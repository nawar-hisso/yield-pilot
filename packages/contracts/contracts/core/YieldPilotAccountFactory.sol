// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {YieldPilotAccount} from "./YieldPilotAccount.sol";

/// @title YieldPilotAccountFactory
/// @notice CREATE2 factory for YieldPilotAccount clones. Given a passkey
///         public-key `(x, y)` and a salt, returns a deterministic clone
///         address. Idempotent — re-calling `createAccount` with the same
///         inputs returns the existing account instead of reverting.
contract YieldPilotAccountFactory {
    /// @notice Shared implementation contract for all clones.
    address public immutable accountImplementation;

    event AccountCreated(address indexed account, bytes32 pubKeyX, bytes32 pubKeyY, uint256 salt);

    /// @param impl Address of a deployed YieldPilotAccount (the template).
    constructor(address impl) {
        accountImplementation = impl;
    }

    /// @notice Create (or return existing) YieldPilotAccount for the given
    ///         passkey + salt. Used as `initCode` target in the first
    ///         UserOperation.
    function createAccount(bytes32 pubKeyX, bytes32 pubKeyY, uint256 salt)
        external
        returns (YieldPilotAccount)
    {
        address predicted = computeAddress(pubKeyX, pubKeyY, salt);
        if (predicted.code.length > 0) {
            return YieldPilotAccount(payable(predicted));
        }
        bytes32 finalSalt = _finalSalt(pubKeyX, pubKeyY, salt);
        address account = Clones.cloneDeterministic(accountImplementation, finalSalt);
        YieldPilotAccount(payable(account)).initialize(pubKeyX, pubKeyY);
        emit AccountCreated(account, pubKeyX, pubKeyY, salt);
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
