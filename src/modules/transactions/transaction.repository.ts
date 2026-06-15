import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../config/database";

export class TransactionRepository {
  constructor(private readonly db: PrismaClient | Prisma.TransactionClient = prisma) {}

  create(data: Prisma.TransactionCreateInput) {
    return this.db.transaction.create({ data, include: this.detailInclude });
  }

  findById(id: bigint) {
    return this.db.transaction.findUnique({ where: { id }, include: this.detailInclude });
  }

  list(query: { type?: string; status?: string; customerPhone?: string; skip: number; take: number }) {
    return this.db.transaction.findMany({
      where: this.toWhere(query),
      include: this.detailInclude,
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.take
    });
  }

  count(query: { type?: string; status?: string; customerPhone?: string }) {
    return this.db.transaction.count({ where: this.toWhere(query) });
  }

  countTodayByDateRange(start: Date, end: Date) {
    return this.db.transaction.count({ where: { createdAt: { gte: start, lte: end } } });
  }

  nextQueueNo(queueDate: Date) {
    return this.db.transaction.aggregate({
      where: { queueDate },
      _max: { queueNo: true }
    });
  }

  updateStatus(id: bigint, data: Prisma.TransactionUpdateInput) {
    return this.db.transaction.update({ where: { id }, data, include: this.detailInclude });
  }

  private toWhere(query: { type?: string; status?: string; customerPhone?: string }): Prisma.TransactionWhereInput {
    return {
      ...(query.type ? { transactionType: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerPhone ? { customerPhoneSnapshot: { contains: query.customerPhone } } : {})
    };
  }

  private readonly detailInclude = {
    items: true,
    statusLogs: true,
    inventoryMovements: true,
    cylinderLoans: true,
    createdByUser: {
      select: { id: true, username: true, name: true, role: true }
    }
  } satisfies Prisma.TransactionInclude;
}
