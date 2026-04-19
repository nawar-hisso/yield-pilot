import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { decodeAbiParameters, getAddress, parseAbiParameters, slice, type Hex, type Address } from "viem";
import { buildSponsorship, getPaymasterSignerAddress } from "../services/paymaster-signer.js";
import {
  evaluatePolicy,
  recordCharge,
  EXECUTE_SELECTOR,
  EXECUTE_BATCH_SELECTOR,
} from "../services/paymaster-policy.js";
import { logger } from "../logger.js";

export const paymasterRouter: ExpressRouter = Router();

const hex = (len?: number) =>
  z
    .string()
    .regex(new RegExp(`^0x[0-9a-fA-F]${len ? `{${len * 2}}` : "*"}$`), {
      message: len ? `expected 0x-hex with ${len} bytes` : "expected 0x-hex",
    }) as unknown as z.ZodType<Hex>;

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected EVM address") as unknown as z.ZodType<Address>;

const bigintString = z
  .string()
  .regex(/^[0-9]+$/, "expected decimal integer string")
  .transform((v) => BigInt(v));

const userOpSchema = z.object({
  sender: addressSchema,
  nonce: bigintString,
  initCode: hex(),
  callData: hex(),
  accountGasLimits: hex(32),
  preVerificationGas: bigintString,
  gasFees: hex(32),
});

const sponsorBody = z.object({
  chainId: z.number().int().positive(),
  paymasterAddress: addressSchema,
  userOp: userOpSchema,
  maxCost: bigintString,
  /** Paymaster's own validation-gas budget (16-byte uint, wei). Required. */
  paymasterValidationGasLimit: bigintString,
  /** Paymaster's own postOp-gas budget (16-byte uint, wei). Required. */
  paymasterPostOpGasLimit: bigintString,
  /** Validity window (seconds). Defaults to [now, now + 30 min]. */
  validAfter: z.number().int().nonnegative().optional(),
  validUntil: z.number().int().positive().optional(),
});

// Minimum length for a single execute(address,uint256,bytes) call: 4 + 32 bytes
// (selector + target) = 72 hex chars + "0x".
const MIN_EXECUTE_CALLDATA_HEX = 2 + 8 + 64;

/** Decode ALL call targets from a UserOp.callData. One entry for `execute`,
 *  N for `executeBatch`. Throws on malformed input. */
function extractTargets(callData: Hex): { selector: Hex; targets: Address[] } {
  const selector = slice(callData, 0, 4);
  if (selector === EXECUTE_SELECTOR) {
    if (callData.length < MIN_EXECUTE_CALLDATA_HEX) {
      throw new Error("callData too short for execute(address,...)");
    }
    const targetSlot = slice(callData, 4, 36);
    const targetBytes = ("0x" + targetSlot.slice(2 + 24)) as Address;
    return { selector, targets: [getAddress(targetBytes)] };
  }
  if (selector === EXECUTE_BATCH_SELECTOR) {
    const args = ("0x" + callData.slice(10)) as Hex;
    const [targetsRaw] = decodeAbiParameters(
      parseAbiParameters("address[], uint256[], bytes[]"),
      args,
    );
    const targets = (targetsRaw as readonly Address[]).map((t) => getAddress(t));
    if (targets.length === 0) throw new Error("executeBatch targets array is empty");
    return { selector, targets };
  }
  throw new Error(`unsupported selector ${selector}`);
}

paymasterRouter.get("/signer", (_req, res) => {
  try {
    res.json({ address: getPaymasterSignerAddress() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/paymaster/sponsor
 * Accepts an unsigned PackedUserOperation minus paymasterAndData + signature,
 * runs the policy, and returns a signed paymasterAndData blob that the
 * frontend embeds before submitting the UserOp to the bundler.
 */
paymasterRouter.post("/sponsor", async (req, res) => {
  const parsed = sponsorBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "bad body", details: parsed.error.flatten() });
  }
  const {
    chainId,
    paymasterAddress,
    userOp,
    maxCost,
    paymasterValidationGasLimit,
    paymasterPostOpGasLimit,
  } = parsed.data;

  // Extract the selector + all targets. `executeBatch` carries multiple, so
  // we hand evaluatePolicy() an array and let it allow-list each one.
  let selector: Hex;
  let targets: Address[];
  try {
    ({ selector, targets } = extractTargets(userOp.callData));
  } catch (err) {
    return res.status(400).json({ error: "bad callData", reason: (err as Error).message });
  }

  const policy = evaluatePolicy({
    chainId,
    targets,
    selector,
    sender: userOp.sender,
    preVerificationGas: userOp.preVerificationGas,
    maxCost,
  });
  if (!policy.ok) {
    logger.warn({ chainId, targets, reason: policy.reason }, "sponsorship rejected");
    return res.status(403).json({ error: "policy rejected", reason: policy.reason });
  }

  const now = Math.floor(Date.now() / 1000);
  const validAfter = parsed.data.validAfter ?? now;
  const validUntil = parsed.data.validUntil ?? now + 30 * 60; // 30-minute window
  if (validUntil <= validAfter) {
    return res.status(400).json({ error: "validUntil must be > validAfter" });
  }

  try {
    const out = await buildSponsorship({
      userOp,
      chainId,
      paymasterAddress,
      paymasterValidationGasLimit,
      paymasterPostOpGasLimit,
      validUntil,
      validAfter,
    });
    recordCharge(userOp.sender, maxCost);
    logger.info(
      {
        sender: userOp.sender,
        nonce: userOp.nonce.toString(),
        hasInitCode: userOp.initCode !== "0x",
        initCodePrefix: userOp.initCode.slice(0, 42),
        callDataPrefix: userOp.callData.slice(0, 74),
        accountGasLimits: userOp.accountGasLimits,
        preVerificationGas: userOp.preVerificationGas.toString(),
        gasFees: userOp.gasFees,
        paymasterAndData: out.paymasterAndData,
        hash: out.hash,
      },
      "sponsor signed",
    );
    return res.json({
      paymasterAndData: out.paymasterAndData,
      validUntil: out.validUntil,
      validAfter: out.validAfter,
      hash: out.hash,
      signature: out.signature,
    });
  } catch (err) {
    logger.error({ err }, "sponsorship signing failed");
    return res.status(500).json({ error: (err as Error).message });
  }
});
