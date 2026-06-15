import type { Prisma } from "@prisma/client";
import { INVENTORY_MOVEMENT_TYPES, LOAN_STATUSES } from "../../constants/inventory.constants";
import {
  ITEM_ACTIONS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  VALID_STATUS_TRANSITIONS
} from "../../constants/transaction.constants";
import { prisma } from "../../config/database";
import { AppError } from "../../shared/errors/AppError";
import { ERROR_CODES } from "../../shared/errors/error-codes";
import type { AuthUser } from "../../shared/types/auth-user.type";
import { toDateOnly } from "../../shared/utils/date.util";
import { buildTransactionNo } from "../../shared/utils/transaction-no.util";
import { InventoryService, type MovementInput } from "../inventory/inventory.service";
import { ProductRepository } from "../products/product.repository";
import type { ChangeTransactionStatusInput, CreateTransactionInput, ListTransactionsQuery } from "./transaction.schema";
import { TransactionRepository } from "./transaction.repository";

export class TransactionService {
  constructor(
    private readonly transactionRepository = new TransactionRepository(),
    private readonly inventoryService = new InventoryService()
  ) {}

  async list(query: ListTransactionsQuery) {
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.transactionRepository.list({ ...query, skip, take: query.limit }),
      this.transactionRepository.count(query)
    ]);
    return { items, page: query.page, limit: query.limit, total };
  }

  async get(id: bigint) {
    const transaction = await this.transactionRepository.findById(id);
    if (!transaction) throw new AppError(ERROR_CODES.NOT_FOUND, "Transaction not found", 404);
    return transaction;
  }

  create(input: CreateTransactionInput, currentUser: AuthUser) {
    return prisma.$transaction(async (tx) => {
      const transactionRepository = new TransactionRepository(tx);
      const productRepository = new ProductRepository(tx);
      const today = toDateOnly();
      const productIds = [...new Set(input.items.map((item) => item.productId))];
      const products = await productRepository.findActiveByIds(productIds);

      if (products.length !== productIds.length) {
        throw new AppError(ERROR_CODES.NOT_FOUND, "Some products are inactive or not found", 404);
      }

      const productById = new Map(products.map((product) => [product.id.toString(), product]));
      const itemCreates = input.items.map((item) => {
        const product = productById.get(item.productId.toString())!;
        const unitPrice = item.unitPrice ?? this.resolveUnitPrice(input.transactionType, product);
        const costPrice = item.costPrice ?? Number(product.exchangeCostPrice);
        return {
          product: { connect: { id: product.id } },
          productBrandSnapshot: product.brand,
          productWeightSnapshot: product.weightKg,
          quantity: item.quantity,
          unitPrice,
          costPrice,
          lineTotal: unitPrice * item.quantity,
          itemAction: item.itemAction,
          note: item.note
        };
      });

      const todayCount = await transactionRepository.countTodayByDateRange(today, new Date());
      const queueNo =
        input.transactionType === TRANSACTION_TYPES.DELIVERY_EXCHANGE
          ? ((await transactionRepository.nextQueueNo(today))._max.queueNo ?? 0) + 1
          : null;
      const defaultStatus =
        input.transactionType === TRANSACTION_TYPES.DELIVERY_EXCHANGE
          ? TRANSACTION_STATUSES.PENDING
          : TRANSACTION_STATUSES.COMPLETED;

      const transaction = await transactionRepository.create({
        transactionNo: buildTransactionNo(todayCount + 1),
        transactionType: input.transactionType,
        status: defaultStatus,
        queueDate: queueNo ? today : null,
        queueNo,
        customer: input.customerId ? { connect: { id: input.customerId } } : undefined,
        customerNameSnapshot: input.customerName,
        customerPhoneSnapshot: input.customerPhone,
        customerAddressSnapshot: input.customerAddress,
        totalAmount: itemCreates.reduce((sum, item) => sum + item.lineTotal, 0),
        note: input.note,
        completedAt: defaultStatus === TRANSACTION_STATUSES.COMPLETED ? new Date() : null,
        createdByUser: { connect: { id: BigInt(currentUser.id) } },
        items: { create: itemCreates },
        statusLogs: {
          create: {
            toStatus: defaultStatus,
            changedByUser: { connect: { id: BigInt(currentUser.id) } },
            note: "Created transaction"
          }
        }
      });

      if (defaultStatus === TRANSACTION_STATUSES.COMPLETED) {
        await this.applyCompletedEffects(input, transaction.id, tx);
      }

      return transactionRepository.findById(transaction.id);
    });
  }

  changeStatus(id: bigint, input: ChangeTransactionStatusInput, currentUser: AuthUser) {
    return prisma.$transaction(async (tx) => {
      const transactionRepository = new TransactionRepository(tx);
      const transaction = await transactionRepository.findById(id);
      if (!transaction) throw new AppError(ERROR_CODES.NOT_FOUND, "Transaction not found", 404);

      if (!VALID_STATUS_TRANSITIONS[transaction.status]?.includes(input.status)) {
        throw new AppError(ERROR_CODES.INVALID_STATUS_TRANSITION, "Invalid transaction status transition", 422);
      }

      const updated = await transactionRepository.updateStatus(id, {
        status: input.status,
        completedAt: input.status === TRANSACTION_STATUSES.COMPLETED ? new Date() : transaction.completedAt,
        statusLogs: {
          create: {
            fromStatus: transaction.status,
            toStatus: input.status,
            changedByUser: { connect: { id: BigInt(currentUser.id) } },
            note: input.note
          }
        }
      });

      if (
        transaction.transactionType === TRANSACTION_TYPES.DELIVERY_EXCHANGE &&
        input.status === TRANSACTION_STATUSES.COMPLETED
      ) {
        await this.inventoryService.applyMovements(
          transaction.items.flatMap((item) => [
            {
              productId: item.productId,
              transactionId: transaction.id,
              movementType: INVENTORY_MOVEMENT_TYPES.FULL_OUT,
              quantity: item.quantity,
              note: "Delivery exchange completed"
            },
            {
              productId: item.productId,
              transactionId: transaction.id,
              movementType: INVENTORY_MOVEMENT_TYPES.EMPTY_IN,
              quantity: item.quantity,
              note: "Delivery exchange completed"
            }
          ]),
          tx
        );
      }

      return updated;
    });
  }

  cancel(id: bigint, currentUser: AuthUser) {
    return this.changeStatus(id, { status: TRANSACTION_STATUSES.CANCELLED, note: "Cancelled transaction" }, currentUser);
  }

  private resolveUnitPrice(transactionType: string, product: { exchangeSalePrice: Prisma.Decimal; fullTankPrice: Prisma.Decimal }) {
    if (transactionType === TRANSACTION_TYPES.BUY_FULL_TANK) return Number(product.fullTankPrice);
    return Number(product.exchangeSalePrice);
  }

  private async applyCompletedEffects(input: CreateTransactionInput, transactionId: bigint, tx: Prisma.TransactionClient) {
    const movementItems: MovementInput[] = input.items.flatMap((item): MovementInput[] => {
      if (input.transactionType === TRANSACTION_TYPES.WALK_IN_EXCHANGE) {
        return [
          {
            productId: item.productId,
            transactionId,
            movementType: INVENTORY_MOVEMENT_TYPES.FULL_OUT,
            quantity: item.quantity,
            note: "Walk-in exchange"
          },
          {
            productId: item.productId,
            transactionId,
            movementType: INVENTORY_MOVEMENT_TYPES.EMPTY_IN,
            quantity: item.quantity,
            note: "Walk-in exchange"
          }
        ];
      }
      if (input.transactionType === TRANSACTION_TYPES.BORROW_CYLINDER) {
        return [
          {
            productId: item.productId,
            transactionId,
            movementType: INVENTORY_MOVEMENT_TYPES.LOAN_OUT,
            quantity: item.quantity,
            note: "Borrow cylinder"
          }
        ];
      }
      if (input.transactionType === TRANSACTION_TYPES.RETURN_CYLINDER) {
        return [
          {
            productId: item.productId,
            transactionId,
            movementType: INVENTORY_MOVEMENT_TYPES.LOAN_RETURN,
            quantity: item.quantity,
            note: "Return cylinder"
          }
        ];
      }
      if (input.transactionType === TRANSACTION_TYPES.BUY_FULL_TANK) {
        return [
          {
            productId: item.productId,
            transactionId,
            movementType: INVENTORY_MOVEMENT_TYPES.FULL_OUT,
            quantity: item.quantity,
            note: "Buy full tank"
          }
        ];
      }
      return [];
    });

    await this.inventoryService.applyMovements(movementItems, tx);

    if (input.transactionType === TRANSACTION_TYPES.BORROW_CYLINDER) {
      const transaction = await new TransactionRepository(tx).findById(transactionId);
      for (const item of transaction?.items ?? []) {
        if (item.itemAction !== ITEM_ACTIONS.BORROW) continue;
        await tx.cylinderLoan.create({
          data: {
            transactionId,
            transactionItemId: item.id,
            customerId: input.customerId,
            customerNameSnapshot: input.customerName,
            customerPhoneSnapshot: input.customerPhone,
            customerAddressSnapshot: input.customerAddress,
            productId: item.productId,
            quantity: item.quantity,
            loanStatus: LOAN_STATUSES.BORROWED,
            borrowedDate: toDateOnly(),
            expectedReturnDate: input.expectedReturnDate,
            depositAmount: input.depositAmount,
            note: input.note
          }
        });
      }
    }
  }
}
