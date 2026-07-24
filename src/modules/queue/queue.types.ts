import { Prisma } from "@prisma/client";

import type { TransactionStatus } from "../../constants/transaction.constants";
import type { AuthenticatedRequestUser } from "../../shared/types/auth.types";
import type { ChangeTransactionStatusInput } from "../transactions/transaction.schema";
import type { TransactionDetailDto } from "../transactions/transaction.types";

export const queueEntrySelect = {
  id: true,
  transactionNo: true,
  transactionType: true,
  status: true,
  queueDate: true,
  queueNo: true,
  customerNameSnapshot: true,
  customerPhoneSnapshot: true,
  customerAddressSnapshot: true,
  totalAmount: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  createdByUser: { select: { id: true, name: true } },
  items: {
    select: {
      id: true,
      productId: true,
      productBrandSnapshot: true,
      productWeightSnapshot: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      note: true
    },
    orderBy: { id: "asc" as const }
  }
} satisfies Prisma.TransactionSelect;

export type QueueEntryRecord = Prisma.TransactionGetPayload<{ select: typeof queueEntrySelect }>;

export interface QueueRepositoryInput {
  queueDate: string;
  status?: TransactionStatus;
}

export interface QueueRepository {
  listByDate(input: QueueRepositoryInput): Promise<QueueEntryRecord[]>;
}

export interface QueueStatusService {
  changeQueueStatus(
    transactionId: string,
    input: ChangeTransactionStatusInput,
    currentUser: AuthenticatedRequestUser
  ): Promise<TransactionDetailDto>;
}

export interface QueueItemDto {
  id: string;
  productId: string;
  productBrand: string;
  productWeightKg: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  note: string | null;
}

export interface QueueEntryDto {
  id: string;
  transactionNo: string;
  status: string;
  queueDate: string;
  queueNo: number;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  totalAmount: string;
  note: string | null;
  items: QueueItemDto[];
  totalQuantity: number;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface QueueListResult {
  queueDate: string;
  queues: QueueEntryDto[];
}
