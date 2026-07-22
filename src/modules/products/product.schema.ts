import { z } from "zod";

const bigintId = z.string().regex(/^[1-9][0-9]*$/);
const decimal2 = z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/);
const positiveDecimal2 = decimal2.refine((value) => Number(value) > 0, "Must be greater than zero");
const trimmedBrand = z.string().trim().min(1).max(100);
const booleanQuery = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

export const productIdParamsSchema = z.object({ productId: bigintId }).strict();
export const productImageParamsSchema = z.object({ productId: bigintId, imageId: bigintId }).strict();

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
  includeInactive: booleanQuery.default(false)
}).strict();

export const createProductSchema = z.object({
  brand: trimmedBrand,
  weightKg: positiveDecimal2,
  exchangeCostPrice: decimal2,
  exchangeSalePrice: decimal2,
  fullTankCostPrice: decimal2,
  fullTankPrice: decimal2
}).strict();

export const updateProductSchema = createProductSchema.partial().extend({ isActive: z.boolean().optional() }).refine(
  (input) => Object.keys(input).length > 0,
  "At least one field is required"
);

export const uploadProductImageFieldsSchema = z.object({
  sortOrder: z.coerce.number().int().min(0).default(0),
  isPrimary: booleanQuery.default(false)
}).strict();

export const updateProductImageSchema = z.object({
  sortOrder: z.number().int().min(0).optional(),
  isPrimary: z.boolean().optional()
}).strict().refine((input) => Object.keys(input).length > 0, "At least one field is required");

export type ListProductsInput = z.infer<typeof listProductsQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UploadProductImageFields = z.infer<typeof uploadProductImageFieldsSchema>;
export type UpdateProductImageInput = z.infer<typeof updateProductImageSchema>;
