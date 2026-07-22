import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "../../config/database";
import type { DatabaseClient, ImageWriteInput, ProductRecord, ProductRepository, ProductWriteInput } from "./product.types";

const productInclude = { images: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] } };
type ProductWithImages = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function serializeProduct(product: ProductWithImages): ProductRecord {
  return {
    id: product.id.toString(),
    brand: product.brand,
    weightKg: product.weightKg.toFixed(2),
    exchangeCostPrice: product.exchangeCostPrice.toFixed(2),
    exchangeSalePrice: product.exchangeSalePrice.toFixed(2),
    fullTankPrice: product.fullTankPrice.toFixed(2),
    isActive: product.isActive,
    images: product.images.map((image) => ({
      id: image.id.toString(), objectKey: image.objectKey, originalName: image.originalName,
      mimeType: image.mimeType, fileSize: image.fileSize, sortOrder: image.sortOrder,
      isPrimary: image.isPrimary, createdAt: image.createdAt.toISOString(), updatedAt: image.updatedAt.toISOString()
    })),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString()
  };
}

const id = (value: string) => BigInt(value);

export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  async list(input: { page: number; limit: number; search?: string; includeInactive: boolean }) {
    const where: Prisma.ProductWhereInput = {
      ...(input.includeInactive ? {} : { isActive: true }),
      ...(input.search ? { brand: { contains: input.search, mode: "insensitive" } } : {})
    };
    const [products, totalItems] = await Promise.all([
      this.database.product.findMany({ where, include: productInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (input.page - 1) * input.limit, take: input.limit }),
      this.database.product.count({ where })
    ]);
    return { products: products.map(serializeProduct), totalItems };
  }

  async findById(productId: string) {
    const product = await this.database.product.findUnique({ where: { id: id(productId) }, include: productInclude });
    return product ? serializeProduct(product) : null;
  }

  async create(input: ProductWriteInput, client: DatabaseClient) {
    return serializeProduct(await client.product.create({ data: input, include: productInclude }));
  }

  async createInitialBalance(productId: string, client: DatabaseClient): Promise<void> {
    await client.inventoryBalance.create({ data: { productId: id(productId) } });
  }

  async update(productId: string, input: Partial<ProductWriteInput> & { isActive?: boolean }) {
    const exists = await this.database.product.findUnique({ where: { id: id(productId) }, select: { id: true } });
    if (!exists) return null;
    return serializeProduct(await this.database.product.update({ where: { id: id(productId) }, data: input, include: productInclude }));
  }

  countImages(productId: string) { return this.database.productImage.count({ where: { productId: id(productId) } }); }
  listImages(productId: string) { return this.database.productImage.findMany({ where: { productId: id(productId) }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }); }
  findImage(productId: string, imageId: string) { return this.database.productImage.findFirst({ where: { id: id(imageId), productId: id(productId) } }); }

  createImage(productId: string, input: ImageWriteInput, client: DatabaseClient) {
    return client.productImage.create({ data: { ...input, productId: id(productId) } });
  }

  async updateImage(productId: string, imageId: string, input: { sortOrder?: number; isPrimary?: boolean }, client: DatabaseClient) {
    const result = await client.productImage.updateMany({ where: { id: id(imageId), productId: id(productId) }, data: input });
    return result.count ? client.productImage.findUnique({ where: { id: id(imageId) } }) : null;
  }

  async clearPrimaryImage(productId: string, client: DatabaseClient, exceptImageId?: string) {
    await client.productImage.updateMany({
      where: { productId: id(productId), isPrimary: true, ...(exceptImageId ? { id: { not: id(exceptImageId) } } : {}) },
      data: { isPrimary: false }
    });
  }

  async deleteImage(productId: string, imageId: string) {
    const image = await this.findImage(productId, imageId);
    if (!image) return null;
    return this.database.productImage.delete({ where: { id: id(imageId) } });
  }
}

export class PrismaTransactionRunner {
  constructor(private readonly database: PrismaClient = prisma) {}
  run<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> { return this.database.$transaction(work); }
}
