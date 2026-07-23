import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { INVENTORY_MOVEMENT_TYPES } from "../../constants/inventory.constants";
import { ITEM_ACTIONS, TRANSACTION_STATUSES, TRANSACTION_TYPES, type TransactionStatus } from "../../constants/transaction.constants";
import { AppError } from "../../shared/errors/app-error";
import type { AuthenticatedRequestUser } from "../../shared/types/auth.types";
import type { Clock } from "../../shared/utils/date";
import { TransactionService } from "./transaction.service";
import type {
  CreateTransactionRecordInput,
  DatabaseClient,
  TransactionDetailRecord,
  TransactionRepository,
  TransactionRunner
} from "./transaction.types";

const now = new Date("2026-07-22T03:00:00.000Z");
const clock: Clock = { now: () => now };
const user: AuthenticatedRequestUser = {
  id: "1",
  name: "Admin",
  username: "admin",
  role: { id: "1", code: "ADMIN", name: "Admin" }
};

function detailFrom(input: CreateTransactionRecordInput, status = input.status): TransactionDetailRecord {
  return {
    id: 100n,
    transactionNo: input.transactionNo,
    transactionType: input.transactionType,
    status,
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
    items: input.items.map((item, index) => ({
      id: BigInt(200 + index),
      transactionId: 100n,
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
      id: 300n,
      transactionId: 100n,
      fromStatus: null,
      toStatus: status,
      changedBy: 1n,
      changedAt: now,
      note: null,
      changedByUser: { id: 1n, name: "Admin" }
    }],
    inventoryMovements: undefined as never,
    cylinderLoans: undefined as never,
    customer: undefined as never
  } as TransactionDetailRecord;
}

function statusDetail(status: TransactionStatus): TransactionDetailRecord {
  return detailFrom({
    transactionNo: "TX-20260722-0001",
    transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
    status,
    queueDate: new Date("2026-07-22T00:00:00.000Z"),
    queueNo: 1,
    customerName: "Customer",
    customerPhone: null,
    customerAddress: "Address",
    totalAmount: new Prisma.Decimal("780.00"),
    note: null,
    createdBy: 1n,
    completedAt: status === TRANSACTION_STATUSES.COMPLETED ? now : null,
    changedAt: now,
    items: [{
      productId: 42n,
      productBrandSnapshot: "Brand",
      productWeightSnapshot: new Prisma.Decimal("15.00"),
      quantity: 2,
      unitPrice: new Prisma.Decimal("390.00"),
      costPrice: new Prisma.Decimal("330.00"),
      lineTotal: new Prisma.Decimal("780.00"),
      itemAction: ITEM_ACTIONS.EXCHANGE,
      note: null,
      expectedReturnDate: null,
      depositAmount: new Prisma.Decimal(0)
    }]
  }, status);
}

function setup() {
  let createdInput: CreateTransactionRecordInput | undefined;
  let detailStatus: TransactionStatus | undefined;
  const repository = {
    list: vi.fn(),
    findDetail: vi.fn(async () => createdInput ? detailFrom(createdInput, detailStatus) : null),
    findProducts: vi.fn(async (ids: bigint[]) => ids.map((id) => ({
      id,
      brand: `Brand ${id}`,
      weightKg: new Prisma.Decimal("15.00"),
      exchangeCostPrice: new Prisma.Decimal("330.00"),
      exchangeSalePrice: new Prisma.Decimal("390.00"),
      fullTankCostPrice: new Prisma.Decimal("1850.00"),
      fullTankPrice: new Prisma.Decimal("2450.00"),
      isActive: true
    }))),
    acquireDailyLock: vi.fn(async () => undefined),
    nextTransactionSequence: vi.fn(async () => 1),
    nextQueueNumber: vi.fn(async () => 1),
    create: vi.fn(async (input: CreateTransactionRecordInput) => {
      createdInput = input;
      detailStatus = input.status;
      return { id: 100n, items: input.items.map((item, index) => ({ id: BigInt(200 + index), productId: item.productId })) };
    }),
    applyExchangeStock: vi.fn(async () => true),
    applyFullOut: vi.fn(async () => true),
    applyLoanOut: vi.fn(async () => true),
    createMovements: vi.fn(async () => undefined),
    createLoans: vi.fn(async () => undefined),
    findForStatus: vi.fn(),
    claimStatus: vi.fn(async (_id: bigint, _from: TransactionStatus, to: TransactionStatus) => { detailStatus = to; return true; }),
    createStatusLog: vi.fn(async () => undefined)
  };
  const runner: TransactionRunner = {
    run: (work) => work({} as DatabaseClient)
  };
  return {
    repository,
    service: new TransactionService(repository as unknown as TransactionRepository, runner, clock),
    createdInput: () => createdInput
  };
}

describe("TransactionService create workflows", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates delivery queue data without changing stock", async () => {
    const { repository, service } = setup();
    const result = await service.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "Customer",
      customerAddress: "Address",
      items: [{ productId: "42", quantity: 2 }]
    }, user);

    expect(result).toMatchObject({
      transactionNo: "TX-20260722-0001",
      status: TRANSACTION_STATUSES.PENDING,
      queueDate: "2026-07-22",
      queueNo: 1,
      totalAmount: "780.00"
    });
    expect(repository.nextQueueNumber).toHaveBeenCalledWith("2026-07-22", expect.anything());
    expect(repository.applyExchangeStock).not.toHaveBeenCalled();
    expect(repository.createMovements).not.toHaveBeenCalled();
  });

  it("completes walk-in exchange with full-out and empty-in movements", async () => {
    const { repository, service } = setup();
    await service.create({
      transactionType: TRANSACTION_TYPES.WALK_IN_EXCHANGE,
      customerName: "Customer",
      items: [{ productId: "42", quantity: 2 }]
    }, user);

    expect(repository.applyExchangeStock).toHaveBeenCalledWith(42n, 2, expect.anything());
    expect(repository.createMovements).toHaveBeenCalledWith(100n, [
      expect.objectContaining({ movementType: INVENTORY_MOVEMENT_TYPES.FULL_OUT }),
      expect.objectContaining({ movementType: INVENTORY_MOVEMENT_TYPES.EMPTY_IN })
    ], expect.anything());
  });

  it("creates a zero-revenue borrow, loan-out movement, and loan terms", async () => {
    const { repository, service, createdInput } = setup();
    const result = await service.create({
      transactionType: TRANSACTION_TYPES.BORROW_CYLINDER,
      customerName: "Restaurant",
      items: [{ productId: "42", quantity: 1, depositAmount: "500.00" }]
    }, user);

    expect(result.totalAmount).toBe("0.00");
    expect(createdInput()?.items[0].costPrice.toFixed(2)).toBe("330.00");
    expect(repository.applyLoanOut).toHaveBeenCalledWith(42n, 1, expect.anything());
    expect(repository.createMovements).toHaveBeenCalledWith(100n, [
      expect.objectContaining({ movementType: INVENTORY_MOVEMENT_TYPES.LOAN_OUT })
    ], expect.anything());
    expect(repository.createLoans).toHaveBeenCalledWith([
      expect.objectContaining({
        transactionItemId: 200n,
        expectedReturnDate: null,
        depositAmount: new Prisma.Decimal("500.00")
      })
    ], expect.anything());
  });

  it("uses full-tank price and only decreases full stock", async () => {
    const { repository, service } = setup();
    const result = await service.create({
      transactionType: TRANSACTION_TYPES.BUY_FULL_TANK,
      customerName: "Customer",
      items: [{ productId: "42", quantity: 2 }]
    }, user);

    expect(result.totalAmount).toBe("4900.00");
    expect(repository.applyFullOut).toHaveBeenCalledWith(42n, 2, expect.anything());
    expect(repository.createMovements).toHaveBeenCalledWith(100n, [
      expect.objectContaining({ movementType: INVENTORY_MOVEMENT_TYPES.FULL_OUT })
    ], expect.anything());
  });

  it("raises INSUFFICIENT_STOCK before movements are written", async () => {
    const { repository, service } = setup();
    repository.applyFullOut.mockResolvedValue(false);
    await expect(service.create({
      transactionType: TRANSACTION_TYPES.BUY_FULL_TANK,
      customerName: "Customer",
      items: [{ productId: "42", quantity: 2 }]
    }, user)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(repository.createMovements).not.toHaveBeenCalled();
  });

  it("rejects a missing product before creating a transaction", async () => {
    const { repository, service } = setup();
    repository.findProducts.mockResolvedValue([]);
    await expect(service.create({
      transactionType: TRANSACTION_TYPES.WALK_IN_EXCHANGE,
      customerName: "Customer",
      items: [{ productId: "999", quantity: 1 }]
    }, user)).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects an inactive product before creating a transaction", async () => {
    const { repository, service } = setup();
    repository.findProducts.mockImplementation(async (ids: bigint[]) => ids.map((id) => ({
      id,
      brand: "Inactive",
      weightKg: new Prisma.Decimal("15.00"),
      exchangeCostPrice: new Prisma.Decimal("330.00"),
      exchangeSalePrice: new Prisma.Decimal("390.00"),
      fullTankCostPrice: new Prisma.Decimal("1850.00"),
      fullTankPrice: new Prisma.Decimal("2450.00"),
      isActive: false
    })));
    await expect(service.create({
      transactionType: TRANSACTION_TYPES.BUY_FULL_TANK,
      customerName: "Customer",
      items: [{ productId: "42", quantity: 1 }]
    }, user)).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("maps an exhausted unique-number race to an operational conflict", async () => {
    const { repository } = setup();
    const uniqueError = new Prisma.PrismaClientKnownRequestError("Unique constraint", {
      code: "P2002",
      clientVersion: "test"
    });
    const failingRunner: TransactionRunner = { run: async () => { throw uniqueError; } };
    const service = new TransactionService(repository as unknown as TransactionRepository, failingRunner, clock);
    await expect(service.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "Customer",
      customerAddress: "Address",
      items: [{ productId: "42", quantity: 1 }]
    }, user)).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
  });
});

