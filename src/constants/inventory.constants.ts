export const INVENTORY_MOVEMENT_TYPES = {
  FULL_OUT: "FULL_OUT",
  EMPTY_IN: "EMPTY_IN",
  LOAN_OUT: "LOAN_OUT",
  LOAN_RETURN: "LOAN_RETURN",
  ADJUSTMENT: "ADJUSTMENT"
} as const;

// Inventory workflows are intentionally on hold for the MVP. Keep transaction,
// queue, and loan records working without validating or mutating stock.
export const INVENTORY_WORKFLOWS_ENABLED: boolean = false;

export type InventoryMovementType =
  (typeof INVENTORY_MOVEMENT_TYPES)[keyof typeof INVENTORY_MOVEMENT_TYPES];
