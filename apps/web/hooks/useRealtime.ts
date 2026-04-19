"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimePayload } from "@yield-pilot/shared";

/**
 * Subscribes to the apps/api WebSocket channel. Tracks the latest real
 * `connected` + `lastPingAt`. The `ping` heartbeat (emitted every 30s by the
 * server) is consumed but never surfaced as activity — it's just a
 * keep-alive, not a user-visible event.
 */
export function useRealtime() {
  const [last, setLast] = useState<Exclude<RealtimePayload, { type: "ping" }> | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WS_URL;
    if (!url) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const payload: RealtimePayload = JSON.parse(ev.data);
        if (payload.type === "ping") {
          setLastPingAt(payload.payload.ts);
          return;
        }
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

  return { last, connected, lastPingAt };
}
