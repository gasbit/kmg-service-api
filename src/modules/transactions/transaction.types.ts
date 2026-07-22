import { Prisma, type PrismaClient } from "@prisma/client";

import type { InventoryMovementType } from "../../constants/inventory.constants";
import type { ItemAction, TransactionStatus, TransactionType } from "../../constants/transaction.constants";

export type DatabaseClient = Prisma.TransactionClient;

export const transactionDetailInclude = {
  createdByUser: { select: { id: true, name: true } },
  items: { orderBy: { id: "asc" as const } },
  statusLogs: {
    include: { changedByUser: { select: { id: true, name: true } } },
    orderBy: [{ changedAt: "asc" as const }, { id: "asc" as const }]
  }
} satisfies Prisma.TransactionInclude;

export type TransactionDetailRecord = Prisma.TransactionGetPayload<{ include: typeof transactionDetailInclude }>;

export const transactionSummaryInclude = {
  createdByUser: { select: { id: true, name: true } },
  items: { select: { quantity: true } },
  _count: { select: { items: true } }
} satisfies Prisma.TransactionInclude;

export type TransactionSummaryRecord = Prisma.TransactionGetPayload<{ include: typeof transactionSummaryInclude }>;

export interface PublicUserDto { id: string; name: string }

export interface TransactionItemDto {
  id: string;
  productId: string;
  productBrand: string;
  productWeightKg: string;
  quantity: number;
  unitPrice: string;
  costPrice: string;
  lineTotal: string;
  itemAction: string;
  note: string | null;
}

export interface TransactionStatusLogDto {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: PublicUserDto;
  changedAt: string;
  note: string | null;
}

export interface TransactionSummaryDto {
  id: string;
  transactionNo: string;
  transactionType: string;
  status: string;
  queueDate: string | null;
  queueNo: number | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  totalAmount: string;
  note: string | null;
  itemCount: number;
  totalQuantity: number;
  createdBy: PublicUserDto;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TransactionDetailDto extends Omit<TransactionSummaryDto, "itemCount" | "totalQuantity"> {
  customerId: string | null;
  items: TransactionItemDto[];
  statusLogs: TransactionStatusLogDto[];
}

export interface WorkflowProduct {
  id: bigint;
  brand: string;
  weightKg: Prisma.Decimal;
  exchangeCostPrice: Prisma.Decimal;
  exchangeSalePrice: Prisma.Decimal;
  fullTankCostPrice: Prisma.Decimal;
  fullTankPrice: Prisma.Decimal;
  isActive: boolean;
}

export interface PreparedTransactionItem {
  productId: bigint;
  productBrandSnapshot: string;
  productWeightSnapshot: Prisma.Decimal;
  quantity: number;
  unitPrice: Prisma.Decimal;
  costPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  itemAction: ItemAction;
  note: string | null;
  expectedReturnDate: Date | null;
  depositAmount: Prisma.Decimal;
}

export interface CreateTransactionRecordInput {
  transactionNo: string;
  transactionType: TransactionType;
  status: TransactionStatus;
  queueDate: Date | null;
  queueNo: number | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  totalAmount: Prisma.Decimal;
  note: string | null;
  createdBy: bigint;
  completedAt: Date | null;
  changedAt: Date;
  items: PreparedTransactionItem[];
}

export interface CreateLoanInput {
  transactionId: bigint;
  transactionItemId: bigint;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  productId: bigint;
  quantity: number;
  borrowedDate: Date;
  expectedReturnDate: Date | null;
  depositAmount: Prisma.Decimal;
  note: string | null;
}

export interface TransactionForStatus {
  id: bigint;
  transactionType: string;
  status: string;
  items: Array<{ productId: bigint; quantity: number }>;
}

export interface TransactionRepository {
  list(input: {
    page: number;
    limit: number;
    transactionType?: string;
    status?: string;
    search?: string;
    createdAtFrom?: Date;
    createdAtToExclusive?: Date;
  }): Promise<{ transactions: TransactionSummaryRecord[]; totalItems: number }>;
  findDetail(transactionId: string | bigint, client?: DatabaseClient): Promise<TransactionDetailRecord | null>;
  findProducts(productIds: bigint[], client: DatabaseClient): Promise<WorkflowProduct[]>;
  acquireDailyLock(businessDate: string, client: DatabaseClient): Promise<void>;
  nextTransactionSequence(businessDate: string, client: DatabaseClient): Promise<number>;
  nextQueueNumber(queueDate: string, client: DatabaseClient): Promise<number>;
  create(input: CreateTransactionRecordInput, client: DatabaseClient): Promise<{ id: bigint; items: Array<{ id: bigint; productId: bigint }> }>;
  applyExchangeStock(productId: bigint, quantity: number, client: DatabaseClient): Promise<boolean>;
  applyFullOut(productId: bigint, quantity: number, client: DatabaseClient): Promise<boolean>;
  applyLoanOut(productId: bigint, quantity: number, client: DatabaseClient): Promise<boolean>;
  createMovements(transactionId: bigint, movements: Array<{ productId: bigint; movementType: InventoryMovementType; quantity: number; note: string | null }>, client: DatabaseClient): Promise<void>;
  createLoans(loans: CreateLoanInput[], client: DatabaseClient): Promise<void>;
  findForStatus(transactionId: bigint, client: DatabaseClient): Promise<TransactionForStatus | null>;
  claimStatus(transactionId: bigint, fromStatus: TransactionStatus, toStatus: TransactionStatus, completedAt: Date | null, client: DatabaseClient): Promise<boolean>;
  createStatusLog(transactionId: bigint, fromStatus: TransactionStatus, toStatus: TransactionStatus, changedBy: bigint, changedAt: Date, note: string | null, client: DatabaseClient): Promise<void>;
}

export interface TransactionRunner {
  run<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T>;
}

export type RootDatabaseClient = PrismaClient;
