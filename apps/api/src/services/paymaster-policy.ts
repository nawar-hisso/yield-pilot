import type { Hex } from "viem";
import { logger } from "../logger.js";

/**
 * Sponsorship policy. Runs before we sign — enforces target + per-UserOp cap +
 * sliding-window daily caps (global + per-sender). Keeps the fast-path
 * memory-backed; a Redis rewrite is drop-in if we need multi-instance scaling.
 */

export interface PolicyInput {
  chainId: number;
  target: `0x${string}`;          // decoded from callData (execute target)
  selector: Hex;                   // first 4 bytes of callData
  sender: `0x${string}`;          // UserOp.sender (counterfactual / deployed account)
  preVerificationGas: bigint;
  maxCost: bigint;
}

export interface PolicyResult {
  ok: boolean;
  reason?: string;
}

const EXECUTE_SELECTOR: Hex = "0xb61d27f6"; // YieldPilotAccount.execute(address,uint256,bytes)

/** Per-chain allow-list of vault addresses we will sponsor deposits into. */
function vaultAddressFor(chainId: number): `0x${string}` | null {
  const raw =
    chainId === 11155111
      ? process.env.VAULT_ADDRESS_SEPOLIA
      : chainId === 84532
        ? process.env.VAULT_ADDRESS_BASE_SEPOLIA
        : chainId === 31337
          ? process.env.VAULT_ADDRESS_LOCALHOST ?? process.env.VAULT_ADDRESS_SEPOLIA
          : undefined;
  if (!raw || !/^0x[0-9a-fA-F]{40}$/.test(raw)) return null;
  return raw.toLowerCase() as `0x${string}`;
}

/** Hard cap per UserOp — the fattest ZeroDev-style ceiling we'll sponsor at all. */
const MAX_SPONSORED_WEI = 5_000_000_000_000_000n; // 0.005 ETH

/** Rolling 24-hour global cap across all senders. */
const DAILY_GLOBAL_CAP_WEI = BigInt(process.env.PAYMASTER_DAILY_GLOBAL_CAP_WEI ?? "50000000000000000"); // 0.05 ETH default

/** Rolling 24-hour cap per sender. */
const DAILY_PER_SENDER_CAP_WEI = BigInt(process.env.PAYMASTER_DAILY_PER_SENDER_CAP_WEI ?? "10000000000000000"); // 0.01 ETH default

const DAY_MS = 24 * 60 * 60 * 1000;

interface Charge {
  ts: number; // ms epoch
  amount: bigint;
}

// Sliding-window ledgers. Not persistent — restart wipes the window (acceptable
// for an MVP; drop-in Redis replaces this when we scale horizontally).
const globalLedger: Charge[] = [];
const senderLedgers = new Map<string, Charge[]>();

function prune(ledger: Charge[]): void {
  const cutoff = Date.now() - DAY_MS;
  while (ledger.length > 0 && ledger[0]!.ts < cutoff) ledger.shift();
}

function windowSum(ledger: Charge[]): bigint {
  prune(ledger);
  let sum = 0n;
  for (const c of ledger) sum += c.amount;
  return sum;
}

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  if (input.selector !== EXECUTE_SELECTOR) {
    return { ok: false, reason: `unsupported selector ${input.selector}` };
  }

  const vault = vaultAddressFor(input.chainId);
  if (!vault) {
    return { ok: false, reason: `unsupported chain ${input.chainId}` };
  }
  if (vault !== input.target.toLowerCase()) {
    return { ok: false, reason: `target ${input.target} is not the configured vault ${vault}` };
  }

  if (input.maxCost > MAX_SPONSORED_WEI) {
    return { ok: false, reason: `maxCost ${input.maxCost} exceeds per-op cap ${MAX_SPONSORED_WEI}` };
  }

  // Daily caps (projected if approved).
  const senderKey = input.sender.toLowerCase();
  const senderLedger = senderLedgers.get(senderKey) ?? [];
  const senderProjected = windowSum(senderLedger) + input.maxCost;
  if (senderProjected > DAILY_PER_SENDER_CAP_WEI) {
    return {
      ok: false,
      reason: `sender daily cap exceeded: would spend ${senderProjected} > ${DAILY_PER_SENDER_CAP_WEI}`,
    };
  }

  const globalProjected = windowSum(globalLedger) + input.maxCost;
  if (globalProjected > DAILY_GLOBAL_CAP_WEI) {
    return {
      ok: false,
      reason: `global daily cap exceeded: would spend ${globalProjected} > ${DAILY_GLOBAL_CAP_WEI}`,
    };
  }

  logger.debug(
    { chainId: input.chainId, sender: input.sender, target: input.target, maxCost: input.maxCost.toString() },
    "policy pass",
  );
  return { ok: true };
}

/**
 * Record that a sponsorship was approved. Call this AFTER the signer returns —
 * before the UserOp actually broadcasts. In the worst case we over-book the
 * window if the user abandons the UserOp, erring conservative.
 */
export function recordCharge(sender: `0x${string}`, maxCost: bigint): void {
  const charge: Charge = { ts: Date.now(), amount: maxCost };
  globalLedger.push(charge);
  const key = sender.toLowerCase();
  const senderLedger = senderLedgers.get(key) ?? [];
  senderLedger.push(charge);
  senderLedgers.set(key, senderLedger);
}

/** Reset state for tests. */
export function __resetPolicyStateForTests(): void {
  globalLedger.length = 0;
  senderLedgers.clear();
}

export { EXECUTE_SELECTOR, DAILY_GLOBAL_CAP_WEI, DAILY_PER_SENDER_CAP_WEI };
