import { Prisma, type PrismaClient } from "@prisma/client";

import type { LoanStatus } from "../../constants/loan.constants";
import type { DatabaseClient } from "../transactions/transaction.types";

export const loanSummaryInclude = {
  transactionItem: {
    select: {
      productBrandSnapshot: true,
      productWeightSnapshot: true
    }
  }
} satisfies Prisma.CylinderLoanInclude;

export const loanDetailInclude = {
  transactionItem: {
    select: {
      productBrandSnapshot: true,
      productWeightSnapshot: true,
      costPrice: true
    }
  },
  returnItems: {
    include: {
      transaction: {
        select: {
          id: true,
          transactionNo: true,
          note: true,
          createdAt: true,
          completedAt: true,
          createdByUser: {
            select: { id: true, name: true }
          }
        }
      }
    },
    orderBy: { transactionId: "asc" as const }
  }
} satisfies Prisma.CylinderLoanInclude;

export const returnSourceSelect = {
  id: true,
  transactionId: true,
  transactionItemId: true,
  customerId: true,
  customerNameSnapshot: true,
  customerPhoneSnapshot: true,
  customerAddressSnapshot: true,
  productId: true,
  quantity: true,
  returnedQuantity: true,
  loanStatus: true,
  borrowedDate: true,
  expectedReturnDate: true,
  returnedDate: true,
  depositAmount: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  transactionItem: {
    select: {
      productBrandSnapshot: true,
      productWeightSnapshot: true,
      costPrice: true
    }
  }
} satisfies Prisma.CylinderLoanSelect;

export type LoanSummaryRecord = Prisma.CylinderLoanGetPayload<{ include: typeof loanSummaryInclude }>;
export type LoanDetailRecord = Prisma.CylinderLoanGetPayload<{ include: typeof loanDetailInclude }>;
export type LoanReturnSource = Prisma.CylinderLoanGetPayload<{ select: typeof returnSourceSelect }>;

export interface PublicUserDto {
  id: string;
  name: string;
}

export interface LoanSummaryDto {
  id: string;
  borrowTransactionId: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  productId: string;
  productBrand: string;
  productWeightKg: string;
  quantity: number;
  returnedQuantity: number;
  remainingQuantity: number;
  loanStatus: string;
  isOverdue: boolean;
  borrowedDate: string;
  expectedReturnDate: string | null;
  returnedDate: string | null;
  depositAmount: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoanReturnHistoryItemDto {
  transactionId: string;
  transactionNo: string;
  quantity: number;
  returnedDate: string;
  note: string | null;
  createdBy: PublicUserDto;
  createdAt: string;
}

export interface LoanDetailDto extends LoanSummaryDto {
  borrowTransactionItemId: string;
  returnHistory: LoanReturnHistoryItemDto[];
}

export interface ReturnTransactionItemDto {
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

export interface ReturnTransactionDto {
  id: string;
  transactionNo: string;
  transactionType: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  totalAmount: string;
  note: string | null;
  createdBy: PublicUserDto;
  item: ReturnTransactionItemDto;
  createdAt: string;
  completedAt: string;
}

export interface LoanListRepositoryInput {
  page: number;
  limit: number;
  businessDate: string;
  activeOnly: boolean;
  status?: LoanStatus | string;
  isOverdue?: boolean;
  search?: string;
}

export interface LoanRepository {
  list(input: LoanListRepositoryInput): Promise<{ loans: LoanSummaryRecord[]; totalItems: number }>;
  findDetail(loanId: string | bigint, client?: DatabaseClient): Promise<LoanDetailRecord | null>;
  findReturnSource(loanId: bigint, client: DatabaseClient): Promise<LoanReturnSource | null>;
  claimReturn(loanId: bigint, quantity: number, returnedDate: string, client: DatabaseClient): Promise<boolean>;
}

export type RootDatabaseClient = PrismaClient;
