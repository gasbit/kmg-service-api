import { describe, expect, it } from "vitest";

import { TRANSACTION_STATUSES } from "../../constants/transaction.constants";
import {
  listQueueByDateQuerySchema,
  listTodayQueueQuerySchema,
  queueTransactionIdParamsSchema,
  updateQueueStatusSchema
} from "./queue.schema";

describe("queue schemas", () => {
  it("validates today filters and rejects unknown fields", () => {
    expect(listTodayQueueQuerySchema.parse({})).toEqual({});
    for (const status of Object.values(TRANSACTION_STATUSES)) {
      expect(listTodayQueueQuerySchema.parse({ status })).toEqual({ status });
    }
    expect(listTodayQueueQuerySchema.safeParse({ extra: "no" }).success).toBe(false);
    expect(listTodayQueueQuerySchema.safeParse({ status: "UNKNOWN" }).success).toBe(false);
  });

  it("requires a real calendar date for date queries", () => {
    expect(listQueueByDateQuerySchema.parse({ date: "2026-07-24" })).toEqual({ date: "2026-07-24" });
    for (const date of [undefined, "", "2026-02-30", "2026-7-24", "2026-07-24T00:00:00Z"]) {
      expect(listQueueByDateQuerySchema.safeParse({ date }).success).toBe(false);
    }
    expect(listQueueByDateQuerySchema.safeParse({ date: "2026-07-24", extra: "no" }).success).toBe(false);
  });

  it("validates BigInt transaction IDs", () => {
    expect(queueTransactionIdParamsSchema.parse({ transactionId: "42" })).toEqual({ transactionId: "42" });
    for (const transactionId of ["0", "-1", "1.5", "abc", ""]) {
      expect(queueTransactionIdParamsSchema.safeParse({ transactionId }).success).toBe(false);
    }
  });

  it("validates strict status updates", () => {
    for (const status of [
      TRANSACTION_STATUSES.IN_PROGRESS,
      TRANSACTION_STATUSES.COMPLETED,
      TRANSACTION_STATUSES.CANCELLED
    ]) {
      expect(updateQueueStatusSchema.safeParse({ status }).success).toBe(true);
    }
    expect(updateQueueStatusSchema.parse({
      status: TRANSACTION_STATUSES.IN_PROGRESS,
      note: "  รับงานแล้ว  "
    })).toEqual({
      status: TRANSACTION_STATUSES.IN_PROGRESS,
      note: "รับงานแล้ว"
    });
    expect(updateQueueStatusSchema.safeParse({ status: TRANSACTION_STATUSES.PENDING }).success).toBe(false);
    expect(updateQueueStatusSchema.safeParse({ status: TRANSACTION_STATUSES.IN_PROGRESS, note: " " }).success).toBe(false);
    expect(updateQueueStatusSchema.safeParse({
      status: TRANSACTION_STATUSES.IN_PROGRESS,
      queueNo: 2
    }).success).toBe(false);
  });
});
