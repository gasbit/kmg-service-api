import { Router } from "express";

import { ROLE_CODES } from "../../constants/role.constants";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";
import { validateBody, validateParams, validateQuery } from "../../middlewares/validate.middleware";
import { listQueueByDate, listTodayQueue, updateQueueStatus } from "./queue.controller";
import {
  listQueueByDateQuerySchema,
  listTodayQueueQuerySchema,
  queueTransactionIdParamsSchema,
  updateQueueStatusSchema
} from "./queue.schema";

export const queueRouter = Router();

queueRouter.use(authMiddleware, requireRoles(ROLE_CODES.ADMIN));
queueRouter.get("/today", validateQuery(listTodayQueueQuerySchema), listTodayQueue);
queueRouter.get("/", validateQuery(listQueueByDateQuerySchema), listQueueByDate);
queueRouter.patch(
  "/:transactionId/status",
  validateParams(queueTransactionIdParamsSchema),
  validateBody(updateQueueStatusSchema),
  updateQueueStatus
);
