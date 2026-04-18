// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BasePaymaster} from "@account-abstraction/contracts/core/BasePaymaster.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {_packValidationData, SIG_VALIDATION_FAILED, SIG_VALIDATION_SUCCESS} from "@account-abstraction/contracts/core/Helpers.sol";
import {UserOperationLib} from "@account-abstraction/contracts/core/UserOperationLib.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title Paymaster (verifying)
/// @notice ERC-4337 verifying paymaster for YieldPilot. An off-chain signer
///         (the `apps/api` backend) inspects incoming UserOperations against
///         a policy and signs sponsorship approvals. On-chain we:
///           * verify the signer matches `verifier`
///           * enforce a `(sender → lifetime cap)` gas budget PRE-execution
///           * bind sponsorship to a `YieldPilotAccount` factory allow-list
///             so hostile custom accounts can't spoof `execute()` callData
///         The hot path reads only paymaster-owned storage keyed by sender,
///         so it plays well with ERC-7562 bundler rules.
/// @dev `paymasterAndData` layout (v0.7):
///        [0:20]   paymaster address
///        [20:36]  paymasterValidationGasLimit (packed)
///        [36:52]  paymasterPostOpGasLimit (packed)
///        [52:58]  validUntil (uint48, 6 bytes, big-endian)
///        [58:64]  validAfter (uint48)
///        [64:129] signature (65 bytes: r || s || v)
contract Paymaster is BasePaymaster {
    using MessageHashUtils for bytes32;

    /// @notice EOA used by the backend to sign sponsorship approvals.
    address public verifier;

    /// @notice Approved account factories. A UserOp's `sender` must be a clone
    ///         deployed by one of these factories (enforced via the first 20
    ///         bytes of `userOp.initCode` on first-tx; after that we fall back
    ///         to the explicit `allowedSenders` mapping populated on first
    ///         sponsorship).
    mapping(address factory => bool allowed) public allowedFactories;

    /// @notice Senders seen on a first-tx with an approved factory's initCode —
    ///         cached so subsequent UserOps (which have empty `initCode`) still
    ///         pass the sender check without a factory re-read.
    mapping(address sender => bool allowed) public allowedSenders;

    /// @notice Whitelisted call targets (e.g., the vault). UserOps calling
    ///         `execute(target, ...)` with a non-whitelisted target revert.
    mapping(address target => bool allowed) public allowedTargets;

    /// @notice Lifetime sponsored-gas cap per sender (wei). `0` = no cap set.
    mapping(address sender => uint256 cap) public gasBudget;

    /// @notice Cumulative sponsored gas per sender (wei).
    mapping(address sender => uint256 used) public gasUsed;

    event VerifierSet(address indexed verifier);
    event FactoryAllowed(address indexed factory, bool allowed);
    event SenderAllowed(address indexed sender, bool allowed);
    event TargetWhitelisted(address indexed target, bool allowed);
    event BudgetSet(address indexed sender, uint256 cap);
    event GasSponsored(address indexed sender, address indexed target, uint256 gasCost);
    event BudgetOverflow(address indexed sender, uint256 used, uint256 cap);

    error Paymaster__TargetNotAllowed(address target);
    error Paymaster__SenderNotAllowed(address sender);
    error Paymaster__BudgetExceeded(address sender, uint256 used, uint256 cap, uint256 maxCost);
    error Paymaster__UnsupportedSelector(bytes4 selector);
    error Paymaster__InvalidData();

    /// @notice Selector of `YieldPilotAccount.execute(address,uint256,bytes)`.
    bytes4 public constant EXECUTE_SELECTOR = bytes4(keccak256("execute(address,uint256,bytes)"));

    uint256 private constant VALID_UNTIL_OFFSET = UserOperationLib.PAYMASTER_DATA_OFFSET; // 52
    uint256 private constant VALID_AFTER_OFFSET = VALID_UNTIL_OFFSET + 6;                   // 58
    uint256 private constant SIG_OFFSET = VALID_AFTER_OFFSET + 6;                           // 64
    uint256 private constant PAYMASTER_DATA_LENGTH = 6 + 6 + 65;                            // 77

    constructor(IEntryPoint _entryPoint, address _verifier, address _owner) BasePaymaster(_entryPoint) {
        verifier = _verifier;
        emit VerifierSet(_verifier);
        _transferOwnership(_owner);
    }

    // ─── Admin ──────────────────────────────────────────────────────────────

    function setVerifier(address v) external onlyOwner {
        verifier = v;
        emit VerifierSet(v);
    }

    function setFactory(address factory, bool allowed) external onlyOwner {
        allowedFactories[factory] = allowed;
        emit FactoryAllowed(factory, allowed);
    }

    function setAllowedSender(address sender, bool allowed) external onlyOwner {
        allowedSenders[sender] = allowed;
        emit SenderAllowed(sender, allowed);
    }

    function setTarget(address target, bool allowed) external onlyOwner {
        allowedTargets[target] = allowed;
        emit TargetWhitelisted(target, allowed);
    }

    /// @notice Lifetime cap per sender. Set to `0` to disable enforcement.
    function setBudget(address sender, uint256 cap) external onlyOwner {
        gasBudget[sender] = cap;
        emit BudgetSet(sender, cap);
    }

    // ─── Hash to be signed off-chain ────────────────────────────────────────

    /// @notice Hash the paymaster signer approves. Commits to the full v0.7
    ///         UserOp state PLUS the paymaster's own gas limits (the first
    ///         52 bytes of `paymasterAndData`) so a bundler can't rewrite
    ///         them after the signer signs.
    function getHash(PackedUserOperation calldata userOp, uint48 validUntil, uint48 validAfter)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.accountGasLimits,
                userOp.preVerificationGas,
                userOp.gasFees,
                keccak256(userOp.paymasterAndData[:UserOperationLib.PAYMASTER_DATA_OFFSET]),
                block.chainid,
                address(this),
                validUntil,
                validAfter
            )
        );
    }

    // ─── EntryPoint hooks ───────────────────────────────────────────────────

    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32, /* userOpHash */
        uint256 maxCost
    ) internal override returns (bytes memory context, uint256 validationData) {
        // 1. Enforce call shape: only account.execute(target, value, data) is sponsored.
        if (userOp.callData.length < 36) revert Paymaster__InvalidData();
        bytes4 selector = bytes4(userOp.callData[:4]);
        if (selector != EXECUTE_SELECTOR) revert Paymaster__UnsupportedSelector(selector);
        address target = address(uint160(uint256(bytes32(userOp.callData[4:36]))));
        if (!allowedTargets[target]) revert Paymaster__TargetNotAllowed(target);

        // 2. Bind sponsorship to a known sender — either an already-seen clone
        //    or a fresh clone being deployed via an approved factory.
        address sender = userOp.sender;
        if (!allowedSenders[sender]) {
            if (userOp.initCode.length < 20) revert Paymaster__SenderNotAllowed(sender);
            address factory = address(bytes20(userOp.initCode[:20]));
            if (!allowedFactories[factory]) revert Paymaster__SenderNotAllowed(sender);
            allowedSenders[sender] = true; // cache for subsequent UserOps
            emit SenderAllowed(sender, true);
        }

        // 3. Decode sponsorship fields from paymasterAndData.
        if (userOp.paymasterAndData.length < UserOperationLib.PAYMASTER_DATA_OFFSET + PAYMASTER_DATA_LENGTH) {
            revert Paymaster__InvalidData();
        }
        uint48 validUntil = uint48(bytes6(userOp.paymasterAndData[VALID_UNTIL_OFFSET:VALID_AFTER_OFFSET]));
        uint48 validAfter = uint48(bytes6(userOp.paymasterAndData[VALID_AFTER_OFFSET:SIG_OFFSET]));
        bytes calldata signature = userOp.paymasterAndData[SIG_OFFSET:SIG_OFFSET + 65];

        // 4. Enforce the per-sender lifetime budget PRE-execution.
        uint256 cap = gasBudget[sender];
        if (cap != 0) {
            uint256 used = gasUsed[sender];
            if (used + maxCost > cap) revert Paymaster__BudgetExceeded(sender, used, cap, maxCost);
        }

        // 5. Recover signer over EIP-191 hash.
        bytes32 digest = getHash(userOp, validUntil, validAfter).toEthSignedMessageHash();
        (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signature);
        bool sigFailed = err != ECDSA.RecoverError.NoError || recovered != verifier;

        validationData = _packValidationData(sigFailed, validUntil, validAfter);
        context = abi.encode(sender, target, maxCost);
    }

    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /* actualUserOpFeePerGas */
    ) internal override {
        if (mode == PostOpMode.postOpReverted) return; // defensive — never emitted by EntryPoint.

        (address sender, address target, ) = abi.decode(context, (address, address, uint256));

        // Budget accounting is checked (not unchecked) so silent overflow can't
        // hide an over-spend. Emits BudgetOverflow if the cap is breached but
        // never reverts (reverting would slash the paymaster's deposit).
        uint256 newUsed = gasUsed[sender] + actualGasCost;
        gasUsed[sender] = newUsed;
        uint256 cap = gasBudget[sender];
        if (cap != 0 && newUsed > cap) {
            emit BudgetOverflow(sender, newUsed, cap);
        } else {
            emit GasSponsored(sender, target, actualGasCost);
        }
    }
}
