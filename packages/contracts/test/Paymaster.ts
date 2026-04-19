import { expect } from "chai";
import { ethers } from "hardhat";
import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";

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

  async function impersonateEntryPoint() {
    await ethers.provider.send("hardhat_impersonateAccount", [ENTRY_POINT_V07]);
    await ethers.provider.send("hardhat_setBalance", [ENTRY_POINT_V07, "0x56BC75E2D63100000"]); // 100 ETH
    return await ethers.getSigner(ENTRY_POINT_V07);
  }

  /** Build a PackedUserOperation skeleton good enough to exercise target checks. */
  function makeUserOp(params: {
    sender: string;
    callData: string;
    paymaster: string;
  }) {
    // 52-byte paymaster prefix + 6+6+65 = 129 bytes of paymasterAndData = 52+77=129.
    // We just need the paymasterAndData length to pass the sanity check; sig will
    // fail recovery but recovery failure sets SIG_VALIDATION_FAILED (not a revert),
    // so target + sender checks still run first.
    const paymasterAndData =
      params.paymaster.toLowerCase() +
      "00".repeat(32) + // validation/postOp gas limits (16 + 16)
      "00".repeat(6) + // validUntil
      "00".repeat(6) + // validAfter
      "00".repeat(65); // signature
    return {
      sender: params.sender,
      nonce: 0n,
      initCode: "0x",
      callData: params.callData,
      accountGasLimits: "0x" + "00".repeat(32),
      preVerificationGas: 0n,
      gasFees: "0x" + "00".repeat(32),
      paymasterAndData,
      signature: "0x",
    };
  }

  function executeCallData(target: string, data = "0x"): string {
    const iface = new ethers.Interface(["function execute(address,uint256,bytes)"]);
    return iface.encodeFunctionData("execute", [target, 0n, data]);
  }

  function executeBatchCallData(targets: string[], datas: string[] = []): string {
    const iface = new ethers.Interface(["function executeBatch(address[],uint256[],bytes[])"]);
    const values = targets.map(() => 0n);
    const d = datas.length === targets.length ? datas : targets.map(() => "0x");
    return iface.encodeFunctionData("executeBatch", [targets, values, d]);
  }

  it("stores the verifier passed in constructor", async function () {
    const { paymaster, verifier } = await deployPaymaster();
    expect(await paymaster.verifier()).to.equal(verifier.address);
  });

  it("exposes the canonical execute + executeBatch selectors", async function () {
    const { paymaster } = await deployPaymaster();
    const execSel = "0x" + keccak256(toUtf8Bytes("execute(address,uint256,bytes)")).slice(2, 10);
    const batchSel =
      "0x" + keccak256(toUtf8Bytes("executeBatch(address[],uint256[],bytes[])")).slice(2, 10);
    expect(await paymaster.EXECUTE_SELECTOR()).to.equal(execSel);
    expect(await paymaster.EXECUTE_BATCH_SELECTOR()).to.equal(batchSel);
    // Matches the AA33 selector the frontend previously saw rejected.
    expect(batchSel).to.equal("0x47e1da2a");
  });

  it("admin setters are gated by Ownable", async function () {
    const { paymaster, verifier, target, deployer } = await deployPaymaster();

    await expect(paymaster.connect(verifier).setVerifier(verifier.address))
      .to.be.revertedWithCustomError(paymaster, "OwnableUnauthorizedAccount");

    await expect(paymaster.connect(verifier).setTarget(target.address, true))
      .to.be.revertedWithCustomError(paymaster, "OwnableUnauthorizedAccount");

    await expect(paymaster.connect(verifier).setBudget(target.address, 1n))
      .to.be.revertedWithCustomError(paymaster, "OwnableUnauthorizedAccount");

    await expect(paymaster.connect(verifier).setFactory(target.address, true))
      .to.be.revertedWithCustomError(paymaster, "OwnableUnauthorizedAccount");

    await expect(paymaster.connect(verifier).setAllowedSender(target.address, true))
      .to.be.revertedWithCustomError(paymaster, "OwnableUnauthorizedAccount");

    // Owner calls succeed.
    await paymaster.connect(deployer).setTarget(target.address, true);
    expect(await paymaster.allowedTargets(target.address)).to.equal(true);

    await paymaster.connect(deployer).setBudget(target.address, 100n);
    expect(await paymaster.gasBudget(target.address)).to.equal(100n);

    await paymaster.connect(deployer).setFactory(target.address, true);
    expect(await paymaster.allowedFactories(target.address)).to.equal(true);
  });

  it("getHash returns deterministic output and changes when params change", async function () {
    const { paymaster } = await deployPaymaster();

    const paymasterAndData = "0x" + "00".repeat(52);
    const userOp = {
      sender: ethers.ZeroAddress,
      nonce: 0n,
      initCode: "0x",
      callData: "0x",
      accountGasLimits: "0x" + "00".repeat(32),
      preVerificationGas: 0n,
      gasFees: "0x" + "00".repeat(32),
      paymasterAndData,
      signature: "0x",
    };

    const h1 = await paymaster.getHash(userOp, 1000, 0);
    const h2 = await paymaster.getHash(userOp, 1000, 0);
    const h3 = await paymaster.getHash(userOp, 2000, 0);
    expect(h1).to.equal(h2);
    expect(h1).to.not.equal(h3);
  });

  it("executeBatch with an unallowed target reverts with Paymaster__TargetNotAllowed", async function () {
    const { paymaster, deployer, target } = await deployPaymaster();
    const sender = deployer.address; // sender allow-list pre-populated below

    // Whitelist only one of the two targets in the batch.
    await paymaster.connect(deployer).setTarget(target.address, true);
    const unallowed = ethers.Wallet.createRandom().address;
    await paymaster.connect(deployer).setAllowedSender(sender, true);

    const callData = executeBatchCallData([target.address, unallowed]);
    const userOp = makeUserOp({
      sender,
      callData,
      paymaster: await paymaster.getAddress(),
    });

    const ep = await impersonateEntryPoint();
    await expect(
      paymaster.connect(ep).validatePaymasterUserOp(userOp, ethers.ZeroHash, 0n),
    )
      .to.be.revertedWithCustomError(paymaster, "Paymaster__TargetNotAllowed")
      .withArgs(unallowed);
  });

  it("executeBatch with all allowed targets clears the target + sender checks", async function () {
    const { paymaster, deployer, target, verifier } = await deployPaymaster();
    const sender = deployer.address;

    await paymaster.connect(deployer).setTarget(target.address, true);
    const targetB = verifier.address; // reuse a known-allocated address for the second target
    await paymaster.connect(deployer).setTarget(targetB, true);
    await paymaster.connect(deployer).setAllowedSender(sender, true);

    const callData = executeBatchCallData([target.address, targetB]);
    const userOp = makeUserOp({
      sender,
      callData,
      paymaster: await paymaster.getAddress(),
    });

    const ep = await impersonateEntryPoint();
    // The all-zero signature will fail ECDSA recovery, but that returns
    // SIG_VALIDATION_FAILED (not a revert). What we're asserting is that the
    // target + sender checks don't revert first.
    const ret = await paymaster.connect(ep).validatePaymasterUserOp.staticCall(
      userOp,
      ethers.ZeroHash,
      0n,
    );
    // `context` should be non-empty (sender, target, maxCost abi-encoded).
    expect(ret.context).to.not.equal("0x");
    const [decodedSender, decodedPrimary] = AbiCoder.defaultAbiCoder().decode(
      ["address", "address", "uint256"],
      ret.context,
    );
    expect(decodedSender.toLowerCase()).to.equal(sender.toLowerCase());
    expect(decodedPrimary.toLowerCase()).to.equal(target.address.toLowerCase());
  });

  it("rejects unsupported selectors", async function () {
    const { paymaster, deployer } = await deployPaymaster();
    await paymaster.connect(deployer).setAllowedSender(deployer.address, true);

    const bogus = "0xdeadbeef" + "00".repeat(32);
    const userOp = makeUserOp({
      sender: deployer.address,
      callData: bogus,
      paymaster: await paymaster.getAddress(),
    });

    const ep = await impersonateEntryPoint();
    await expect(
      paymaster.connect(ep).validatePaymasterUserOp(userOp, ethers.ZeroHash, 0n),
    )
      .to.be.revertedWithCustomError(paymaster, "Paymaster__UnsupportedSelector")
      .withArgs("0xdeadbeef");
  });
});
