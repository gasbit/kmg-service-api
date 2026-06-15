import type { Prisma } from "@prisma/client";
import { INVENTORY_MOVEMENT_TYPES } from "../../constants/inventory.constants";
import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import { ERROR_CODES } from "../../shared/errors/error-codes";
import type { AdjustInventoryInput, ListInventoryMovementsQuery, MovementType } from "./inventory.schema";
import { InventoryRepository } from "./inventory.repository";

export type MovementInput = {
  productId: bigint;
  transactionId?: bigint;
  movementType: MovementType;
  quantity: number;
  note?: string;
};

export class InventoryService {
  constructor(private readonly inventoryRepository = new InventoryRepository()) {}

  listBalances() {
    return this.inventoryRepository.listBalances();
  }

  async listMovements(query: ListInventoryMovementsQuery) {
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.inventoryRepository.listMovements({ productId: query.productId, skip, take: query.limit }),
      this.inventoryRepository.countMovements({ productId: query.productId })
    ]);

    return { items, page: query.page, limit: query.limit, total };
  }

  adjustInventory(input: AdjustInventoryInput) {
    return prisma.$transaction(async (tx) => {
      const inventoryRepository = new InventoryRepository(tx);
      const balance = await inventoryRepository.findBalanceByProductId(input.productId);
      if (!balance) throw new AppError(ERROR_CODES.NOT_FOUND, "Inventory balance not found", 404);

      const nextFullQty = balance.fullQty + input.fullQtyDelta;
      const nextEmptyQty = balance.emptyQty + input.emptyQtyDelta;
      const nextLoanedQty = balance.loanedQty + input.loanedQtyDelta;
      if (nextFullQty < 0 || nextEmptyQty < 0 || nextLoanedQty < 0) {
        throw new AppError(ERROR_CODES.INSUFFICIENT_STOCK, "Inventory balance cannot be negative", 422);
      }

      const updated = await inventoryRepository.updateBalance(input.productId, {
        fullQty: nextFullQty,
        emptyQty: nextEmptyQty,
        loanedQty: nextLoanedQty
      });

      await inventoryRepository.createMovement({
        product: { connect: { id: input.productId } },
        movementType: INVENTORY_MOVEMENT_TYPES.ADJUSTMENT,
        quantity: input.fullQtyDelta + input.emptyQtyDelta + input.loanedQtyDelta,
        note: input.note
      });

      return updated;
    });
  }

  async applyMovements(movements: MovementInput[], db: Prisma.TransactionClient) {
    const inventoryRepository = new InventoryRepository(db);

    for (const movement of movements) {
      const balance = await inventoryRepository.findBalanceByProductId(movement.productId);
      if (!balance) throw new AppError(ERROR_CODES.NOT_FOUND, "Inventory balance not found", 404);

      const next = this.calculateBalance(balance, movement.movementType, movement.quantity);
      if (next.fullQty < 0 || next.emptyQty < 0 || next.loanedQty < 0) {
        throw new AppError(ERROR_CODES.INSUFFICIENT_STOCK, "Insufficient stock", 422, { productId: movement.productId });
      }

      await inventoryRepository.updateBalance(movement.productId, next);
      await inventoryRepository.createMovement({
        product: { connect: { id: movement.productId } },
        transaction: movement.transactionId ? { connect: { id: movement.transactionId } } : undefined,
        movementType: movement.movementType,
        quantity: movement.quantity,
        note: movement.note
      });
    }
  }

  private calculateBalance(
    balance: { fullQty: number; emptyQty: number; loanedQty: number },
    movementType: MovementType,
    quantity: number
  ) {
    const next = { fullQty: balance.fullQty, emptyQty: balance.emptyQty, loanedQty: balance.loanedQty };
    if (movementType === INVENTORY_MOVEMENT_TYPES.FULL_OUT) next.fullQty -= quantity;
    if (movementType === INVENTORY_MOVEMENT_TYPES.EMPTY_IN) next.emptyQty += quantity;
    if (movementType === INVENTORY_MOVEMENT_TYPES.LOAN_OUT) {
      next.fullQty -= quantity;
      next.loanedQty += quantity;
    }
    if (movementType === INVENTORY_MOVEMENT_TYPES.LOAN_RETURN) {
      next.loanedQty -= quantity;
      next.emptyQty += quantity;
    }
    return next;
  }
}
