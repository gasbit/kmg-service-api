import { z } from "zod";

import { TRANSACTION_STATUSES } from "../../constants/transaction.constants";
import { isCalendarDate } from "../../shared/utils/date";

const bigintId = z.string().regex(/^[1-9][0-9]*$/);
const calendarDate = z.string().refine(isCalendarDate, "Must be a valid calendar date");
const optionalText = z.string().trim().min(1).optional();
const queueStatus = z.enum([
  TRANSACTION_STATUSES.PENDING,
  TRANSACTION_STATUSES.IN_PROGRESS,
  TRANSACTION_STATUSES.COMPLETED,
  TRANSACTION_STATUSES.CANCELLED
]);

export const listTodayQueueQuerySchema = z.object({
  status: queueStatus.optional()
}).strict();

export const listQueueByDateQuerySchema = z.object({
  date: calendarDate,
  status: queueStatus.optional()
}).strict();

export const queueTransactionIdParamsSchema = z.object({
  transactionId: bigintId
}).strict();

export const updateQueueStatusSchema = z.object({
  status: z.enum([
    TRANSACTION_STATUSES.IN_PROGRESS,
    TRANSACTION_STATUSES.COMPLETED,
    TRANSACTION_STATUSES.CANCELLED
  ]),
  note: optionalText
}).strict();

export type ListTodayQueueInput = z.infer<typeof listTodayQueueQuerySchema>;
export type ListQueueByDateInput = z.infer<typeof listQueueByDateQuerySchema>;
export type UpdateQueueStatusInput = z.infer<typeof updateQueueStatusSchema>;
