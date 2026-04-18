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
/// @notice ERC-4337 smart account whose signer is a WebAuthn (P-256) passkey.
///         The passkey public-key (X, Y) is stored once at initialization;
///         every UserOperation must be signed by that passkey via the browser
///         WebAuthn API. Deployed via CREATE2 by YieldPilotAccountFactory.
/// @dev Signature encoding: `abi.encode(bytes authenticatorData, bytes clientDataJSON, bytes32 r, bytes32 s)`.
contract YieldPilotAccount is BaseAccount, Initializable, IERC165, IERC721Receiver, IERC1155Receiver {
    /// @notice Soft upper bound on batch size — keeps `executeBatch` from
    uint256 public constant MAX_BATCH = 32;

    IEntryPoint private immutable _entryPoint;

    /// @notice Passkey public-key X coordinate (secp256r1 / P-256).
    bytes32 public pubKeyX;
    /// @notice Passkey public-key Y coordinate.
    bytes32 public pubKeyY;

    event YieldPilotAccountInitialized(bytes32 pubKeyX, bytes32 pubKeyY);
    event Executed(address indexed target, uint256 value, bytes data);

    error YieldPilotAccount__ExecuteFailed(address target, bytes data);
    error YieldPilotAccount__InvalidArrayLength();
    error YieldPilotAccount__InvalidPubKey();
    error YieldPilotAccount__BatchTooLarge(uint256 length, uint256 max);

    constructor(IEntryPoint anEntryPoint) {
        _entryPoint = anEntryPoint;
        _disableInitializers();
    }

    /// @notice Called once by the factory on the freshly-deployed clone.
    /// @param x Passkey public-key X coordinate.
    /// @param y Passkey public-key Y coordinate.
    function initialize(bytes32 x, bytes32 y) external initializer {
        if (x == bytes32(0) || y == bytes32(0)) revert YieldPilotAccount__InvalidPubKey();
        pubKeyX = x;
        pubKeyY = y;
        emit YieldPilotAccountInitialized(x, y);
    }

    /// @inheritdoc BaseAccount
    function entryPoint() public view override returns (IEntryPoint) {
        return _entryPoint;
    }

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

    /// @dev Verify the passkey signature over `userOpHash`.
    function _validateSignature(PackedUserOperation calldata userOp, bytes32 userOpHash)
        internal
        view
        override
        returns (uint256 validationData)
    {
        (bytes memory authData, bytes memory clientDataJSON, bytes32 r, bytes32 s) =
            abi.decode(userOp.signature, (bytes, bytes, bytes32, bytes32));

        bool ok = WebAuthn.verify(authData, clientDataJSON, r, s, pubKeyX, pubKeyY, userOpHash);
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
