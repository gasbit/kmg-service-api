import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  CORS_ORIGIN: z.string().default("*"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  STORAGE_ROOT: z.string().min(1).default("storage"),
  PRODUCT_IMAGE_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  PRODUCT_IMAGE_MAX_COUNT: z.coerce.number().int().positive().default(10),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().min(8).default("admin1234"),
  ADMIN_NAME: z.string().min(1).default("KMG Admin")
});

export const env = envSchema.parse(process.env);
