import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { apiEnvSchema } from "@yield-pilot/shared";
import { logger } from "./logger.js";
import { userRouter } from "./routes/user.js";
import { paymasterRouter } from "./routes/paymaster.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { attachWs } from "./ws/server.js";
import { attachPairWs } from "./ws/pair.js";

const env = apiEnvSchema.parse(process.env);

const app = express();
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(pinoHttp({ logger }));

app.get("/healthz", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Mount express.raw BEFORE the JSON parser and scoped only to this prefix.

// JSON parser for the rest of the API.
app.use(express.json({ limit: "1mb" }));
app.use("/api/user", userRouter);
app.use("/api/paymaster", paymasterRouter);
app.use(errorHandler);

const server = http.createServer(app);
attachWs(server, env.WS_PATH);
attachPairWs(server, "/ws/pair");

server.listen(env.API_PORT, () => {
  logger.info(
    { port: env.API_PORT, wsPath: env.WS_PATH, cors: env.CORS_ORIGIN },
    "apps/api listening",
  );
});
