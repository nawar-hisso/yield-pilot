"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Web3Auth } from "@web3auth/modal";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } from "@web3auth/base";
import { createWalletClient, custom, type WalletClient } from "viem";

// Chain config sourced from env (populated via .env.local per network).
const chainIdDecimal = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111");
const chainIdHex = `0x${chainIdDecimal.toString(16)}`;
const rpcTarget = process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://sepolia.etherscan.io";
const displayName = process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Sepolia";
const ticker = process.env.NEXT_PUBLIC_CHAIN_TICKER ?? "ETH";

const web3authNetwork =
  (process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK as "sapphire_mainnet" | "sapphire_devnet") ??
  "sapphire_devnet";

const CHAIN_CONFIG = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: chainIdHex,
  rpcTarget,
  displayName,
  blockExplorerUrl: explorerUrl,
  ticker,
  tickerName: ticker,
};

interface AuthContext {
  web3auth: Web3Auth | null;
  address: `0x${string}` | null;
  walletClient: WalletClient | null;
  isConnected: boolean;
  isLoading: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const AuthCtx = createContext<AuthContext>({
  web3auth: null,
  address: null,
  walletClient: null,
  isConnected: false,
  isLoading: true,
  connect: async () => {},
  disconnect: async () => {},
});

export function Web3AuthProvider({ children }: { children: ReactNode }) {
  const [web3auth, setWeb3Auth] = useState<Web3Auth | null>(null);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID;
      if (!clientId) {
        console.warn(
          "[Web3Auth] NEXT_PUBLIC_WEB3AUTH_CLIENT_ID missing — connect will fail. Fill in .env.local.",
        );
        setIsLoading(false);
        return;
      }

      const privateKeyProvider = new EthereumPrivateKeyProvider({
        config: { chainConfig: CHAIN_CONFIG },
      });

      const w3a = new Web3Auth({
        clientId,
        web3AuthNetwork:
          web3authNetwork as (typeof WEB3AUTH_NETWORK)[keyof typeof WEB3AUTH_NETWORK],
        privateKeyProvider,
        uiConfig: {
          appName: process.env.NEXT_PUBLIC_APP_NAME ?? "YieldPilot",
          mode: "dark",
        },
      });

      await w3a.initModal();
      setWeb3Auth(w3a);

      if (w3a.connected && w3a.provider) {
        const client = createWalletClient({ transport: custom(w3a.provider) });
        const [addr] = await client.getAddresses();
        if (addr) {
          setAddress(addr);
          setWalletClient(client);
        }
      }
      setIsLoading(false);
    };

    void init();
  }, []);

  const connect = async () => {
    if (!web3auth) return;
    const provider = await web3auth.connect();
    if (provider) {
      const client = createWalletClient({ transport: custom(provider) });
      const [addr] = await client.getAddresses();
      if (addr) {
        setAddress(addr);
        setWalletClient(client);
      }
    }
  };

  const disconnect = async () => {
    if (!web3auth) return;
    await web3auth.logout();
    setAddress(null);
    setWalletClient(null);
  };

  return (
    <AuthCtx.Provider
      value={{
        web3auth,
        address,
        walletClient,
        isConnected: !!address,
        isLoading,
        connect,
        disconnect,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useWeb3Auth = () => useContext(AuthCtx);
export const useAccount = () => {
  const { address, isConnected } = useContext(AuthCtx);
  return { address, isConnected };
};
export const useSigner = () => useContext(AuthCtx).walletClient;
