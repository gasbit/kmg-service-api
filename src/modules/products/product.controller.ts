import type { NextFunction, Request, Response } from "express";

import { sendSuccess } from "../../shared/utils/api-response";
import type { CreateProductInput, ListProductsInput, UpdateProductImageInput, UpdateProductInput, UploadProductImageFields } from "./product.schema";
import { ProductService } from "./product.service";

const service = new ProductService();
const run = (handler: (request: Request, response: Response) => Promise<void>) =>
  (request: Request, response: Response, next: NextFunction) => { handler(request, response).catch(next); };
const param = (request: Request, name: string): string => request.params[name] as string;

export const listProducts = run(async (_request, response) => {
  const input = response.locals.validatedQuery as ListProductsInput;
  const result = await service.list(input);
  response.status(200).json({ success: true, data: { products: result.products }, meta: { requestId: response.locals.requestId as string, pagination: result.pagination } });
});
export const getProduct = run(async (request, response) => { sendSuccess(response, await service.get(param(request, "productId"))); });
export const createProduct = run(async (request, response) => { sendSuccess(response, await service.create(request.body as CreateProductInput), 201); });
export const updateProduct = run(async (request, response) => { sendSuccess(response, await service.update(param(request, "productId"), request.body as UpdateProductInput)); });
export const deactivateProduct = run(async (request, response) => { sendSuccess(response, await service.deactivate(param(request, "productId"))); });
export const listProductImages = run(async (request, response) => { sendSuccess(response, { images: await service.listImages(param(request, "productId")) }); });
export const uploadProductImage = run(async (request, response) => { sendSuccess(response, await service.uploadImage(param(request, "productId"), request.body as UploadProductImageFields, request.file), 201); });
export const updateProductImage = run(async (request, response) => { sendSuccess(response, await service.updateImage(param(request, "productId"), param(request, "imageId"), request.body as UpdateProductImageInput)); });
export const deleteProductImage = run(async (request, response) => { sendSuccess(response, await service.deleteImage(param(request, "productId"), param(request, "imageId"))); });
