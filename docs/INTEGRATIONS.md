# YieldPilot — Integrations

## Overview



---

## Integration Map

| Layer | Component | Primary Files | Env Vars | Owner |
|-------|-----------|---------------|----------|-------|
| **Smart Contracts** | YieldVault (ERC-4626) | `contracts/core/YieldVault.sol` | `NEXT_PUBLIC_VAULT_ADDRESS`, `NEXT_PUBLIC_VAULT_ADDRESS_BASE_SEPOLIA` | Executor (Phase 1) |
| | ERC-20 (Mock USDC) | `contracts/core/MockUSDC.sol` | `NEXT_PUBLIC_MOCK_USDC_ADDRESS`, `NEXT_PUBLIC_MOCK_USDC_ADDRESS_BASE_SEPOLIA` | Executor (Phase 1) |
| | MockAave (integration) | `contracts/mocks/MockAave.sol` | `NEXT_PUBLIC_MOCK_AAVE_ADDRESS` | Executor (Phase 1) |
| | Paymaster (ERC-4337) | `contracts/core/Paymaster.sol` | `NEXT_PUBLIC_PAYMASTER_ADDRESS`, `PAYMASTER_SIGNER_PRIVATE_KEY` | Executor (Phase 5) |
| **Wallet** | Web3Auth provider | `apps/web/src/providers/Web3Provider.tsx` | `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`, `NEXT_PUBLIC_WEB3AUTH_NETWORK` | Executor (Phase 3) |
| **Frontend** | Contract interactions | `apps/web/hooks/useVault.ts`, `useDeposit.ts`, etc. | `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL` | Executor (Phase 3) |
| **Indexing** | Subgraph (The Graph) | `apps/subgraph/subgraph.yaml`, `schema.graphql`, `src/` | `NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA`, `NEXT_PUBLIC_SUBGRAPH_URL_BASE_SEPOLIA`, `STUDIO_SLUG`, `STUDIO_DEPLOY_KEY` | Executor (Phase 2) |
| **Database** | Prisma schema | `packages/database/prisma/schema.prisma` | `DATABASE_URL`, `DIRECT_URL` | Executor (Phase 3) |
| **Backend** | Express API | `apps/api/src/index.ts` | `API_PORT`, `API_PUBLIC_URL`, `CORS_ORIGIN` | Executor (Phase 6) |
| **DevOps** | Docker | `docker-compose.yml`, `Dockerfile` (if custom) | All above | Executor (Phase 7) |

---

## Wallet Integration: Web3Auth

**Provider file:** `apps/web/src/providers/Web3Provider.tsx`  
**Status:** Implemented

### Setup Steps

1. **Create Web3Auth project** → https://dashboard.web3auth.io/login
   - Create new project, select testnet environment
   - Obtain `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`
2. **Set environment variables:**
   ```bash
   NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=<from dashboard>
   NEXT_PUBLIC_WEB3AUTH_NETWORK=sapphire_devnet  # for Sepolia + Base Sepolia
   ```
3. **Chain config flow:**
   - `NEXT_PUBLIC_CHAIN_ID=11155111` (Sepolia) or `84532` (Base Sepolia)
   - `NEXT_PUBLIC_RPC_URL` sourced from `knowledge/networks/<chain>.md`
   - Provider initializes `EthereumPrivateKeyProvider` with `CHAIN_CONFIG` built from env vars
4. **Multi-chain switching:**
   - Phase 7 adds a UI chain-switcher that calls `wagmi.useSwitchChain()`
   - For now, env vars select the primary chain at build time
   - Secondary chain (`base-sepolia`) accessed via env-var suffix: `NEXT_PUBLIC_*_BASE_SEPOLIA`

### Connection Flow

- `useWeb3Auth()` context exports `connect()`, `disconnect()`, `address`, `walletClient`
- `useAccount()` hook extracts `{ address, isConnected }` for layout/navbar
- `useSigner()` returns viem `WalletClient` for contract writes
- Sign-out: `disconnect()` calls `web3auth.logout()`, clears state

### Known Caveats

