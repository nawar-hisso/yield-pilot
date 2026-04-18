import type { Address } from "viem";

export interface ContractAddresses {
  vault: Address | null;
  usdc: Address | null;
  aave: Address | null;
  paymaster: Address | null;
  accountFactory: Address | null;
  accountImpl: Address | null;
  safeModule: Address | null;
}

const EMPTY: ContractAddresses = {
  vault: null,
  usdc: null,
  aave: null,
  paymaster: null,
  accountFactory: null,
  accountImpl: null,
  safeModule: null,
};

function parseAddr(v: string | undefined): Address | null {
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : null;
}

/**
 * Resolve deployed contract addresses for the active chain. Falls back to
 * the suffix-less env vars (populated post local-deploy) when no chain-
 * specific address is set.
 */
export function contractsFor(chainId: number): ContractAddresses {
  if (chainId === 31337) {
    return {
      vault: parseAddr(process.env.NEXT_PUBLIC_VAULT_ADDRESS),
      usdc: parseAddr(process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS),
      aave: parseAddr(process.env.NEXT_PUBLIC_MOCK_AAVE_ADDRESS),
      paymaster: parseAddr(process.env.NEXT_PUBLIC_PAYMASTER_CONTRACT_ADDRESS),
      accountFactory: parseAddr(process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS),
      accountImpl: parseAddr(process.env.NEXT_PUBLIC_ACCOUNT_IMPL_ADDRESS),
    };
  }
  if (chainId === 11155111) {
    return {
      vault: parseAddr(process.env.NEXT_PUBLIC_VAULT_ADDRESS),
      usdc: parseAddr(process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS),
      aave: parseAddr(process.env.NEXT_PUBLIC_MOCK_AAVE_ADDRESS),
      paymaster: parseAddr(process.env.NEXT_PUBLIC_PAYMASTER_CONTRACT_ADDRESS),
      accountFactory: parseAddr(process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS),
      accountImpl: parseAddr(process.env.NEXT_PUBLIC_ACCOUNT_IMPL_ADDRESS),
    };
  }
  if (chainId === 84532) {
    return {
      vault: parseAddr(process.env.NEXT_PUBLIC_VAULT_ADDRESS_BASE_SEPOLIA),
      usdc: parseAddr(process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS_BASE_SEPOLIA),
      aave: null,
      paymaster: parseAddr(process.env.NEXT_PUBLIC_PAYMASTER_CONTRACT_ADDRESS_BASE_SEPOLIA),
      accountFactory: parseAddr(process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS_BASE_SEPOLIA),
      accountImpl: parseAddr(process.env.NEXT_PUBLIC_ACCOUNT_IMPL_ADDRESS_BASE_SEPOLIA),
      safeModule: null,
    };
  }
  return EMPTY;
}

export const USDC_DECIMALS = 6;
