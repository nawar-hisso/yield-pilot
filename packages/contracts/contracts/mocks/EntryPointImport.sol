// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @dev Empty file — its only purpose is to force Hardhat to compile the real
///      EntryPoint from the @account-abstraction/contracts package so tests
///      can deploy + impersonate it. This contract is never deployed itself.
import {EntryPoint} from "@account-abstraction/contracts/core/EntryPoint.sol";

// silence the "unused import" linter by re-declaring
abstract contract EntryPointImport {
    function _dummy() internal pure virtual returns (EntryPoint);
}
