import { Router } from "express";

import { ROLE_CODES } from "../../constants/role.constants";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";
import { validateBody, validateParams, validateQuery } from "../../middlewares/validate.middleware";
import {
  cancelTransaction,
  changeTransactionStatus,
  createTransaction,
  getTransaction,
  listTransactions
} from "./transaction.controller";
import {
  cancelTransactionSchema,
  changeTransactionStatusSchema,
  createTransactionSchema,
  listTransactionsQuerySchema,
  transactionIdParamsSchema
} from "./transaction.schema";

export const transactionRouter = Router();
transactionRouter.use(authMiddleware, requireRoles(ROLE_CODES.ADMIN));
transactionRouter.get("/", validateQuery(listTransactionsQuerySchema), listTransactions);
transactionRouter.post("/", validateBody(createTransactionSchema), createTransaction);
transactionRouter.get("/:transactionId", validateParams(transactionIdParamsSchema), getTransaction);
transactionRouter.patch(
  "/:transactionId/status",
  validateParams(transactionIdParamsSchema),
  validateBody(changeTransactionStatusSchema),
  changeTransactionStatus
);
transactionRouter.post(
  "/:transactionId/cancel",
  validateParams(transactionIdParamsSchema),
  validateBody(cancelTransactionSchema),
  cancelTransaction
);
