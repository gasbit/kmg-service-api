import { z } from "zod";
import { ITEM_ACTIONS, TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../../constants/transaction.constants";

const transactionTypeValues = Object.values(TRANSACTION_TYPES) as [string, ...string[]];
const itemActionValues = Object.values(ITEM_ACTIONS) as [string, ...string[]];
const statusValues = Object.values(TRANSACTION_STATUSES) as [string, ...string[]];

export const transactionIdParamsSchema = z.object({
  params: z.object({
    id: z.coerce.bigint()
  })
});

export const listTransactionsSchema = z.object({
  query: z.object({
    type: z.enum(transactionTypeValues).optional(),
    status: z.enum(statusValues).optional(),
    customerPhone: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const createTransactionSchema = z.object({
  body: z.object({
    transactionType: z.enum(transactionTypeValues),
    customerId: z.coerce.bigint().optional(),
    customerName: z.string().min(1),
    customerPhone: z.string().optional(),
    customerAddress: z.string().optional(),
    note: z.string().optional(),
    expectedReturnDate: z.coerce.date().optional(),
    depositAmount: z.coerce.number().nonnegative().default(0),
    items: z
      .array(
        z.object({
          productId: z.coerce.bigint(),
          quantity: z.coerce.number().int().positive(),
          itemAction: z.enum(itemActionValues),
          unitPrice: z.coerce.number().nonnegative().optional(),
          costPrice: z.coerce.number().nonnegative().optional(),
          note: z.string().optional()
        })
      )
      .min(1)
  })
});

export const changeTransactionStatusSchema = transactionIdParamsSchema.extend({
  body: z.object({
    status: z.enum(statusValues),
    note: z.string().optional()
  })
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>["body"];
export type ChangeTransactionStatusInput = z.infer<typeof changeTransactionStatusSchema>["body"];
export type ListTransactionsQuery = z.infer<typeof listTransactionsSchema>["query"];
