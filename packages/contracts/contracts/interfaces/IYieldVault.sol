// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// @title IYieldVault
/// @notice Extension of IERC4626 with YieldPilot-specific hooks.
interface IYieldVault is IERC4626 {
    /// @notice Emitted when the vault re-invests idle assets into the strategy.
    event StrategyDeposit(uint256 amount);

    /// @notice Emitted when the vault withdraws from the strategy to satisfy a redemption.
    event StrategyWithdraw(uint256 amount);

    /// @notice Pull idle assets into the active yield strategy.
    function deployToStrategy(uint256 amount) external;

    /// @notice Pull funds back from the active yield strategy.
    function recallFromStrategy(uint256 amount) external;
}
