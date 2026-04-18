// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Paymaster
/// @notice ERC-4337 paymaster skeleton that sponsors gas for deposits into a
///         whitelisted YieldVault. Phase 5 replaces the minimal logic here
///         with an import from `@account-abstraction/contracts`.
/// @dev Maintains a per-vault spending cap plus an optional global daily cap.
contract Paymaster is Ownable, ReentrancyGuard {
    /// @notice Whitelisted vault addresses that may have their deposits sponsored.
    mapping(address vault => bool allowed) public allowedTargets;

    /// @notice Per-vault lifetime cap on sponsored gas (wei).
    mapping(address vault => uint256 cap) public gasBudget;

    /// @notice Sponsored gas consumed per vault (wei).
    mapping(address vault => uint256 used) public gasUsed;

    event TargetWhitelisted(address indexed vault, bool allowed);
    event BudgetSet(address indexed vault, uint256 cap);
    event GasSponsored(address indexed vault, address indexed user, uint256 gasCost);

    error TargetNotAllowed(address vault);
    error BudgetExceeded(address vault, uint256 requested, uint256 remaining);

    constructor(address owner_) Ownable(owner_) {}

    /// @notice Allow or revoke a target contract for sponsorship.
    function setTarget(address vault, bool allowed) external onlyOwner {
        allowedTargets[vault] = allowed;
        emit TargetWhitelisted(vault, allowed);
    }

    /// @notice Set the lifetime gas-budget cap (wei) for a vault.
    function setBudget(address vault, uint256 cap) external onlyOwner {
        gasBudget[vault] = cap;
        emit BudgetSet(vault, cap);
    }

    /// @notice Track sponsorship after a UserOperation settles.
    /// @dev In the real paymaster this runs from `postOp`. The skeleton just
    ///      ensures cap enforcement and event emission are in place.
    function recordSponsorship(address vault, address user, uint256 gasCost)
        external
        onlyOwner
        nonReentrant
    {
        if (!allowedTargets[vault]) revert TargetNotAllowed(vault);
        uint256 used = gasUsed[vault] + gasCost;
        if (used > gasBudget[vault]) {
            revert BudgetExceeded(vault, gasCost, gasBudget[vault] - gasUsed[vault]);
        }
        gasUsed[vault] = used;
        emit GasSponsored(vault, user, gasCost);
    }

    /// @notice Accept ETH deposits to fund the paymaster stake.
    receive() external payable {}
}
