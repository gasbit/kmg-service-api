import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "../../config/database";
import { LOAN_STATUSES } from "../../constants/transaction.constants";
import type {
  CreateLoanInput,
  CreateTransactionRecordInput,
  DatabaseClient,
  TransactionRepository,
  TransactionRunner
} from "./transaction.types";
import { transactionDetailInclude, transactionSummaryInclude } from "./transaction.types";

const asId = (value: string | bigint) => typeof value === "bigint" ? value : BigInt(value);

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  async list(input: {
    page: number;
    limit: number;
    transactionType?: string;
    status?: string;
    search?: string;
    createdAtFrom?: Date;
    createdAtToExclusive?: Date;
  }) {
    const where: Prisma.TransactionWhereInput = {
      ...(input.transactionType ? { transactionType: input.transactionType } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.createdAtFrom || input.createdAtToExclusive ? {
        createdAt: {
          ...(input.createdAtFrom ? { gte: input.createdAtFrom } : {}),
          ...(input.createdAtToExclusive ? { lt: input.createdAtToExclusive } : {})
        }
      } : {}),
      ...(input.search ? {
        OR: [
          { transactionNo: { contains: input.search, mode: "insensitive" } },
          { customerNameSnapshot: { contains: input.search, mode: "insensitive" } },
          { customerPhoneSnapshot: { contains: input.search, mode: "insensitive" } }
        ]
      } : {})
    };

    const [transactions, totalItems] = await Promise.all([
      this.database.transaction.findMany({
        where,
        include: transactionSummaryInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.limit,
        take: input.limit
      }),
      this.database.transaction.count({ where })
    ]);
    return { transactions, totalItems };
  }

  findDetail(transactionId: string | bigint, client?: DatabaseClient) {
    const database = client ?? this.database;
    return database.transaction.findUnique({ where: { id: asId(transactionId) }, include: transactionDetailInclude });
  }

  findProducts(productIds: bigint[], client: DatabaseClient) {
    return client.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        brand: true,
        weightKg: true,
        exchangeCostPrice: true,
        exchangeSalePrice: true,
        fullTankCostPrice: true,
        fullTankPrice: true,
        isActive: true
      }
    });
  }

  async acquireDailyLock(businessDate: string, client: DatabaseClient): Promise<void> {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`transaction-daily:${businessDate}`}))`;
  }

  async nextTransactionSequence(businessDate: string, client: DatabaseClient): Promise<number> {
    const prefix = `TX-${businessDate.replaceAll("-", "")}-`;
    const rows = await client.$queryRaw<Array<{ next_sequence: bigint }>>`
      SELECT COALESCE(MAX(CAST(SUBSTRING(transaction_no FROM 13) AS BIGINT)), 0) + 1 AS next_sequence
      FROM transactions
      WHERE transaction_no LIKE ${`${prefix}%`}
    `;
    return Number(rows[0]?.next_sequence ?? 1);
  }

  async nextQueueNumber(queueDate: string, client: DatabaseClient): Promise<number> {
    const rows = await client.$queryRaw<Array<{ next_queue: bigint }>>`
      SELECT COALESCE(MAX(queue_no), 0) + 1 AS next_queue
      FROM transactions
      WHERE queue_date = CAST(${queueDate} AS date)
    `;
    return Number(rows[0]?.next_queue ?? 1);
  }

  async create(input: CreateTransactionRecordInput, client: DatabaseClient) {
    return client.transaction.create({
      data: {
        transactionNo: input.transactionNo,
        transactionType: input.transactionType,
        status: input.status,
        queueDate: input.queueDate,
        queueNo: input.queueNo,
        customerNameSnapshot: input.customerName,
        customerPhoneSnapshot: input.customerPhone,
        customerAddressSnapshot: input.customerAddress,
        totalAmount: input.totalAmount,
        note: input.note,
        createdBy: input.createdBy,
        completedAt: input.completedAt,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            productBrandSnapshot: item.productBrandSnapshot,
            productWeightSnapshot: item.productWeightSnapshot,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            costPrice: item.costPrice,
            lineTotal: item.lineTotal,
            itemAction: item.itemAction,
            note: item.note
          }))
        },
        statusLogs: {
          create: {
            fromStatus: null,
            toStatus: input.status,
            changedBy: input.createdBy,
            changedAt: input.changedAt
          }
        }
      },
      select: { id: true, items: { select: { id: true, productId: true }, orderBy: { id: "asc" } } }
    });
  }

  async applyExchangeStock(productId: bigint, quantity: number, client: DatabaseClient): Promise<boolean> {
    const affected = await client.$executeRaw`
      UPDATE inventory_balances
      SET full_qty = full_qty - ${quantity}, empty_qty = empty_qty + ${quantity}, updated_at = NOW()
      WHERE product_id = ${productId} AND full_qty >= ${quantity}
    `;
    return affected === 1;
  }

  async applyFullOut(productId: bigint, quantity: number, client: DatabaseClient): Promise<boolean> {
    const affected = await client.$executeRaw`
      UPDATE inventory_balances
      SET full_qty = full_qty - ${quantity}, updated_at = NOW()
      WHERE product_id = ${productId} AND full_qty >= ${quantity}
    `;
    return affected === 1;
  }

  async applyLoanOut(productId: bigint, quantity: number, client: DatabaseClient): Promise<boolean> {
    const affected = await client.$executeRaw`
      UPDATE inventory_balances
      SET full_qty = full_qty - ${quantity}, loaned_qty = loaned_qty + ${quantity}, updated_at = NOW()
      WHERE product_id = ${productId} AND full_qty >= ${quantity}
    `;
    return affected === 1;
  }

  async createMovements(transactionId: bigint, movements: Array<{ productId: bigint; movementType: string; quantity: number; note: string | null }>, client: DatabaseClient): Promise<void> {
    if (!movements.length) return;
    await client.inventoryMovement.createMany({
      data: movements.map((movement) => ({ ...movement, transactionId }))
    });
  }

  async createLoans(loans: CreateLoanInput[], client: DatabaseClient): Promise<void> {
    if (!loans.length) return;
    await client.cylinderLoan.createMany({
      data: loans.map((loan) => ({
        transactionId: loan.transactionId,
        transactionItemId: loan.transactionItemId,
        customerNameSnapshot: loan.customerName,
        customerPhoneSnapshot: loan.customerPhone,
        customerAddressSnapshot: loan.customerAddress,
        productId: loan.productId,
        quantity: loan.quantity,
        returnedQuantity: 0,
        loanStatus: LOAN_STATUSES.BORROWED,
        borrowedDate: loan.borrowedDate,
        expectedReturnDate: loan.expectedReturnDate,
        depositAmount: loan.depositAmount,
        note: loan.note
      }))
    });
  }

  findForStatus(transactionId: bigint, client: DatabaseClient) {
    return client.transaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        transactionType: true,
        status: true,
        items: { select: { productId: true, quantity: true } }
      }
    });
  }

  async claimStatus(transactionId: bigint, fromStatus: string, toStatus: string, completedAt: Date | null, client: DatabaseClient): Promise<boolean> {
    const result = await client.transaction.updateMany({
      where: { id: transactionId, status: fromStatus },
      data: { status: toStatus, completedAt }
    });
    return result.count === 1;
  }

  async createStatusLog(transactionId: bigint, fromStatus: string, toStatus: string, changedBy: bigint, changedAt: Date, note: string | null, client: DatabaseClient): Promise<void> {
    await client.transactionStatusLog.create({
      data: { transactionId, fromStatus, toStatus, changedBy, changedAt, note }
    });
  }
}

const isRetryableWriteError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002");

export class PrismaTransactionRunner implements TransactionRunner {
  constructor(private readonly database: PrismaClient = prisma, private readonly maxAttempts = 3) {}

  async run<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        return await this.database.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      } catch (error) {
        lastError = error;
        if (!isRetryableWriteError(error) || attempt === this.maxAttempts) throw error;
      }
    }
    throw lastError;
  }
}
