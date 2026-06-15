import { Router } from "express";
import { ROLE_CODES } from "../../constants/role.constants";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { roleMiddleware } from "../../middlewares/role.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { getLoan, listActiveLoans, listLoans, returnLoan } from "./loan.controller";
import { listLoansSchema, loanIdParamsSchema, returnLoanSchema } from "./loan.schema";

export const loanRoutes = Router();

loanRoutes.use(authMiddleware, roleMiddleware([ROLE_CODES.ADMIN]));
loanRoutes.get("/", validate(listLoansSchema), listLoans);
loanRoutes.get("/active", listActiveLoans);
loanRoutes.get("/:id", validate(loanIdParamsSchema), getLoan);
loanRoutes.post("/:id/return", validate(returnLoanSchema), returnLoan);
