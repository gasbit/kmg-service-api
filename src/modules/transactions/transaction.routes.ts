import { Router } from "express";
import { ROLE_CODES } from "../../constants/role.constants";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { roleMiddleware } from "../../middlewares/role.middleware";
import { validate } from "../../middlewares/validate.middleware";
import {
  cancelTransaction,
  changeTransactionStatus,
  createTransaction,
  getTransaction,
  listTransactions
} from "./transaction.controller";
import {
  changeTransactionStatusSchema,
  createTransactionSchema,
  listTransactionsSchema,
  transactionIdParamsSchema
} from "./transaction.schema";

export const transactionRoutes = Router();

transactionRoutes.use(authMiddleware, roleMiddleware([ROLE_CODES.ADMIN]));
transactionRoutes.post("/", validate(createTransactionSchema), createTransaction);
transactionRoutes.get("/", validate(listTransactionsSchema), listTransactions);
transactionRoutes.get("/:id", validate(transactionIdParamsSchema), getTransaction);
transactionRoutes.patch("/:id/status", validate(changeTransactionStatusSchema), changeTransactionStatus);
transactionRoutes.post("/:id/cancel", validate(transactionIdParamsSchema), cancelTransaction);
