"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimePayload } from "@yield-pilot/shared";

/**
 * Subscribes to the apps/api WebSocket channel. Emits the latest
 */
export function useRealtime() {
  const [last, setLast] = useState<RealtimePayload | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WS_URL;
    if (!url) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const payload: RealtimePayload = JSON.parse(ev.data);
        setLast(payload);
      } catch (err) {
        console.warn("[useRealtime] bad payload", err);
      }
    };
    ws.onerror = (err) => console.warn("[useRealtime] error", err);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  return { last };
}
