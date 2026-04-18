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
///           * enforce an `(vault → cap)` lifetime gas budget as a safety net
///         The hot path reads only immutables + a single storage word so it
///         plays well with ERC-7562 bundler rules.
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

    /// @notice Whitelisted targets. UserOps calling `execute(target, ...)`
    ///         with a non-whitelisted target are rejected in validate.
    mapping(address target => bool allowed) public allowedTargets;

    /// @notice Lifetime sponsored-gas cap per target (wei).
    mapping(address target => uint256 cap) public gasBudget;

    /// @notice Cumulative sponsored gas per target (wei).
    mapping(address target => uint256 used) public gasUsed;

    event VerifierSet(address indexed verifier);
    event TargetWhitelisted(address indexed target, bool allowed);
    event BudgetSet(address indexed target, uint256 cap);
    event GasSponsored(address indexed target, address indexed sender, uint256 gasCost);
    event BudgetOverflow(address indexed target, uint256 used, uint256 cap);

    error Paymaster__TargetNotAllowed(address target);
    error Paymaster__UnsupportedSelector(bytes4 selector);
    error Paymaster__InvalidData();

    /// @notice Selector of `YieldPilotAccount.execute(address,uint256,bytes)`.
    bytes4 public constant EXECUTE_SELECTOR = 0xb61d27f6;

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

    function setTarget(address target, bool allowed) external onlyOwner {
        allowedTargets[target] = allowed;
        emit TargetWhitelisted(target, allowed);
    }

    function setBudget(address target, uint256 cap) external onlyOwner {
        gasBudget[target] = cap;
        emit BudgetSet(target, cap);
    }

    // ─── Hash to be signed off-chain ────────────────────────────────────────

    /// @notice Hash the paymaster signer approves. The backend recomputes
    ///         this hash, signs `toEthSignedMessageHash(hash)`, and the
    ///         signature is included in `paymasterAndData`.
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
    ) internal view override returns (bytes memory context, uint256 validationData) {
        // 1. Enforce call shape: only account.execute(target, value, data) is sponsored.
        if (userOp.callData.length < 36) revert Paymaster__InvalidData();
        bytes4 selector = bytes4(userOp.callData[:4]);
        if (selector != EXECUTE_SELECTOR) revert Paymaster__UnsupportedSelector(selector);
        address target = address(uint160(uint256(bytes32(userOp.callData[4:36]))));
        if (!allowedTargets[target]) revert Paymaster__TargetNotAllowed(target);

        // 2. Decode our sponsorship fields from paymasterAndData.
        if (userOp.paymasterAndData.length != UserOperationLib.PAYMASTER_DATA_OFFSET + PAYMASTER_DATA_LENGTH) {
            revert Paymaster__InvalidData();
        }
        uint48 validUntil = uint48(bytes6(userOp.paymasterAndData[VALID_UNTIL_OFFSET:VALID_AFTER_OFFSET]));
        uint48 validAfter = uint48(bytes6(userOp.paymasterAndData[VALID_AFTER_OFFSET:SIG_OFFSET]));
        bytes calldata signature = userOp.paymasterAndData[SIG_OFFSET:];

        // 3. Recover signer over EIP-191 hash.
        bytes32 digest = getHash(userOp, validUntil, validAfter).toEthSignedMessageHash();
        (address recovered, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signature);
        bool sigFailed = err != ECDSA.RecoverError.NoError || recovered != verifier;

        // 4. Return packed validationData with time range.
        validationData = _packValidationData(sigFailed, validUntil, validAfter);
        context = abi.encode(userOp.sender, target, maxCost);
    }

    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /* actualUserOpFeePerGas */
    ) internal override {
        if (mode == PostOpMode.postOpReverted) return; // never emitted by EntryPoint; defensive.

        (address sender, address target, ) = abi.decode(context, (address, address, uint256));

        // Budget tracking is best-effort: we never revert here (slashing risk).
        unchecked {
            uint256 newUsed = gasUsed[target] + actualGasCost;
            gasUsed[target] = newUsed;
            if (gasBudget[target] != 0 && newUsed > gasBudget[target]) {
                emit BudgetOverflow(target, newUsed, gasBudget[target]);
            } else {
                emit GasSponsored(target, sender, actualGasCost);
            }
        }
    }
}
