import { describe, expect, it } from "vitest";

import { createProductSchema, updateProductSchema } from "./product.schema";

const validProduct = {
  brand: "ปตท.",
  weightKg: "15.00",
  exchangeCostPrice: "330.00",
  exchangeSalePrice: "390.00",
  fullTankCostPrice: "1850.00",
  fullTankPrice: "2450.00"
};

describe("product pricing schemas", () => {
  it("requires a dedicated full-tank cost when creating a product", () => {
    const missingFullTankCost: Partial<typeof validProduct> = { ...validProduct };
    delete missingFullTankCost.fullTankCostPrice;

    expect(createProductSchema.safeParse(missingFullTankCost).success).toBe(false);
    expect(createProductSchema.parse(validProduct).fullTankCostPrice).toBe("1850.00");
  });

  it("validates full-tank cost as a non-negative decimal string with at most two decimal places", () => {
    expect(updateProductSchema.safeParse({ fullTankCostPrice: "0.00" }).success).toBe(true);
    expect(updateProductSchema.safeParse({ fullTankCostPrice: "-1.00" }).success).toBe(false);
    expect(updateProductSchema.safeParse({ fullTankCostPrice: "1.001" }).success).toBe(false);
    expect(updateProductSchema.safeParse({ fullTankCostPrice: 1850 }).success).toBe(false);
  });
});
