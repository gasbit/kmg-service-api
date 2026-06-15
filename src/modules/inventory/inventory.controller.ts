import type { Request, Response } from "express";
import { sendSuccess } from "../../shared/utils/response.util";
import { InventoryService } from "./inventory.service";

const inventoryService = new InventoryService();

export async function listInventoryBalances(_req: Request, res: Response) {
  return sendSuccess(res, await inventoryService.listBalances());
}

export async function listInventoryMovements(req: Request, res: Response) {
  return sendSuccess(res, await inventoryService.listMovements(req.query as never));
}

export async function adjustInventory(req: Request, res: Response) {
  return sendSuccess(res, await inventoryService.adjustInventory(req.body), 201);
}
