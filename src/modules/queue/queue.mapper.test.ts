import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../../constants/transaction.constants";
import { mapQueueEntry, mapTransactionDetailToQueue } from "./queue.mapper";
import type { QueueEntryRecord } from "./queue.types";

const createdAt = new Date("2026-07-24T02:15:00.000Z");

function record(overrides: Partial<QueueEntryRecord> = {}): QueueEntryRecord {
  return {
    id: 9001n,
    transactionNo: "TX-20260724-0001",
    transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
    status: TRANSACTION_STATUSES.PENDING,
    queueDate: new Date("2026-07-24T00:00:00.000Z"),
    queueNo: 1,
    customerNameSnapshot: "ร้านอาหารอิ่มดี",
    customerPhoneSnapshot: "0899999999",
    customerAddressSnapshot: "กรุงเทพฯ",
    totalAmount: new Prisma.Decimal("780.00"),
    note: null,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    createdByUser: { id: 1n, name: "Admin" },
    items: [{
      id: 12001n,
      productId: 42n,
      productBrandSnapshot: "ปตท.",
      productWeightSnapshot: new Prisma.Decimal("15.00"),
      quantity: 2,
      unitPrice: new Prisma.Decimal("390.00"),
      lineTotal: new Prisma.Decimal("780.00"),
      note: null
    }],
    ...overrides
  };
}

describe("queue mapper", () => {
  it("maps IDs, decimals, dates, snapshots, and total quantity", () => {
    const result = mapQueueEntry(record());
    expect(result).toMatchObject({
      id: "9001",
      queueDate: "2026-07-24",
      queueNo: 1,
      totalAmount: "780.00",
      totalQuantity: 2,
      createdBy: { id: "1", name: "Admin" },
      items: [{
        id: "12001",
        productId: "42",
        productBrand: "ปตท.",
        productWeightKg: "15.00",
        unitPrice: "390.00",
        lineTotal: "780.00"
      }]
    });
    expect(JSON.stringify(result)).not.toContain("costPrice");
  });

  it("rejects records without a delivery queue identity", () => {
    expect(() => mapQueueEntry(record({ transactionType: TRANSACTION_TYPES.WALK_IN_EXCHANGE })))
      .toThrow("Queue record is missing delivery queue identity");
    expect(() => mapQueueEntry(record({ queueDate: null })))
      .toThrow("Queue record is missing delivery queue identity");
    expect(() => mapQueueEntry(record({ queueNo: null })))
      .toThrow("Queue record is missing delivery queue identity");
  });

  it("narrows transaction detail without exposing cost or logs", () => {
    const result = mapTransactionDetailToQueue({
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
        productBrand: "ปตท.",
        productWeightKg: "15.00",
        quantity: 1,
        unitPrice: "390.00",
        costPrice: "330.00",
        lineTotal: "390.00",
        itemAction: "EXCHANGE",
        note: null
      }],
      statusLogs: [{
        id: "1",
        fromStatus: "PENDING",
        toStatus: "IN_PROGRESS",
        changedBy: { id: "1", name: "Admin" },
        changedAt: createdAt.toISOString(),
        note: null
      }],
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      completedAt: null
    });
    expect(result.status).toBe(TRANSACTION_STATUSES.IN_PROGRESS);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("costPrice");
    expect(serialized).not.toContain("statusLogs");
    expect(serialized).not.toContain("customerId");
  });
});
