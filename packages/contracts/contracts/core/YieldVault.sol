// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMockAave} from "../interfaces/IMockAave.sol";
import {IYieldVault} from "../interfaces/IYieldVault.sol";

/// @title YieldVault
/// @notice Tokenized vault (ERC-4626) that routes deposits into a MockAave lending pool.
/// @dev Phase 1 skeleton — the contract-designer agent will expand strategy logic.
///      Depositors mint `yvUSDC` shares proportional to the pool's total assets.
contract YieldVault is ERC4626, Ownable, ReentrancyGuard, IYieldVault {
    IMockAave public immutable strategy;

    /// @param asset_ The deposit token (MockUSDC on testnet).
    /// @param strategy_ The lending pool the vault routes idle deposits into.
    /// @param owner_ Initial owner (admin for parameter changes + strategy swaps).
    constructor(IERC20 asset_, IMockAave strategy_, address owner_)
        ERC20("YieldPilot USDC", "yvUSDC")
        ERC4626(asset_)
        Ownable(owner_)
    {
        strategy = strategy_;
    }

    /// @inheritdoc IYieldVault
    function deployToStrategy(uint256 amount) external override onlyOwner nonReentrant {
        IERC20 a = IERC20(asset());
        a.approve(address(strategy), amount);
        strategy.supply(address(a), amount);
        emit StrategyDeposit(amount);
    }

    /// @inheritdoc IYieldVault
    function recallFromStrategy(uint256 amount) external override onlyOwner nonReentrant {
        strategy.withdraw(asset(), amount);
        emit StrategyWithdraw(amount);
    }

    /// @dev Total assets = idle balance in vault + balance parked in the strategy.
    function totalAssets() public view override(ERC4626, IERC4626) returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 parked = strategy.getBalance(asset(), address(this));
        return idle + parked;
    }
}
