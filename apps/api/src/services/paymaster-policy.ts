import type { Hex } from "viem";
import { logger } from "../logger.js";

/**
 * Pure sponsorship policy — given the parsed UserOp fields, decide whether
 * apps/api should sign an approval. Keep this small + readable; extend with
 * rate limits / per-user caps when moving beyond MVP.
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
        : undefined;
  if (!raw || !/^0x[0-9a-fA-F]{40}$/.test(raw)) return null;
  return raw as `0x${string}`;
}

/** Hard cap per UserOp — ZeroDev-style headroom so a runaway tx can't drain us. */
const MAX_SPONSORED_WEI = 5_000_000_000_000_000n; // 0.005 ETH

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  if (input.selector !== EXECUTE_SELECTOR) {
    return { ok: false, reason: `unsupported selector ${input.selector}` };
  }

  const vault = vaultAddressFor(input.chainId);
  if (!vault) {
    return { ok: false, reason: `unsupported chain ${input.chainId}` };
  }
  if (vault.toLowerCase() !== input.target.toLowerCase()) {
    return { ok: false, reason: `target ${input.target} is not the configured vault ${vault}` };
  }

  if (input.maxCost > MAX_SPONSORED_WEI) {
    return { ok: false, reason: `maxCost ${input.maxCost} exceeds cap ${MAX_SPONSORED_WEI}` };
  }

  logger.debug({ chainId: input.chainId, sender: input.sender, target: input.target }, "policy pass");
  return { ok: true };
}

export { EXECUTE_SELECTOR };
