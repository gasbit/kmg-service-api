import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { Clock } from "../../shared/utils/date";
import { LoanService } from "./loan.service";
import type { LoanRepository, LoanSummaryRecord } from "./loan.types";

const bangkokToday = new Date("2026-07-22T03:00:00.000Z");
const clock: Clock = { now: () => bangkokToday };

function loanRecord(overrides: Partial<LoanSummaryRecord> = {}): LoanSummaryRecord {
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
    returnedQuantity: 1,
    loanStatus: "PARTIAL_RETURNED",
    borrowedDate: new Date("2026-07-20T00:00:00.000Z"),
    expectedReturnDate: null,
    returnedDate: null,
    depositAmount: new Prisma.Decimal("500.00"),
    note: null,
    createdAt: new Date("2026-07-20T03:10:00.000Z"),
    updatedAt: new Date("2026-07-22T04:00:00.000Z"),
    transactionItem: {
      productBrandSnapshot: "ปตท.",
      productWeightSnapshot: new Prisma.Decimal("15.00")
    },
    ...overrides
  };
}

function setup(records: LoanSummaryRecord[] = [loanRecord()]) {
  const repository = {
    list: vi.fn(async () => ({ loans: records, totalItems: records.length })),
    findDetail: vi.fn(),
    findReturnSource: vi.fn(),
    claimReturn: vi.fn()
  };
  return {
    repository,
    service: new LoanService(repository as unknown as LoanRepository, clock)
  };
}

describe("LoanService", () => {
  it("maps pagination, snapshots, decimal IDs, and remaining quantity", async () => {
    const { repository, service } = setup();
    const result = await service.list({ page: 1, limit: 20 });
    expect(repository.list).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      activeOnly: false,
      businessDate: "2026-07-22"
    });
    expect(result.loans[0]).toMatchObject({
      id: "301",
      borrowTransactionId: "9001",
      productBrand: "ปตท.",
      productWeightKg: "15.00",
      depositAmount: "500.00",
      remainingQuantity: 2,
      isOverdue: false
    });
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1
    });
  });

  it("uses active mode and Bangkok business date", async () => {
    const { repository, service } = setup();
    await service.listActive({ page: 2, limit: 10, isOverdue: true, search: "ร้าน" });
    expect(repository.list).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      isOverdue: true,
      search: "ร้าน",
      activeOnly: true,
      businessDate: "2026-07-22"
    });
  });

  it("derives overdue only before today with remaining quantity and non-final status", async () => {
    const records = [
      loanRecord({ id: 1n, expectedReturnDate: new Date("2026-07-21T00:00:00.000Z") }),
      loanRecord({ id: 2n, expectedReturnDate: new Date("2026-07-22T00:00:00.000Z") }),
      loanRecord({ id: 3n, expectedReturnDate: new Date("2026-07-21T00:00:00.000Z"), returnedQuantity: 3, loanStatus: "RETURNED" }),
      loanRecord({ id: 4n, expectedReturnDate: null })
    ];
    const result = await setup(records).service.list({ page: 1, limit: 20 });
    expect(result.loans.map((loan) => loan.isOverdue)).toEqual([true, false, false, false]);
  });

  it("changes Bangkok business date exactly at 17:00 UTC", async () => {
    const due = loanRecord({ expectedReturnDate: new Date("2026-07-22T00:00:00.000Z") });
    const beforeMidnight = new LoanService(setup([due]).repository as unknown as LoanRepository, {
      now: () => new Date("2026-07-22T16:59:59.999Z")
    });
    const atMidnight = new LoanService(setup([due]).repository as unknown as LoanRepository, {
      now: () => new Date("2026-07-22T17:00:00.000Z")
    });
    expect((await beforeMidnight.list({ page: 1, limit: 20 })).loans[0].isOverdue).toBe(false);
    expect((await atMidnight.list({ page: 1, limit: 20 })).loans[0].isOverdue).toBe(true);
  });

  it("returns NOT_FOUND when detail does not exist", async () => {
    const { repository, service } = setup();
    repository.findDetail.mockResolvedValue(null);
    await expect(service.get("999")).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Loan not found"
    });
  });
});
