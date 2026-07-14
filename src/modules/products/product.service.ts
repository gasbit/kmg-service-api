import { Prisma, type ProductImage } from "@prisma/client";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { ERROR_CODES } from "../../shared/errors/error-codes";
import type { CreateProductInput, ListProductsInput, UpdateProductImageInput, UpdateProductInput, UploadProductImageFields } from "./product.schema";
import { LocalStorageProvider } from "./product.storage";
import { PrismaProductRepository, PrismaTransactionRunner } from "./product.repository";
import type { ProductDto, ProductImageDto, ProductRecord, ProductRepository, StorageProvider, TransactionRunner } from "./product.types";

const notFound = (resource: "Product" | "Product image") => new AppError(404, ERROR_CODES.NOT_FOUND, `${resource} not found`);
const primaryConflict = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError(409, ERROR_CODES.CONFLICT, "Product already has a primary image");
  }
  throw error;
};

function hasValidImageSignature(file: Express.Multer.File): boolean {
  const bytes = file.buffer;
  if (file.mimetype === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimetype === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

export class ProductService {
  constructor(
    private readonly repository: ProductRepository = new PrismaProductRepository(),
    private readonly transactions: TransactionRunner = new PrismaTransactionRunner(),
    private readonly storage: StorageProvider = new LocalStorageProvider()
  ) {}

  private imageDto(image: ProductImage): ProductImageDto {
    return {
      id: image.id.toString(), url: this.storage.getPublicUrl(image.objectKey), originalName: image.originalName,
      mimeType: image.mimeType, fileSize: image.fileSize, sortOrder: image.sortOrder, isPrimary: image.isPrimary,
      createdAt: image.createdAt.toISOString(), updatedAt: image.updatedAt.toISOString()
    };
  }

  private productDto(product: ProductRecord): ProductDto {
    return {
      ...product,
      images: product.images.map(({ objectKey, ...image }) => ({ ...image, url: this.storage.getPublicUrl(objectKey) }))
    };
  }

  async list(input: ListProductsInput) {
    const result = await this.repository.list(input);
    return {
      products: result.products.map((product) => this.productDto(product)),
      pagination: { page: input.page, limit: input.limit, totalItems: result.totalItems, totalPages: Math.ceil(result.totalItems / input.limit) }
    };
  }

  async get(productId: string): Promise<ProductDto> {
    const product = await this.repository.findById(productId);
    if (!product) throw notFound("Product");
    return this.productDto(product);
  }

  async create(input: CreateProductInput): Promise<ProductDto> {
    const product = await this.transactions.run(async (client) => {
      const created = await this.repository.create(input, client);
      await this.repository.createInitialBalance(created.id, client);
      return created;
    });
    return this.productDto(product);
  }

  async update(productId: string, input: UpdateProductInput): Promise<ProductDto> {
    const product = await this.repository.update(productId, input);
    if (!product) throw notFound("Product");
    return this.productDto(product);
  }

  deactivate(productId: string): Promise<ProductDto> { return this.update(productId, { isActive: false }); }

  async listImages(productId: string): Promise<ProductImageDto[]> {
    if (!await this.repository.findById(productId)) throw notFound("Product");
    return (await this.repository.listImages(productId)).map((image) => this.imageDto(image));
  }

  async uploadImage(productId: string, fields: UploadProductImageFields, file?: Express.Multer.File): Promise<ProductImageDto> {
    if (!file) throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Image file is required");
    if (!hasValidImageSignature(file)) throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Image content does not match its declared type");
    if (!await this.repository.findById(productId)) throw notFound("Product");
    if (await this.repository.countImages(productId) >= env.PRODUCT_IMAGE_MAX_COUNT) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Product image limit reached");
    }

    const stored = await this.storage.saveProductImage(productId, file);
    try {
      const image = await this.transactions.run(async (client) => {
        if (fields.isPrimary) await this.repository.clearPrimaryImage(productId, client);
        return this.repository.createImage(productId, {
          objectKey: stored.objectKey, originalName: file.originalname || null, mimeType: file.mimetype,
          fileSize: file.size, sortOrder: fields.sortOrder, isPrimary: fields.isPrimary
        }, client);
      });
      return this.imageDto(image);
    } catch (error) {
      await this.storage.delete(stored.objectKey).catch(() => undefined);
      return primaryConflict(error);
    }
  }

  async updateImage(productId: string, imageId: string, input: UpdateProductImageInput): Promise<ProductImageDto> {
    const image = await this.transactions.run(async (client) => {
      if (input.isPrimary) await this.repository.clearPrimaryImage(productId, client, imageId);
      return this.repository.updateImage(productId, imageId, input, client);
    }).catch(primaryConflict);
    if (!image) throw notFound("Product image");
    return this.imageDto(image);
  }

  async deleteImage(productId: string, imageId: string): Promise<{ deletedImageId: string }> {
    const image = await this.repository.deleteImage(productId, imageId);
    if (!image) throw notFound("Product image");
    await this.storage.delete(image.objectKey);
    return { deletedImageId: image.id.toString() };
  }
}
