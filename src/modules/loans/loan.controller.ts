import type { Request, Response } from "express";
import { toBigIntId } from "../../shared/utils/id.util";
import { sendSuccess } from "../../shared/utils/response.util";
import { LoanService } from "./loan.service";

const loanService = new LoanService();

export async function listLoans(req: Request, res: Response) {
  return sendSuccess(res, await loanService.list(req.query as never));
}

export async function listActiveLoans(_req: Request, res: Response) {
  return sendSuccess(res, await loanService.active());
}

export async function getLoan(req: Request, res: Response) {
  return sendSuccess(res, await loanService.get(toBigIntId(req.params.id)));
}

export async function returnLoan(req: Request, res: Response) {
  return sendSuccess(res, await loanService.returnLoan(toBigIntId(req.params.id), req.body, req.user!), 201);
}
