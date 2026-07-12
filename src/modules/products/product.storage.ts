import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { env } from "../../config/env";
import type { StorageProvider } from "./product.types";

const extensionByMimeType: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

export const ALLOWED_PRODUCT_IMAGE_MIME_TYPES = Object.keys(extensionByMimeType);
export const storageRoot = path.resolve(env.STORAGE_ROOT);

export class LocalStorageProvider implements StorageProvider {
  async saveProductImage(productId: string, file: Express.Multer.File): Promise<{ objectKey: string }> {
    const extension = extensionByMimeType[file.mimetype];
    if (!extension) throw new Error("Unsupported image MIME type");
    const objectKey = path.posix.join("products", productId, `${randomUUID()}${extension}`);
    const target = path.resolve(storageRoot, objectKey);
    if (!target.startsWith(`${storageRoot}${path.sep}`)) throw new Error("Invalid storage path");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.buffer, { flag: "wx" });
    return { objectKey };
  }

  async delete(objectKey: string): Promise<void> {
    const target = path.resolve(storageRoot, objectKey);
    if (!target.startsWith(`${storageRoot}${path.sep}`)) throw new Error("Invalid storage path");
    try {
      await unlink(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  getPublicUrl(objectKey: string): string {
    const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
    return `${env.PUBLIC_API_URL.replace(/\/$/, "")}/uploads/${encodedKey}`;
  }
}
