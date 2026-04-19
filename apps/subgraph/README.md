# @yield-pilot/subgraph

The Graph subgraph indexing YieldVault deposits/withdraws + share-price snapshots.

## Deploy

1. Run `pnpm -F @yield-pilot/contracts compile`
2. Copy `YieldVault.json` from `packages/contracts/artifacts` into `apps/subgraph/abis/`
3. Update `subgraph.yaml` with deployed addresses + start blocks
4. `pnpm -F @yield-pilot/subgraph codegen && pnpm -F @yield-pilot/subgraph build`
5. `pnpm -F @yield-pilot/subgraph deploy:sepolia` (requires Subgraph Studio auth)

## Local indexer

`docker/docker-compose.yml` optionally runs a local `graph-node` against
`hardhat node` for offline development — uncomment the graph-node service.
