import { Router } from "express";
import { ROLE_CODES } from "../../constants/role.constants";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { roleMiddleware } from "../../middlewares/role.middleware";
import { validate } from "../../middlewares/validate.middleware";
import { adjustInventory, listInventoryBalances, listInventoryMovements } from "./inventory.controller";
import { adjustInventorySchema, listInventoryMovementsSchema } from "./inventory.schema";

export const inventoryRoutes = Router();

inventoryRoutes.use(authMiddleware, roleMiddleware([ROLE_CODES.ADMIN]));
inventoryRoutes.get("/balances", listInventoryBalances);
inventoryRoutes.get("/movements", validate(listInventoryMovementsSchema), listInventoryMovements);
inventoryRoutes.post("/adjustments", validate(adjustInventorySchema), adjustInventory);
