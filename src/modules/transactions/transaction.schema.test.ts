import { describe, expect, it } from "vitest";

import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../../constants/transaction.constants";
import {
  cancelTransactionSchema,
  changeTransactionStatusSchema,
  createTransactionSchema,
  listTransactionsQuerySchema,
  transactionIdParamsSchema
} from "./transaction.schema";

const item = { productId: "42", quantity: 1 };
const base = { customerName: " สมชาย ", items: [item] };

describe("transaction schemas", () => {
  it.each([
    { transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE, ...base, customerAddress: " กรุงเทพฯ " },
    { transactionType: TRANSACTION_TYPES.WALK_IN_EXCHANGE, ...base },
    { transactionType: TRANSACTION_TYPES.BUY_FULL_TANK, ...base },
    {
      transactionType: TRANSACTION_TYPES.BORROW_CYLINDER,
      ...base,
      items: [{ ...item, expectedReturnDate: "2026-07-31", depositAmount: "500.00" }]
    }
  ])("accepts public create type $transactionType", (payload) => {
    const result = createTransactionSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.customerName).toBe("สมชาย");
  });

  it("defaults borrow deposit and leaves expected return date absent", () => {
    const result = createTransactionSchema.parse({
      transactionType: TRANSACTION_TYPES.BORROW_CYLINDER,
      ...base
    });
    expect(result.items[0]).toMatchObject({ depositAmount: "0.00" });
    expect("expectedReturnDate" in result.items[0]).toBe(false);
  });

  it.each([
    TRANSACTION_TYPES.RETURN_CYLINDER,
    "UNKNOWN"
  ])("rejects unsupported public create type %s", (transactionType) => {
    expect(createTransactionSchema.safeParse({ transactionType, ...base }).success).toBe(false);
  });

  it.each(["status", "transactionNo", "queueNo", "totalAmount", "createdBy"])("rejects server-owned field %s", (field) => {
    expect(createTransactionSchema.safeParse({
      transactionType: TRANSACTION_TYPES.WALK_IN_EXCHANGE,
      ...base,
      [field]: "owned-by-server"
    }).success).toBe(false);
  });

  it("requires a delivery address", () => {
    expect(createTransactionSchema.safeParse({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      ...base
    }).success).toBe(false);
  });

  it("rejects empty, zero, negative, and fractional item quantities", () => {
    const invalidItems: Array<Array<{ productId: string; quantity: number }>> = [
      [],
      [{ productId: "1", quantity: 0 }],
      [{ productId: "1", quantity: -1 }],
      [{ productId: "1", quantity: 1.5 }]
    ];
    for (const items of invalidItems) {
      expect(createTransactionSchema.safeParse({
        transactionType: TRANSACTION_TYPES.WALK_IN_EXCHANGE,
        customerName: "Customer",
        items
      }).success).toBe(false);
    }
  });

  it("reports the duplicate product at the repeated item path", () => {
    const result = createTransactionSchema.safeParse({
      transactionType: TRANSACTION_TYPES.BUY_FULL_TANK,
      customerName: "Customer",
      items: [item, { ...item, quantity: 2 }]
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["items", 1, "productId"]);
  });

  it.each(["2026-02-30", "22-07-2026", "2026-13-01"])("rejects invalid calendar date %s", (expectedReturnDate) => {
    expect(createTransactionSchema.safeParse({
      transactionType: TRANSACTION_TYPES.BORROW_CYLINDER,
      ...base,
      items: [{ ...item, expectedReturnDate }]
    }).success).toBe(false);
  });

  it.each(["-1", "1.001", ".50", "01.00"])("rejects invalid deposit %s", (depositAmount) => {
    expect(createTransactionSchema.safeParse({
      transactionType: TRANSACTION_TYPES.BORROW_CYLINDER,
      ...base,
      items: [{ ...item, depositAmount }]
    }).success).toBe(false);
  });

  it("applies list defaults and validates date range", () => {
    expect(listTransactionsQuerySchema.parse({})).toMatchObject({ page: 1, limit: 20 });
    expect(listTransactionsQuerySchema.safeParse({ dateFrom: "2026-07-23", dateTo: "2026-07-22" }).success).toBe(false);
    expect(listTransactionsQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listTransactionsQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it("validates IDs, status mutations, and strict cancel bodies", () => {
    expect(transactionIdParamsSchema.safeParse({ transactionId: "1" }).success).toBe(true);
    expect(transactionIdParamsSchema.safeParse({ transactionId: "0" }).success).toBe(false);
    expect(changeTransactionStatusSchema.safeParse({ status: TRANSACTION_STATUSES.IN_PROGRESS }).success).toBe(true);
    expect(changeTransactionStatusSchema.safeParse({ status: TRANSACTION_STATUSES.PENDING }).success).toBe(false);
    expect(cancelTransactionSchema.safeParse({}).success).toBe(true);
    expect(cancelTransactionSchema.safeParse(undefined).success).toBe(true);
    expect(cancelTransactionSchema.safeParse({ status: TRANSACTION_STATUSES.CANCELLED }).success).toBe(false);
  });
});
