import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "KMG-SERVICE-API listening");
});

server.on("error", (error) => {
  logger.fatal({ err: error }, "HTTP server failed");
});
