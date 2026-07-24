import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { LOAN_STATUSES } from "../../constants/loan.constants";
import { ITEM_ACTIONS, TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../../constants/transaction.constants";
import type { AuthenticatedRequestUser } from "../../shared/types/auth.types";
import type { Clock } from "../../shared/utils/date";
import { TransactionService } from "../transactions/transaction.service";
import type {
  CreateTransactionRecordInput,
  DatabaseClient,
  TransactionDetailRecord,
  TransactionRepository,
  TransactionRunner
} from "../transactions/transaction.types";
import type { LoanDetailRecord, LoanRepository, LoanReturnSource } from "./loan.types";

const now = new Date("2026-07-22T03:00:00.000Z");
const clock: Clock = { now: () => now };
const user: AuthenticatedRequestUser = {
  id: "1",
  name: "Admin",
  username: "admin",
  role: { id: "1", code: "ADMIN", name: "Admin" }
};

function source(overrides: Partial<LoanReturnSource> = {}): LoanReturnSource {
  return {
    id: 301n,
    transactionId: 9001n,
    transactionItemId: 12001n,
    customerId: null,
    customerNameSnapshot: "ร้านอาหารอิ่มดี",
    customerPhoneSnapshot: "0899999999",
    customerAddressSnapshot: "กรุงเทพฯ",
    productId: 42n,
    quantity: 3,
    returnedQuantity: 0,
    loanStatus: LOAN_STATUSES.BORROWED,
    borrowedDate: new Date("2026-07-20T00:00:00.000Z"),
    expectedReturnDate: null,
    returnedDate: null,
    depositAmount: new Prisma.Decimal("500.00"),
    note: null,
    createdAt: new Date("2026-07-20T03:00:00.000Z"),
    updatedAt: new Date("2026-07-20T03:00:00.000Z"),
    transactionItem: {
      productBrandSnapshot: "Original Brand",
      productWeightSnapshot: new Prisma.Decimal("15.00"),
      costPrice: new Prisma.Decimal("330.00")
    },
    ...overrides
  };
}

function transactionDetail(input: CreateTransactionRecordInput): TransactionDetailRecord {
  return {
    id: 9010n,
    transactionNo: input.transactionNo,
    transactionType: input.transactionType,
    status: input.status,
    queueDate: input.queueDate,
    queueNo: input.queueNo,
    customerId: null,
    customerNameSnapshot: input.customerName,
    customerPhoneSnapshot: input.customerPhone,
    customerAddressSnapshot: input.customerAddress,
    totalAmount: input.totalAmount,
    note: input.note,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    completedAt: input.completedAt,
    createdByUser: { id: 1n, name: "Admin" },
    items: input.items.map((item) => ({
      id: 12010n,
      transactionId: 9010n,
      productId: item.productId,
      sourceLoanId: item.sourceLoanId ?? null,
      productBrandSnapshot: item.productBrandSnapshot,
      productWeightSnapshot: item.productWeightSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      costPrice: item.costPrice,
      lineTotal: item.lineTotal,
      itemAction: item.itemAction,
      note: item.note
    })),
    statusLogs: [{
      id: 13010n,
      transactionId: 9010n,
      fromStatus: null,
      toStatus: input.status,
      changedBy: 1n,
      changedAt: now,
      note: input.initialStatusLogNote ?? null,
      changedByUser: { id: 1n, name: "Admin" }
    }]
  } as TransactionDetailRecord;
}

function loanDetail(returnedQuantity: number, status: string): LoanDetailRecord {
  return {
    ...source({
      returnedQuantity,
      loanStatus: status,
      returnedDate: returnedQuantity === 3 ? new Date("2026-07-22T00:00:00.000Z") : null,
      updatedAt: now
    }),
    returnItems: [{
      id: 12010n,
      transactionId: 9010n,
      productId: 42n,
      sourceLoanId: 301n,
      productBrandSnapshot: "Original Brand",
      productWeightSnapshot: new Prisma.Decimal("15.00"),
      quantity: returnedQuantity,
      unitPrice: new Prisma.Decimal(0),
      costPrice: new Prisma.Decimal("330.00"),
      lineTotal: new Prisma.Decimal(0),
      itemAction: ITEM_ACTIONS.RETURN,
      note: "คืนถัง",
      transaction: {
        id: 9010n,
        transactionNo: "TX-20260722-0004",
        note: "คืนถัง",
        createdAt: now,
        completedAt: now,
        createdByUser: { id: 1n, name: "Admin" }
      }
    }]
  } as unknown as LoanDetailRecord;
}

function setup(options: {
  source?: LoanReturnSource | null;
  claim?: boolean;
  stock?: boolean;
  updatedLoan?: LoanDetailRecord;
} = {}) {
  let createdInput: CreateTransactionRecordInput | undefined;
  const repository = {
    acquireDailyLock: vi.fn(async () => undefined),
    nextTransactionSequence: vi.fn(async () => 4),
    create: vi.fn(async (input: CreateTransactionRecordInput) => {
      createdInput = input;
      return { id: 9010n, items: [{ id: 12010n, productId: 42n }] };
    }),
    applyLoanReturn: vi.fn(async () => options.stock ?? true),
    createMovements: vi.fn(async () => undefined),
    findDetail: vi.fn(async () => createdInput ? transactionDetail(createdInput) : null)
  };
  const loanRepository = {
    findReturnSource: vi.fn(async () => options.source === undefined ? source() : options.source),
    claimReturn: vi.fn(async () => options.claim ?? true),
    findDetail: vi.fn(async () => options.updatedLoan ?? loanDetail(1, LOAN_STATUSES.PARTIAL_RETURNED))
  };
  const runner: TransactionRunner = { run: (work) => work({} as DatabaseClient) };
  return {
    repository,
    loanRepository,
    service: new TransactionService(
      repository as unknown as TransactionRepository,
      runner,
      clock,
      loanRepository as unknown as LoanRepository
    ),
    createdInput: () => createdInput
  };
}

describe("TransactionService loan return workflow", () => {
  it("creates a zero-value return transaction from original snapshots and updates stock", async () => {
    const { repository, loanRepository, service, createdInput } = setup();
    const result = await service.returnCylinder({ loanId: "301", quantity: 1, note: "คืนถัง" }, user);

    expect(loanRepository.claimReturn).toHaveBeenCalledWith(301n, 1, "2026-07-22", expect.anything());
    expect(createdInput()).toMatchObject({
      transactionNo: "TX-20260722-0004",
      transactionType: TRANSACTION_TYPES.RETURN_CYLINDER,
      status: TRANSACTION_STATUSES.COMPLETED,
      totalAmount: new Prisma.Decimal(0),
      note: "คืนถัง",
      initialStatusLogNote: "คืนถัง",
      items: [{
        productId: 42n,
        sourceLoanId: 301n,
        productBrandSnapshot: "Original Brand",
        quantity: 1,
        unitPrice: new Prisma.Decimal(0),
        costPrice: new Prisma.Decimal("330.00"),
        lineTotal: new Prisma.Decimal(0),
        itemAction: ITEM_ACTIONS.RETURN,
        note: "คืนถัง"
      }]
    });
    expect(repository.applyLoanReturn).not.toHaveBeenCalled();
    expect(repository.createMovements).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      transaction: {
        transactionType: TRANSACTION_TYPES.RETURN_CYLINDER,
        totalAmount: "0.00",
        item: { costPrice: "330.00", quantity: 1 }
      },
      loan: { id: "301", returnedQuantity: 1, remainingQuantity: 2 }
    });
  });

  it.each([
    [LOAN_STATUSES.RETURNED],
    [LOAN_STATUSES.CANCELLED]
  ])("rejects a loan in final status %s before claiming", async (loanStatus) => {
    const { loanRepository, service } = setup({ source: source({ loanStatus }) });
    await expect(service.returnCylinder({ loanId: "301", quantity: 1 }, user))
      .rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
    expect(loanRepository.claimReturn).not.toHaveBeenCalled();
  });

  it("rejects a quantity greater than the remaining loan quantity", async () => {
    const { service } = setup({ source: source({ returnedQuantity: 2 }) });
    await expect(service.returnCylinder({ loanId: "301", quantity: 2 }, user))
      .rejects.toMatchObject({
        code: "CONFLICT",
        message: "Return quantity exceeds remaining loan quantity"
      });
  });

  it("does not validate loaned inventory while inventory is on hold", async () => {
    const { repository, service } = setup({ stock: false });
    await expect(service.returnCylinder({ loanId: "301", quantity: 1 }, user))
      .resolves.toMatchObject({ loan: { id: "301" } });
    expect(repository.applyLoanReturn).not.toHaveBeenCalled();
    expect(repository.createMovements).not.toHaveBeenCalled();
  });

  it("returns the full-return lifecycle representation", async () => {
    const { service } = setup({
      source: source({ returnedQuantity: 1 }),
      updatedLoan: loanDetail(3, LOAN_STATUSES.RETURNED)
    });
    const result = await service.returnCylinder({ loanId: "301", quantity: 2 }, user);
    expect(result.loan).toMatchObject({
      returnedQuantity: 3,
      remainingQuantity: 0,
      loanStatus: LOAN_STATUSES.RETURNED,
      returnedDate: "2026-07-22"
    });
  });

  it("preserves an overdue status after a partial return", async () => {
    const { service } = setup({
      source: source({ loanStatus: LOAN_STATUSES.OVERDUE }),
      updatedLoan: loanDetail(1, LOAN_STATUSES.OVERDUE)
    });
    const result = await service.returnCylinder({ loanId: "301", quantity: 1 }, user);
    expect(result.loan).toMatchObject({
      returnedQuantity: 1,
      remainingQuantity: 2,
      loanStatus: LOAN_STATUSES.OVERDUE,
      returnedDate: null
    });
  });

  it("reports a concurrent claim conflict without creating a transaction", async () => {
    const current = source({ returnedQuantity: 3, loanStatus: LOAN_STATUSES.RETURNED });
    const { repository, loanRepository, service } = setup({ claim: false });
    loanRepository.findReturnSource
      .mockResolvedValueOnce(source())
      .mockResolvedValueOnce(current);
    await expect(service.returnCylinder({ loanId: "301", quantity: 1 }, user))
      .rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
    expect(repository.create).not.toHaveBeenCalled();
  });
});
