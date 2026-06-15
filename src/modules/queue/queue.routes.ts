import { Router } from "express";
import { z } from "zod";
import { ROLE_CODES } from "../../constants/role.constants";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { roleMiddleware } from "../../middlewares/role.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { changeTransactionStatusSchema } from "../transactions/transaction.schema";
import { getQueue, getTodayQueue, updateQueueStatus } from "./queue.controller";

export const queueRoutes = Router();

const listQueueSchema = z.object({
  query: z.object({ date: z.coerce.date().default(() => new Date()) })
});

const updateQueueStatusSchema = changeTransactionStatusSchema.extend({
  params: z.object({ transactionId: z.coerce.bigint() })
});

queueRoutes.use(authMiddleware, roleMiddleware([ROLE_CODES.ADMIN]));
queueRoutes.get("/today", getTodayQueue);
queueRoutes.get("/", validate(listQueueSchema), getQueue);
queueRoutes.patch("/:transactionId/status", validate(updateQueueStatusSchema), updateQueueStatus);
