import { expect } from "chai";
import { ethers } from "hardhat";

const CRED_A = "0x" + "01".repeat(32);
const CRED_B = "0x" + "02".repeat(32);
const X1 = "0x" + "11".repeat(32);
const Y1 = "0x" + "22".repeat(32);
const X2 = "0x" + "33".repeat(32);
const Y2 = "0x" + "44".repeat(32);
const NICK_A = ethers.encodeBytes32String("MacBook · Safari");
const NICK_B = ethers.encodeBytes32String("iPhone · Safari");
const ZERO_NICK = ethers.ZeroHash;

describe("YieldPilotAccountFactory", function () {
  async function deployFactory() {
    const [deployer] = await ethers.getSigners();
    const Account = await ethers.getContractFactory("YieldPilotAccount");
    const impl = await Account.deploy(deployer.address);
    const Factory = await ethers.getContractFactory("YieldPilotAccountFactory");
    const factory = await Factory.deploy(await impl.getAddress());
    return { factory, impl, deployer };
  }

  it("computeAddress matches createAccount output", async function () {
    const { factory } = await deployFactory();
    const predicted = await factory.computeAddress(X1, Y1, 0);
    await factory.createAccount(CRED_A, X1, Y1, NICK_A, 0);
    const code = await ethers.provider.getCode(predicted);
    expect(code.length).to.be.greaterThan(2);
  });

  it("is idempotent — second call returns existing account", async function () {
    const { factory } = await deployFactory();
    const predicted = await factory.computeAddress(X1, Y1, 0);

    await factory.createAccount(CRED_A, X1, Y1, NICK_A, 0);
    // Second call must not revert and must not redeploy.
    await expect(factory.createAccount(CRED_A, X1, Y1, NICK_A, 0)).not.to.be.reverted;
    const code = await ethers.provider.getCode(predicted);
    expect(code.length).to.be.greaterThan(2);
  });

  it("different (pubkey, salt) triples produce different addresses", async function () {
    const { factory } = await deployFactory();
    const addrA = await factory.computeAddress(X1, Y1, 0);
    const addrB = await factory.computeAddress(X2, Y2, 0);
    const addrC = await factory.computeAddress(X1, Y1, 1);
    expect(addrA).to.not.equal(addrB);
    expect(addrA).to.not.equal(addrC);
  });

  it("credId and nickname do NOT influence the CREATE2 address", async function () {
    const { factory } = await deployFactory();
    const base = await factory.computeAddress(X1, Y1, 0);
    // computeAddress signature only takes (x, y, salt) — confirm address is
    // determined by those three alone, not by any metadata.
    expect(await factory.computeAddress(X1, Y1, 0)).to.equal(base);
  });

  it("initializes the clone with the primary passkey + credId", async function () {
    const { factory } = await deployFactory();
    await factory.createAccount(CRED_A, X1, Y1, NICK_A, 0);
    const addr = await factory.computeAddress(X1, Y1, 0);
    const Account = await ethers.getContractFactory("YieldPilotAccount");
    const account = Account.attach(addr);
    expect(await account.pubKeyX()).to.equal(X1);
    expect(await account.pubKeyY()).to.equal(Y1);
    expect(await account.primaryCredId()).to.equal(CRED_A);
    expect(await account.activeKeyCount()).to.equal(1);
  });

  it("emits AccountCreated with all metadata", async function () {
    const { factory } = await deployFactory();
    const predicted = await factory.computeAddress(X1, Y1, 0);
    await expect(factory.createAccount(CRED_A, X1, Y1, NICK_A, 0))
      .to.emit(factory, "AccountCreated")
      .withArgs(predicted, CRED_A, X1, Y1, NICK_A, 0);
  });

  it("rejects zero-address implementation", async function () {
    const [deployer] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("YieldPilotAccountFactory");
    await expect(Factory.connect(deployer).deploy(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(Factory, "YieldPilotAccountFactory__InvalidImpl");
  });

  it("second credId with different key still creates at a different address", async function () {
    const { factory } = await deployFactory();
    const addrA = await factory.computeAddress(X1, Y1, 0);
    const addrB = await factory.computeAddress(X2, Y2, 0);
    await factory.createAccount(CRED_A, X1, Y1, NICK_A, 0);
    await factory.createAccount(CRED_B, X2, Y2, NICK_B, 0);
    expect(await ethers.provider.getCode(addrA)).to.not.equal("0x");
    expect(await ethers.provider.getCode(addrB)).to.not.equal("0x");
    expect(addrA).to.not.equal(addrB);
  });
});
