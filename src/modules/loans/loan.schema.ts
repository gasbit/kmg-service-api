import { z } from "zod";

import { LOAN_STATUSES } from "../../constants/loan.constants";

const bigintId = z.string().regex(/^[1-9][0-9]*$/);
const strictBooleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");
const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
};
const searchField = z.string().trim().min(1).max(150).optional();

export const loanIdParamsSchema = z.object({
  loanId: bigintId
}).strict();

export const listLoansQuerySchema = z.object({
  ...paginationFields,
  status: z.enum(Object.values(LOAN_STATUSES) as [string, ...string[]]).optional(),
  isOverdue: strictBooleanQuery.optional(),
  search: searchField
}).strict();

export const listActiveLoansQuerySchema = z.object({
  ...paginationFields,
  isOverdue: strictBooleanQuery.optional(),
  search: searchField
}).strict();

export const returnLoanSchema = z.object({
  quantity: z.number().int().positive(),
  note: z.string().trim().min(1).optional()
}).strict();

export type ListLoansInput = z.infer<typeof listLoansQuerySchema>;
export type ListActiveLoansInput = z.infer<typeof listActiveLoansQuerySchema>;
export type ReturnLoanInput = z.infer<typeof returnLoanSchema>;
