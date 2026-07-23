import type { NextFunction, Request, Response } from "express";

import { sendSuccess } from "../../shared/utils/api-response";
import { TransactionService } from "../transactions/transaction.service";
import type { ListActiveLoansInput, ListLoansInput, ReturnLoanInput } from "./loan.schema";
import { LoanService } from "./loan.service";

const loanService = new LoanService();
const transactionService = new TransactionService();
const run = (handler: (request: Request, response: Response) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => { handler(request, response).catch(next); };
const loanId = (request: Request) => request.params.loanId as string;

export const listLoans = run(async (_request, response) => {
  const input = response.locals.validatedQuery as ListLoansInput;
  const result = await loanService.list(input);
  response.status(200).json({
    success: true,
    data: { loans: result.loans },
    meta: { requestId: response.locals.requestId as string, pagination: result.pagination }
  });
});

export const listActiveLoans = run(async (_request, response) => {
  const input = response.locals.validatedQuery as ListActiveLoansInput;
  const result = await loanService.listActive(input);
  response.status(200).json({
    success: true,
    data: { loans: result.loans },
    meta: { requestId: response.locals.requestId as string, pagination: result.pagination }
  });
});

export const getLoan = run(async (request, response) => {
  sendSuccess(response, await loanService.get(loanId(request)));
});

export const returnLoan = run(async (request, response) => {
  const input = request.body as ReturnLoanInput;
  sendSuccess(response, await transactionService.returnCylinder({
    loanId: loanId(request),
    quantity: input.quantity,
    note: input.note
  }, request.user!));
});
