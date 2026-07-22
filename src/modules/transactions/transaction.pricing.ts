import { Prisma } from "@prisma/client";

import { TRANSACTION_TYPES, type PricedCreateTransactionType } from "../../constants/transaction.constants";

export interface PricingProduct {
  exchangeCostPrice: Prisma.Decimal;
  exchangeSalePrice: Prisma.Decimal;
  fullTankCostPrice: Prisma.Decimal;
  fullTankPrice: Prisma.Decimal;
}

export interface TransactionItemPricing {
  unitPrice: Prisma.Decimal;
  costPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

/**
 * Derives server-owned monetary snapshots for a public transaction item.
 * Borrow cost is a valuation snapshot and must not be recognized as cost of sales.
 */
export function deriveTransactionItemPricing(
  transactionType: PricedCreateTransactionType,
  product: PricingProduct,
  quantity: number
): TransactionItemPricing {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RangeError("Transaction item quantity must be a positive integer");
  }

  if (transactionType === TRANSACTION_TYPES.BORROW_CYLINDER) {
    return {
      unitPrice: new Prisma.Decimal(0),
      costPrice: product.exchangeCostPrice,
      lineTotal: new Prisma.Decimal(0)
    };
  }

  const isFullTankPurchase = transactionType === TRANSACTION_TYPES.BUY_FULL_TANK;
  const unitPrice = isFullTankPurchase ? product.fullTankPrice : product.exchangeSalePrice;
  const costPrice = isFullTankPurchase ? product.fullTankCostPrice : product.exchangeCostPrice;

  return {
    unitPrice,
    costPrice,
    lineTotal: unitPrice.mul(quantity)
  };
}
