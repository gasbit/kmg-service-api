import { Router } from "express";

import { authRouter } from "./modules/auth/auth.routes";
import { productRouter } from "./modules/products/product.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/products", productRouter);
