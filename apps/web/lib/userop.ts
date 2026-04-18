import { type Address, type Hex } from "viem";
import { apiFetch } from "./api";

/**
 * Minimal UserOp builder + submission helpers.
 *
 * For MVP the actual bundler submission uses wagmi's PublicClient chain id to
 * pick the Pimlico RPC URL. We keep this module framework-free so it can be
 * unit-tested without a React tree.
 */

export interface DraftUserOp {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;   // packed verification + call gas
  preVerificationGas: bigint;
  gasFees: Hex;            // packed maxPriorityFee + maxFee
  paymasterAndData: Hex;   // filled by requestSponsorship
  signature: Hex;          // filled after passkey auth
}

/** Serialisable form used over the wire to apps/api. */
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
}

export interface SponsorshipResponse {
  paymasterAndData: Hex;
  validUntil: number;
  validAfter: number;
  hash: Hex;
  signature: Hex;
}

/** Ask apps/api to sign a sponsorship approval. Returns paymasterAndData. */
export async function requestSponsorship(args: {
  chainId: number;
  paymasterAddress: Address;
  draft: Omit<DraftUserOp, "paymasterAndData" | "signature">;
  maxCost: bigint;
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
  };
  return apiFetch<SponsorshipResponse>("/api/paymaster/sponsor", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

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

/** Fire-and-forget bundler call. Returns the UserOp hash. */
export async function submitUserOp(userOp: DraftUserOp, chainId: number): Promise<Hex> {
  const payload = {
    jsonrpc: "2.0",
    method: "eth_sendUserOperation",
    id: Date.now(),
    params: [
      {
        sender: userOp.sender,
        nonce: `0x${userOp.nonce.toString(16)}`,
        initCode: userOp.initCode,
        callData: userOp.callData,
        accountGasLimits: userOp.accountGasLimits,
        preVerificationGas: `0x${userOp.preVerificationGas.toString(16)}`,
        gasFees: userOp.gasFees,
        paymasterAndData: userOp.paymasterAndData,
        signature: userOp.signature,
      },
      "0x0000000071727De22E5E9d8BAf0edAc6f37da032", // EntryPoint v0.7
    ],
  };

  const res = await fetch(bundlerUrlFor(chainId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { result?: Hex; error?: { message: string } };
  if (json.error) throw new Error(`bundler: ${json.error.message}`);
  if (!json.result) throw new Error("bundler returned no result");
  return json.result;
}
