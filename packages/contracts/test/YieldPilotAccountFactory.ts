import { expect } from "chai";
import { ethers } from "hardhat";

const X1 = "0x" + "11".repeat(32);
const Y1 = "0x" + "22".repeat(32);
const X2 = "0x" + "33".repeat(32);
const Y2 = "0x" + "44".repeat(32);

describe("YieldPilotAccountFactory", function () {
  async function deployFactory() {
    const [deployer] = await ethers.getSigners();
    const Account = await ethers.getContractFactory("YieldPilotAccount");
    const impl = await Account.deploy(deployer.address);
    const Factory = await ethers.getContractFactory("YieldPilotAccountFactory");
    const factory = await Factory.deploy(await impl.getAddress());
    return { factory, impl, deployer };
  }

  it("getAddress matches createAccount output", async function () {
    const { factory } = await deployFactory();
    const predicted = await factory.computeAddress(X1, Y1, 0);
    const tx = await factory.createAccount(X1, Y1, 0);
    await tx.wait();
    const code = await ethers.provider.getCode(predicted);
    expect(code.length).to.be.greaterThan(2); // deployed
  });

  it("is idempotent — second call returns existing account", async function () {
    const { factory } = await deployFactory();
    const predicted = await factory.computeAddress(X1, Y1, 0);

    await factory.createAccount(X1, Y1, 0);
    // Second call must not revert and must not redeploy.
    await expect(factory.createAccount(X1, Y1, 0)).not.to.be.reverted;
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

  it("initializes the clone with the passed pubkey", async function () {
    const { factory } = await deployFactory();
    await factory.createAccount(X1, Y1, 0);
    const addr = await factory.computeAddress(X1, Y1, 0);
    const Account = await ethers.getContractFactory("YieldPilotAccount");
    const account = Account.attach(addr);
    expect(await account.pubKeyX()).to.equal(X1);
    expect(await account.pubKeyY()).to.equal(Y1);
  });
});
