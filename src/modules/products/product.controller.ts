import type { Request, Response } from "express";
import { toBigIntId } from "../../shared/utils/id.util";
import { sendSuccess } from "../../shared/utils/response.util";
import { ProductService } from "./product.service";

const productService = new ProductService();

export async function listProducts(req: Request, res: Response) {
  return sendSuccess(res, await productService.list(req.query as never));
}

export async function getProduct(req: Request, res: Response) {
  return sendSuccess(res, await productService.get(toBigIntId(req.params.id)));
}

export async function createProduct(req: Request, res: Response) {
  return sendSuccess(res, await productService.create(req.body), 201);
}

export async function updateProduct(req: Request, res: Response) {
  return sendSuccess(res, await productService.update(toBigIntId(req.params.id), req.body));
}

export async function deleteProduct(req: Request, res: Response) {
  return sendSuccess(res, await productService.softDelete(toBigIntId(req.params.id)));
}
