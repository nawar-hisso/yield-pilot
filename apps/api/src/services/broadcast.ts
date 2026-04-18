import type { RealtimePayload } from "@yield-pilot/shared";
import { getWss } from "../ws/server.js";

/** Fan-out a payload to every connected WebSocket client. */
export function broadcast(payload: RealtimePayload) {
  const wss = getWss();
  if (!wss) return;
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(msg);
  }
}
