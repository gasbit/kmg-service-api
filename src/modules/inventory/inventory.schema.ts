import { z } from "zod";
import { INVENTORY_MOVEMENT_TYPES } from "../../constants/inventory.constants";

export const listInventoryMovementsSchema = z.object({
  query: z.object({
    productId: z.coerce.bigint().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20)
  })
});

export const adjustInventorySchema = z.object({
  body: z.object({
    productId: z.coerce.bigint(),
    fullQtyDelta: z.coerce.number().int().default(0),
    emptyQtyDelta: z.coerce.number().int().default(0),
    loanedQtyDelta: z.coerce.number().int().default(0),
    note: z.string().min(1)
  })
});

export type ListInventoryMovementsQuery = z.infer<typeof listInventoryMovementsSchema>["query"];
export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>["body"];
export type MovementType = (typeof INVENTORY_MOVEMENT_TYPES)[keyof typeof INVENTORY_MOVEMENT_TYPES];
