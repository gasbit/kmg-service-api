import { Router } from "express";

import { ROLE_CODES } from "../../constants/role.constants";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";
import { validateBody, validateParams, validateQuery } from "../../middlewares/validate.middleware";
import { getLoan, listActiveLoans, listLoans, returnLoan } from "./loan.controller";
import {
  listActiveLoansQuerySchema,
  listLoansQuerySchema,
  loanIdParamsSchema,
  returnLoanSchema
} from "./loan.schema";

export const loanRouter = Router();

loanRouter.use(authMiddleware, requireRoles(ROLE_CODES.ADMIN));
loanRouter.get("/", validateQuery(listLoansQuerySchema), listLoans);
loanRouter.get("/active", validateQuery(listActiveLoansQuerySchema), listActiveLoans);
loanRouter.get("/:loanId", validateParams(loanIdParamsSchema), getLoan);
loanRouter.post(
  "/:loanId/return",
  validateParams(loanIdParamsSchema),
  validateBody(returnLoanSchema),
  returnLoan
);
