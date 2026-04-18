import type { ErrorRequestHandler } from "express";
import { logger } from "../logger.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error({ err }, "unhandled error");
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({ error: err?.message ?? "internal error" });
};
