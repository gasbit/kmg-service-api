import { Prisma } from "@prisma/client";

import { INVENTORY_MOVEMENT_TYPES, type InventoryMovementType } from "../../constants/inventory.constants";
import {
  ALLOWED_STATUS_TRANSITIONS,
  INITIAL_STATUS_BY_TRANSACTION_TYPE,
  ITEM_ACTION_BY_TRANSACTION_TYPE,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type TransactionStatus
} from "../../constants/transaction.constants";
import { RETURNABLE_LOAN_STATUSES } from "../../constants/loan.constants";
import { AppError } from "../../shared/errors/app-error";
import { ERROR_CODES } from "../../shared/errors/error-codes";
import type { AuthenticatedRequestUser } from "../../shared/types/auth.types";
import {
  bangkokBusinessDate,
  bangkokDayEndExclusiveUtc,
  bangkokDayStartUtc,
  databaseDate,
  systemClock,
  type Clock
} from "../../shared/utils/date";
import { mapTransactionDetail, mapTransactionSummary } from "./transaction.mapper";
import { mapLoanDetail, mapReturnTransaction } from "../loans/loan.mapper";
import { PrismaLoanRepository } from "../loans/loan.repository";
import type { LoanRepository } from "../loans/loan.types";
import { deriveTransactionItemPricing } from "./transaction.pricing";
import { PrismaTransactionRepository, PrismaTransactionRunner } from "./transaction.repository";
import type {
  CancelTransactionInput,
  ChangeTransactionStatusInput,
  CreateTransactionInput,
  ListTransactionsInput
} from "./transaction.schema";
import type {
  DatabaseClient,
  PreparedTransactionItem,
  TransactionDetailDto,
  TransactionRepository,
  TransactionRunner,
  ReturnCylinderWorkflowInput,
  ReturnCylinderWorkflowResult
} from "./transaction.types";

const transactionNotFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, "Transaction not found");
const queueTransactionNotFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, "Queue transaction not found");
const insufficientStock = () => new AppError(409, ERROR_CODES.INSUFFICIENT_STOCK, "Insufficient product stock");
const invalidTransition = (from: string, to: string) =>
  new AppError(409, ERROR_CODES.INVALID_STATUS_TRANSITION, `Cannot change transaction status from ${from} to ${to}`);
const loanNotFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, "Loan not found");
const loanConflict = (message: string) => new AppError(409, ERROR_CODES.CONFLICT, message);
const insufficientLoanedInventory = () =>
  new AppError(409, ERROR_CODES.INSUFFICIENT_STOCK, "Insufficient loaned inventory");

function aggregateQuantities(items: Array<{ productId: bigint; quantity: number }>): Map<bigint, number> {
  const quantities = new Map<bigint, number>();
  for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  return quantities;
}

function isTransactionStatus(value: string): value is TransactionStatus {
  return Object.values(TRANSACTION_STATUSES).includes(value as TransactionStatus);
}

export class TransactionService {
  constructor(
    private readonly repository: TransactionRepository = new PrismaTransactionRepository(),
    private readonly transactions: TransactionRunner = new PrismaTransactionRunner(),
    private readonly clock: Clock = systemClock,
    private readonly loanRepository: LoanRepository = new PrismaLoanRepository()
  ) {}