describe("TransactionService status workflows", () => {
  it("rejects a transition that skips IN_PROGRESS", async () => {
    const { repository, service } = setup();
    repository.findForStatus.mockResolvedValue({
      id: 100n,
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      status: TRANSACTION_STATUSES.PENDING,
      items: [{ productId: 42n, quantity: 1 }]
    });
    await expect(service.changeStatus("100", { status: TRANSACTION_STATUSES.COMPLETED }, user))
      .rejects.toBeInstanceOf(AppError);
    expect(repository.claimStatus).not.toHaveBeenCalled();
  });

  it("claims delivery completion before applying exchange inventory effects", async () => {
    const { repository, service } = setup();
    repository.findForStatus.mockResolvedValue({
      id: 100n,
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      status: TRANSACTION_STATUSES.IN_PROGRESS,
      items: [{ productId: 42n, quantity: 2 }]
    });
    repository.findDetail.mockResolvedValue(detailFrom({
      transactionNo: "TX-20260722-0001",
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      status: TRANSACTION_STATUSES.IN_PROGRESS,
      queueDate: new Date("2026-07-22T00:00:00.000Z"),
      queueNo: 1,
      customerName: "Customer",
      customerPhone: null,
      customerAddress: "Address",
      totalAmount: new Prisma.Decimal("390.00"),
      note: null,
      createdBy: 1n,
      completedAt: now,
      changedAt: now,
      items: [{
        productId: 42n,
        productBrandSnapshot: "Brand",
        productWeightSnapshot: new Prisma.Decimal("15.00"),
        quantity: 2,
        unitPrice: new Prisma.Decimal("390.00"),
        costPrice: new Prisma.Decimal("330.00"),
        lineTotal: new Prisma.Decimal("780.00"),
        itemAction: "EXCHANGE",
        note: null,
        expectedReturnDate: null,
        depositAmount: new Prisma.Decimal(0)
      }]
    }, TRANSACTION_STATUSES.COMPLETED));
    const result = await service.changeStatus("100", { status: TRANSACTION_STATUSES.COMPLETED, note: "Delivered" }, user);
    expect(repository.claimStatus).toHaveBeenCalledBefore(repository.applyExchangeStock);
    expect(repository.applyExchangeStock).toHaveBeenCalledWith(42n, 2, expect.anything());
    expect(repository.createMovements).toHaveBeenCalledWith(100n, expect.arrayContaining([
      expect.objectContaining({ movementType: INVENTORY_MOVEMENT_TYPES.FULL_OUT }),
      expect.objectContaining({ movementType: INVENTORY_MOVEMENT_TYPES.EMPTY_IN })
    ]), expect.anything());
    expect(repository.createStatusLog).toHaveBeenCalled();
    expect(result.status).toBe(TRANSACTION_STATUSES.COMPLETED);
  });

  it("implements cancel as the shared CANCELLED status transition", async () => {
    const { service } = setup();
    const changeStatus = vi.spyOn(service, "changeStatus").mockResolvedValue({} as never);
    await service.cancel("100", { note: "Customer cancelled" }, user);
    expect(changeStatus).toHaveBeenCalledWith("100", {
      status: TRANSACTION_STATUSES.CANCELLED,
      note: "Customer cancelled"
    }, user);
  });

  it.each([
    [TRANSACTION_STATUSES.PENDING, TRANSACTION_STATUSES.IN_PROGRESS, true],
    [TRANSACTION_STATUSES.PENDING, TRANSACTION_STATUSES.CANCELLED, true],
    [TRANSACTION_STATUSES.IN_PROGRESS, TRANSACTION_STATUSES.COMPLETED, true],
    [TRANSACTION_STATUSES.IN_PROGRESS, TRANSACTION_STATUSES.CANCELLED, true],
    [TRANSACTION_STATUSES.PENDING, TRANSACTION_STATUSES.COMPLETED, false],
    [TRANSACTION_STATUSES.IN_PROGRESS, TRANSACTION_STATUSES.IN_PROGRESS, false],
    [TRANSACTION_STATUSES.COMPLETED, TRANSACTION_STATUSES.CANCELLED, false],
    [TRANSACTION_STATUSES.CANCELLED, TRANSACTION_STATUSES.IN_PROGRESS, false]
  ] as const)("validates transition %s -> %s", async (fromStatus, toStatus, allowed) => {
    const { repository, service } = setup();
    repository.findForStatus.mockResolvedValue({
      id: 100n,
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      status: fromStatus,
      items: [{ productId: 42n, quantity: 2 }]
    });
    repository.findDetail.mockResolvedValue(statusDetail(toStatus));

    const operation = service.changeStatus("100", { status: toStatus }, user);
    if (allowed) {
      await expect(operation).resolves.toMatchObject({ status: toStatus });
      expect(repository.claimStatus).toHaveBeenCalledOnce();
    } else {
      await expect(operation).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });
      expect(repository.claimStatus).not.toHaveBeenCalled();
    }
  });
});
