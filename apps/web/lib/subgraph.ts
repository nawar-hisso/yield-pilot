// graphql-request client pointed at The Graph Studio deployment for the
// active chain. Endpoints are provisioned during Phase 2 deploy.

import { GraphQLClient } from "graphql-request";

const endpoints: Record<number, string | undefined> = {
  11155111: process.env.NEXT_PUBLIC_SUBGRAPH_URL_SEPOLIA,
  84532: process.env.NEXT_PUBLIC_SUBGRAPH_URL_BASE_SEPOLIA,
};

export function subgraphClient(chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111")) {
  const url = endpoints[chainId];
  if (!url) {
    throw new Error(`No subgraph URL configured for chainId=${chainId}`);
  }
  return new GraphQLClient(url);
}
