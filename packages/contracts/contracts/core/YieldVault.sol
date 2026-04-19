// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMockAave} from "../interfaces/IMockAave.sol";
import {IYieldVault} from "../interfaces/IYieldVault.sol";

/// @title YieldVault
/// @notice Tokenized vault (ERC-4626) that routes deposits into a MockAave lending pool.
/// @dev Uses OZ's virtual-shares defense (`_decimalsOffset = 6`) to neutralize the
///      inflation/donation attack on the first depositor. Strategy approvals use
///      `SafeERC20.forceApprove` so the vault can swap in USDT-style tokens later
///      without tripping their non-zero→non-zero revert.
contract YieldVault is ERC4626, Ownable, ReentrancyGuard, IYieldVault {
    using SafeERC20 for IERC20;

    IMockAave public immutable strategy;

    error YieldVault__ZeroAddress();
    error YieldVault__ZeroAmount();

    /// @param asset_ The deposit token (MockUSDC on testnet).
    /// @param strategy_ The lending pool the vault routes idle deposits into.
    /// @param owner_ Initial owner (admin for parameter changes + strategy swaps).
    constructor(IERC20 asset_, IMockAave strategy_, address owner_)
        ERC20("YieldPilot USDC", "yvUSDC")
        ERC4626(asset_)
        Ownable(owner_)
    {
        if (address(strategy_) == address(0)) revert YieldVault__ZeroAddress();
        strategy = strategy_;
    }

    /// @dev Virtual-shares offset — inflates share price precision by 10^6 so the
    ///      first depositor cannot donate assets to steal the second depositor's rounding.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    /// @inheritdoc IYieldVault
    function deployToStrategy(uint256 amount) external override onlyOwner nonReentrant {
        if (amount == 0) revert YieldVault__ZeroAmount();
        IERC20 a = IERC20(asset());
        a.forceApprove(address(strategy), amount);
        strategy.supply(address(a), amount);
        emit StrategyDeposit(amount);
    }

    /// @inheritdoc IYieldVault
    function recallFromStrategy(uint256 amount) external override onlyOwner nonReentrant {
        if (amount == 0) revert YieldVault__ZeroAmount();
        strategy.withdraw(asset(), amount);
        emit StrategyWithdraw(amount);
    }

    /// @notice Total assets = idle balance in vault + balance parked in the strategy.
    /// @dev Overrides ERC4626 + IERC4626 to account for strategy-held balances.
    function totalAssets() public view override(ERC4626, IERC4626) returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        uint256 parked = strategy.getBalance(asset(), address(this));
        return idle + parked;
    }

    // ─── Auto-deploy hooks ─────────────────────────────────────────────────
    //
    // ERC4626's external entrypoints (`deposit`, `mint`, `withdraw`, `redeem`)
    // all funnel through the internal `_deposit` / `_withdraw` hooks. We
    // override those so:
    //   * every successful deposit/mint immediately sends the fresh USDC into
    //     the strategy — no "idle" window where capital sits earning nothing.
    //   * every successful withdraw/redeem first pulls however much is needed
    //     back out of the strategy, keeping the user-facing semantics
    //     indistinguishable from a non-lending vault.
    //
    // Idempotent against the existing admin `deployToStrategy` /
    // `recallFromStrategy` paths; those stay for ops-level rebalancing.

    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override {
        super._deposit(caller, receiver, assets, shares);
        _autoSupplyToStrategy(assets);
    }

    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        _autoRecallFromStrategy(assets);
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function _autoSupplyToStrategy(uint256 amount) private {
        if (amount == 0) return;
        IERC20 a = IERC20(asset());
        a.forceApprove(address(strategy), amount);
        strategy.supply(address(a), amount);
        emit StrategyDeposit(amount);
    }

    function _autoRecallFromStrategy(uint256 needed) private {
        if (needed == 0) return;
        IERC20 a = IERC20(asset());
        uint256 idle = a.balanceOf(address(this));
        if (idle >= needed) return;
        uint256 gap = needed - idle;
        strategy.withdraw(address(a), gap);
        emit StrategyWithdraw(gap);
    }
}
