// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IMockAave
/// @notice Minimal subset of Aave V3's lending-pool API for a testnet simulation.
interface IMockAave {
    event Supplied(address indexed token, address indexed from, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    function supply(address token, uint256 amount) external;

    function withdraw(address token, uint256 amount) external returns (uint256);

    function getBalance(address token, address user) external view returns (uint256);
}
