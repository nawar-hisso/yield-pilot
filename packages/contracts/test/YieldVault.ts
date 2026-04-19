import { expect } from "chai";
import { ethers } from "hardhat";

describe("YieldVault (skeleton)", function () {
  async function deployFixture() {
    const [owner, alice] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy(owner.address);

    const MockAave = await ethers.getContractFactory("MockAave");
    const aave = await MockAave.deploy(owner.address);
    // Zero out APY so single-block time deltas don't drift the assertions.
    await aave.setApyBps(0);

    const YieldVault = await ethers.getContractFactory("YieldVault");
    const vault = await YieldVault.deploy(
      await usdc.getAddress(),
      await aave.getAddress(),
      owner.address,
    );

    // Give alice some test USDC to deposit.
    await usdc.mint(alice.address, 10_000n * 10n ** 6n);
    return { vault, usdc, aave, owner, alice };
  }

  it("mints shares scaled by the virtual-shares decimalsOffset on the first deposit", async function () {
    const { vault, usdc, alice } = await deployFixture();
    const deposit = 1_000n * 10n ** 6n;

    await usdc.connect(alice).approve(await vault.getAddress(), deposit);
    await vault.connect(alice).deposit(deposit, alice.address);

    // With _decimalsOffset() = 6 the vault mints assets * 10**6 shares on the
    // first deposit — the OZ virtual-shares defense that neutralises the
    // inflation attack on the first depositor.
    const offset = 10n ** 6n;
    expect(await vault.balanceOf(alice.address)).to.equal(deposit * offset);
    expect(await vault.totalAssets()).to.equal(deposit);
    // Round-trip: redeeming all shares returns the original assets.
    expect(await vault.convertToAssets(deposit * offset)).to.equal(deposit);
  });

  it("auto-supplies deposits into the strategy — no idle window", async function () {
    const { vault, usdc, aave, alice } = await deployFixture();
    const deposit = 1_000n * 10n ** 6n;

    await usdc.connect(alice).approve(await vault.getAddress(), deposit);
    await vault.connect(alice).deposit(deposit, alice.address);

    // Vault's own USDC balance should be zero — everything went straight to
    // MockAave via the _deposit override.
    expect(await usdc.balanceOf(await vault.getAddress())).to.equal(0n);
    expect(await aave.getBalance(await usdc.getAddress(), await vault.getAddress())).to.equal(
      deposit,
    );
    expect(await vault.totalAssets()).to.equal(deposit);
  });

  it("auto-recalls from the strategy on withdraw when idle is insufficient", async function () {
    const { vault, usdc, aave, alice } = await deployFixture();
    const deposit = 1_000n * 10n ** 6n;

    await usdc.connect(alice).approve(await vault.getAddress(), deposit);
    await vault.connect(alice).deposit(deposit, alice.address);

    // All funds parked in the strategy — no idle in the vault.
    expect(await usdc.balanceOf(await vault.getAddress())).to.equal(0n);

    // Withdraw half; vault should pull from MockAave + forward to alice.
    const half = deposit / 2n;
    await vault.connect(alice).withdraw(half, alice.address, alice.address);

    // Alice got the USDC, strategy balance dropped by the withdrawn amount.
    expect(await usdc.balanceOf(alice.address)).to.equal(9_000n * 10n ** 6n + half);
    expect(await aave.getBalance(await usdc.getAddress(), await vault.getAddress())).to.equal(
      deposit - half,
    );
  });
});
