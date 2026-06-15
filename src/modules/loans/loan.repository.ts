import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../config/database";
import { LOAN_STATUSES } from "../../constants/inventory.constants";

export class LoanRepository {
  constructor(private readonly db: PrismaClient | Prisma.TransactionClient = prisma) {}

  list(query: { status?: string; skip: number; take: number }) {
    return this.db.cylinderLoan.findMany({
      where: query.status ? { loanStatus: query.status } : undefined,
      include: { product: true, transaction: true },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.take
    });
  }

  count(query: { status?: string }) {
    return this.db.cylinderLoan.count({ where: query.status ? { loanStatus: query.status } : undefined });
  }

  active() {
    return this.db.cylinderLoan.findMany({
      where: { loanStatus: { in: [LOAN_STATUSES.BORROWED, LOAN_STATUSES.PARTIAL_RETURNED, LOAN_STATUSES.OVERDUE] } },
      include: { product: true, transaction: true },
      orderBy: { borrowedDate: "asc" }
    });
  }

  findById(id: bigint) {
    return this.db.cylinderLoan.findUnique({ where: { id }, include: { product: true, transaction: true } });
  }
}
