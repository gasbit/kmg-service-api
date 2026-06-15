import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../config/database";
import { LOAN_STATUSES } from "../../constants/inventory.constants";
import { TRANSACTION_TYPES } from "../../constants/transaction.constants";

export class DashboardRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  statusSummary(start: Date, end: Date) {
    return this.db.transaction.groupBy({
      by: ["status"],
      where: { createdAt: { gte: start, lte: end } },
      _count: { status: true }
    });
  }

  todaySales(start: Date, end: Date) {
    return this.db.transaction.aggregate({
      where: { createdAt: { gte: start, lte: end }, status: "COMPLETED" },
      _sum: { totalAmount: true }
    });
  }

  todayQueue(today: Date) {
    return this.db.transaction.findMany({
      where: {
        transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
        queueDate: today,
        status: { in: ["PENDING", "IN_PROGRESS"] }
      },
      include: { items: true },
      orderBy: { queueNo: "asc" }
    });
  }

  activeProductPrices() {
    return this.db.product.findMany({
      where: { isActive: true },
      orderBy: [{ weightKg: "asc" }, { brand: "asc" }],
      select: { id: true, brand: true, weightKg: true, exchangeSalePrice: true, fullTankPrice: true }
    });
  }

  activeLoans() {
    return this.db.cylinderLoan.findMany({
      where: { loanStatus: { in: [LOAN_STATUSES.BORROWED, LOAN_STATUSES.PARTIAL_RETURNED, LOAN_STATUSES.OVERDUE] } },
      include: { product: true },
      orderBy: { borrowedDate: "asc" },
      take: 20
    });
  }

  stockSummary() {
    return this.db.inventoryBalance.findMany({
      include: { product: true },
      orderBy: [{ product: { weightKg: "asc" } }, { product: { brand: "asc" } }]
    });
  }
}
