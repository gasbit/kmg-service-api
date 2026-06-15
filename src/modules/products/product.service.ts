import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import { ERROR_CODES } from "../../shared/errors/error-codes";
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from "./product.schema";
import { ProductRepository } from "./product.repository";

export class ProductService {
  constructor(private readonly productRepository = new ProductRepository()) {}

  async list(query: ListProductsQuery) {
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.productRepository.list({ ...query, skip, take: query.limit }),
      this.productRepository.count(query)
    ]);

    return { items, page: query.page, limit: query.limit, total };
  }

  async get(id: bigint) {
    const product = await this.productRepository.findById(id);
    if (!product) throw new AppError(ERROR_CODES.NOT_FOUND, "Product not found", 404);
    return product;
  }

  create(input: CreateProductInput) {
    return prisma.$transaction(async (tx) => {
      const productRepository = new ProductRepository(tx);
      return productRepository.create({
        brand: input.brand,
        weightKg: input.weightKg,
        exchangeCostPrice: input.exchangeCostPrice,
        exchangeSalePrice: input.exchangeSalePrice,
        fullTankPrice: input.fullTankPrice,
        inventoryBalance: {
          create: {
            fullQty: input.initialFullQty,
            emptyQty: input.initialEmptyQty,
            loanedQty: 0
          }
        }
      });
    });
  }

  async update(id: bigint, input: UpdateProductInput) {
    await this.get(id);
    return this.productRepository.update(id, input);
  }

  async softDelete(id: bigint) {
    await this.get(id);
    return this.productRepository.softDelete(id);
  }
}
