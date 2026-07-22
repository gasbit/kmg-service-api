import type { NextFunction, Request, Response } from "express";

import { sendSuccess } from "../../shared/utils/api-response";
import type {
  CancelTransactionInput,
  ChangeTransactionStatusInput,
  CreateTransactionInput,
  ListTransactionsInput
} from "./transaction.schema";
import { TransactionService } from "./transaction.service";

const service = new TransactionService();
const run = (handler: (request: Request, response: Response) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => { handler(request, response).catch(next); };
const transactionId = (request: Request) => request.params.transactionId as string;

export const listTransactions = run(async (_request, response) => {
  const input = response.locals.validatedQuery as ListTransactionsInput;
  const result = await service.list(input);
  response.status(200).json({
    success: true,
    data: { transactions: result.transactions },
    meta: { requestId: response.locals.requestId as string, pagination: result.pagination }
  });
});

export const getTransaction = run(async (request, response) => {
  sendSuccess(response, await service.get(transactionId(request)));
});

export const createTransaction = run(async (request, response) => {
  sendSuccess(response, await service.create(request.body as CreateTransactionInput, request.user!), 201);
});

export const changeTransactionStatus = run(async (request, response) => {
  sendSuccess(response, await service.changeStatus(
    transactionId(request),
    request.body as ChangeTransactionStatusInput,
    request.user!
  ));
});

export const cancelTransaction = run(async (request, response) => {
  sendSuccess(response, await service.cancel(
    transactionId(request),
    request.body as CancelTransactionInput,
    request.user!
  ));
});
