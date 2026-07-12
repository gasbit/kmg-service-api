import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";

import { env } from "../../config/env";
import { ROLE_CODES } from "../../constants/role.constants";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRoles } from "../../middlewares/role.middleware";
import { validateBody, validateParams, validateQuery } from "../../middlewares/validate.middleware";
import { AppError } from "../../shared/errors/app-error";
import { ERROR_CODES } from "../../shared/errors/error-codes";
import { createProduct, deactivateProduct, deleteProductImage, getProduct, listProductImages, listProducts, updateProduct, updateProductImage, uploadProductImage } from "./product.controller";
import { createProductSchema, listProductsQuerySchema, productIdParamsSchema, productImageParamsSchema, updateProductImageSchema, updateProductSchema, uploadProductImageFieldsSchema } from "./product.schema";
import { ALLOWED_PRODUCT_IMAGE_MIME_TYPES } from "./product.storage";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.PRODUCT_IMAGE_MAX_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => callback(null, ALLOWED_PRODUCT_IMAGE_MIME_TYPES.includes(file.mimetype))
});

const uploadSingleImage = (request: Request, response: Response, next: NextFunction) => {
  upload.single("file")(request, response, (error) => {
    if (error) { next(new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Invalid image upload")); return; }
    if (!request.file) { next(new AppError(400, ERROR_CODES.VALIDATION_ERROR, "A JPEG, PNG, or WebP image is required")); return; }
    next();
  });
};

export const productRouter = Router();
productRouter.use(authMiddleware, requireRoles(ROLE_CODES.ADMIN));
productRouter.get("/", validateQuery(listProductsQuerySchema), listProducts);
productRouter.post("/", validateBody(createProductSchema), createProduct);
productRouter.get("/:productId", validateParams(productIdParamsSchema), getProduct);
productRouter.patch("/:productId", validateParams(productIdParamsSchema), validateBody(updateProductSchema), updateProduct);
productRouter.delete("/:productId", validateParams(productIdParamsSchema), deactivateProduct);
productRouter.get("/:productId/images", validateParams(productIdParamsSchema), listProductImages);
productRouter.post("/:productId/images", validateParams(productIdParamsSchema), uploadSingleImage, validateBody(uploadProductImageFieldsSchema), uploadProductImage);
productRouter.patch("/:productId/images/:imageId", validateParams(productImageParamsSchema), validateBody(updateProductImageSchema), updateProductImage);
productRouter.delete("/:productId/images/:imageId", validateParams(productImageParamsSchema), deleteProductImage);
