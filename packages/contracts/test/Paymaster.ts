import { expect } from "chai";
import { ethers } from "hardhat";

const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

describe("Paymaster", function () {
  async function deployPaymaster() {
    const [deployer, verifier, target] = await ethers.getSigners();

    // BasePaymaster's constructor asserts the entryPoint supports IEntryPoint
    // via ERC165. For unit tests of admin controls we deploy the real
    // EntryPoint v0.7 to the canonical address using hardhat's setCode path.
    const EntryPoint = await ethers.getContractFactory(
      "@account-abstraction/contracts/core/EntryPoint.sol:EntryPoint",
    );
    const tempEp = await EntryPoint.deploy();
    const runtime = await ethers.provider.getCode(await tempEp.getAddress());
    await ethers.provider.send("hardhat_setCode", [ENTRY_POINT_V07, runtime]);

    const Paymaster = await ethers.getContractFactory("Paymaster");
    const paymaster = await Paymaster.deploy(ENTRY_POINT_V07, verifier.address, deployer.address);

    return { paymaster, deployer, verifier, target };
  }

  it("stores the verifier passed in constructor", async function () {
    const { paymaster, verifier } = await deployPaymaster();
    expect(await paymaster.verifier()).to.equal(verifier.address);
  });

  it("admin setters are gated by Ownable", async function () {
    const { paymaster, verifier, target, deployer } = await deployPaymaster();

    await expect(paymaster.connect(verifier).setVerifier(verifier.address))
      .to.be.revertedWithCustomError(paymaster, "OwnableUnauthorizedAccount");

    await expect(paymaster.connect(verifier).setTarget(target.address, true))
      .to.be.revertedWithCustomError(paymaster, "OwnableUnauthorizedAccount");

    await expect(paymaster.connect(verifier).setBudget(target.address, 1n))
      .to.be.revertedWithCustomError(paymaster, "OwnableUnauthorizedAccount");

    // Owner calls succeed.
    await paymaster.connect(deployer).setTarget(target.address, true);
    expect(await paymaster.allowedTargets(target.address)).to.equal(true);

    await paymaster.connect(deployer).setBudget(target.address, 100n);
    expect(await paymaster.gasBudget(target.address)).to.equal(100n);
  });

  it("getHash returns deterministic output and changes when params change", async function () {
    const { paymaster } = await deployPaymaster();

    const userOp = {
      sender: ethers.ZeroAddress,
      nonce: 0n,
      initCode: "0x",
      callData: "0x",
      accountGasLimits: "0x" + "00".repeat(32),
      preVerificationGas: 0n,
      gasFees: "0x" + "00".repeat(32),
      paymasterAndData: "0x",
      signature: "0x",
    };

    const h1 = await paymaster.getHash(userOp, 1000, 0);
    const h2 = await paymaster.getHash(userOp, 1000, 0);
    const h3 = await paymaster.getHash(userOp, 2000, 0);
    expect(h1).to.equal(h2);
    expect(h1).to.not.equal(h3);
  });
});
