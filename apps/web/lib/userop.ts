import {
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  toHex,
} from "viem";
import { apiFetch } from "./api";
import { publicClient } from "./viem";
import {
  buildInitCode,
  encodePasskeySignature,
  packAccountGasLimits,
  packGasFees,
} from "./account";
import { signUserOpHash } from "./passkey";

/**
 * ERC-4337 v0.7 UserOperation builder + Pimlico bundler plumbing.
 *
 * This module is deliberately framework-free so it can be unit-tested without
 * a React tree. The only side-effect it performs is `fetch()` (bundler + apps/api).
 *
 * Flow for a single UserOp:
 *   1. Resolve counterfactual sender address (caller supplies it).
 *   2. Fetch nonce from EntryPoint.getNonce(sender, 0).
 *   3. Derive initCode (empty if sender already has code).
 *   4. Pack dummy gas limits + a dummy signature, send to the bundler's
 *      `eth_estimateUserOperationGas` to get real limits.
 *   5. Pack real limits, request a paymaster signature from apps/api.
 *   6. Compute the v0.7 userOpHash (see `computeUserOpHashV07` below).
 *   7. Ask the user's authenticator to sign the hash.
 *   8. Encode the 5-field passkey envelope + submit via `eth_sendUserOperation`.
 *   9. Poll `eth_getUserOperationReceipt` until it returns a receipt.
 */

// ───────────────────────── Constants ─────────────────────────

export const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;

/** Dummy signature used during gas estimation. 200 bytes of 0xff mimics a real
 *  passkey envelope well enough for the bundler to estimate verification gas. */
const DUMMY_SIGNATURE = ("0x" + "ff".repeat(200)) as Hex;

/** Size of the pre-verification gas buffer we add on top of the bundler estimate
 *  to cover the paymaster signing overhead + any mempool-time gas variance. */
const PRE_VERIFICATION_GAS_BUFFER = 10_000n;

// ───────────────────────── Types ─────────────────────────

export interface PackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex; // packed (verificationGasLimit, callGasLimit)
  preVerificationGas: bigint;
  gasFees: Hex; // packed (maxPriorityFeePerGas, maxFeePerGas)
  paymasterAndData: Hex;
  signature: Hex;
}

export interface SponsorshipRequestBody {
  chainId: number;
  paymasterAddress: Address;
  userOp: {
    sender: Address;
    nonce: string; // decimal
    initCode: Hex;
    callData: Hex;
    accountGasLimits: Hex;
    preVerificationGas: string;
    gasFees: Hex;
  };
  maxCost: string;
  paymasterValidationGasLimit: string;
  paymasterPostOpGasLimit: string;
}

export interface SponsorshipResponse {
  paymasterAndData: Hex;
  validUntil: number;
  validAfter: number;
  hash: Hex;
  signature: Hex;
}

export interface BuildAndSendArgs {
  /** Counterfactual smart-account address. */
  sender: Address;
  /** Account.execute / executeBatch calldata. */
  callData: Hex;
  /** Chain the UserOp lands on. Pimlico only serves real testnets/mainnets. */
  chainId: number;
  /** Paymaster contract address (Sepolia: NEXT_PUBLIC_PAYMASTER_CONTRACT_ADDRESS). */
  paymaster: Address;
  /** Passkey `credentialId` the user will sign with. Required — no silent fallback. */
  credentialId: string;
  /** Counterfactual-address inputs. Needed when the account has no code yet. */
  initCodeArgs?: {
    factory: Address;
    credIdHash: Hex;
    pubKeyX: Hex;
    pubKeyY: Hex;
    nickname?: Hex;
    salt?: bigint;
  };
}

export interface UserOpReceipt {
  userOpHash: Hex;
  txHash: Hex;
  success: boolean;
  actualGasCost: bigint;
  actualGasUsed: bigint;
}

// ───────────────────────── Public API ─────────────────────────

