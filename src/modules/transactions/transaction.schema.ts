import { z } from "zod";

import { PRICED_CREATE_TRANSACTION_TYPES, TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../../constants/transaction.constants";
import { isCalendarDate } from "../../shared/utils/date";

const bigintId = z.string().regex(/^[1-9][0-9]*$/);
const calendarDate = z.string().refine(isCalendarDate, "Must be a valid calendar date");
const decimal2 = z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/);
const optionalText = (max?: number) => {
  const text = z.string().trim().min(1);
  return max ? text.max(max).optional() : text.optional();
};

const commonItemSchema = z.object({
  productId: bigintId,
  quantity: z.number().int().positive(),
  note: optionalText()
}).strict();

const borrowItemSchema = z.object({
  productId: bigintId,
  quantity: z.number().int().positive(),
  expectedReturnDate: calendarDate.optional(),
  depositAmount: decimal2.default("0.00"),
  note: optionalText()
}).strict();

const customerFields = {
  customerName: z.string().trim().min(1).max(150),
  customerPhone: optionalText(50),
  customerAddress: optionalText(),
  note: optionalText()
};

function rejectDuplicateProducts<T extends { items: Array<{ productId: string }> }>(input: T, context: z.RefinementCtx) {
  const firstIndexByProduct = new Map<string, number>();
  input.items.forEach((item, index) => {
    if (firstIndexByProduct.has(item.productId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate productId; first used at items.${firstIndexByProduct.get(item.productId)}.productId`,
        path: ["items", index, "productId"]
      });
    } else {
      firstIndexByProduct.set(item.productId, index);
    }
  });
}

const deliverySchema = z.object({
  transactionType: z.literal(TRANSACTION_TYPES.DELIVERY_EXCHANGE),
  ...customerFields,
  customerAddress: z.string().trim().min(1),
  items: z.array(commonItemSchema).min(1)
}).strict();

const walkInSchema = z.object({
  transactionType: z.literal(TRANSACTION_TYPES.WALK_IN_EXCHANGE),
  ...customerFields,
  items: z.array(commonItemSchema).min(1)
}).strict();

const borrowSchema = z.object({
  transactionType: z.literal(TRANSACTION_TYPES.BORROW_CYLINDER),
  ...customerFields,
  items: z.array(borrowItemSchema).min(1)
}).strict();

const buyFullTankSchema = z.object({
  transactionType: z.literal(TRANSACTION_TYPES.BUY_FULL_TANK),
  ...customerFields,
  items: z.array(commonItemSchema).min(1)
}).strict();

export const createTransactionSchema = z.discriminatedUnion("transactionType", [
  deliverySchema,
  walkInSchema,
  borrowSchema,
  buyFullTankSchema
]).superRefine(rejectDuplicateProducts);

export const transactionIdParamsSchema = z.object({ transactionId: bigintId }).strict();

export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  transactionType: z.enum(Object.values(TRANSACTION_TYPES) as [string, ...string[]]).optional(),
  status: z.enum(Object.values(TRANSACTION_STATUSES) as [string, ...string[]]).optional(),
  dateFrom: calendarDate.optional(),
  dateTo: calendarDate.optional(),
  search: z.string().trim().min(1).max(150).optional()
}).strict().superRefine((input, context) => {
  if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "dateFrom must not be after dateTo", path: ["dateFrom"] });
  }
});

export const changeTransactionStatusSchema = z.object({
  status: z.enum([
    TRANSACTION_STATUSES.IN_PROGRESS,
    TRANSACTION_STATUSES.COMPLETED,
    TRANSACTION_STATUSES.CANCELLED
  ]),
  note: optionalText()
}).strict();

export const cancelTransactionSchema = z.preprocess(
  (value) => value === undefined ? {} : value,
  z.object({ note: optionalText() }).strict()
);

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type ListTransactionsInput = z.infer<typeof listTransactionsQuerySchema> & {
  transactionType?: (typeof PRICED_CREATE_TRANSACTION_TYPES)[number] | typeof TRANSACTION_TYPES.RETURN_CYLINDER;
};
export type ChangeTransactionStatusInput = z.infer<typeof changeTransactionStatusSchema>;
export type CancelTransactionInput = z.infer<typeof cancelTransactionSchema>;
