// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BaseAccount} from "@account-abstraction/contracts/core/BaseAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {SIG_VALIDATION_FAILED, SIG_VALIDATION_SUCCESS} from "@account-abstraction/contracts/core/Helpers.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {WebAuthn} from "../libraries/WebAuthn.sol";

/// @title YieldPilotAccount
/// @notice ERC-4337 smart account whose signer is a WebAuthn (P-256) passkey.
///         The passkey public-key (X, Y) is stored once at initialization;
///         every UserOperation must be signed by that passkey via the browser
///         WebAuthn API. Deployed via CREATE2 by YieldPilotAccountFactory.
/// @dev Signature encoding: `abi.encode(bytes authenticatorData, bytes clientDataJSON, bytes32 r, bytes32 s)`.
contract YieldPilotAccount is BaseAccount, Initializable {
    IEntryPoint private immutable _entryPoint;

    /// @notice Passkey public-key X coordinate (secp256r1 / P-256).
    bytes32 public pubKeyX;
    /// @notice Passkey public-key Y coordinate.
    bytes32 public pubKeyY;

    event YieldPilotAccountInitialized(bytes32 pubKeyX, bytes32 pubKeyY);
    event Executed(address indexed target, uint256 value, bytes data);

    error YieldPilotAccount__ExecuteFailed(address target, bytes data);
    error YieldPilotAccount__InvalidArrayLength();

    constructor(IEntryPoint anEntryPoint) {
        _entryPoint = anEntryPoint;
        _disableInitializers();
    }

    /// @notice Called once by the factory on the freshly-deployed clone.
    /// @param x Passkey public-key X coordinate.
    /// @param y Passkey public-key Y coordinate.
    function initialize(bytes32 x, bytes32 y) external initializer {
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
        if (targets.length != data.length || targets.length != values.length) {
            revert YieldPilotAccount__InvalidArrayLength();
        }
        for (uint256 i = 0; i < targets.length; i++) {
            _call(targets[i], values[i], data[i]);
        }
    }

    /// @notice Receive ETH (used for paying prefund when no paymaster is set).
    receive() external payable {}

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
