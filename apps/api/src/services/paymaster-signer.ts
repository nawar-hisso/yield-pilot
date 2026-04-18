import {
  type Address,
  type Hex,
  concatHex,
  hashMessage,
  keccak256,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { logger } from "../logger.js";

/**
 * Loads the paymaster signer EOA from PAYMASTER_SIGNER_PRIVATE_KEY and exposes
 * helpers to compute the hash our on-chain Paymaster expects + produce a
 * sponsorship approval that the frontend embeds into paymasterAndData.
 *
 * On-chain contract layout (see packages/contracts/contracts/core/Paymaster.sol):
 *   paymasterAndData = [paymaster(20) | validationGas(16) | postOpGas(16) | validUntil(6) | validAfter(6) | signature(65)]
 *
 * The on-chain `getHash(...)` commits to `keccak256(paymasterAndData[:52])`,
 * binding the signature to the paymaster's OWN gas limits so a bundler cannot
 * silently rewrite them after the signer signs.
 */

export interface SponsorshipInput {
  userOp: {
    sender: Address;
    nonce: bigint;
    initCode: Hex;
    callData: Hex;
    accountGasLimits: Hex;
    preVerificationGas: bigint;
    gasFees: Hex;
  };
  chainId: number;
  paymasterAddress: Address;
  /** Paymaster's own validation-gas budget (16-byte uint). */
  paymasterValidationGasLimit: bigint;
  /** Paymaster's own postOp-gas budget (16-byte uint). */
  paymasterPostOpGasLimit: bigint;
  validUntil: number; // unix seconds (uint48)
  validAfter: number; // unix seconds (uint48)
}

export interface SponsorshipOutput {
  paymasterAndData: Hex;
  validUntil: number;
  validAfter: number;
  hash: Hex;
  signature: Hex;
}

let _account: PrivateKeyAccount | null = null;

function signerAccount(): PrivateKeyAccount {
  if (_account) return _account;
  const key = process.env.PAYMASTER_SIGNER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("PAYMASTER_SIGNER_PRIVATE_KEY missing or malformed");
  }
  _account = privateKeyToAccount(key as Hex);
  logger.info({ signer: _account.address }, "paymaster signer loaded");
  return _account;
}

export function getPaymasterSignerAddress(): Address {
  return signerAccount().address;
}

// Maximum reasonable gas-limit bound on each paymaster callback. Any submitter
// passing values above this is rejected outright — they would hand the
// paymaster an unbounded sponsorship cost.
const MAX_GAS_LIMIT = 2_000_000n;

export async function buildSponsorship(input: SponsorshipInput): Promise<SponsorshipOutput> {
  const {
    userOp,
    chainId,
    paymasterAddress,
    paymasterValidationGasLimit,
    paymasterPostOpGasLimit,
    validUntil,
    validAfter,
  } = input;

  if (paymasterValidationGasLimit <= 0n || paymasterValidationGasLimit > MAX_GAS_LIMIT) {
    throw new Error(`paymasterValidationGasLimit out of range (0, ${MAX_GAS_LIMIT}]`);
  }
  if (paymasterPostOpGasLimit <= 0n || paymasterPostOpGasLimit > MAX_GAS_LIMIT) {
    throw new Error(`paymasterPostOpGasLimit out of range (0, ${MAX_GAS_LIMIT}]`);
  }

  const paymasterDataHeader = concatHex([
    paymasterAddress,
    toHexPadded(paymasterValidationGasLimit, 16),
    toHexPadded(paymasterPostOpGasLimit, 16),
  ]);
  const paymasterDataHeaderHash = keccak256(paymasterDataHeader);

  // Matches on-chain Paymaster.getHash(...) — must stay in sync with Solidity.
  const encoded = encodePackedHash(
    userOp.sender,
    userOp.nonce,
    keccak256(userOp.initCode),
    keccak256(userOp.callData),
    userOp.accountGasLimits,
    userOp.preVerificationGas,
    userOp.gasFees,
    paymasterDataHeaderHash,
    BigInt(chainId),
    paymasterAddress,
    validUntil,
    validAfter,
  );

  const digest = hashMessage({ raw: encoded });
  const signature = await signerAccount().signMessage({ message: { raw: encoded } });

  const paymasterAndData = concatHex([
    paymasterDataHeader, // [paymaster(20) | validationGas(16) | postOpGas(16)]
    toHexPadded(BigInt(validUntil), 6),
    toHexPadded(BigInt(validAfter), 6),
    signature,
  ]);

  return { paymasterAndData, validUntil, validAfter, hash: digest, signature };
}

function encodePackedHash(
  sender: Address,
  nonce: bigint,
  initCodeHash: Hex,
  callDataHash: Hex,
  accountGasLimits: Hex,
  preVerificationGas: bigint,
  gasFees: Hex,
  paymasterDataHeaderHash: Hex,
  chainId: bigint,
  paymaster: Address,
  validUntil: number,
  validAfter: number,
): Hex {
  // Match Solidity's abi.encode(...) — 32-byte aligned fields.
  const parts: Hex[] = [
    padAddress(sender),
    toHexPadded(nonce, 32),
    initCodeHash,
    callDataHash,
    accountGasLimits,
    toHexPadded(preVerificationGas, 32),
    gasFees,
    paymasterDataHeaderHash,
    toHexPadded(chainId, 32),
    padAddress(paymaster),
    toHexPadded(BigInt(validUntil), 32), // uint48 encoded as 32-byte slot per abi.encode
    toHexPadded(BigInt(validAfter), 32),
  ];
  return keccak256(concatHex(parts));
}

function padAddress(a: Address): Hex {
  return ("0x" + "0".repeat(24) + a.slice(2).toLowerCase()) as Hex;
}

function toHexPadded(value: bigint, byteLen: number): Hex {
  const hex = value.toString(16);
  const needed = byteLen * 2;
  if (hex.length > needed) throw new Error(`value exceeds ${byteLen} bytes`);
  return ("0x" + hex.padStart(needed, "0")) as Hex;
}
