import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { apiEnvSchema } from "@yield-pilot/shared";
import { logger } from "./logger.js";
import { paymasterRouter } from "./routes/paymaster.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { attachWs, getWss, getEventsPath } from "./ws/server.js";
import { attachPairWs, getPairWss, getPairPath } from "./ws/pair.js";

const env = apiEnvSchema.parse(process.env);

const app = express();
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(pinoHttp({ logger }));

app.get("/healthz", (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use(express.json({ limit: "1mb" }));
app.use("/api/paymaster", paymasterRouter);
app.use(errorHandler);

const server = http.createServer(app);
attachWs(server, env.WS_PATH);
attachPairWs(server, "/ws/pair");

// Single upgrade router — route by pathname so two WebSocketServers can
// share one http.Server without the first-attached one rejecting paths it
// doesn't own with HTTP 400.
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === getEventsPath()) {
    const events = getWss();
    if (!events) return socket.destroy();
    events.handleUpgrade(req, socket, head, (ws) => events.emit("connection", ws, req));
    return;
  }
  if (url.pathname === getPairPath()) {
    const pair = getPairWss();
    if (!pair) return socket.destroy();
    pair.handleUpgrade(req, socket, head, (ws) => pair.emit("connection", ws, req));
    return;
  }
  socket.destroy();
});

server.listen(env.API_PORT, () => {
  logger.info(
    { port: env.API_PORT, wsPath: env.WS_PATH, cors: env.CORS_ORIGIN },
    "apps/api listening",
  );
});
