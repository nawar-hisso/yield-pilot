import { expect } from "chai";
import { ethers } from "hardhat";

const X = "0x" + "11".repeat(32);
const Y = "0x" + "22".repeat(32);

describe("YieldPilotAccount (skeleton)", function () {
  async function deployFixture() {
    // We pass the deployer's EOA as the "entryPoint" so we can impersonate it
    // when testing `execute` access control, without standing up the real
    // EntryPoint singleton.
    const [deployer, stranger, recipient] = await ethers.getSigners();

    const Account = await ethers.getContractFactory("YieldPilotAccount");
    const impl = await Account.deploy(deployer.address);

    const Factory = await ethers.getContractFactory("YieldPilotAccountFactory");
    const factory = await Factory.deploy(await impl.getAddress());

    await factory.createAccount(X, Y, 0);
    const accountAddress = await factory.computeAddress(X, Y, 0);
    const account = Account.attach(accountAddress);

    return { account, factory, impl, deployer, stranger, recipient };
  }

  it("stores the passkey public key on initialize", async function () {
    const { account } = await deployFixture();
    expect(await account.pubKeyX()).to.equal(X);
    expect(await account.pubKeyY()).to.equal(Y);
  });

  it("rejects double initialization (Initializable guard)", async function () {
    const { account } = await deployFixture();
    await expect(account.initialize(X, Y)).to.be.revertedWithCustomError(
      account,
      "InvalidInitialization",
    );
  });

  it("rejects execute from non-entryPoint caller", async function () {
    const { account, stranger, recipient } = await deployFixture();
    await expect(account.connect(stranger).execute(recipient.address, 0, "0x")).to.be.reverted;
  });

  it("executes a call when invoked by the entryPoint", async function () {
    const { account, deployer, recipient } = await deployFixture();
    // Deployer is the fake entryPoint in this fixture.
    await deployer.sendTransaction({ to: await account.getAddress(), value: ethers.parseEther("1") });
    const before = await ethers.provider.getBalance(recipient.address);

    await account.connect(deployer).execute(recipient.address, ethers.parseEther("0.1"), "0x");

    const after = await ethers.provider.getBalance(recipient.address);
    expect(after - before).to.equal(ethers.parseEther("0.1"));
  });
});
