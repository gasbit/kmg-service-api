import type { ProductImage } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ProductService } from "./product.service";
import type { DatabaseClient, ImageWriteInput, ProductRecord, ProductRepository, ProductWriteInput, StorageProvider, TransactionRunner } from "./product.types";

const now = "2026-07-12T03:00:00.000Z";
const product = (overrides: Partial<ProductRecord> = {}): ProductRecord => ({
  id: "1", brand: "ปตท.", weightKg: "15.00", exchangeCostPrice: "330.00",
  exchangeSalePrice: "390.00", fullTankCostPrice: "1850.00", fullTankPrice: "2450.00", isActive: true,
  images: [], createdAt: now, updatedAt: now, ...overrides
});

const image = (overrides: Partial<ProductImage> = {}): ProductImage => ({
  id: 10n, productId: 1n, objectKey: "products/1/image.webp", originalName: "image.webp",
  mimeType: "image/webp", fileSize: 100, sortOrder: 0, isPrimary: false,
  createdAt: new Date(now), updatedAt: new Date(now), ...overrides
});

class FakeRepository implements ProductRepository {
  current: ProductRecord | null = product();
  initialBalanceCreated = false;
  images: ProductImage[] = [];
  failImageCreate = false;

  async list() { return { products: this.current ? [this.current] : [], totalItems: this.current ? 1 : 0 }; }
  async findById() { return this.current; }
  async create(input: ProductWriteInput) { this.current = product({ ...input }); return this.current; }
  async createInitialBalance() { this.initialBalanceCreated = true; }
  async update(_id: string, input: Partial<ProductWriteInput> & { isActive?: boolean }) {
    if (!this.current) return null;
    this.current = { ...this.current, ...input };
    return this.current;
  }
  async countImages() { return this.images.length; }
  async createImage(_productId: string, input: ImageWriteInput) {
    if (this.failImageCreate) throw new Error("database failed");
    const created = image({ ...input }); this.images.push(created); return created;
  }
  async updateImage(_productId: string, imageId: string, input: { sortOrder?: number; isPrimary?: boolean }) {
    const found = this.images.find((item) => item.id.toString() === imageId);
    if (!found) return null;
    Object.assign(found, input); return found;
  }
  async clearPrimaryImage(_productId: string, _client: DatabaseClient, exceptImageId?: string) {
    this.images.forEach((item) => { if (item.id.toString() !== exceptImageId) item.isPrimary = false; });
  }
  async findImage(_productId: string, imageId: string) { return this.images.find((item) => item.id.toString() === imageId) ?? null; }
  async listImages() { return this.images; }
  async deleteImage(_productId: string, imageId: string) {
    const index = this.images.findIndex((item) => item.id.toString() === imageId);
    return index < 0 ? null : this.images.splice(index, 1)[0];
  }
}

class FakeTransactionRunner implements TransactionRunner {
  run<T>(work: (client: DatabaseClient) => Promise<T>) { return work({} as DatabaseClient); }
}

class FakeStorage implements StorageProvider {
  deleted: string[] = [];
  async saveProductImage() { return { objectKey: "products/1/generated.webp" }; }
  async delete(objectKey: string) { this.deleted.push(objectKey); }
  getPublicUrl(objectKey: string) { return `https://example.test/uploads/${objectKey}`; }
}

const createInput = {
  brand: "ปตท.", weightKg: "15.00", exchangeCostPrice: "330.00",
  exchangeSalePrice: "390.00", fullTankCostPrice: "1850.00", fullTankPrice: "2450.00"
};

describe("ProductService", () => {
  it("creates a product and its initial inventory balance in one transaction callback", async () => {
    const repository = new FakeRepository();
    const transaction = new FakeTransactionRunner();
    const runSpy = vi.spyOn(transaction, "run");
    const result = await new ProductService(repository, transaction, new FakeStorage()).create(createInput);

    expect(runSpy).toHaveBeenCalledOnce();
    expect(repository.initialBalanceCreated).toBe(true);
    expect(result).toMatchObject({ id: "1", brand: "ปตท.", fullTankCostPrice: "1850.00", images: [] });
  });

  it("returns stable pagination metadata and public image URLs", async () => {
    const repository = new FakeRepository();
    repository.current = product({ images: [{
      id: "10", objectKey: "products/1/image.webp", originalName: null, mimeType: "image/webp",
      fileSize: 100, sortOrder: 0, isPrimary: true, createdAt: now, updatedAt: now
    }] });
    const result = await new ProductService(repository, new FakeTransactionRunner(), new FakeStorage())
      .list({ page: 1, limit: 20, includeInactive: false });

    expect(result.pagination).toEqual({ page: 1, limit: 20, totalItems: 1, totalPages: 1 });
    expect(result.products[0].images[0].url).toBe("https://example.test/uploads/products/1/image.webp");
    expect(result.products[0].images[0]).not.toHaveProperty("objectKey");
  });

  it("soft deletes a product idempotently", async () => {
    const repository = new FakeRepository();
    const service = new ProductService(repository, new FakeTransactionRunner(), new FakeStorage());

    await expect(service.deactivate("1")).resolves.toMatchObject({ isActive: false });
    await expect(service.deactivate("1")).resolves.toMatchObject({ isActive: false });
  });

  it("cleans up a stored file when image metadata creation fails", async () => {
    const repository = new FakeRepository();
    repository.failImageCreate = true;
    const storage = new FakeStorage();
    const file = { originalname: "test.webp", mimetype: "image/webp", size: 16, buffer: Buffer.from("RIFF1234WEBPdata") } as Express.Multer.File;
    const service = new ProductService(repository, new FakeTransactionRunner(), storage);

    await expect(service.uploadImage("1", { sortOrder: 0, isPrimary: false }, file)).rejects.toThrow("database failed");
    expect(storage.deleted).toEqual(["products/1/generated.webp"]);
  });

  it("rejects a file whose bytes do not match the declared image type", async () => {
    const repository = new FakeRepository();
    const storage = new FakeStorage();
    const file = { originalname: "fake.webp", mimetype: "image/webp", size: 4, buffer: Buffer.from("text") } as Express.Multer.File;

    await expect(new ProductService(repository, new FakeTransactionRunner(), storage)
      .uploadImage("1", { sortOrder: 0, isPrimary: false }, file))
      .rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  it("rejects missing products with a stable not-found error", async () => {
    const repository = new FakeRepository();
    repository.current = null;

    await expect(new ProductService(repository, new FakeTransactionRunner(), new FakeStorage()).get("999"))
      .rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });
});
