// Zod-validated env schemas. Each app imports the schema it needs and fails
// fast at startup if required vars are missing.

import { z } from "zod";

const hex = /^0x[0-9a-fA-F]+$/;
const url = z.string().url();

export const webEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("YieldPilot"),
  NEXT_PUBLIC_CHAIN_ID: z.coerce.number().int().positive(),
  NEXT_PUBLIC_CHAIN_NAME: z.string(),
  NEXT_PUBLIC_CHAIN_TICKER: z.string().default("ETH"),
  NEXT_PUBLIC_RPC_URL: url,
  NEXT_PUBLIC_EXPLORER_URL: url,
  NEXT_PUBLIC_WEB3AUTH_CLIENT_ID: z.string().min(1),
  NEXT_PUBLIC_WEB3AUTH_NETWORK: z.enum(["sapphire_mainnet", "sapphire_devnet"]).default("sapphire_devnet"),
  NEXT_PUBLIC_API_URL: url,
  NEXT_PUBLIC_WS_URL: z.string().startsWith("ws"),
  NEXT_PUBLIC_BUNDLER_URL: url.optional(),
  NEXT_PUBLIC_PAYMASTER_URL: url.optional(),
  NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA: url.optional(),
  NEXT_PUBLIC_SUBGRAPH_URL_BASE_SEPOLIA: url.optional(),
  NEXT_PUBLIC_VAULT_ADDRESS: z.string().regex(hex).optional(),
  NEXT_PUBLIC_MOCK_USDC_ADDRESS: z.string().regex(hex).optional(),
});

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  WS_PATH: z.string().default("/ws/events"),
  DATABASE_URL: z.string().startsWith("postgres"),
  DIRECT_URL: z.string().startsWith("postgres").optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;
export type ApiEnv = z.infer<typeof apiEnvSchema>;
