import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../../constants/transaction.constants";
import type { AuthenticatedRequestUser } from "../../shared/types/auth.types";
import type { Clock } from "../../shared/utils/date";
import { QueueService } from "./queue.service";
import type { QueueEntryRecord, QueueRepository, QueueStatusService } from "./queue.types";

const clock: Clock = { now: () => new Date("2026-07-23T17:00:00.000Z") };
const user: AuthenticatedRequestUser = {
  id: "1",
  name: "Admin",
  username: "admin",
  role: { id: "1", code: "ADMIN", name: "Admin" }
};

function record(): QueueEntryRecord {
  const now = new Date("2026-07-24T02:15:00.000Z");
  return {
    id: 9001n,
    transactionNo: "TX-20260724-0001",
    transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
    status: TRANSACTION_STATUSES.PENDING,
    queueDate: new Date("2026-07-24T00:00:00.000Z"),
    queueNo: 1,
    customerNameSnapshot: "Customer",
    customerPhoneSnapshot: null,
    customerAddressSnapshot: "Address",
    totalAmount: new Prisma.Decimal("390.00"),
    note: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    createdByUser: { id: 1n, name: "Admin" },
    items: [{
      id: 12001n,
      productId: 42n,
      productBrandSnapshot: "Brand",
      productWeightSnapshot: new Prisma.Decimal("15.00"),
      quantity: 1,
      unitPrice: new Prisma.Decimal("390.00"),
      lineTotal: new Prisma.Decimal("390.00"),
      note: null
    }]
  };
}

function setup(records: QueueEntryRecord[] = [record()]) {
  const repository = {
    listByDate: vi.fn(async () => records)
  };
  const transactionService = {
    changeQueueStatus: vi.fn()
  };
  return {
    repository,
    transactionService,
    service: new QueueService(
      repository as QueueRepository,
      clock,
      transactionService as unknown as QueueStatusService
    )
  };
}

describe("QueueService", () => {
  it("lists today using the Bangkok business date and status filter", async () => {
    const { repository, service } = setup();
    const result = await service.listToday({ status: TRANSACTION_STATUSES.PENDING });
    expect(repository.listByDate).toHaveBeenCalledWith({
      queueDate: "2026-07-24",
      status: TRANSACTION_STATUSES.PENDING
    });
    expect(result).toMatchObject({
      queueDate: "2026-07-24",
      queues: [{ id: "9001", queueNo: 1 }]
    });
  });

  it("uses the requested date and returns an empty array", async () => {
    const { repository, service } = setup([]);
    const result = await service.listByDate({ date: "2026-07-20" });
    expect(repository.listByDate).toHaveBeenCalledWith({ queueDate: "2026-07-20" });
    expect(result).toEqual({ queueDate: "2026-07-20", queues: [] });
  });

  it("propagates repository failures", async () => {
    const { repository, service } = setup();
    repository.listByDate.mockRejectedValue(new Error("database unavailable"));
    await expect(service.listToday({})).rejects.toThrow("database unavailable");
  });

  it("delegates queue status writes and narrows the response", async () => {
    const { transactionService, service } = setup();
    transactionService.changeQueueStatus.mockResolvedValue({
      id: "9001",
      transactionNo: "TX-20260724-0001",
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      status: TRANSACTION_STATUSES.IN_PROGRESS,
      queueDate: "2026-07-24",
      queueNo: 1,
      customerId: null,
      customerName: "Customer",
      customerPhone: null,
      customerAddress: "Address",
      totalAmount: "390.00",
      note: null,
      createdBy: { id: "1", name: "Admin" },
      items: [{
        id: "12001",
        productId: "42",
        productBrand: "Brand",
        productWeightKg: "15.00",
        quantity: 1,
        unitPrice: "390.00",
        costPrice: "330.00",
        lineTotal: "390.00",
        itemAction: "EXCHANGE",
        note: null
      }],
      statusLogs: [],
      createdAt: "2026-07-24T02:15:00.000Z",
      updatedAt: "2026-07-24T03:00:00.000Z",
      completedAt: null
    });

    const result = await service.updateStatus(
      "9001",
      { status: TRANSACTION_STATUSES.IN_PROGRESS, note: "รับงานแล้ว" },
      user
    );
    expect(transactionService.changeQueueStatus).toHaveBeenCalledWith(
      "9001",
      { status: TRANSACTION_STATUSES.IN_PROGRESS, note: "รับงานแล้ว" },
      user
    );
    expect(result.status).toBe(TRANSACTION_STATUSES.IN_PROGRESS);
    expect(JSON.stringify(result)).not.toContain("costPrice");
  });
});
