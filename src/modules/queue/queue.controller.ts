import type { NextFunction, Request, Response } from "express";

import { sendSuccess } from "../../shared/utils/api-response";
import type {
  ListQueueByDateInput,
  ListTodayQueueInput,
  UpdateQueueStatusInput
} from "./queue.schema";
import { QueueService } from "./queue.service";

const service = new QueueService();
const run = (handler: (request: Request, response: Response) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => { handler(request, response).catch(next); };
const transactionId = (request: Request) => request.params.transactionId as string;

export const listTodayQueue = run(async (_request, response) => {
  sendSuccess(response, await service.listToday(response.locals.validatedQuery as ListTodayQueueInput));
});

export const listQueueByDate = run(async (_request, response) => {
  sendSuccess(response, await service.listByDate(response.locals.validatedQuery as ListQueueByDateInput));
});

export const updateQueueStatus = run(async (request, response) => {
  sendSuccess(response, await service.updateStatus(
    transactionId(request),
    request.body as UpdateQueueStatusInput,
    request.user!
  ));
});