- **Client ID per-network.** Testnet vs mainnet require different project IDs. Mismatch = silent modal failure.
- **First transaction needs gas.** Web3Auth login costs nothing; the first on-chain tx (deposit) requires ETH. Solved by Paymaster in Phase 5.
- **No cross-tab sync.** Opening in two browser tabs = two separate sessions. Use `BroadcastChannel` if needing to sync across tabs.
- **Heavy bundle.** Web3Auth JS is ~250KB. Already deferred via dynamic import in `_app.tsx`.

---

## Smart Contract Wiring

### Post-Deploy Initialization (Hardhat Ignition)

After `ignition deploy` to Sepolia, executor must run these calls in order via Hardhat console or a setup script:

#### 1. Paymaster Setup (Phase 5, requires `PAYMASTER_SIGNER_PRIVATE_KEY`)

```solidity
// Address of deployed Paymaster
const paymaster = await Paymaster.at(NEXT_PUBLIC_PAYMASTER_ADDRESS);

// Allow Paymaster to sponsor vault deposits
await paymaster.setTarget(NEXT_PUBLIC_VAULT_ADDRESS, true);

// Set spending cap (e.g., 10 ETH for all sponsored tx)
const cap = ethers.parseEther("10");
await paymaster.setBudget(NEXT_PUBLIC_VAULT_ADDRESS, cap);
```


```solidity

// Allow deposit selector on vault
await guard.setAllowed(
  NEXT_PUBLIC_VAULT_ADDRESS,
  "0xb6b55f25",  // deposit(uint256,address)
  true
);

// Allow withdraw selector on vault
await guard.setAllowed(
  NEXT_PUBLIC_VAULT_ADDRESS,
  "0x2e1a7d4d",  // withdraw(uint256)
  true
);

// Allow supply selector on MockAave
await guard.setAllowed(
  NEXT_PUBLIC_MOCK_AAVE_ADDRESS,
  "0xb4514fbe",  // supply(address,uint256)
  true
);

// Allow getBalance selector on MockAave
await guard.setAllowed(
  NEXT_PUBLIC_MOCK_AAVE_ADDRESS,
  "0x427f5e7d",  // getBalance(address,address)
  true
);
```



#### 4. Ownership Handoff (Phase 4+, optional)

If handing over admin duties to a multisig:

```solidity
const vault = await YieldVault.at(NEXT_PUBLIC_VAULT_ADDRESS);
```

---

## ERC-4337 Bundler + Paymaster Provider Selection

**Recommendation:** Pimlico (most mature, best Sepolia + Base Sepolia support)

| Provider | Sepolia | Base Sepolia | Mainnet | Cost | Maturity |
|----------|---------|--------------|---------|------|----------|
| Pimlico | Yes | Yes | Yes | $0.001–$0.005/op | High |
| Stackup | Yes | Yes | Yes | Free (L2), paid (L1) | Medium |
| Biconomy | Yes | Yes | Yes | Free tier | Medium |

**Chosen:** Pimlico (free tier covers dev/testnet; production-grade reliability)

### Environment Variables

```bash
# From Pimlico dashboard (https://dashboard.pimlico.io)
NEXT_PUBLIC_BUNDLER_URL=https://api.pimlico.io/v2/sepolia/rpc?apikey=<key>
NEXT_PUBLIC_PAYMASTER_URL=https://api.pimlico.io/v2/sepolia/rpc?apikey=<key>

# Server-only: Paymaster signer (for premium/sponsored tiers)
PAYMASTER_SIGNER_PRIVATE_KEY=<0x...>
```

---

## Chainlink Price Feeds

### Use Case in YieldPilot

Display USDC balance in USD on the dashboard. Vault operates in USDC (6 decimals), but users want to see "$X" equivalent.

### Feed Addresses

| Chain | USDC/USD Feed | Status |
|-------|---------------|--------|
| Sepolia | `0x084B1c3C81545d370f3634136b6F59180EA335fF` (USDC/USD) | Available |
| Base Sepolia | `0x7e860098F58fBBCB2011b06379B37C02e8fd3c0e` (USDC/USD) | Available |

**Fallback on testnet:** If feed unavailable, deploy `MockAggregatorV3` returning hardcoded `1e8` (1 USDC = 1 USD × 10^8 decimals).

### Contract Integration

