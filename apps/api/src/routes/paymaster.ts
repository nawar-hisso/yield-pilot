import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { slice, type Hex, type Address } from "viem";
import { buildSponsorship, getPaymasterSignerAddress } from "../services/paymaster-signer.js";
import { evaluatePolicy } from "../services/paymaster-policy.js";
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
  /** Validity window (seconds). Defaults to [now, now + 30 min]. */
  validAfter: z.number().int().nonnegative().optional(),
  validUntil: z.number().int().positive().optional(),
});

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
  const { chainId, paymasterAddress, userOp, maxCost } = parsed.data;

  // Extract target + selector from the execute(...) call.
  if (userOp.callData.length < 2 + 8) {
    return res.status(400).json({ error: "callData too short" });
  }
  const selector = slice(userOp.callData, 0, 4);
  // callData layout: selector(4) + target(32, left-padded) + ...
  // slice returns bytes; the target lives in the last 20 bytes of the first arg slot.
  const target = ("0x" + userOp.callData.slice(2 + 8 + 24, 2 + 8 + 64)) as Address;

  const policy = evaluatePolicy({
    chainId,
    target,
    selector,
    sender: userOp.sender,
    preVerificationGas: userOp.preVerificationGas,
    maxCost,
  });
  if (!policy.ok) {
    logger.warn({ chainId, target, reason: policy.reason }, "sponsorship rejected");
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
      validUntil,
      validAfter,
    });
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
