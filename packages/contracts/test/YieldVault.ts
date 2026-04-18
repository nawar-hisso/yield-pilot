import { expect } from "chai";
import { ethers } from "hardhat";

describe("YieldVault (skeleton)", function () {
  async function deployFixture() {
    const [owner, alice] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy(owner.address);

    const MockAave = await ethers.getContractFactory("MockAave");
    const aave = await MockAave.deploy(owner.address);

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

  it("assigns 1:1 shares on the first deposit", async function () {
    const { vault, usdc, alice } = await deployFixture();
    const deposit = 1_000n * 10n ** 6n;

    await usdc.connect(alice).approve(await vault.getAddress(), deposit);
    await vault.connect(alice).deposit(deposit, alice.address);

    expect(await vault.balanceOf(alice.address)).to.equal(deposit);
    expect(await vault.totalAssets()).to.equal(deposit);
  });

  it("reports totalAssets as idle + strategy balance", async function () {
    const { vault, usdc, aave, owner, alice } = await deployFixture();
    const deposit = 1_000n * 10n ** 6n;

    await usdc.connect(alice).approve(await vault.getAddress(), deposit);
    await vault.connect(alice).deposit(deposit, alice.address);

    await vault.connect(owner).deployToStrategy(deposit);

    expect(await usdc.balanceOf(await vault.getAddress())).to.equal(0n);
    expect(await aave.getBalance(await usdc.getAddress(), await vault.getAddress())).to.equal(
      deposit,
    );
    // totalAssets should still reflect alice's position (principal at t=0).
    expect(await vault.totalAssets()).to.equal(deposit);
  });
});
