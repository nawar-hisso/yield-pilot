// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {YieldPilotAccount} from "./YieldPilotAccount.sol";

/// @title YieldPilotAccountFactory
/// @notice CREATE2 factory for YieldPilotAccount clones. The CREATE2 salt
///         incorporates **only** `(pubKeyX, pubKeyY, salt)` — so the
///         account's address is determined by the *first* passkey and never
///         moves, even after `addAuthorizedKey` registers additional keys.
///
///         `credId` and `nickname` are passed to `initialize` as metadata but
///         do NOT influence the address.
contract YieldPilotAccountFactory {
    /// @notice Shared implementation contract for all clones.
    address public immutable accountImplementation;

    event AccountCreated(
        address indexed account,
        bytes32 indexed credId,
        bytes32 pubKeyX,
        bytes32 pubKeyY,
        bytes32 nickname,
        uint256 salt
    );

    error YieldPilotAccountFactory__InvalidImpl();

    /// @param impl Address of a deployed YieldPilotAccount (the template).
    constructor(address impl) {
        if (impl == address(0)) revert YieldPilotAccountFactory__InvalidImpl();
        accountImplementation = impl;
    }

    /// @notice Create (or return existing) YieldPilotAccount for the given
    ///         passkey + salt. Used as `initCode` target in the first
    ///         UserOperation.
    /// @param credId    Routing id for the primary passkey (keccak256 of the
    ///                  WebAuthn credentialId bytes).
    /// @param pubKeyX   P-256 public key X coordinate.
    /// @param pubKeyY   P-256 public key Y coordinate.
    /// @param nickname  Optional client-side label. `bytes32(0)` is accepted.
    /// @param salt      Additional entropy — lets one passkey back multiple accounts.
    function createAccount(
        bytes32 credId,
        bytes32 pubKeyX,
        bytes32 pubKeyY,
        bytes32 nickname,
        uint256 salt
    ) external returns (YieldPilotAccount) {
        address predicted = computeAddress(pubKeyX, pubKeyY, salt);
        if (predicted.code.length > 0) {
            return YieldPilotAccount(payable(predicted));
        }
        bytes32 finalSalt = _finalSalt(pubKeyX, pubKeyY, salt);
        address account = Clones.cloneDeterministic(accountImplementation, finalSalt);
        YieldPilotAccount(payable(account)).initialize(credId, pubKeyX, pubKeyY, nickname);
        emit AccountCreated(account, credId, pubKeyX, pubKeyY, nickname, salt);
        return YieldPilotAccount(payable(account));
    }

    /// @notice Counterfactual address for the given passkey + salt. Pure view.
    function computeAddress(bytes32 pubKeyX, bytes32 pubKeyY, uint256 salt) public view returns (address) {
        bytes32 finalSalt = _finalSalt(pubKeyX, pubKeyY, salt);
        return Clones.predictDeterministicAddress(accountImplementation, finalSalt, address(this));
    }

    function _finalSalt(bytes32 pubKeyX, bytes32 pubKeyY, uint256 salt) private pure returns (bytes32) {
        return keccak256(abi.encode(pubKeyX, pubKeyY, salt));
    }
}
