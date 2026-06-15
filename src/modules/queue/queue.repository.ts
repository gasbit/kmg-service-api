import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../config/database";
import { TRANSACTION_TYPES } from "../../constants/transaction.constants";

export class QueueRepository {
  constructor(private readonly db: PrismaClient | Prisma.TransactionClient = prisma) {}

  listByDate(queueDate: Date) {
    return this.db.transaction.findMany({
      where: { transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE, queueDate },
      include: { items: true, statusLogs: true },
      orderBy: { queueNo: "asc" }
    });
  }
}
