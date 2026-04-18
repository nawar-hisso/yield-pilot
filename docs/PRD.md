# PRD: YieldPilot — DeFi Yield Management Dashboard

## Overview


This project is designed as a portfolio piece that demonstrates end-to-end Web3 full-stack engineering across every concept relevant to senior Web3 roles.

---

## Concepts Covered

| Concept               | Where It Appears                                |
| --------------------- | ----------------------------------------------- |
| Next.js App Router    | Entire frontend                                 |
| React + TypeScript    | Entire frontend                                 |
| Wagmi + Viem          | Wallet connection, contract reads/writes        |
| Tailwind CSS          | Styling                                         |
| Recharts              | P&L charts, APY visualization                   |
| SWR                   | Data fetching + caching                         |
| ERC-4626              | Vault smart contracts (deposit/withdraw/redeem) |
| ERC-4337              | Gasless deposits via Paymaster                  |
| Multi-sig             | Multi-owner Safe approvals                      |
| Multicall             | Batch on-chain reads for dashboard              |
| The Graph / Subgraphs | Index vault events, query deposit history       |
| GraphQL               | Frontend queries to subgraph                    |
| Protocol integration  | Aave supply (simulated or testnet)              |
| PostgreSQL + Prisma   | Off-chain user preferences, notifications       |
| Docker                | Containerized development                       |
| CI/CD                 | GitHub Actions for build/test/deploy            |
| P&L calculation       | Current value vs deposited amount               |
| Multi-chain           | Deploy on Sepolia + Base Sepolia (testnets)     |

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   FRONTEND                        │
│  Next.js 14 (App Router) + TypeScript             │
│  Wagmi + Viem (wallet + contract interactions)    │
│  Tailwind CSS + Recharts (UI + charts)            │
│  SWR (data fetching + caching)                    │
│  graphql-request (subgraph queries)               │
└────────────────────┬─────────────────────────────┘
                     │
        REST API + GraphQL + WebSocket
                     │
┌────────────────────▼─────────────────────────────┐
│                 BACKEND (Node.js)                  │
│  Express or Next.js API Routes                     │
│  Prisma + PostgreSQL (user data, preferences)     │
│  WebSocket server (push live events to frontend)  │
└────────────────────┬─────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────┐
│               DATA LAYER                           │
│  The Graph subgraph (indexed vault events)        │
│  Multicall3 (batch current balances/positions)    │
└────────────────────┬─────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────┐
│            SMART CONTRACTS (Solidity)              │
│  YieldVault.sol (ERC-4626)                         │
│  Paymaster.sol (ERC-4337 gasless deposits)        │
│  MockAave.sol (simulated lending pool)            │
│                                                    │
│  Deployed on: Sepolia + Base Sepolia               │
└──────────────────────────────────────────────────┘
```

---

## Smart Contracts

### 1. YieldVault.sol (ERC-4626)

A tokenized vault where users deposit USDC (or test token) and receive share tokens.

```
Functions:
- deposit(assets, receiver) → mint shares to receiver
- withdraw(assets, receiver, owner) → burn shares, return assets
- redeem(shares, receiver, owner) → burn shares, return proportional assets
- totalAssets() → total value in the vault
- convertToShares(assets) → how many shares for X assets
- convertToAssets(shares) → how much X shares are worth

Events:
- Deposit(sender, owner, assets, shares)
- Withdraw(sender, receiver, owner, assets, shares)
```

The vault sends deposited funds to a MockAave contract to earn simulated yield.

### 2. MockAave.sol

A simplified Aave lending pool for testnet. Accepts deposits, accrues interest over time (simulated with a fixed APY), and allows withdrawals.

```
Functions:
- supply(token, amount) → deposit into pool
- withdraw(token, amount) → withdraw from pool
- getBalance(token, user) → current balance with accrued interest
```



```
Functions:
- removeOperator(operator) → owner removes an operator

- Operator CAN call: vault.deposit(), mockAave.supply()
- Operator CANNOT call: token.transfer(), safe.removeOwner()
```



```
Functions:
- checkTransaction(to, value, data, ...) → revert if not allowed
  - Check: is `to` an approved contract? (vault, MockAave)
  - Check: is the function selector allowed? (supply yes, transfer no)
```

### 5. Paymaster.sol (ERC-4337)

Sponsors gas for user deposits so they don't need ETH to get started.

```
Flow:
- User creates a UserOperation for deposit
- Paymaster validates and agrees to pay gas
- Bundler submits UserOp to EntryPoint
- Deposit executes — user pays nothing
```

---

## Subgraph

### Schema (`schema.graphql`)

```graphql
type VaultDeposit @entity {
  id: ID!
  user: Bytes!
  assets: BigInt!
  shares: BigInt!
  timestamp: BigInt!
  transactionHash: Bytes!
}

type VaultWithdrawal @entity {
  id: ID!
  user: Bytes!
  assets: BigInt!
  shares: BigInt!
  timestamp: BigInt!
  transactionHash: Bytes!
}

