import { TRANSACTION_TYPES } from "../../constants/transaction.constants";
import { formatDatabaseDate } from "../../shared/utils/date";
import type { TransactionDetailDto } from "../transactions/transaction.types";
import type { QueueEntryDto, QueueEntryRecord } from "./queue.types";

function requireQueueIdentity(transactionType: string, queueDate: string | null, queueNo: number | null) {
  if (transactionType !== TRANSACTION_TYPES.DELIVERY_EXCHANGE || queueDate === null || queueNo === null) {
    throw new Error("Queue record is missing delivery queue identity");
  }
  return { queueDate, queueNo };
}

export function mapQueueEntry(record: QueueEntryRecord): QueueEntryDto {
  const identity = requireQueueIdentity(
    record.transactionType,
    formatDatabaseDate(record.queueDate),
    record.queueNo
  );
  const items = record.items.map((item) => ({
    id: item.id.toString(),
    productId: item.productId.toString(),
    productBrand: item.productBrandSnapshot,
    productWeightKg: item.productWeightSnapshot.toFixed(2),
    quantity: item.quantity,
    unitPrice: item.unitPrice.toFixed(2),
    lineTotal: item.lineTotal.toFixed(2),
    note: item.note
  }));
  return {
    id: record.id.toString(),
    transactionNo: record.transactionNo,
    status: record.status,
    queueDate: identity.queueDate,
    queueNo: identity.queueNo,
    customerName: record.customerNameSnapshot,
    customerPhone: record.customerPhoneSnapshot,
    customerAddress: record.customerAddressSnapshot,
    totalAmount: record.totalAmount.toFixed(2),
    note: record.note,
    items,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    createdBy: {
      id: record.createdByUser.id.toString(),
      name: record.createdByUser.name
    },
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null
  };
}

export function mapTransactionDetailToQueue(transaction: TransactionDetailDto): QueueEntryDto {
  const identity = requireQueueIdentity(
    transaction.transactionType,
    transaction.queueDate,
    transaction.queueNo
  );
  const items = transaction.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productBrand: item.productBrand,
    productWeightKg: item.productWeightKg,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    note: item.note
  }));
  return {
    id: transaction.id,
    transactionNo: transaction.transactionNo,
    status: transaction.status,
    queueDate: identity.queueDate,
    queueNo: identity.queueNo,
    customerName: transaction.customerName,
    customerPhone: transaction.customerPhone,
    customerAddress: transaction.customerAddress,
    totalAmount: transaction.totalAmount,
    note: transaction.note,
    items,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    createdBy: transaction.createdBy,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    completedAt: transaction.completedAt
  };
}
