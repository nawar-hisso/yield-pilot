import { expect } from "chai";
import { ethers } from "hardhat";

const CRED_A = "0x" + "01".repeat(32);
const CRED_B = "0x" + "02".repeat(32);
const CRED_C = "0x" + "03".repeat(32);
const X1 = "0x" + "11".repeat(32);
const Y1 = "0x" + "22".repeat(32);
const X2 = "0x" + "33".repeat(32);
const Y2 = "0x" + "44".repeat(32);
const X3 = "0x" + "55".repeat(32);
const Y3 = "0x" + "66".repeat(32);
const NICK_A = ethers.encodeBytes32String("MacBook · Safari");
const NICK_B = ethers.encodeBytes32String("iPhone · Safari");
const ZERO_NICK = ethers.ZeroHash;

describe("YieldPilotAccount", function () {
  async function deployFixture() {
    // Deployer plays the role of `entryPoint` so we can exercise execute()
    // access control without standing up the real EntryPoint singleton.
    const [deployer, stranger, recipient] = await ethers.getSigners();

    const Account = await ethers.getContractFactory("YieldPilotAccount");
    const impl = await Account.deploy(deployer.address);

    const Factory = await ethers.getContractFactory("YieldPilotAccountFactory");
    const factory = await Factory.deploy(await impl.getAddress());

    await factory.createAccount(CRED_A, X1, Y1, NICK_A, 0);
    const accountAddress = await factory.computeAddress(X1, Y1, 0);
    const account = await ethers.getContractAt("YieldPilotAccount", accountAddress);

    return { account, factory, impl, deployer, stranger, recipient, accountAddress };
  }

  it("stores the primary passkey on initialize + emits event", async function () {
    const { account } = await deployFixture();
    expect(await account.primaryCredId()).to.equal(CRED_A);
    expect(await account.pubKeyX()).to.equal(X1);
    expect(await account.pubKeyY()).to.equal(Y1);
    expect(await account.activeKeyCount()).to.equal(1);

    const record = await account.keys(CRED_A);
    expect(record.x).to.equal(X1);
    expect(record.y).to.equal(Y1);
    expect(record.active).to.equal(true);
    expect(record.nickname).to.equal(NICK_A);
  });

  it("rejects double initialization (Initializable guard)", async function () {
    const { account } = await deployFixture();
    await expect(
      account.initialize(CRED_A, X1, Y1, NICK_A),
    ).to.be.revertedWithCustomError(account, "InvalidInitialization");
  });

  it("rejects execute from non-entryPoint caller", async function () {
    const { account, stranger, recipient } = await deployFixture();
    await expect(account.connect(stranger).execute(recipient.address, 0, "0x")).to.be.reverted;
  });

  it("executes a call when invoked by the entryPoint", async function () {
    const { account, deployer, recipient } = await deployFixture();
    await deployer.sendTransaction({ to: await account.getAddress(), value: ethers.parseEther("1") });
    const before = await ethers.provider.getBalance(recipient.address);

    await account.connect(deployer).execute(recipient.address, ethers.parseEther("0.1"), "0x");

    const after = await ethers.provider.getBalance(recipient.address);
    expect(after - before).to.equal(ethers.parseEther("0.1"));
  });

  it("rejects addAuthorizedKey from non-self callers", async function () {
    const { account, deployer, stranger } = await deployFixture();
    // Even the entryPoint-impersonator (deployer) cannot call directly —
    // only the account calling itself via `execute(address(this), ...)`.
    await expect(
      account.connect(deployer).addAuthorizedKey(CRED_B, X2, Y2, NICK_B),
    ).to.be.revertedWithCustomError(account, "YieldPilotAccount__NotSelf");
    await expect(
      account.connect(stranger).addAuthorizedKey(CRED_B, X2, Y2, NICK_B),
    ).to.be.revertedWithCustomError(account, "YieldPilotAccount__NotSelf");
  });

  it("addAuthorizedKey through execute() registers the new key", async function () {
    const { account, deployer, accountAddress } = await deployFixture();

    const iface = account.interface;
    const calldata = iface.encodeFunctionData("addAuthorizedKey", [CRED_B, X2, Y2, NICK_B]);

    await expect(account.connect(deployer).execute(accountAddress, 0, calldata))
      .to.emit(account, "KeyAdded")
      .withArgs(CRED_B, X2, Y2, NICK_B);

    expect(await account.activeKeyCount()).to.equal(2);
    const all = await account.authorizedKeys();
    expect(all).to.deep.equal([CRED_A, CRED_B]);

    const record = await account.keys(CRED_B);
    expect(record.x).to.equal(X2);
    expect(record.y).to.equal(Y2);
    expect(record.active).to.equal(true);
  });

  it("addAuthorizedKey rejects duplicate credIds + zero-values", async function () {
    const { account, deployer, accountAddress } = await deployFixture();
    const iface = account.interface;

    await expect(
      account
        .connect(deployer)
        .execute(accountAddress, 0, iface.encodeFunctionData("addAuthorizedKey", [CRED_A, X2, Y2, NICK_B])),
    ).to.be.reverted; // duplicate credId

    await expect(
      account
        .connect(deployer)
        .execute(accountAddress, 0, iface.encodeFunctionData("addAuthorizedKey", [ethers.ZeroHash, X2, Y2, ZERO_NICK])),
    ).to.be.reverted; // zero credId

    await expect(
      account
        .connect(deployer)
        .execute(accountAddress, 0, iface.encodeFunctionData("addAuthorizedKey", [CRED_B, ethers.ZeroHash, Y2, ZERO_NICK])),
    ).to.be.reverted; // zero x
  });

  it("revokeKey deactivates the target + rejects revoking the last active key", async function () {
    const { account, deployer, accountAddress } = await deployFixture();
    const iface = account.interface;

    // Only primary active — revoking it must fail.
    await expect(
      account.connect(deployer).execute(accountAddress, 0, iface.encodeFunctionData("revokeKey", [CRED_A])),
    ).to.be.reverted;

    // Add a second key, then revoke the primary — should succeed.
    await account
      .connect(deployer)
      .execute(accountAddress, 0, iface.encodeFunctionData("addAuthorizedKey", [CRED_B, X2, Y2, NICK_B]));

    await expect(
      account.connect(deployer).execute(accountAddress, 0, iface.encodeFunctionData("revokeKey", [CRED_A])),
    )
      .to.emit(account, "KeyRevoked")
      .withArgs(CRED_A);

    expect(await account.activeKeyCount()).to.equal(1);
    expect((await account.keys(CRED_A)).active).to.equal(false);
    expect((await account.keys(CRED_B)).active).to.equal(true);

    // Revoking the last active now fails.
    await expect(
      account.connect(deployer).execute(accountAddress, 0, iface.encodeFunctionData("revokeKey", [CRED_B])),
    ).to.be.reverted;
  });

  it("revokeKey is idempotent for already-revoked credIds", async function () {
    const { account, deployer, accountAddress } = await deployFixture();
    const iface = account.interface;

    await account
      .connect(deployer)
      .execute(accountAddress, 0, iface.encodeFunctionData("addAuthorizedKey", [CRED_B, X2, Y2, NICK_B]));
    await account
      .connect(deployer)
      .execute(accountAddress, 0, iface.encodeFunctionData("addAuthorizedKey", [CRED_C, X3, Y3, ZERO_NICK]));
    await account
      .connect(deployer)
      .execute(accountAddress, 0, iface.encodeFunctionData("revokeKey", [CRED_B]));

    // Revoking again — no-op, no revert.
    await account
      .connect(deployer)
      .execute(accountAddress, 0, iface.encodeFunctionData("revokeKey", [CRED_B]));

    expect(await account.activeKeyCount()).to.equal(2); // A + C still active
  });

  it("authorizedKeys returns every credId ever registered (including revoked)", async function () {
    const { account, deployer, accountAddress } = await deployFixture();
    const iface = account.interface;

    await account
      .connect(deployer)
      .execute(accountAddress, 0, iface.encodeFunctionData("addAuthorizedKey", [CRED_B, X2, Y2, NICK_B]));
    await account
      .connect(deployer)
      .execute(accountAddress, 0, iface.encodeFunctionData("revokeKey", [CRED_B]));

    expect(await account.authorizedKeys()).to.deep.equal([CRED_A, CRED_B]);
  });
});
