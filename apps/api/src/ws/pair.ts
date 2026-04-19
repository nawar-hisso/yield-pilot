import type http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { logger } from "../logger.js";

/**
 * Ephemeral device-pairing relay.
 *
 * One WebSocket per peer. Peers send `{ type: "pair:join", nonce, role }` on
 * connect. When both `host` and `guest` have joined a nonce, the server
 * forwards every subsequent message from one to the other (and vice versa).
 *
 * Pure in-memory. No DB writes, no log of payloads. Nonces expire after 5
 * minutes. Once either peer disconnects, the nonce is wiped.
 */

interface PairSession {
  nonce: string;
  host?: WebSocket;
  guest?: WebSocket;
  createdAt: number;
}

const sessions = new Map<string, PairSession>();
const TTL_MS = 5 * 60 * 1000;

function cleanupExpired(): void {
  const now = Date.now();
  for (const [nonce, s] of sessions) {
    if (now - s.createdAt > TTL_MS) {
      try { s.host?.close(4408, "expired"); } catch {}
      try { s.guest?.close(4408, "expired"); } catch {}
      sessions.delete(nonce);
    }
  }
}

let _pairPath = "/ws/pair";
let _pairWss: WebSocketServer | null = null;

export function getPairWss() { return _pairWss; }
export function getPairPath() { return _pairPath; }

export function attachPairWs(_server: http.Server, path: string): WebSocketServer {
  _pairPath = path;
  const wss = new WebSocketServer({ noServer: true });
  _pairWss = wss;

  const sweeper = setInterval(cleanupExpired, 60_000);
  wss.on("close", () => clearInterval(sweeper));

  wss.on("connection", (ws) => {
    let myNonce: string | null = null;
    let myRole: "host" | "guest" | null = null;
    logger.debug("pair ws client connected");

    ws.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.close(4400, "bad json");
        return;
      }

      const type = typeof msg.type === "string" ? msg.type : "";

      if (type === "pair:join") {
        const nonce = typeof msg.nonce === "string" ? msg.nonce : "";
        const role = msg.role === "host" || msg.role === "guest" ? msg.role : null;
        if (!nonce || nonce.length < 16 || nonce.length > 128 || !role) {
          ws.close(4400, "bad join");
          return;
        }
        let session = sessions.get(nonce);
        if (!session) {
          session = { nonce, createdAt: Date.now() };
          sessions.set(nonce, session);
        }
        if (role === "host") {
          if (session.host) { ws.close(4409, "host already joined"); return; }
          session.host = ws;
        } else {
          if (session.guest) { ws.close(4409, "guest already joined"); return; }
          session.guest = ws;
        }
        myNonce = nonce;
        myRole = role;

        ws.send(JSON.stringify({ type: "pair:joined", role, peerReady: Boolean(session.host && session.guest) }));
        if (session.host && session.guest) {
          const payload = JSON.stringify({ type: "pair:ready" });
          try { session.host.send(payload); } catch {}
          try { session.guest.send(payload); } catch {}
        }
        return;
      }

      // Relay any other message type to the peer.
      if (!myNonce || !myRole) { ws.close(4401, "not joined"); return; }
      const session = sessions.get(myNonce);
      if (!session) { ws.close(4404, "no session"); return; }
      const peer = myRole === "host" ? session.guest : session.host;
      if (!peer || peer.readyState !== peer.OPEN) return;
      try { peer.send(raw.toString()); } catch (err) {
        logger.warn({ err }, "pair relay failed");
      }
    });

    ws.on("close", () => {
      if (!myNonce) return;
      const session = sessions.get(myNonce);
      if (!session) return;
      if (myRole === "host") session.host = undefined;
      else if (myRole === "guest") session.guest = undefined;
      // Tell the remaining peer the session is dead.
      const peer = myRole === "host" ? session.guest : session.host;
      try { peer?.send(JSON.stringify({ type: "pair:closed", reason: "peer disconnected" })); } catch {}
      if (!session.host && !session.guest) sessions.delete(myNonce);
    });
  });

  return wss;
}
