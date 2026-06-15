import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../config/database";

export class ProductRepository {
  constructor(private readonly db: PrismaClient | Prisma.TransactionClient = prisma) {}

  list(query: { search?: string; includeInactive?: boolean; skip: number; take: number }) {
    const where: Prisma.ProductWhereInput = {
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? {
            OR: [
              { brand: { contains: query.search, mode: "insensitive" } },
              { weightKg: { equals: Number(query.search) || undefined } }
            ]
          }
        : {})
    };

    return this.db.product.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { weightKg: "asc" }, { brand: "asc" }],
      skip: query.skip,
      take: query.take,
      include: { inventoryBalance: true }
    });
  }

  count(query: { search?: string; includeInactive?: boolean }) {
    return this.db.product.count({
      where: {
        ...(query.includeInactive ? {} : { isActive: true }),
        ...(query.search ? { brand: { contains: query.search, mode: "insensitive" } } : {})
      }
    });
  }

  findById(id: bigint) {
    return this.db.product.findUnique({ where: { id }, include: { inventoryBalance: true } });
  }

  findActiveByIds(ids: bigint[]) {
    return this.db.product.findMany({ where: { id: { in: ids }, isActive: true } });
  }

  create(data: Prisma.ProductCreateInput) {
    return this.db.product.create({ data, include: { inventoryBalance: true } });
  }

  update(id: bigint, data: Prisma.ProductUpdateInput) {
    return this.db.product.update({ where: { id }, data, include: { inventoryBalance: true } });
  }

  softDelete(id: bigint) {
    return this.db.product.update({ where: { id }, data: { isActive: false }, include: { inventoryBalance: true } });
  }
}
