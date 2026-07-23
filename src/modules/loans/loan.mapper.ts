import { FINAL_LOAN_STATUSES } from "../../constants/loan.constants";
import { bangkokBusinessDate, formatDatabaseDate } from "../../shared/utils/date";
import type { TransactionDetailDto } from "../transactions/transaction.types";
import type {
  LoanDetailDto,
  LoanDetailRecord,
  LoanSummaryDto,
  LoanSummaryRecord,
  ReturnTransactionDto
} from "./loan.types";

export function isLoanOverdue(
  loan: Pick<LoanSummaryRecord, "quantity" | "returnedQuantity" | "expectedReturnDate" | "loanStatus">,
  businessDate: string
): boolean {
  if (FINAL_LOAN_STATUSES.includes(loan.loanStatus as (typeof FINAL_LOAN_STATUSES)[number])) return false;
  const expectedReturnDate = formatDatabaseDate(loan.expectedReturnDate);
  return loan.quantity > loan.returnedQuantity
    && expectedReturnDate !== null
    && expectedReturnDate < businessDate;
}

export function mapLoanSummary(loan: LoanSummaryRecord, businessDate: string): LoanSummaryDto {
  return {
    id: loan.id.toString(),
    borrowTransactionId: loan.transactionId.toString(),
    customerId: loan.customerId?.toString() ?? null,
    customerName: loan.customerNameSnapshot,
    customerPhone: loan.customerPhoneSnapshot,
    customerAddress: loan.customerAddressSnapshot,
    productId: loan.productId.toString(),
    productBrand: loan.transactionItem.productBrandSnapshot,
    productWeightKg: loan.transactionItem.productWeightSnapshot.toFixed(2),
    quantity: loan.quantity,
    returnedQuantity: loan.returnedQuantity,
    remainingQuantity: loan.quantity - loan.returnedQuantity,
    loanStatus: loan.loanStatus,
    isOverdue: isLoanOverdue(loan, businessDate),
    borrowedDate: formatDatabaseDate(loan.borrowedDate)!,
    expectedReturnDate: formatDatabaseDate(loan.expectedReturnDate),
    returnedDate: formatDatabaseDate(loan.returnedDate),
    depositAmount: loan.depositAmount.toFixed(2),
    note: loan.note,
    createdAt: loan.createdAt.toISOString(),
    updatedAt: loan.updatedAt.toISOString()
  };
}

export function mapLoanDetail(loan: LoanDetailRecord, businessDate: string): LoanDetailDto {
  const summary = mapLoanSummary(loan, businessDate);
  const returnHistory = loan.returnItems.map((item) => ({
    transactionId: item.transaction.id.toString(),
    transactionNo: item.transaction.transactionNo,
    quantity: item.quantity,
    returnedDate: bangkokBusinessDate(item.transaction.completedAt ?? item.transaction.createdAt),
    note: item.transaction.note,
    createdBy: {
      id: item.transaction.createdByUser.id.toString(),
      name: item.transaction.createdByUser.name
    },
    createdAt: item.transaction.createdAt.toISOString()
  })).sort((left, right) => {
    const dateOrder = left.returnedDate.localeCompare(right.returnedDate);
    if (dateOrder !== 0) return dateOrder;
    const leftId = BigInt(left.transactionId);
    const rightId = BigInt(right.transactionId);
    return leftId === rightId ? 0 : leftId < rightId ? -1 : 1;
  });

  return {
    ...summary,
    borrowTransactionItemId: loan.transactionItemId.toString(),
    returnHistory
  };
}

export function mapReturnTransaction(transaction: TransactionDetailDto): ReturnTransactionDto {
  const item = transaction.items[0];
  if (!item || !transaction.completedAt) {
    throw new Error("Return transaction is missing its item or completion timestamp");
  }
  return {
    id: transaction.id,
    transactionNo: transaction.transactionNo,
    transactionType: transaction.transactionType,
    status: transaction.status,
    customerName: transaction.customerName,
    customerPhone: transaction.customerPhone,
    customerAddress: transaction.customerAddress,
    totalAmount: transaction.totalAmount,
    note: transaction.note,
    createdBy: transaction.createdBy,
    item,
    createdAt: transaction.createdAt,
    completedAt: transaction.completedAt
  };
}
