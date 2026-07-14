import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";

import { env } from "./config/env";
import { errorMiddleware, notFoundMiddleware } from "./middlewares/error.middleware";
import { requestIdMiddleware } from "./middlewares/request-id.middleware";
import { apiRouter } from "./routes";
import { sendSuccess } from "./shared/utils/api-response";
import { storageRoot } from "./modules/products/product.storage";

export const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));
app.use(requestIdMiddleware);
app.use("/uploads", express.static(path.resolve(storageRoot), { index: false }));

app.get("/api/health", (_request, response) => {
  sendSuccess(response, { status: "ok" });
});
app.use("/api", apiRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
