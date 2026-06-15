import { z } from "zod";

export const loanIdParamsSchema = z.object({
  params: z.object({
    id: z.coerce.bigint()
  })
});

export const listLoansSchema = z.object({
  query: z.object({
    status: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const returnLoanSchema = loanIdParamsSchema.extend({
  body: z.object({
    quantity: z.coerce.number().int().positive(),
    note: z.string().optional()
  })
});

export type ListLoansQuery = z.infer<typeof listLoansSchema>["query"];
export type ReturnLoanInput = z.infer<typeof returnLoanSchema>["body"];
