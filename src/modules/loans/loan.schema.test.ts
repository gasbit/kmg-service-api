import { describe, expect, it } from "vitest";

import {
  listActiveLoansQuerySchema,
  listLoansQuerySchema,
  loanIdParamsSchema,
  returnLoanSchema
} from "./loan.schema";

describe("loan schemas", () => {
  it("validates BigInt loan IDs", () => {
    expect(loanIdParamsSchema.parse({ loanId: "42" })).toEqual({ loanId: "42" });
    for (const loanId of ["0", "-1", "1.5", "abc", ""]) {
      expect(loanIdParamsSchema.safeParse({ loanId }).success).toBe(false);
    }
  });

  it("applies list defaults and parses strict overdue booleans", () => {
    expect(listLoansQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(listLoansQuerySchema.parse({ isOverdue: "true" }).isOverdue).toBe(true);
    expect(listLoansQuerySchema.parse({ isOverdue: "false" }).isOverdue).toBe(false);
    expect(listLoansQuerySchema.safeParse({ isOverdue: "1" }).success).toBe(false);
    expect(listLoansQuerySchema.safeParse({ isOverdue: "yes" }).success).toBe(false);
  });

  it("validates list boundaries, status, search, and unknown fields", () => {
    expect(listLoansQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(listLoansQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(listLoansQuerySchema.safeParse({ status: "UNKNOWN" }).success).toBe(false);
    expect(listLoansQuerySchema.parse({ search: "  ลูกค้า  " }).search).toBe("ลูกค้า");
    expect(listLoansQuerySchema.safeParse({ search: " " }).success).toBe(false);
    expect(listLoansQuerySchema.safeParse({ search: "x".repeat(151) }).success).toBe(false);
    expect(listLoansQuerySchema.safeParse({ extra: "no" }).success).toBe(false);
    for (const status of ["BORROWED", "PARTIAL_RETURNED", "RETURNED", "OVERDUE", "CANCELLED"]) {
      expect(listLoansQuerySchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("does not allow status on the active-list query", () => {
    expect(listActiveLoansQuerySchema.safeParse({ status: "BORROWED" }).success).toBe(false);
  });

  it("validates strict return requests", () => {
    expect(returnLoanSchema.parse({ quantity: 1, note: "  คืนหนึ่งถัง  " })).toEqual({
      quantity: 1,
      note: "คืนหนึ่งถัง"
    });
    for (const quantity of [0, -1, 1.5]) {
      expect(returnLoanSchema.safeParse({ quantity }).success).toBe(false);
    }
    expect(returnLoanSchema.safeParse({ quantity: 1, note: " " }).success).toBe(false);
    expect(returnLoanSchema.safeParse({ quantity: 1, status: "RETURNED" }).success).toBe(false);
  });
});