```solidity
// contracts/libraries/PriceFeeds.sol
library PriceFeeds {
  function usdcUsdFeed() internal view returns (address) {
    if (block.chainid == 11155111) return 0x084B1c3C81545d370f3634136b6F59180EA335fF;
    if (block.chainid == 84532) return 0x7e860098F58fBBCB2011b06379B37C02e8fd3c0e;
    revert("No USDC/USD feed");
  }
}

// contracts/core/YieldVault.sol
function balanceInUSD() external view returns (uint256) {
  (,int256 price,,uint256 updatedAt,) = AggregatorV3Interface(
    PriceFeeds.usdcUsdFeed()
  ).latestRoundData();
  require(block.timestamp - updatedAt < 3600, "stale feed");
  uint256 assets = _totalAssets;
  return (assets * uint256(price)) / 1e8; // answer is 8 decimals
}
```

### Frontend

```ts
// apps/web/hooks/useVaultPriceUSD.ts
const { data: priceData } = useReadContract({
  address: VAULT_ADDRESS,
  abi: vaultAbi,
  functionName: "balanceInUSD",
  watch: true,
});
```

---

## Subgraph Integration (The Graph)

### Purpose

Index vault `Deposit` + `Withdraw` events and Safe `StrategyExecuted` events for historical queries and dashboard P&L calculation.

### Files

| File | Purpose | Source |
|------|---------|--------|
| `apps/subgraph/subgraph.yaml` | Manifest with contract addresses, start blocks, event handlers | Template + executor post-deploy substitution |
| `apps/subgraph/src/yield-vault.ts` | Handlers: `handleDeposit`, `handleWithdraw` | Template |
| `apps/subgraph/abis/YieldVault.json` | Contract ABI | Copied from `packages/contracts/artifacts` after Hardhat compile |

### Deployment Flow

1. **Compile contracts** → ABIs land in `packages/contracts/artifacts/`
2. **Post-deploy script writes `deployments/contracts.json`:**
   ```json
   {
     "sepolia": {
       "vault": "0xYieldVault...",
       "deployBlock": 7123456
     },
     "baseSepolia": { ... }
   }
   ```
3. **Copy ABIs:**
   ```bash
   cp packages/contracts/artifacts/contracts/core/YieldVault.sol/YieldVault.json \
      apps/subgraph/abis/YieldVault.json
   ```
4. **Substitute into `subgraph.yaml`:**
   ```yaml
   dataSources:
     - kind: ethereum
       name: YieldVault
       network: sepolia
       source:
         address: "{{ vault.address }}"  # filled by executor
         abi: YieldVault
         startBlock: {{ vault.deployBlock }}
   ```
5. **Deploy to Subgraph Studio:**
   ```bash
   export STUDIO_SLUG=<your-project>
   export STUDIO_DEPLOY_KEY=<from dashboard>
   pnpm run subgraph:codegen
   pnpm run subgraph:build
   pnpm run subgraph:deploy
   ```
   Prints query URL → copy to `.env`:
   ```bash
   NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA=https://api.studio.thegraph.com/query/...
   NEXT_PUBLIC_SUBGRAPH_URL_BASE_SEPOLIA=https://api.studio.thegraph.com/query/...
   ```

### Frontend Queries

```ts
// apps/web/lib/subgraph.ts
import { request, gql } from "graphql-request";

export async function getUserPosition(address: string, chainId: number) {
  const endpoint = chainId === 11155111
    ? process.env.NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA
    : process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE_SEPOLIA;

  const query = gql`
    query UserPosition($user: Bytes!) {
      userPosition(id: $user) {
        totalDeposited
        totalWithdrawn
        currentShares
        lastActivity
      }
      vaultDeposits(where: { user: $user }, first: 50, orderBy: timestamp, orderDirection: desc) {
        assets
        shares
        timestamp
        transactionHash
      }
    }
  `;

  return request(endpoint, query, { user: address.toLowerCase() });
}
```

### Key Pitfalls

- **`startBlock` = 0 → genesis scan.** Executor must fill correct deploy block.
- **ABI sync.** If contract changes (new events), regenerate ABI, copy to subgraph, redeploy.
- **Multi-chain manifest.** Phase 7 adds a second `dataSources` block for Base Sepolia in `subgraph.yaml`.

---


### Purpose


### Provisioning

   - Network: Sepolia (or Base Sepolia)
   - Type: **Address Activity**
   - Addresses: `NEXT_PUBLIC_VAULT_ADDRESS`

