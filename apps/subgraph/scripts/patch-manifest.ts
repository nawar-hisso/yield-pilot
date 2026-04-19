#!/usr/bin/env tsx
/**
 * patch-manifest.ts — rewrites `subgraph.yaml` with real contract addresses +
 * start blocks pulled from `deployments/<network>.json`.
 *
 * Usage (from repo root):
 *   pnpm tsx apps/subgraph/scripts/patch-manifest.ts sepolia
 *   pnpm tsx apps/subgraph/scripts/patch-manifest.ts base-sepolia
 *
 * Expected deployment record shape (produced by scripts/post-deploy.ts):
 *   {
 *     "chainId": 11155111,
 *     "network": "sepolia",
 *     "startBlock": 1234567,
 *     "contracts": {
 *       "YieldVault": "0x...",
 *       ...
 *     }
 *   }
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

interface DeploymentRecord {
  chainId: number;
  network: string;
  startBlock?: number;
  contracts: Record<string, string>;
}

const SUBGRAPH_NETWORKS: Record<string, string> = {
  sepolia: "sepolia",
  "base-sepolia": "base-sepolia",
};

function main(): void {
  const network = process.argv[2];
  if (!network) {
    console.error("usage: patch-manifest.ts <network>");
    process.exit(1);
  }

  const subgraphNetwork = SUBGRAPH_NETWORKS[network];
  if (!subgraphNetwork) {
    console.error(`unknown network ${network}; expected one of ${Object.keys(SUBGRAPH_NETWORKS).join(", ")}`);
    process.exit(1);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, "../../..");
  const recordPath = resolve(repoRoot, `deployments/${network}.json`);
  const manifestPath = resolve(here, "..", "subgraph.yaml");

  const record: DeploymentRecord = JSON.parse(readFileSync(recordPath, "utf8"));
  const vault = record.contracts["YieldVault"] ?? record.contracts["Vault"];
  const startBlock = record.startBlock ?? 0;

  if (!vault) {
    console.error(`deployment record missing YieldVault`, record.contracts);
    process.exit(1);
  }

  let manifest = readFileSync(manifestPath, "utf8");

  manifest = patchDataSource(manifest, "YieldVault", vault, subgraphNetwork, startBlock);

  writeFileSync(manifestPath, manifest, "utf8");
  console.log(`[patch-manifest] ${network} → YieldVault=${vault}, startBlock=${startBlock}`);
}

function patchDataSource(
  manifest: string,
  dataSourceName: string,
  address: string,
  network: string,
  startBlock: number,
): string {
  // Match the block starting at `name: <dataSourceName>` up to the next `name:` or EOF.
  const re = new RegExp(
    `(name:\\s*${dataSourceName}[\\s\\S]*?network:\\s*)[^\\n]+([\\s\\S]*?address:\\s*")[^"]+("[\\s\\S]*?startBlock:\\s*)\\d+`,
    "m",
  );
  if (!re.test(manifest)) {
    console.warn(`[patch-manifest] did not find data source ${dataSourceName}`);
    return manifest;
  }
  return manifest.replace(re, `$1${network}$2${address}$3${startBlock}`);
}

main();
