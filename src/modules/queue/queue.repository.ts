import type { PrismaClient } from "@prisma/client";

import { prisma } from "../../config/database";
import { TRANSACTION_TYPES } from "../../constants/transaction.constants";
import { databaseDate } from "../../shared/utils/date";
import { queueEntrySelect, type QueueRepository, type QueueRepositoryInput } from "./queue.types";

export class PrismaQueueRepository implements QueueRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  listByDate(input: QueueRepositoryInput) {
    return this.database.transaction.findMany({
      where: {
        transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
        queueDate: databaseDate(input.queueDate),
        queueNo: { not: null },
        ...(input.status ? { status: input.status } : {})
      },
      select: queueEntrySelect,
      orderBy: [{ queueNo: "asc" }, { id: "asc" }]
    });
  }
}
