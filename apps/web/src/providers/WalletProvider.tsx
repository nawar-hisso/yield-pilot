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
  /** Whether a passkey smart-account record exists on-device. Used by UI to
   *  switch the chooser label from "Create" → "Continue with" and to gate the
   *  Settings "Remove smart account" action. */
  hasPasskey: boolean;
  /** Destroy the stored passkey record permanently. Expose via a dedicated
   *  Settings action — Disconnect does NOT call this. */
  forgetPasskey: () => Promise<void>;
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

  // Auto-set path based on wagmi's actual connection state so Reown-initiated
  // connects (e.g. the user reopens the Reown modal directly) stay in sync.
  // NOTE: we deliberately do NOT auto-set "passkey" based on the stored passkey
  // record. The record survives Disconnect by design (so the address stays
  // stable across sessions), so auto-setting it here would make Disconnect a
  // no-op — the user must explicitly choose the passkey path via the chooser.
  useEffect(() => {
    if (eoa.isConnected && activePath !== "eoa") setActivePath("eoa");
  }, [eoa.isConnected, activePath]);

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
    // IMPORTANT: Disconnecting ends the SESSION, not the account.
    //   - EOA: wagmi disconnectAsync() just drops the provider connection.
    //   - Passkey: we just clear the active path + activePath flag. The
    //     passkey record in IndexedDB is preserved so the counterfactual
    //     smart-account address stays stable across reconnects. Use
    //     passkey.forget() (via a dedicated "Remove smart account" UI) to
    //     actually destroy the account record.
    if (activePath === "eoa") await disconnectAsync();
    setActivePath(null);
  }, [activePath, disconnectAsync]);

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
      hasPasskey: !!passkey.passkey,
      forgetPasskey: passkey.forget,
    };
  }, [
    activePath,
    passkey.passkey,
    passkey.address,
    passkey.isLoading,
    passkey.forget,
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
