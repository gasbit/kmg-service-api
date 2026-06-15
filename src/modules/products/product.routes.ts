import { Router } from "express";
import { ROLE_CODES } from "../../constants/role.constants";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { roleMiddleware } from "../../middlewares/role.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from "./product.controller";
import { createProductSchema, listProductsSchema, productIdParamsSchema, updateProductSchema } from "./product.schema";

export const productRoutes = Router();

productRoutes.use(authMiddleware, roleMiddleware([ROLE_CODES.ADMIN]));
productRoutes.get("/", validate(listProductsSchema), listProducts);
productRoutes.get("/:id", validate(productIdParamsSchema), getProduct);
productRoutes.post("/", validate(createProductSchema), createProduct);
productRoutes.patch("/:id", validate(updateProductSchema), updateProduct);
productRoutes.delete("/:id", validate(productIdParamsSchema), deleteProduct);