type UserPosition @entity {
  id: ID!
  totalDeposited: BigInt!
  totalWithdrawn: BigInt!
  currentShares: BigInt!
  depositCount: BigInt!
  lastActivity: BigInt!
}

  id: ID!
  operator: Bytes!
  safe: Bytes!
  target: Bytes!
  action: String!
  timestamp: BigInt!
  transactionHash: Bytes!
}
```

### Deploy to

- Subgraph Studio (or self-hosted Graph Node via Docker for development)

---

## Frontend Pages

### Page 1: Dashboard (`/`)

**What it shows:**

- Connected wallet info (via Wagmi useAccount)
- Total portfolio value (Multicall — batch read vault shares + share price)
- P&L: current value minus total deposited (from subgraph)
- APY: calculated from share price change over time
- P&L chart over 7/30/90 days (Recharts)
- Live activity feed (WebSocket — real-time deposit/withdrawal notifications)

**Data sources:**

- Multicall → current share balance + share price (live)
- Subgraph → deposit/withdrawal history (historical)
- SWR → caches all queries, revalidates on focus

### Page 2: Vault (`/vault`)

**What it shows:**

- Deposit form: enter amount → preview shares → confirm
- Withdraw form: enter shares → preview assets → confirm
- Option: "Gasless deposit" toggle (uses ERC-4337 Paymaster)
- Vault stats: TVL, total shares, current share price, APY
- Transaction history table (from subgraph)

**Interactions:**

- Wagmi useWriteContract → call vault.deposit() or vault.withdraw()
- For gasless: build UserOperation → submit to bundler → Paymaster sponsors

### Page 3: Delegation (`/delegate`)

**What it shows:**

- "Create Safe" button (if no Safe exists)

**Interactions:**

- Add operator as Module
- View operator activity log

### Page 4: Multi-sig (`/multisig`) — Optional

**What it shows:**

- Pending transactions needing signatures
- Sign / reject buttons
- Execution status (threshold reached → auto-execute)

**Use case:** If the user creates a 2-of-3 Safe for a team-managed vault.

### Page 5: Settings (`/settings`)

**What it shows:**

- Notification preferences (stored in PostgreSQL via Prisma)
- Chain switching (Sepolia ↔ Base Sepolia)
- Connected wallet management

---

## Backend (API Routes / Express)

### Endpoints

```
GET  /api/user/preferences     ← Fetch user settings from PostgreSQL
PUT  /api/user/preferences     ← Update user settings
WS   /ws/events                ← WebSocket channel for live events
```


```
  → Server parses event data
  → Server pushes to WebSocket channel
  → Frontend receives and updates UI instantly
```

### Prisma Schema

```prisma
model User {
  id              String   @id  // wallet address
  notifyDeposits  Boolean  @default(true)
  notifyWithdraws Boolean  @default(true)
  preferredChain  String   @default("sepolia")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

---

## Tech Stack Summary

| Layer               | Technology                                         |
| ------------------- | -------------------------------------------------- |
| Frontend            | Next.js 14 (App Router), React, TypeScript         |
| Wallet              | Wagmi, Viem, Reown Kit (WalletConnect)             |
| Styling             | Tailwind CSS                                       |
| Charts              | Recharts                                           |
| Data fetching       | SWR, graphql-request                               |
| Smart contracts     | Solidity, Hardhat, OpenZeppelin                    |
| Vault standard      | ERC-4626                                           |
| Account abstraction | ERC-4337 (Paymaster, Bundler, EntryPoint)          |
| Indexing            | The Graph (subgraph)                               |
| Backend             | Next.js API routes or Express.js                   |
| Database            | PostgreSQL, Prisma                                 |
| Testing             | Hardhat tests (contracts), Jest (frontend), Vitest |
| Infrastructure      | Docker, GitHub Actions CI/CD                       |
| Networks            | Sepolia, Base Sepolia (testnets)                   |

---

## Development Phases

### Phase 1: Smart Contracts (3-4 days)

- [ ] YieldVault.sol (ERC-4626) with deposit/withdraw/redeem
- [ ] MockAave.sol for simulated yield
- [ ] Hardhat tests for vault mechanics
- [ ] Deploy to Sepolia

### Phase 2: Subgraph (1-2 days)

- [ ] Schema definition (VaultDeposit, VaultWithdrawal, UserPosition)
- [ ] Mapping handlers for vault events
- [ ] Deploy to Subgraph Studio or local Graph Node
- [ ] Test GraphQL queries

### Phase 3: Frontend Core (3-4 days)

- [ ] Next.js App Router setup with Tailwind
- [ ] Wagmi + Viem wallet connection (Reown Kit)
- [ ] Dashboard page: portfolio value via Multicall, P&L from subgraph
- [ ] Vault page: deposit/withdraw forms with contract writes
- [ ] SWR for all data fetching with stale-while-revalidate
- [ ] Recharts for P&L and APY charts


- [ ] Safe SDK integration: create Safe, add module, attach guard
- [ ] Delegation page: add/remove operators, view activity

### Phase 5: Account Abstraction (2 days)

- [ ] Paymaster.sol for gasless deposits
- [ ] ERC-4337 flow: UserOperation → Bundler → EntryPoint
- [ ] "Gasless deposit" toggle on vault page
- [ ] Test gasless flow end-to-end

### Phase 6: Real-Time + Backend (1-2 days)

- [ ] WebSocket server for pushing live updates
- [ ] Live activity feed on dashboard
- [ ] PostgreSQL + Prisma for user preferences

### Phase 7: Multi-Chain + Polish (1-2 days)

- [ ] Deploy contracts to Base Sepolia
- [ ] Chain switching in frontend (Wagmi useChainId)
- [ ] Docker setup for local development
- [ ] GitHub Actions for CI (lint, test, build)
- [ ] README with architecture diagram
