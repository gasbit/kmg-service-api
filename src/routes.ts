import { Router } from "express";

import { authRouter } from "./modules/auth/auth.routes";
import { productRouter } from "./modules/products/product.routes";
import { transactionRouter } from "./modules/transactions/transaction.routes";
import { loanRouter } from "./modules/loans/loan.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/products", productRouter);
apiRouter.use("/transactions", transactionRouter);
apiRouter.use("/loans", loanRouter);
