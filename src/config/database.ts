import { Prisma, PrismaClient } from "@prisma/client";

import { env } from "./env";

export const prisma = new PrismaClient({
  log: env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"]
});

export type PrismaTransactionClient = Prisma.TransactionClient;

