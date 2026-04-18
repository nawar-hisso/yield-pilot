"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAccount, useDisconnect, useWalletClient } from "wagmi";
import type { Address, WalletClient } from "viem";
import { useAppKit } from "@reown/appkit/react";
import { usePasskeyAccount } from "./PasskeyAccountProvider";

export type WalletType = "eoa" | "passkey";
export type ConnectPath = WalletType;

const STORAGE_KEY = "yp:connect-path";

export interface WalletContextValue {
  address: Address | null;
  isConnected: boolean;
  isLoading: boolean;
  walletType: WalletType | null;
  chainId: number | undefined;
  walletClient: WalletClient | null;
  openChooser: () => void;
  closeChooser: () => void;
  chooserOpen: boolean;
  chooseEoa: () => void;
  choosePasskey: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const Ctx = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { open } = useAppKit();
  const eoa = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const passkey = usePasskeyAccount();

  const [chooserOpen, setChooserOpen] = useState(false);
  const [activePath, setActivePath] = useState<ConnectPath | null>(null);

  // Rehydrate the last-used path on mount.
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored === "eoa" || stored === "passkey") setActivePath(stored);
  }, []);

  // Persist whenever activePath changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activePath) window.localStorage.setItem(STORAGE_KEY, activePath);
    else window.localStorage.removeItem(STORAGE_KEY);
  }, [activePath]);

  // Auto-set path based on actual connection state (e.g. user reconnects wagmi).
  useEffect(() => {
    if (eoa.isConnected && activePath !== "eoa") setActivePath("eoa");
  }, [eoa.isConnected, activePath]);
  useEffect(() => {
    if (passkey.passkey && activePath !== "passkey") setActivePath("passkey");
  }, [passkey.passkey, activePath]);

  const openChooser = useCallback(() => setChooserOpen(true), []);
  const closeChooser = useCallback(() => setChooserOpen(false), []);

  const chooseEoa = useCallback(() => {
    setActivePath("eoa");
    setChooserOpen(false);
    void open();
  }, [open]);

  const choosePasskey = useCallback(async () => {
    setActivePath("passkey");
    setChooserOpen(false);
    if (!passkey.passkey) {
      await passkey.register();
    }
  }, [passkey]);

  const disconnect = useCallback(async () => {
    if (activePath === "eoa") await disconnectAsync();
    else if (activePath === "passkey") await passkey.forget();
    setActivePath(null);
  }, [activePath, disconnectAsync, passkey]);

  const value = useMemo<WalletContextValue>(() => {
    const isPasskey = activePath === "passkey" && !!passkey.passkey;
    const isEoa = activePath === "eoa" && eoa.isConnected;
    const address = isPasskey ? passkey.address : isEoa ? (eoa.address as Address | undefined) ?? null : null;
    return {
      address: address ?? null,
      isConnected: isPasskey || isEoa,
      isLoading: passkey.isLoading || eoa.isConnecting,
      walletType: isPasskey ? "passkey" : isEoa ? "eoa" : null,
      chainId: eoa.chainId,
      walletClient: isEoa ? (walletClient ?? null) : null,
      openChooser,
      closeChooser,
      chooserOpen,
      chooseEoa,
      choosePasskey,
      disconnect,
    };
  }, [
    activePath,
    passkey.passkey,
    passkey.address,
    passkey.isLoading,
    eoa.isConnected,
    eoa.address,
    eoa.chainId,
    eoa.isConnecting,
    walletClient,
    openChooser,
    closeChooser,
    chooserOpen,
    chooseEoa,
    choosePasskey,
    disconnect,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside <WalletProvider>");
  return v;
}