/** Compute the bundler RPC URL for a given chain using the project's API key. */
export function bundlerUrlFor(chainId: number): string {
  const key = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_PIMLICO_API_KEY missing — create a project at https://dashboard.pimlico.io and paste the key into .env.local.",
    );
  }
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${key}`;
}

/** Ask apps/api to sign a sponsorship approval. Returns paymasterAndData. */
export async function requestSponsorship(args: {
  chainId: number;
  paymasterAddress: Address;
  draft: Omit<PackedUserOperation, "paymasterAndData" | "signature">;
  maxCost: bigint;
  paymasterValidationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
}): Promise<SponsorshipResponse> {
  const body: SponsorshipRequestBody = {
    chainId: args.chainId,
    paymasterAddress: args.paymasterAddress,
    userOp: {
      sender: args.draft.sender,
      nonce: args.draft.nonce.toString(10),
      initCode: args.draft.initCode,
      callData: args.draft.callData,
      accountGasLimits: args.draft.accountGasLimits,
      preVerificationGas: args.draft.preVerificationGas.toString(10),
      gasFees: args.draft.gasFees,
    },
    maxCost: args.maxCost.toString(10),
    paymasterValidationGasLimit: args.paymasterValidationGasLimit.toString(10),
    paymasterPostOpGasLimit: args.paymasterPostOpGasLimit.toString(10),
  };
  return apiFetch<SponsorshipResponse>("/api/paymaster/sponsor", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * End-to-end UserOp pipeline. Signs with the user's passkey, sponsors gas via
 * our Paymaster backend, submits via Pimlico, and returns the UserOp hash.
 */
export async function buildAndSendUserOp(args: BuildAndSendArgs): Promise<Hex> {
  const { sender, callData, chainId, paymaster, credentialId } = args;

  // 1. initCode — empty if account already deployed.
  const code = await publicClient.getBytecode({ address: sender });
  const accountDeployed = Boolean(code && code !== "0x");
  let initCode: Hex = "0x";
  if (!accountDeployed) {
    if (!args.initCodeArgs) {
      throw new Error(
        "initCodeArgs required: account not deployed yet and the factory/pubkey bundle is needed to build initCode",
      );
    }
    initCode = buildInitCode(args.initCodeArgs);
  }

  // 2. Nonce — EntryPoint.getNonce(sender, 0).
  const nonce = await fetchEntryPointNonce(sender);

  // 3. Gas price — Pimlico's helper returns fast/standard/slow tiers.
  const { maxFeePerGas, maxPriorityFeePerGas } = await fetchPimlicoGasPrice(chainId);

  // 4. Estimate — dummy limits + dummy sig, real init/call, zero paymaster.
  //    The bundler returns back the three gas budgets we plug into the real op.
  const dummyAccountGasLimits = packAccountGasLimits(1_000_000n, 1_000_000n);
  const dummyGasFees = packGasFees(maxPriorityFeePerGas, maxFeePerGas);
  const estimate = await estimateUserOpGas(chainId, {
    sender,
    nonce,
    initCode,
    callData,
    accountGasLimits: dummyAccountGasLimits,
    preVerificationGas: 60_000n,
    gasFees: dummyGasFees,
    paymasterAndData: "0x",
    signature: DUMMY_SIGNATURE,
  });

  const accountGasLimits = packAccountGasLimits(
    estimate.verificationGasLimit,
    estimate.callGasLimit,
  );
  const gasFees = packGasFees(maxPriorityFeePerGas, maxFeePerGas);
  const preVerificationGas = estimate.preVerificationGas + PRE_VERIFICATION_GAS_BUFFER;

  // 5. Paymaster sponsorship. Worst-case cost bound the paymaster commits to
  //    cover = (verGas + callGas + preVerGas + pmValGas + pmPostGas) * maxFeePerGas.
  const paymasterValidationGasLimit = 150_000n;
  const paymasterPostOpGasLimit = 80_000n;
  const maxCost =
    (estimate.verificationGasLimit +
      estimate.callGasLimit +
      preVerificationGas +
      paymasterValidationGasLimit +
      paymasterPostOpGasLimit) *
    maxFeePerGas;

  const sponsorship = await requestSponsorship({
    chainId,
    paymasterAddress: paymaster,
    draft: {
      sender,
      nonce,
      initCode,
      callData,
      accountGasLimits,
      preVerificationGas,
      gasFees,
    },
    maxCost,
    paymasterValidationGasLimit,
    paymasterPostOpGasLimit,
  });

  // 6. Hash the final op (with sponsored paymasterAndData).
  const userOpHash = computeUserOpHashV07({
    sender,
    nonce,
    initCode,
    callData,
    accountGasLimits,
    preVerificationGas,
    gasFees,
    paymasterAndData: sponsorship.paymasterAndData,
    signature: "0x",
  }, chainId);

  // 7. Ask the passkey to sign.
  const assertion = await signUserOpHash(credentialId, userOpHash);

  // 8. Encode the 5-field signature envelope + submit.
  const signature = encodePasskeySignature({
    credIdHash: assertion.credIdHash,
    authenticatorData: assertion.authenticatorData,
    clientDataJSON: assertion.clientDataJSON,
    r: assertion.r,
    s: assertion.s,
  });

  const finalOp: PackedUserOperation = {
    sender,
    nonce,
    initCode,
    callData,
    accountGasLimits,
    preVerificationGas,
    gasFees,
    paymasterAndData: sponsorship.paymasterAndData,
    signature,
  };

  return submitUserOp(finalOp, chainId);
}

/** Poll `eth_getUserOperationReceipt` until the bundler returns a receipt. */
export async function waitForUserOpReceipt(
  userOpHash: Hex,
  chainId: number,
  opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<UserOpReceipt> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const receipt = await fetchUserOpReceipt(userOpHash, chainId);
    if (receipt) return receipt;
    await sleep(pollIntervalMs);
  }
  throw new Error(`UserOp ${userOpHash} not mined within ${timeoutMs}ms`);
}

/** Fire-and-forget bundler call. Returns the UserOp hash. */
export async function submitUserOp(userOp: PackedUserOperation, chainId: number): Promise<Hex> {
  const rpc = {
    jsonrpc: "2.0",
    method: "eth_sendUserOperation",
    id: Date.now(),
    params: [toUnpackedRpcForm(userOp), ENTRY_POINT_V07],
  };
  return bundlerRpc<Hex>(chainId, rpc);
}

/**
 * Convert our internal packed v0.7 UserOperation into the **unpacked** JSON
 * shape bundlers accept over RPC (eth_sendUserOperation + eth_estimateUserOperationGas).
 *
 * Packing is a v0.7 calldata optimisation for the EntryPoint struct; the
 * bundler repacks it itself before submitting on-chain. The RPC schema is the
 * original v0.6-style separate fields, with v0.7 adding split factory/paymaster:
 *
 *   accountGasLimits  → verificationGasLimit (first 16B) + callGasLimit (last 16B)
 *   gasFees           → maxPriorityFeePerGas (first 16B) + maxFeePerGas (last 16B)
 *   initCode          → factory (first 20B) + factoryData (rest)    — omit if 0x
 *   paymasterAndData  → paymaster (first 20B) + paymasterVerificationGasLimit (next 16B)
 *                       + paymasterPostOpGasLimit (next 16B) + paymasterData (rest)
 *                                                                    — omit if 0x
 */
function toUnpackedRpcForm(op: PackedUserOperation): Record<string, unknown> {
  const { verificationGasLimit, callGasLimit } = unpackBytes32Pair(op.accountGasLimits);
  const { high: maxPriorityFeePerGas, low: maxFeePerGas } = unpackGasFees(op.gasFees);

  const base: Record<string, unknown> = {
    sender: op.sender,
    nonce: toHex(op.nonce),
    callData: op.callData,
    callGasLimit: toHex(callGasLimit),
    verificationGasLimit: toHex(verificationGasLimit),
    preVerificationGas: toHex(op.preVerificationGas),
    maxFeePerGas: toHex(maxFeePerGas),
    maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
    signature: op.signature,
  };

  if (op.initCode && op.initCode !== "0x") {
    const { factory, factoryData } = splitInitCode(op.initCode);
    base.factory = factory;
    base.factoryData = factoryData;
  }

  if (op.paymasterAndData && op.paymasterAndData !== "0x") {
    const pm = splitPaymasterAndData(op.paymasterAndData);
    base.paymaster = pm.paymaster;
    base.paymasterVerificationGasLimit = toHex(pm.paymasterVerificationGasLimit);
    base.paymasterPostOpGasLimit = toHex(pm.paymasterPostOpGasLimit);
    base.paymasterData = pm.paymasterData;
  }

  return base;
}

function unpackBytes32Pair(packed: Hex): { verificationGasLimit: bigint; callGasLimit: bigint } {
  if (packed.length !== 66) throw new Error(`accountGasLimits must be 32 bytes, got ${packed.length}`);
  const high = BigInt("0x" + packed.slice(2, 34));
  const low = BigInt("0x" + packed.slice(34));
  return { verificationGasLimit: high, callGasLimit: low };
}

function unpackGasFees(packed: Hex): { high: bigint; low: bigint } {
  if (packed.length !== 66) throw new Error(`gasFees must be 32 bytes, got ${packed.length}`);
  const high = BigInt("0x" + packed.slice(2, 34));
  const low = BigInt("0x" + packed.slice(34));
  return { high, low };
}

function splitInitCode(initCode: Hex): { factory: Address; factoryData: Hex } {
  if (initCode.length < 42) throw new Error(`initCode too short: ${initCode.length} hex chars`);
  const factory = ("0x" + initCode.slice(2, 42)) as Address;
  const factoryData = ("0x" + initCode.slice(42)) as Hex;
  return { factory, factoryData };
}

function splitPaymasterAndData(pmd: Hex): {
  paymaster: Address;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
  paymasterData: Hex;
} {
  // Layout: paymaster(20) | pmVerGas(16) | pmPostOpGas(16) | data(rest)
  if (pmd.length < 2 + 40 + 32 + 32) {
    throw new Error(`paymasterAndData too short: ${pmd.length} hex chars`);
  }
  const paymaster = ("0x" + pmd.slice(2, 42)) as Address;
  const pmVerGas = BigInt("0x" + pmd.slice(42, 74));
  const pmPostGas = BigInt("0x" + pmd.slice(74, 106));
  const paymasterData = ("0x" + pmd.slice(106)) as Hex;
  return {
    paymaster,
    paymasterVerificationGasLimit: pmVerGas,
    paymasterPostOpGasLimit: pmPostGas,
    paymasterData,
  };
}

// ───────────────────────── UserOp hashing (v0.7) ─────────────────────────

/**
 * v0.7 userOpHash:
 *   inner = keccak256(abi.encode(
 *     sender, nonce, keccak256(initCode), keccak256(callData),
 *     accountGasLimits, preVerificationGas, gasFees, keccak256(paymasterAndData)
 *   ))
 *   userOpHash = keccak256(abi.encode(inner, entryPoint, chainId))
 */
export function computeUserOpHashV07(op: PackedUserOperation, chainId: number): Hex {
  const inner = keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        op.sender,
        op.nonce,
        keccak256(op.initCode),
        keccak256(op.callData),
        op.accountGasLimits,
        op.preVerificationGas,
        op.gasFees,
        keccak256(op.paymasterAndData),
      ],
    ),
  );
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [inner, ENTRY_POINT_V07, BigInt(chainId)],
    ),
  );
}

// ───────────────────────── Internal RPC helpers ─────────────────────────

interface BundlerGasEstimate {
  preVerificationGas: bigint;
  verificationGasLimit: bigint;
  callGasLimit: bigint;
}

async function estimateUserOpGas(
  chainId: number,
  op: PackedUserOperation,
): Promise<BundlerGasEstimate> {
  const rpc = {
    jsonrpc: "2.0",
    method: "eth_estimateUserOperationGas",
    id: Date.now(),
    params: [toUnpackedRpcForm(op), ENTRY_POINT_V07],
  };
  const json = await bundlerRpc<{
    preVerificationGas: Hex;
    verificationGasLimit: Hex;
    callGasLimit: Hex;
    paymasterVerificationGasLimit?: Hex;
    paymasterPostOpGasLimit?: Hex;
  }>(chainId, rpc);
  return {
    preVerificationGas: BigInt(json.preVerificationGas),
    verificationGasLimit: BigInt(json.verificationGasLimit),
    callGasLimit: BigInt(json.callGasLimit),
  };
}

async function fetchPimlicoGasPrice(chainId: number): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  const rpc = {
    jsonrpc: "2.0",
    method: "pimlico_getUserOperationGasPrice",
    id: Date.now(),
    params: [],
  };
  const json = await bundlerRpc<{
    standard: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
  }>(chainId, rpc);
  return {
    maxFeePerGas: BigInt(json.standard.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(json.standard.maxPriorityFeePerGas),
  };
}

async function fetchUserOpReceipt(hash: Hex, chainId: number): Promise<UserOpReceipt | null> {
  const rpc = {
    jsonrpc: "2.0",
    method: "eth_getUserOperationReceipt",
    id: Date.now(),
    params: [hash],
  };
  const json = await bundlerRpcMaybe<{
    userOpHash: Hex;
    success: boolean;
    actualGasCost: Hex;
    actualGasUsed: Hex;
    receipt: { transactionHash: Hex };
  } | null>(chainId, rpc);
  if (!json) return null;
  return {
    userOpHash: json.userOpHash,
    txHash: json.receipt.transactionHash,
    success: json.success,
    actualGasCost: BigInt(json.actualGasCost),
    actualGasUsed: BigInt(json.actualGasUsed),
  };
}

/** EntryPoint v0.7 `getNonce(sender, key)` — key=0 is the conventional default. */
async function fetchEntryPointNonce(sender: Address): Promise<bigint> {
  const data = encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "getNonce",
        inputs: [
          { name: "sender", type: "address" },
          { name: "key", type: "uint192" },
        ],
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
      },
    ],
    functionName: "getNonce",
    args: [sender, 0n],
  });
  const raw = await publicClient.call({ to: ENTRY_POINT_V07, data });
  const hex = (raw.data ?? "0x") as Hex;
  if (hex === "0x") return 0n;
  return BigInt(hex);
}

async function bundlerRpc<T>(chainId: number, payload: unknown): Promise<T> {
  const res = await fetch(bundlerUrlFor(chainId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string; data?: unknown } };
  if (json.error) {
    const extra = json.error.data ? ` — ${JSON.stringify(json.error.data)}` : "";
    throw new Error(`bundler: ${json.error.message}${extra}`);
  }
  if (json.result === undefined || json.result === null) {
    throw new Error("bundler returned no result");
  }
  return json.result;
}

async function bundlerRpcMaybe<T>(chainId: number, payload: unknown): Promise<T | null> {
  const res = await fetch(bundlerUrlFor(chainId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { result?: T | null; error?: { message: string } };
  if (json.error) throw new Error(`bundler: ${json.error.message}`);
  return (json.result ?? null) as T | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
