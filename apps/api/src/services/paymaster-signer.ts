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

/**
 * Build the sponsorship approval. Matches Paymaster.getHash() semantics on-chain.
 * The on-chain ECDSA.tryRecover expects the EIP-191 wrapper
 * (hashMessage/toEthSignedMessageHash) around the encoded hash.
 */
export async function buildSponsorship(input: SponsorshipInput): Promise<SponsorshipOutput> {
  const { userOp, chainId, paymasterAddress, validUntil, validAfter } = input;

  // keccak256( abi.encode( sender, nonce, keccak256(initCode), keccak256(callData),
  //   accountGasLimits, preVerificationGas, gasFees, chainid, paymaster, validUntil, validAfter ) )
  const encoded = encodePackedHash(
    userOp.sender,
    userOp.nonce,
    keccak256(userOp.initCode),
    keccak256(userOp.callData),
    userOp.accountGasLimits,
    userOp.preVerificationGas,
    userOp.gasFees,
    BigInt(chainId),
    paymasterAddress,
    validUntil,
    validAfter,
  );

  const digest = hashMessage({ raw: encoded });
  const signature = await signerAccount().signMessage({ message: { raw: encoded } });

  const paymasterAndData = concatHex([
    paymasterAddress, // 20
    toHexPadded(0n, 16), // paymasterValidationGasLimit (placeholder — frontend sets real limit)
    toHexPadded(0n, 16), // paymasterPostOpGasLimit (placeholder)
    toHexPadded(BigInt(validUntil), 6),
    toHexPadded(BigInt(validAfter), 6),
    signature,
  ]);

  return { paymasterAndData, validUntil, validAfter, hash: digest, signature };
}

/**
 * Re-create the on-chain abi.encode(...) hash. `hashMessage({ raw })` re-wraps
 * with the EIP-191 prefix to match `ECDSA.tryRecover(toEthSignedMessageHash(...))`.
 */
function encodePackedHash(
  sender: Address,
  nonce: bigint,
  initCodeHash: Hex,
  callDataHash: Hex,
  accountGasLimits: Hex,
  preVerificationGas: bigint,
  gasFees: Hex,
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

