import { z } from "zod";

export const productIdParamsSchema = z.object({
  params: z.object({
    id: z.coerce.bigint()
  })
});

export const listProductsSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    includeInactive: z.coerce.boolean().default(false),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const createProductSchema = z.object({
  body: z.object({
    brand: z.string().min(1),
    weightKg: z.coerce.number().positive(),
    exchangeCostPrice: z.coerce.number().nonnegative(),
    exchangeSalePrice: z.coerce.number().nonnegative(),
    fullTankPrice: z.coerce.number().nonnegative(),
    initialFullQty: z.coerce.number().int().nonnegative().default(0),
    initialEmptyQty: z.coerce.number().int().nonnegative().default(0)
  })
});

export const updateProductSchema = productIdParamsSchema.extend({
  body: createProductSchema.shape.body.omit({ initialFullQty: true, initialEmptyQty: true }).partial()
});

export type CreateProductInput = z.infer<typeof createProductSchema>["body"];
export type UpdateProductInput = z.infer<typeof updateProductSchema>["body"];
export type ListProductsQuery = z.infer<typeof listProductsSchema>["query"];
