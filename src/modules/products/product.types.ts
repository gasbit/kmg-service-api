import type { Prisma, ProductImage } from "@prisma/client";

export type DatabaseClient = Prisma.TransactionClient;

export interface ProductImageDto {
  id: string;
  url: string;
  originalName: string | null;
  mimeType: string;
  fileSize: number;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDto {
  id: string;
  brand: string;
  weightKg: string;
  exchangeCostPrice: string;
  exchangeSalePrice: string;
  fullTankCostPrice: string;
  fullTankPrice: string;
  isActive: boolean;
  images: ProductImageDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductRecord extends Omit<ProductDto, "images"> {
  images: Array<Omit<ProductImageDto, "url"> & { objectKey: string }>;
}

export interface ProductRepository {
  list(input: { page: number; limit: number; search?: string; includeInactive: boolean }): Promise<{ products: ProductRecord[]; totalItems: number }>;
  findById(id: string): Promise<ProductRecord | null>;
  create(input: ProductWriteInput, client: DatabaseClient): Promise<ProductRecord>;
  createInitialBalance(productId: string, client: DatabaseClient): Promise<void>;
  update(id: string, input: Partial<ProductWriteInput> & { isActive?: boolean }): Promise<ProductRecord | null>;
  countImages(productId: string): Promise<number>;
  createImage(productId: string, input: ImageWriteInput, client: DatabaseClient): Promise<ProductImage>;
  updateImage(productId: string, imageId: string, input: { sortOrder?: number; isPrimary?: boolean }, client: DatabaseClient): Promise<ProductImage | null>;
  clearPrimaryImage(productId: string, client: DatabaseClient, exceptImageId?: string): Promise<void>;
  findImage(productId: string, imageId: string): Promise<ProductImage | null>;
  listImages(productId: string): Promise<ProductImage[]>;
  deleteImage(productId: string, imageId: string): Promise<ProductImage | null>;
}

export interface ProductWriteInput {
  brand: string;
  weightKg: string;
  exchangeCostPrice: string;
  exchangeSalePrice: string;
  fullTankCostPrice: string;
  fullTankPrice: string;
}

export interface ImageWriteInput {
  objectKey: string;
  originalName: string | null;
  mimeType: string;
  fileSize: number;
  sortOrder: number;
  isPrimary: boolean;
}

export interface TransactionRunner {
  run<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T>;
}

export interface StorageProvider {
  saveProductImage(productId: string, file: Express.Multer.File): Promise<{ objectKey: string }>;
  delete(objectKey: string): Promise<void>;
  getPublicUrl(objectKey: string): string;
}
