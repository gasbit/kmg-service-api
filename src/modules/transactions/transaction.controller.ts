import type { Request, Response } from "express";
import { toBigIntId } from "../../shared/utils/id.util";
import { sendSuccess } from "../../shared/utils/response.util";
import { TransactionService } from "./transaction.service";

const transactionService = new TransactionService();

export async function listTransactions(req: Request, res: Response) {
  return sendSuccess(res, await transactionService.list(req.query as never));
}

export async function getTransaction(req: Request, res: Response) {
  return sendSuccess(res, await transactionService.get(toBigIntId(req.params.id)));
}

export async function createTransaction(req: Request, res: Response) {
  return sendSuccess(res, await transactionService.create(req.body, req.user!), 201);
}

export async function changeTransactionStatus(req: Request, res: Response) {
  return sendSuccess(res, await transactionService.changeStatus(toBigIntId(req.params.id), req.body, req.user!));
}

export async function cancelTransaction(req: Request, res: Response) {
  return sendSuccess(res, await transactionService.cancel(toBigIntId(req.params.id), req.user!));
}
