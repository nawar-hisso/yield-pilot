"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Address, Hex } from "viem";
import {
  loadPasskey,
  registerPasskey,
  clearPasskey,
  type PasskeyRecord,
} from "../../lib/passkey";
import { counterfactualAddress } from "../../lib/account";

export interface PasskeyAccountContext {
  /** Passkey record (pubkey + credentialId) if one has been registered. */
  passkey: PasskeyRecord | null;
  /** Counterfactual smart-account address — visible before first UserOp. */
  address: Address | null;
  isLoading: boolean;
  /** Register a new passkey with the user's device authenticator. */
  register: () => Promise<PasskeyRecord>;
  /** Wipe the stored passkey — logs the user out of the smart-account path. */
  forget: () => Promise<void>;
}

const Ctx = createContext<PasskeyAccountContext>({
  passkey: null,
  address: null,
  isLoading: true,
  register: async () => {
    throw new Error("PasskeyAccountProvider not mounted");
  },
  forget: async () => {},
});

function factoryAddress(): Address | null {
  const a = process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS;
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as Address) : null;
}

function accountImplAddress(): Address | null {
  const a = process.env.NEXT_PUBLIC_ACCOUNT_IMPL_ADDRESS;
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as Address) : null;
}

export function PasskeyAccountProvider({ children }: { children: ReactNode }) {
  const [passkey, setPasskey] = useState<PasskeyRecord | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load existing passkey on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const record = await loadPasskey();
        if (cancelled) return;
        setPasskey(record);
        if (record) setAddress(deriveAddress(record));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(async () => {
    setIsLoading(true);
    try {
      const record = await registerPasskey();
      setPasskey(record);
      setAddress(deriveAddress(record));
      return record;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const forget = useCallback(async () => {
    await clearPasskey();
    setPasskey(null);
    setAddress(null);
  }, []);

  return (
    <Ctx.Provider value={{ passkey, address, isLoading, register, forget }}>{children}</Ctx.Provider>
  );
}

export function usePasskeyAccount() {
  return useContext(Ctx);
}

function deriveAddress(record: PasskeyRecord): Address | null {
  const factory = factoryAddress();
  const impl = accountImplAddress();
  if (!factory || !impl) return null;
  return counterfactualAddress({
    factory,
    accountImpl: impl,
    pubKeyX: record.pubKeyX as Hex,
    pubKeyY: record.pubKeyY as Hex,
  });
}
