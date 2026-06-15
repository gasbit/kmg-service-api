import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { errorMiddleware } from "./middlewares/error.middleware";
import { requestIdMiddleware } from "./middlewares/request-id.middleware";
import { v1Routes } from "./routes";

export const app = express();

app.use(requestIdMiddleware);
app.use(
  pinoHttp({
    logger,
    autoLogging: env.NODE_ENV !== "test",
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url };
      }
    }
  })
);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

app.use("/api/v1", v1Routes);
app.use(errorMiddleware);
