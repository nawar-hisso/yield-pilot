import { Router } from "express";
import { z } from "zod";
import { prisma } from "@yield-pilot/database";

export const userRouter = Router();

const addressParam = z.object({ address: z.string().regex(/^0x[a-fA-F0-9]{40}$/) });

/**
 * GET /api/user/preferences?address=0x...
 * Returns the off-chain preference record for the given wallet.
 */
userRouter.get("/preferences", async (req, res) => {
  const parsed = addressParam.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "invalid address" });

  const address = parsed.data.address.toLowerCase();
  const user = await prisma.user.findUnique({ where: { address } });
  if (!user) return res.json({ preferences: null });

  return res.json({
    preferences: {
      address: user.address,
      notifyDeposits: user.notifyDeposits,
      notifyWithdraws: user.notifyWithdraws,
      preferredChain: user.preferredChain,
      updatedAt: user.updatedAt.toISOString(),
    },
  });
});

const updateSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  notifyDeposits: z.boolean().optional(),
  notifyWithdraws: z.boolean().optional(),
  preferredChain: z.enum(["sepolia", "base-sepolia"]).optional(),
});

/**
 * PUT /api/user/preferences
 * Upserts the preference record.
 * NOTE: Phase 6 replaces unauth'd writes with a SIWE guard.
 */
userRouter.put("/preferences", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const address = parsed.data.address.toLowerCase();
  const { notifyDeposits, notifyWithdraws, preferredChain } = parsed.data;

  const user = await prisma.user.upsert({
    where: { address },
    update: { notifyDeposits, notifyWithdraws, preferredChain },
    create: {
      address,
      notifyDeposits: notifyDeposits ?? true,
      notifyWithdraws: notifyWithdraws ?? true,
      preferredChain: preferredChain ?? "sepolia",
    },
  });

  return res.json({ ok: true, updatedAt: user.updatedAt });
});
