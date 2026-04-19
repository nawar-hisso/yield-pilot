// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseAccount} from "@account-abstraction/contracts/core/BaseAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {SIG_VALIDATION_FAILED, SIG_VALIDATION_SUCCESS} from "@account-abstraction/contracts/core/Helpers.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {WebAuthn} from "../libraries/WebAuthn.sol";

/// @title YieldPilotAccount
/// @notice Multi-passkey ERC-4337 smart account. Signed by one-or-more P-256
///         WebAuthn passkeys; new keys are added by signing with an already-
///         authorized key. The CREATE2 address is keyed on the *first* passkey
///         only (via the factory), so adding / revoking keys never moves the
///         account address.
/// @dev Signature envelope:
///        `abi.encode(bytes32 credId, bytes authenticatorData, bytes clientDataJSON, bytes32 r, bytes32 s)`
///      `credId` routes to a stored key; `(authenticatorData, clientDataJSON, r, s)` are verified against that key's P-256 pubkey via the RIP-7212 precompile.
contract YieldPilotAccount is BaseAccount, Initializable, IERC165, IERC721Receiver, IERC1155Receiver {
    /// @notice Soft upper bound on batch size — keeps `executeBatch` from
    ///         running out of gas on inputs a caller couldn't physically fund.
    uint256 public constant MAX_BATCH = 32;

    IEntryPoint private immutable _entryPoint;

    struct PasskeyKey {
        bytes32 x;
        bytes32 y;
        uint48 addedAt;      // 0 = slot empty
        bool active;
        bytes32 nickname;    // optional human-readable label (client-side)
    }

    /// @notice credId (keccak256 of WebAuthn credential-id bytes) → key record.
    mapping(bytes32 credId => PasskeyKey key) public keys;

    /// @notice Enumerable list of every credId ever registered (including revoked).
    bytes32[] public credIds;

    event YieldPilotAccountInitialized(bytes32 indexed credId, bytes32 pubKeyX, bytes32 pubKeyY);
    event KeyAdded(bytes32 indexed credId, bytes32 pubKeyX, bytes32 pubKeyY, bytes32 nickname);
    event KeyRevoked(bytes32 indexed credId);
    event Executed(address indexed target, uint256 value, bytes data);

    error YieldPilotAccount__ExecuteFailed(address target, bytes data);
    error YieldPilotAccount__InvalidArrayLength();
    error YieldPilotAccount__InvalidPubKey();
    error YieldPilotAccount__InvalidCredId();
    error YieldPilotAccount__CredIdAlreadyRegistered(bytes32 credId);
    error YieldPilotAccount__UnknownCredId(bytes32 credId);
    error YieldPilotAccount__CannotRevokeLastActiveKey();
    error YieldPilotAccount__NotSelf();
    error YieldPilotAccount__BatchTooLarge(uint256 length, uint256 max);

    modifier onlySelf() {
        if (msg.sender != address(this)) revert YieldPilotAccount__NotSelf();
        _;
    }

    constructor(IEntryPoint anEntryPoint) {
        _entryPoint = anEntryPoint;
        _disableInitializers();
    }

    /// @notice Called once by the factory on the freshly-deployed clone.
    /// @param credId    Routing id — typically keccak256(webauthn credentialId bytes).
    /// @param x         Passkey public-key X coordinate (secp256r1 / P-256).
    /// @param y         Passkey public-key Y coordinate.
    /// @param nickname  Optional client-side label (e.g. "MacBook Pro · Safari"). `bytes32(0)` is fine.
    function initialize(bytes32 credId, bytes32 x, bytes32 y, bytes32 nickname) external initializer {
        if (x == bytes32(0) || y == bytes32(0)) revert YieldPilotAccount__InvalidPubKey();
        if (credId == bytes32(0)) revert YieldPilotAccount__InvalidCredId();
        keys[credId] = PasskeyKey({x: x, y: y, addedAt: uint48(block.timestamp), active: true, nickname: nickname});
        credIds.push(credId);
        emit YieldPilotAccountInitialized(credId, x, y);
    }

    /// @inheritdoc BaseAccount
    function entryPoint() public view override returns (IEntryPoint) {
        return _entryPoint;
    }

    // ─── Execution ──────────────────────────────────────────────────────────

    /// @notice Execute a single call from this account. EntryPoint only.
    function execute(address target, uint256 value, bytes calldata data) external {
        _requireFromEntryPoint();
        _call(target, value, data);
    }

    /// @notice Execute a batch of calls from this account. EntryPoint only.
    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata data)
        external
    {
        _requireFromEntryPoint();
        uint256 len = targets.length;
        if (len != data.length || len != values.length) revert YieldPilotAccount__InvalidArrayLength();
        if (len > MAX_BATCH) revert YieldPilotAccount__BatchTooLarge(len, MAX_BATCH);
        for (uint256 i = 0; i < len; ) {
            _call(targets[i], values[i], data[i]);
            unchecked { ++i; }
        }
    }

    /// @notice Receive ETH (used for paying prefund when no paymaster is set).
    receive() external payable {}

    // ─── Key management (call only via `execute(address(this), 0, ...)`) ────

    /// @notice Authorize an additional passkey. Callable only via a UserOp
    ///         routed through `execute(address(this), ...)`, which means an
    ///         already-authorized key signed for this change.
    function addAuthorizedKey(bytes32 credId, bytes32 x, bytes32 y, bytes32 nickname) external onlySelf {
        if (x == bytes32(0) || y == bytes32(0)) revert YieldPilotAccount__InvalidPubKey();
        if (credId == bytes32(0)) revert YieldPilotAccount__InvalidCredId();
        if (keys[credId].addedAt != 0) revert YieldPilotAccount__CredIdAlreadyRegistered(credId);
        keys[credId] = PasskeyKey({x: x, y: y, addedAt: uint48(block.timestamp), active: true, nickname: nickname});
        credIds.push(credId);
        emit KeyAdded(credId, x, y, nickname);
    }

    /// @notice Deactivate an authorized passkey. Revoked keys can't sign
    ///         future UserOps. Cannot revoke the last active key.
    function revokeKey(bytes32 credId) external onlySelf {
        PasskeyKey storage k = keys[credId];
        if (k.addedAt == 0) revert YieldPilotAccount__UnknownCredId(credId);
        if (!k.active) return; // already revoked — idempotent

        uint256 activeCount;
        uint256 total = credIds.length;
        for (uint256 i = 0; i < total; ) {
            if (keys[credIds[i]].active) ++activeCount;
            unchecked { ++i; }
        }
        if (activeCount <= 1) revert YieldPilotAccount__CannotRevokeLastActiveKey();

        k.active = false;
        emit KeyRevoked(credId);
    }

    // ─── Views ──────────────────────────────────────────────────────────────

    /// @notice Every credId ever registered (includes revoked).
    function authorizedKeys() external view returns (bytes32[] memory) {
        return credIds;
    }

    /// @notice Count of currently-active keys.
    function activeKeyCount() external view returns (uint256 count) {
        uint256 total = credIds.length;
        for (uint256 i = 0; i < total; ) {
            if (keys[credIds[i]].active) ++count;
            unchecked { ++i; }
        }
    }

    /// @notice First registered credId — the passkey that determined the
    ///         CREATE2 address of this account. Present for clients that want
    ///         to know which key is "primary" without scanning the list.
    function primaryCredId() external view returns (bytes32) {
        return credIds.length == 0 ? bytes32(0) : credIds[0];
    }

    /// @notice Legacy accessor: X coordinate of the primary (first) passkey.
    function pubKeyX() external view returns (bytes32) {
        if (credIds.length == 0) return bytes32(0);
        return keys[credIds[0]].x;
    }

    /// @notice Legacy accessor: Y coordinate of the primary (first) passkey.
    function pubKeyY() external view returns (bytes32) {
        if (credIds.length == 0) return bytes32(0);
        return keys[credIds[0]].y;
    }

    // ─── Token callbacks ────────────────────────────────────────────────────

    /// @inheritdoc IERC721Receiver
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @inheritdoc IERC1155Receiver
    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    /// @inheritdoc IERC1155Receiver
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IERC721Receiver).interfaceId
            || interfaceId == type(IERC1155Receiver).interfaceId;
    }

    // ─── Validation ─────────────────────────────────────────────────────────

    /// @dev Verify the passkey signature over `userOpHash`. Decodes the credId
    ///      prefix to pick which stored key to verify against.
    function _validateSignature(PackedUserOperation calldata userOp, bytes32 userOpHash)
        internal
        view
        override
        returns (uint256 validationData)
    {
        (bytes32 credId, bytes memory authData, bytes memory clientDataJSON, bytes32 r, bytes32 s) =
            abi.decode(userOp.signature, (bytes32, bytes, bytes, bytes32, bytes32));

        PasskeyKey memory k = keys[credId];
        if (!k.active) return SIG_VALIDATION_FAILED;

        bool ok = WebAuthn.verify(authData, clientDataJSON, r, s, k.x, k.y, userOpHash);
        return ok ? SIG_VALIDATION_SUCCESS : SIG_VALIDATION_FAILED;
    }

    function _call(address target, uint256 value, bytes memory data) private {
        (bool ok, bytes memory result) = target.call{value: value}(data);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(result, 32), mload(result))
            }
        }
        emit Executed(target, value, data);
    }
}
