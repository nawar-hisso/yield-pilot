// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDC
/// @notice 6-decimal ERC-20 test token. Anyone can `faucet()` 1,000 MockUSDC
///         per call so testers don't need to chase faucets.
contract MockUSDC is ERC20, Ownable {
    uint8 private constant _DECIMALS = 6;
    uint256 public constant FAUCET_AMOUNT = 1_000 * 10 ** _DECIMALS;

    constructor(address owner_) ERC20("Mock USDC", "mUSDC") Ownable(owner_) {}

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /// @notice Issue 1,000 mUSDC to the caller. Unlimited — testnet only.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Owner can mint any amount (used in Hardhat tests).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
