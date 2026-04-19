import type http from "node:http";
import { WebSocketServer } from "ws";
import { logger } from "../logger.js";

let wss: WebSocketServer | null = null;
let eventsPath = "/ws/events";

export function attachWs(_server: http.Server, path: string) {
  eventsPath = path;
  wss = new WebSocketServer({ noServer: true });

  const interval = setInterval(() => {
    if (!wss) return;
    for (const client of wss.clients) {
      if (client.readyState !== client.OPEN) continue;
      client.send(JSON.stringify({ type: "ping", payload: { ts: Date.now() } }));
    }
  }, 30_000);

  wss.on("connection", (ws) => {
    logger.debug("ws client connected");
    ws.on("close", () => logger.debug("ws client disconnected"));
  });

  wss.on("close", () => clearInterval(interval));
  return wss;
}

export function getWss() {
  return wss;
}

export function getEventsPath() {
  return eventsPath;
}
