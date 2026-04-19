import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { Deposit, Withdraw, YieldVault as YieldVaultContract } from "../generated/YieldVault/YieldVault";
import {
  VaultDeposit,
  VaultWithdrawal,
  UserPosition,
  VaultStats,
  SharePriceSnapshot,
} from "../generated/schema";

const STATS_ID = Bytes.fromHexString("0x00");
const ONE_E18 = BigInt.fromString("1000000000000000000");

/**
 * Snapshot the vault's on-chain share price at the current event block.
 * Uses eth_call into totalAssets() + totalSupply() so the snapshot reflects
 * strategy yield, not just deposit/withdraw deltas.
 */
function snapshotSharePrice(event: ethereum.Event): void {
  const vault = YieldVaultContract.bind(event.address);
  const taRes = vault.try_totalAssets();
  const tsRes = vault.try_totalSupply();
  if (taRes.reverted || tsRes.reverted) return;

  const id = event.transaction.hash.concatI32(event.logIndex.toI32());
  const snap = new SharePriceSnapshot(id);
  snap.timestamp = event.block.timestamp;
  snap.block = event.block.number;
  snap.totalAssets = taRes.value;
  snap.totalShares = tsRes.value;
  snap.priceE18 = tsRes.value.equals(BigInt.zero())
    ? ONE_E18
    : taRes.value.times(ONE_E18).div(tsRes.value);
  snap.save();
}

function loadPosition(user: Bytes): UserPosition {
  let p = UserPosition.load(user);
  if (p == null) {
    p = new UserPosition(user);
    p.totalDeposited = BigInt.zero();
    p.totalWithdrawn = BigInt.zero();
    p.currentShares = BigInt.zero();
    p.depositCount = 0;
    p.lastActivity = BigInt.zero();
  }
  return p as UserPosition;
}

function loadStats(): VaultStats {
  let s = VaultStats.load(STATS_ID);
  if (s == null) {
    s = new VaultStats(STATS_ID);
    s.totalAssets = BigInt.zero();
    s.totalShares = BigInt.zero();
    s.uniqueDepositors = 0;
    s.updatedAt = BigInt.zero();
  }
  return s as VaultStats;
}

export function handleDeposit(event: Deposit): void {
  const id = event.transaction.hash.concatI32(event.logIndex.toI32());
  const entry = new VaultDeposit(id);
  entry.user = event.params.owner;
  entry.assets = event.params.assets;
  entry.shares = event.params.shares;
  entry.timestamp = event.block.timestamp;
  entry.block = event.block.number;
  entry.transactionHash = event.transaction.hash;
  entry.save();

  const p = loadPosition(event.params.owner);
  const isFirst = p.depositCount == 0;
  p.totalDeposited = p.totalDeposited.plus(event.params.assets);
  p.currentShares = p.currentShares.plus(event.params.shares);
  p.depositCount = p.depositCount + 1;
  p.lastActivity = event.block.timestamp;
  p.save();

  const s = loadStats();
  s.totalShares = s.totalShares.plus(event.params.shares);
  s.totalAssets = s.totalAssets.plus(event.params.assets);
  if (isFirst) s.uniqueDepositors = s.uniqueDepositors + 1;
  s.updatedAt = event.block.timestamp;
  s.save();

  snapshotSharePrice(event);
}

export function handleWithdraw(event: Withdraw): void {
  const id = event.transaction.hash.concatI32(event.logIndex.toI32());
  const entry = new VaultWithdrawal(id);
  entry.user = event.params.owner;
  entry.assets = event.params.assets;
  entry.shares = event.params.shares;
  entry.timestamp = event.block.timestamp;
  entry.block = event.block.number;
  entry.transactionHash = event.transaction.hash;
  entry.save();

  const p = loadPosition(event.params.owner);
  p.totalWithdrawn = p.totalWithdrawn.plus(event.params.assets);
  p.currentShares = p.currentShares.ge(event.params.shares)
    ? p.currentShares.minus(event.params.shares)
    : BigInt.zero();
  p.lastActivity = event.block.timestamp;
  p.save();

  const s = loadStats();
  s.totalShares = s.totalShares.ge(event.params.shares)
    ? s.totalShares.minus(event.params.shares)
    : BigInt.zero();
  s.totalAssets = s.totalAssets.ge(event.params.assets)
    ? s.totalAssets.minus(event.params.assets)
    : BigInt.zero();
  s.updatedAt = event.block.timestamp;
  s.save();

  snapshotSharePrice(event);
}
