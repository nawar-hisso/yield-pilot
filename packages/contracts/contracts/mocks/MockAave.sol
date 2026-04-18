// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMockAave} from "../interfaces/IMockAave.sol";

/// @title MockAave
/// @notice Simulated lending pool that accrues a fixed APY (default 5%) on
///         the supplied principal, computed lazily at withdraw time.
contract MockAave is IMockAave, Ownable {
    using SafeERC20 for IERC20;

    uint256 public apyBps = 500; // 5% APY in basis points
    uint256 public constant BPS = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    struct Position {
        uint256 principal;
        uint256 lastUpdate;
    }

    mapping(address token => mapping(address user => Position)) private _positions;

    constructor(address owner_) Ownable(owner_) {}

    function setApyBps(uint256 newApy) external onlyOwner {
        apyBps = newApy;
    }

    /// @inheritdoc IMockAave
    function supply(address token, uint256 amount) external override {
        Position storage p = _positions[token][msg.sender];
        p.principal = _accruedBalance(p) + amount;
        p.lastUpdate = block.timestamp;
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Supplied(token, msg.sender, amount);
    }

    /// @inheritdoc IMockAave
    function withdraw(address token, uint256 amount) external override returns (uint256) {
        Position storage p = _positions[token][msg.sender];
        uint256 available = _accruedBalance(p);
        require(amount <= available, "insufficient");
        p.principal = available - amount;
        p.lastUpdate = block.timestamp;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(token, msg.sender, amount);
        return amount;
    }

    /// @inheritdoc IMockAave
    function getBalance(address token, address user) external view override returns (uint256) {
        return _accruedBalance(_positions[token][user]);
    }

    function _accruedBalance(Position memory p) private view returns (uint256) {
        if (p.principal == 0 || p.lastUpdate == 0) return p.principal;
        uint256 elapsed = block.timestamp - p.lastUpdate;
        uint256 interest = (p.principal * apyBps * elapsed) / (BPS * SECONDS_PER_YEAR);
        return p.principal + interest;
    }
}
