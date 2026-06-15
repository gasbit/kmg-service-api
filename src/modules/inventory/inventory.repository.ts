import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../config/database";

export class InventoryRepository {
  constructor(private readonly db: PrismaClient | Prisma.TransactionClient = prisma) {}

  listBalances() {
    return this.db.inventoryBalance.findMany({
      include: { product: true },
      orderBy: [{ product: { weightKg: "asc" } }, { product: { brand: "asc" } }]
    });
  }

  findBalanceByProductId(productId: bigint) {
    return this.db.inventoryBalance.findUnique({ where: { productId } });
  }

  createMovement(data: Prisma.InventoryMovementCreateInput) {
    return this.db.inventoryMovement.create({ data });
  }

  listMovements(query: { productId?: bigint; skip: number; take: number }) {
    return this.db.inventoryMovement.findMany({
      where: query.productId ? { productId: query.productId } : undefined,
      include: { product: true, transaction: true },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.take
    });
  }

  countMovements(query: { productId?: bigint }) {
    return this.db.inventoryMovement.count({
      where: query.productId ? { productId: query.productId } : undefined
    });
  }

  updateBalance(productId: bigint, data: Prisma.InventoryBalanceUpdateInput) {
    return this.db.inventoryBalance.update({ where: { productId }, data });
  }
}
