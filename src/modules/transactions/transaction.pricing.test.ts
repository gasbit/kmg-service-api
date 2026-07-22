import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { TRANSACTION_TYPES } from "../../constants/transaction.constants";
import { deriveTransactionItemPricing } from "./transaction.pricing";

const product = {
  exchangeCostPrice: new Prisma.Decimal("330.00"),
  exchangeSalePrice: new Prisma.Decimal("390.00"),
  fullTankCostPrice: new Prisma.Decimal("1850.00"),
  fullTankPrice: new Prisma.Decimal("2450.00")
};

describe("deriveTransactionItemPricing", () => {
  it.each([
    TRANSACTION_TYPES.DELIVERY_EXCHANGE,
    TRANSACTION_TYPES.WALK_IN_EXCHANGE
  ])("uses exchange sale and cost snapshots for %s", (transactionType) => {
    const pricing = deriveTransactionItemPricing(transactionType, product, 2);

    expect(pricing.unitPrice.toFixed(2)).toBe("390.00");
    expect(pricing.costPrice.toFixed(2)).toBe("330.00");
    expect(pricing.lineTotal.toFixed(2)).toBe("780.00");
  });

  it("uses the dedicated full-tank sale and cost snapshots", () => {
    const pricing = deriveTransactionItemPricing(TRANSACTION_TYPES.BUY_FULL_TANK, product, 2);

    expect(pricing.unitPrice.toFixed(2)).toBe("2450.00");
    expect(pricing.costPrice.toFixed(2)).toBe("1850.00");
    expect(pricing.lineTotal.toFixed(2)).toBe("4900.00");
  });

  it("keeps borrow revenue at zero while retaining a valuation snapshot", () => {
    const pricing = deriveTransactionItemPricing(TRANSACTION_TYPES.BORROW_CYLINDER, product, 1);

    expect(pricing.unitPrice.toFixed(2)).toBe("0.00");
    expect(pricing.costPrice.toFixed(2)).toBe("330.00");
    expect(pricing.lineTotal.toFixed(2)).toBe("0.00");
  });

  it.each([0, -1, 1.5])("rejects invalid quantity %s", (quantity) => {
    expect(() => deriveTransactionItemPricing(TRANSACTION_TYPES.WALK_IN_EXCHANGE, product, quantity))
      .toThrow("positive integer");
  });
});