2. **Local development (ngrok / cloudflared):**
   ```bash
   # Terminal 1: API server
   pnpm -F @yield-pilot/api dev

   # Terminal 2: Tunnel
   cloudflared tunnel --url http://localhost:4000

   # OR ngrok http 4000
   ```

### Environment Variables

```bash
```

### Signature Verification + Deduplication


```ts
import { createHmac, timingSafeEqual } from "node:crypto";

  if (!signingKey) return false;
  const digest = createHmac("sha256", signingKey).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

  // Return event txHash, logIndex, eventType, user, assets, shares, etc.
  return [];
}
```


```ts
  const raw = JSON.stringify(req.body);

    return res.status(401).json({ error: "invalid signature" });
  }

  for (const event of events) {
    const key = `${event.txHash}:${event.logIndex}`;
    try {
      await prisma.processedEvent.create({ data: { key, chainId: event.chainId } });
    } catch {
      continue; // Already processed
    }
    broadcast({ type: "vault.event", payload: event });
  }

  return res.json({ ok: true, processed: events.length });
});
```

### WebSocket Relay

File: `apps/api/src/ws/server.ts`

```ts
import { WebSocketServer } from "ws";

let wss: WebSocketServer | null = null;

export function attachWs(server: http.Server, path: string) {
  wss = new WebSocketServer({ server, path });

  const interval = setInterval(() => {
    for (const client of wss!.clients) {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: "ping", payload: { ts: Date.now() } }));
      }
    }
  }, 30_000); // Heartbeat every 30s

  wss.on("connection", (ws) => logger.debug("ws client connected"));
  return wss;
}

export function getWss() {
  return wss;
}

export function broadcast(payload: RealtimePayload) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(msg);
  }
}
```

### Frontend Consumption

File: `apps/web/hooks/useRealtime.ts`

```ts
export function useRealtime() {
  const [last, setLast] = useState<RealtimePayload | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WS_URL;
    if (!url) return;

    const ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      const payload: RealtimePayload = JSON.parse(ev.data);
      setLast(payload);
      // On "vault.event", invalidate SWR queries, update UI
    };

    return () => ws.close();
  }, []);

  return { last };
}
```

### Failure Modes + Fallbacks

| Scenario | Behavior |
|----------|----------|
| Duplicate event | Caught by `ProcessedEvent` uniqueness; silently dropped. |
| WebSocket client disconnects | Browser auto-reconnects with exponential backoff. SWR queries still work (fallback to polling). |
| API server restarts | Clients reconnect, resume. No data loss if `ProcessedEvent` dedupe is working. |

---

## Database: Postgres + Prisma

### Purpose


### Initialization

1. **Install:**
   ```bash
   pnpm -F @yield-pilot/database install
   ```

2. **Schema:** `packages/database/prisma/schema.prisma` (already defined)
   - `User` — wallet address, notification toggles, preferred chain
   - `Notification` — inbox (deposit/withdraw alerts, failed tx)

3. **Generate Prisma client:**
   ```bash
   pnpm -F @yield-pilot/database prisma:generate
   ```

4. **Run migrations:**
   ```bash
   # Local dev (creates DB if missing)
   pnpm -F @yield-pilot/database prisma:migrate:dev

   # Production (applies only, never creates)
   pnpm -F @yield-pilot/database prisma:migrate:deploy
   ```

### Environment Variables

```bash
# Both frontend and backend use this
DATABASE_URL=postgresql://dev:dev@localhost:5432/yield-pilot

# Serverless pooling (Vercel, Render, Fly)
DIRECT_URL=postgresql://dev:dev@localhost:5432/yield-pilot
```

### Connection Pooling Note


- **Supabase:** Auto pooling via Supabase dashboard
- **Neon:** `pgBouncer` mode in connection string
- **AWS RDS Proxy:** Separate endpoint
- **PgBouncer standalone:** Deploy alongside your app

Set `DIRECT_URL` for migrations (direct connection), `DATABASE_URL` for pooled queries.

---

## Multi-Chain Configuration

YieldPilot deploys to **Sepolia (primary)** and **Base Sepolia (secondary)** in Phase 7.

### Chain Switching Architecture

