import type { Request, Response } from "express";
import { toBigIntId } from "../../shared/utils/id.util";
import { sendSuccess } from "../../shared/utils/response.util";
import { QueueService } from "./queue.service";

const queueService = new QueueService();

export async function getTodayQueue(_req: Request, res: Response) {
  return sendSuccess(res, await queueService.today());
}

export async function getQueue(req: Request, res: Response) {
  return sendSuccess(res, await queueService.byDate(new Date(String(req.query.date))));
}

export async function updateQueueStatus(req: Request, res: Response) {
  return sendSuccess(res, await queueService.updateStatus(toBigIntId(req.params.transactionId), req.body, req.user!));
}