  async list(input: ListTransactionsInput) {
    const result = await this.repository.list({
      ...input,
      createdAtFrom: input.dateFrom ? bangkokDayStartUtc(input.dateFrom) : undefined,
      createdAtToExclusive: input.dateTo ? bangkokDayEndExclusiveUtc(input.dateTo) : undefined
    });
    return {
      transactions: result.transactions.map(mapTransactionSummary),
      pagination: {
        page: input.page,
        limit: input.limit,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / input.limit)
      }
    };
  }

  async get(transactionId: string): Promise<TransactionDetailDto> {
    const transaction = await this.repository.findDetail(transactionId);
    if (!transaction) throw transactionNotFound();
    return mapTransactionDetail(transaction);
  }

  async create(input: CreateTransactionInput, currentUser: AuthenticatedRequestUser): Promise<TransactionDetailDto> {
    try {
      const record = await this.transactions.run(async (client) => this.createInTransaction(input, currentUser, client));
      return mapTransactionDetail(record);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, ERROR_CODES.CONFLICT, "Could not allocate a unique transaction or queue number");
      }
      throw error;
    }
  }

  private async createInTransaction(input: CreateTransactionInput, currentUser: AuthenticatedRequestUser, client: DatabaseClient) {
    const now = this.clock.now();
    const businessDate = bangkokBusinessDate(now);
    const productIds = [...new Set(input.items.map((item) => item.productId))].map(BigInt);
    const products = await this.repository.findProducts(productIds, client);
    if (products.length !== productIds.length) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "One or more products were not found");
    }
    if (products.some((product) => !product.isActive)) {
      throw new AppError(409, ERROR_CODES.CONFLICT, "Inactive products cannot be used in new transactions");
    }

    const productsById = new Map(products.map((product) => [product.id.toString(), product]));
    const itemAction = ITEM_ACTION_BY_TRANSACTION_TYPE[input.transactionType];
    const preparedItems: PreparedTransactionItem[] = input.items.map((item) => {
      const product = productsById.get(item.productId);
      if (!product) throw new AppError(404, ERROR_CODES.NOT_FOUND, "Product not found");
      const pricing = deriveTransactionItemPricing(input.transactionType, product, item.quantity);
      const expectedReturnDate = "expectedReturnDate" in item ? item.expectedReturnDate : undefined;
      const depositAmount = "depositAmount" in item ? item.depositAmount : undefined;
      return {
        productId: product.id,
        productBrandSnapshot: product.brand,
        productWeightSnapshot: product.weightKg,
        quantity: item.quantity,
        unitPrice: pricing.unitPrice,
        costPrice: pricing.costPrice,
        lineTotal: pricing.lineTotal,
        itemAction,
        note: item.note ?? null,
        expectedReturnDate: expectedReturnDate ? databaseDate(expectedReturnDate) : null,
        depositAmount: new Prisma.Decimal(depositAmount ?? 0)
      };
    });
    const totalAmount = preparedItems.reduce((total, item) => total.add(item.lineTotal), new Prisma.Decimal(0));

    await this.repository.acquireDailyLock(businessDate, client);
    const sequence = await this.repository.nextTransactionSequence(businessDate, client);
    const isDelivery = input.transactionType === TRANSACTION_TYPES.DELIVERY_EXCHANGE;
    const queueNo = isDelivery ? await this.repository.nextQueueNumber(businessDate, client) : null;
    const status = INITIAL_STATUS_BY_TRANSACTION_TYPE[input.transactionType];
    const created = await this.repository.create({
      transactionNo: `TX-${businessDate.replaceAll("-", "")}-${String(sequence).padStart(4, "0")}`,
      transactionType: input.transactionType,
      status,
      queueDate: isDelivery ? databaseDate(businessDate) : null,
      queueNo,
      customerName: input.customerName,
      customerPhone: input.customerPhone ?? null,
      customerAddress: input.customerAddress ?? null,
      totalAmount,
      note: input.note ?? null,
      createdBy: BigInt(currentUser.id),
      completedAt: status === TRANSACTION_STATUSES.COMPLETED ? now : null,
      changedAt: now,
      items: preparedItems
    }, client);

    await this.applyCreateEffects(input.transactionType, created, preparedItems, {
      customerName: input.customerName,
      customerPhone: input.customerPhone ?? null,
      customerAddress: input.customerAddress ?? null,
      borrowedDate: databaseDate(businessDate)
    }, client);

    const detail = await this.repository.findDetail(created.id, client);
    if (!detail) throw new Error("Created transaction could not be read");
    return detail;
  }

  private async applyCreateEffects(
    transactionType: CreateTransactionInput["transactionType"],
    created: { id: bigint; items: Array<{ id: bigint; productId: bigint }> },
    items: PreparedTransactionItem[],
    customer: { customerName: string; customerPhone: string | null; customerAddress: string | null; borrowedDate: Date },
    client: DatabaseClient
  ): Promise<void> {
    if (transactionType === TRANSACTION_TYPES.DELIVERY_EXCHANGE) return;

    const quantities = aggregateQuantities(items);
    for (const [productId, quantity] of quantities) {
      const updated = transactionType === TRANSACTION_TYPES.WALK_IN_EXCHANGE
        ? await this.repository.applyExchangeStock(productId, quantity, client)
        : transactionType === TRANSACTION_TYPES.BORROW_CYLINDER
          ? await this.repository.applyLoanOut(productId, quantity, client)
          : await this.repository.applyFullOut(productId, quantity, client);
      if (!updated) throw insufficientStock();
    }

    const movements: Array<{ productId: bigint; movementType: InventoryMovementType; quantity: number; note: string | null }> = [];
    for (const item of items) {
      const common = { productId: item.productId, quantity: item.quantity, note: item.note };
      if (transactionType === TRANSACTION_TYPES.WALK_IN_EXCHANGE) {
        movements.push(
          { ...common, movementType: INVENTORY_MOVEMENT_TYPES.FULL_OUT },
          { ...common, movementType: INVENTORY_MOVEMENT_TYPES.EMPTY_IN }
        );
      } else {
        movements.push({
          ...common,
          movementType: transactionType === TRANSACTION_TYPES.BORROW_CYLINDER
            ? INVENTORY_MOVEMENT_TYPES.LOAN_OUT
            : INVENTORY_MOVEMENT_TYPES.FULL_OUT
        });
      }
    }
    await this.repository.createMovements(created.id, movements, client);

    if (transactionType === TRANSACTION_TYPES.BORROW_CYLINDER) {
      await this.repository.createLoans(items.map((item, index) => ({
        transactionId: created.id,
        transactionItemId: created.items[index].id,
        customerName: customer.customerName,
        customerPhone: customer.customerPhone,
        customerAddress: customer.customerAddress,
        productId: item.productId,
        quantity: item.quantity,
        borrowedDate: customer.borrowedDate,
        expectedReturnDate: item.expectedReturnDate,
        depositAmount: item.depositAmount,
        note: item.note
      })), client);
    }
  }

  changeStatus(
    transactionId: string,
    input: ChangeTransactionStatusInput,
    currentUser: AuthenticatedRequestUser
  ): Promise<TransactionDetailDto> {
    return this.changeStatusWithScope(transactionId, input, currentUser, false);
  }

  changeQueueStatus(
    transactionId: string,
    input: ChangeTransactionStatusInput,
    currentUser: AuthenticatedRequestUser
  ): Promise<TransactionDetailDto> {
    return this.changeStatusWithScope(transactionId, input, currentUser, true);
  }

  private async changeStatusWithScope(
    transactionId: string,
    input: ChangeTransactionStatusInput,
    currentUser: AuthenticatedRequestUser,
    requireDeliveryQueue: boolean
  ): Promise<TransactionDetailDto> {
    const record = await this.transactions.run(async (client) => {
      const id = BigInt(transactionId);
      const current = await this.repository.findForStatus(id, client);
      if (!current) throw requireDeliveryQueue ? queueTransactionNotFound() : transactionNotFound();
      if (
        requireDeliveryQueue
        && (
          current.transactionType !== TRANSACTION_TYPES.DELIVERY_EXCHANGE
          || current.queueDate === null
          || current.queueNo === null
        )
      ) {
        throw queueTransactionNotFound();
      }
      if (!isTransactionStatus(current.status) || !ALLOWED_STATUS_TRANSITIONS[current.status].includes(input.status)) {
        throw invalidTransition(current.status, input.status);
      }

      const now = this.clock.now();
      const completedAt = input.status === TRANSACTION_STATUSES.COMPLETED ? now : null;
      const claimed = await this.repository.claimStatus(id, current.status, input.status, completedAt, client);
      if (!claimed) throw invalidTransition(current.status, input.status);

      if (current.transactionType === TRANSACTION_TYPES.DELIVERY_EXCHANGE && input.status === TRANSACTION_STATUSES.COMPLETED) {
        const quantities = aggregateQuantities(current.items);
        for (const [productId, quantity] of quantities) {
          if (!await this.repository.applyExchangeStock(productId, quantity, client)) throw insufficientStock();
        }
        await this.repository.createMovements(id, current.items.flatMap((item) => [
          { productId: item.productId, movementType: INVENTORY_MOVEMENT_TYPES.FULL_OUT, quantity: item.quantity, note: input.note ?? null },
          { productId: item.productId, movementType: INVENTORY_MOVEMENT_TYPES.EMPTY_IN, quantity: item.quantity, note: input.note ?? null }
        ]), client);
      }

      await this.repository.createStatusLog(
        id,
        current.status,
        input.status,
        BigInt(currentUser.id),
        now,
        input.note ?? null,
        client
      );
      const detail = await this.repository.findDetail(id, client);
      if (!detail) throw transactionNotFound();
      return detail;
    });
    return mapTransactionDetail(record);
  }

  cancel(transactionId: string, input: CancelTransactionInput, currentUser: AuthenticatedRequestUser) {
    return this.changeStatus(transactionId, { status: TRANSACTION_STATUSES.CANCELLED, note: input.note }, currentUser);
  }

  async returnCylinder(
    input: ReturnCylinderWorkflowInput,
    currentUser: AuthenticatedRequestUser
  ): Promise<ReturnCylinderWorkflowResult> {
    try {
      return await this.transactions.run(async (client) => {
        const loanId = BigInt(input.loanId);
        const source = await this.loanRepository.findReturnSource(loanId, client);
        if (!source) throw loanNotFound();
        if (!RETURNABLE_LOAN_STATUSES.includes(source.loanStatus as (typeof RETURNABLE_LOAN_STATUSES)[number])) {
          throw loanConflict(`Loan cannot be returned from status ${source.loanStatus}`);
        }
        const remainingQuantity = source.quantity - source.returnedQuantity;
        if (input.quantity > remainingQuantity) {
          throw loanConflict("Return quantity exceeds remaining loan quantity");
        }

        const now = this.clock.now();
        const businessDate = bangkokBusinessDate(now);
        const claimed = await this.loanRepository.claimReturn(loanId, input.quantity, businessDate, client);
        if (!claimed) {
          const current = await this.loanRepository.findReturnSource(loanId, client);
          if (!current) throw loanNotFound();
          if (!RETURNABLE_LOAN_STATUSES.includes(current.loanStatus as (typeof RETURNABLE_LOAN_STATUSES)[number])) {
            throw loanConflict(`Loan cannot be returned from status ${current.loanStatus}`);
          }
          if (input.quantity > current.quantity - current.returnedQuantity) {
            throw loanConflict("Return quantity exceeds remaining loan quantity");
          }
          throw loanConflict("Loan return was already claimed by another request");
        }

        await this.repository.acquireDailyLock(businessDate, client);
        const sequence = await this.repository.nextTransactionSequence(businessDate, client);
        const zero = new Prisma.Decimal(0);
        const created = await this.repository.create({
          transactionNo: `TX-${businessDate.replaceAll("-", "")}-${String(sequence).padStart(4, "0")}`,
          transactionType: TRANSACTION_TYPES.RETURN_CYLINDER,
          status: TRANSACTION_STATUSES.COMPLETED,
          queueDate: null,
          queueNo: null,
          customerName: source.customerNameSnapshot,
          customerPhone: source.customerPhoneSnapshot,
          customerAddress: source.customerAddressSnapshot,
          totalAmount: zero,
          note: input.note ?? null,
          createdBy: BigInt(currentUser.id),
          completedAt: now,
          changedAt: now,
          initialStatusLogNote: input.note ?? null,
          items: [{
            productId: source.productId,
            sourceLoanId: source.id,
            productBrandSnapshot: source.transactionItem.productBrandSnapshot,
            productWeightSnapshot: source.transactionItem.productWeightSnapshot,
            quantity: input.quantity,
            unitPrice: zero,
            costPrice: source.transactionItem.costPrice,
            lineTotal: zero,
            itemAction: ITEM_ACTION_BY_TRANSACTION_TYPE[TRANSACTION_TYPES.RETURN_CYLINDER],
            note: input.note ?? null,
            expectedReturnDate: null,
            depositAmount: zero
          }]
        }, client);

        if (!await this.repository.applyLoanReturn(source.productId, input.quantity, client)) {
          throw insufficientLoanedInventory();
        }
        await this.repository.createMovements(created.id, [{
          productId: source.productId,
          movementType: INVENTORY_MOVEMENT_TYPES.LOAN_RETURN,
          quantity: input.quantity,
          note: input.note ?? null
        }], client);

        const [transaction, loan] = await Promise.all([
          this.repository.findDetail(created.id, client),
          this.loanRepository.findDetail(source.id, client)
        ]);
        if (!transaction || !loan) throw new Error("Created loan return could not be read");
        return {
          transaction: mapReturnTransaction(mapTransactionDetail(transaction)),
          loan: mapLoanDetail(loan, businessDate)
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw loanConflict("Could not allocate a unique return transaction number");
      }
      throw error;
    }
  }
}
