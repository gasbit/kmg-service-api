import { formatDatabaseDate } from "../../shared/utils/date";
import type {
  TransactionDetailDto,
  TransactionDetailRecord,
  TransactionSummaryDto,
  TransactionSummaryRecord
} from "./transaction.types";

export function mapTransactionSummary(transaction: TransactionSummaryRecord): TransactionSummaryDto {
  return {
    id: transaction.id.toString(),
    transactionNo: transaction.transactionNo,
    transactionType: transaction.transactionType,
    status: transaction.status,
    queueDate: formatDatabaseDate(transaction.queueDate),
    queueNo: transaction.queueNo,
    customerName: transaction.customerNameSnapshot,
    customerPhone: transaction.customerPhoneSnapshot,
    customerAddress: transaction.customerAddressSnapshot,
    totalAmount: transaction.totalAmount.toFixed(2),
    note: transaction.note,
    itemCount: transaction._count.items,
    totalQuantity: transaction.items.reduce((total, item) => total + item.quantity, 0),
    createdBy: { id: transaction.createdByUser.id.toString(), name: transaction.createdByUser.name },
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
    completedAt: transaction.completedAt?.toISOString() ?? null
  };
}

export function mapTransactionDetail(transaction: TransactionDetailRecord): TransactionDetailDto {
  return {
    id: transaction.id.toString(),
    transactionNo: transaction.transactionNo,
    transactionType: transaction.transactionType,
    status: transaction.status,
    queueDate: formatDatabaseDate(transaction.queueDate),
    queueNo: transaction.queueNo,
    customerId: transaction.customerId?.toString() ?? null,
    customerName: transaction.customerNameSnapshot,
    customerPhone: transaction.customerPhoneSnapshot,
    customerAddress: transaction.customerAddressSnapshot,
    totalAmount: transaction.totalAmount.toFixed(2),
    note: transaction.note,
    createdBy: { id: transaction.createdByUser.id.toString(), name: transaction.createdByUser.name },
    items: transaction.items.map((item) => ({
      id: item.id.toString(),
      productId: item.productId.toString(),
      productBrand: item.productBrandSnapshot,
      productWeightKg: item.productWeightSnapshot.toFixed(2),
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      costPrice: item.costPrice.toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
      itemAction: item.itemAction,
      note: item.note
    })),
    statusLogs: transaction.statusLogs.map((log) => ({
      id: log.id.toString(),
      fromStatus: log.fromStatus,
      toStatus: log.toStatus,
      changedBy: { id: log.changedByUser.id.toString(), name: log.changedByUser.name },
      changedAt: log.changedAt.toISOString(),
      note: log.note
    })),
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
    completedAt: transaction.completedAt?.toISOString() ?? null
  };
}
