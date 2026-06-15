import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

export function toPagination(query: unknown) {
  const { page, limit } = paginationSchema.parse(query);
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit
  };
}