**Phase 1–6:** Env-driven, single chain at build time.
```bash
# .env (Sepolia hardcoded at build)
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
NEXT_PUBLIC_VAULT_ADDRESS=0xYieldVaultSepolia...
NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA=https://api.studio.thegraph.com/...
```

**Phase 7:** Chain-switcher UI + env-driven addresses.
```bash
# .env (Phase 7)
NEXT_PUBLIC_CHAIN_ID_SEPOLIA=11155111
NEXT_PUBLIC_RPC_URL_SEPOLIA=https://ethereum-sepolia-rpc.publicnode.com
NEXT_PUBLIC_CHAIN_ID_BASE_SEPOLIA=84532
NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA=https://sepolia.base.org

NEXT_PUBLIC_VAULT_ADDRESS_SEPOLIA=0x...
NEXT_PUBLIC_VAULT_ADDRESS_BASE_SEPOLIA=0x...
NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA=https://api.studio.thegraph.com/...
NEXT_PUBLIC_SUBGRAPH_URL_BASE_SEPOLIA=https://api.studio.thegraph.com/...
```

### Frontend Chain Selection

```ts
// apps/web/lib/config.ts
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");

export function getConfig(chainId: number) {
  if (chainId === 11155111) {
    return {
      vaultAddress: process.env.NEXT_PUBLIC_VAULT_ADDRESS_SEPOLIA,
      subgraphUrl: process.env.NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA,
      rpc: process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA,
    };
  }
  if (chainId === 84532) {
    return {
      vaultAddress: process.env.NEXT_PUBLIC_VAULT_ADDRESS_BASE_SEPOLIA,
      subgraphUrl: process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE_SEPOLIA,
      rpc: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA,
    };
  }
  throw new Error(`Unsupported chain: ${chainId}`);
}
```

### Subgraph Multi-Chain

Phase 7 adds a second `dataSources` block to `apps/subgraph/subgraph.yaml`:

```yaml
dataSources:
  - kind: ethereum
    name: YieldVault_Sepolia
    network: sepolia
    source:
      address: "{{ vault.address.sepolia }}"
      abi: YieldVault
      startBlock: {{ vault.deployBlock.sepolia }}
    mapping: ...

  - kind: ethereum
    name: YieldVault_BaseSepolia
    network: base-sepolia
    source:
      address: "{{ vault.address.baseSepolia }}"
      abi: YieldVault
      startBlock: {{ vault.deployBlock.baseSepolia }}
    mapping: ...
```

---

## Secrets Management + GitHub Actions

### GitHub Secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Purpose | Source |
|--------|---------|--------|
| `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` | Web3Auth login | Web3Auth dashboard |
| `ETHERSCAN_API_KEY` | Contract verification | Etherscan account |
| `DEPLOYER_PRIVATE_KEY` | Hardhat Ignition | .env.local (NOT committed) |
| `STUDIO_SLUG` | Subgraph Studio | Subgraph Studio project |
| `STUDIO_DEPLOY_KEY` | Subgraph deploy auth | Subgraph Studio dashboard |
| `DATABASE_URL` | Postgres | Neon / Supabase / RDS |
| `DIRECT_URL` | Postgres pooler | Neon / Supabase / RDS |
| `NEXT_PUBLIC_BUNDLER_URL` | Pimlico bundler | Pimlico dashboard |
| `NEXT_PUBLIC_PAYMASTER_URL` | Pimlico paymaster | Pimlico dashboard |
| `PAYMASTER_SIGNER_PRIVATE_KEY` | Sponsor tx signing | .env.local (NOT committed) |

---

## Summary: Critical Path to Integration

1. **Phase 1 (Contracts):** Deploy to Sepolia; save addresses to `.env`
2. **Phase 2 (Subgraph):** ABIs → `apps/subgraph/abis/`, deploy to Studio, save query URL
3. **Phase 3 (Frontend):** Web3Auth setup, contract reads/writes wired, SWR queries pointing at subgraph
4. **Phase 5 (Paymaster):** Run post-deploy init scripts to set budgets + allowed contracts
6. **Phase 7 (Multi-chain + Deploy):** Copy all Phase 1–6 to Base Sepolia, add chain-switcher UI, GitHub Actions CI/CD

Every env var, every file path, every contract call has a home in this document. Executor follows sequentially; integration happens incrementally.
