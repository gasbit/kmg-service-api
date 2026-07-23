import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../app";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { LOAN_STATUSES } from "../../constants/loan.constants";
import { ROLE_CODES } from "../../constants/role.constants";
import { TRANSACTION_TYPES } from "../../constants/transaction.constants";
import type { AuthenticatedRequestUser } from "../../shared/types/auth.types";
import type { Clock } from "../../shared/utils/date";
import { PrismaTransactionRepository, PrismaTransactionRunner } from "../transactions/transaction.repository";
import { TransactionService } from "../transactions/transaction.service";
import { PrismaLoanRepository } from "./loan.repository";
import { LoanService } from "./loan.service";

const runDatabaseTests = process.env.RUN_LOAN_DB_TESTS === "true";
const fixedNow = new Date("2026-07-22T03:00:00.000Z");
const clock: Clock = { now: () => fixedNow };
let adminUser: AuthenticatedRequestUser;
let staffUserId: string;

function transactionService(): TransactionService {
  return new TransactionService(
    new PrismaTransactionRepository(prisma),
    new PrismaTransactionRunner(prisma),
    clock,
    new PrismaLoanRepository(prisma)
  );
}

function loanService(): LoanService {
  return new LoanService(new PrismaLoanRepository(prisma), clock);
}

async function cleanTestDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      inventory_movements,
      cylinder_loans,
      transaction_status_logs,
      transaction_items,
      transactions,
      inventory_balances,
      product_images,
      products,
      customers,
      users,
      roles
    RESTART IDENTITY CASCADE
  `);
}

async function seedUsers(): Promise<void> {
  const adminRole = await prisma.role.create({ data: { code: ROLE_CODES.ADMIN, name: "Admin" } });
  const staffRole = await prisma.role.create({ data: { code: "STAFF", name: "Staff" } });
  const [admin, staff] = await Promise.all([
    prisma.user.create({
      data: { roleId: adminRole.id, name: "Test Admin", username: "loan_admin", passwordHash: "not-used" }
    }),
    prisma.user.create({
      data: { roleId: staffRole.id, name: "Test Staff", username: "loan_staff", passwordHash: "not-used" }
    })
  ]);
  adminUser = {
    id: admin.id.toString(),
    name: admin.name,
    username: admin.username,
    role: { id: adminRole.id.toString(), code: adminRole.code, name: adminRole.name }
  };
  staffUserId = staff.id.toString();
}

async function createProduct(options: {
  brand?: string;
  fullQty?: number;
  emptyQty?: number;
  loanedQty?: number;
  isActive?: boolean;
} = {}) {
  return prisma.product.create({
    data: {
      brand: options.brand ?? "PTT",
      weightKg: new Prisma.Decimal("15.00"),
      exchangeCostPrice: new Prisma.Decimal("330.00"),
      exchangeSalePrice: new Prisma.Decimal("390.00"),
      fullTankCostPrice: new Prisma.Decimal("1850.00"),
      fullTankPrice: new Prisma.Decimal("2450.00"),
      isActive: options.isActive ?? true,
      inventoryBalance: {
        create: {
          fullQty: options.fullQty ?? 10,
          emptyQty: options.emptyQty ?? 0,
          loanedQty: options.loanedQty ?? 0
        }
      }
    }
  });
}

async function borrow(options: {
  productId: bigint;
  quantity?: number;
  customerName?: string;
  customerPhone?: string;
  expectedReturnDate?: string;
  depositAmount?: string;
}) {
  const transaction = await transactionService().create({
    transactionType: TRANSACTION_TYPES.BORROW_CYLINDER,
    customerName: options.customerName ?? "Borrow Customer",
    customerPhone: options.customerPhone,
    items: [{
      productId: options.productId.toString(),
      quantity: options.quantity ?? 1,
      expectedReturnDate: options.expectedReturnDate,
      depositAmount: options.depositAmount ?? "500.00"
    }]
  }, adminUser);
  const loan = await prisma.cylinderLoan.findFirstOrThrow({
    where: { transactionId: BigInt(transaction.id) }
  });
  return { transaction, loan };
}

function token(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: "1h" });
}

describe.skipIf(!runDatabaseTests)("loan PostgreSQL integration", () => {
  beforeAll(() => {
    const databaseName = new URL(env.DATABASE_URL).pathname.slice(1);
    if (!databaseName.endsWith("_test")) throw new Error("Refusing to clean a non-test database");
  });

  beforeEach(async () => {
    await cleanTestDatabase();
    await seedUsers();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await prisma.$disconnect();
  });

  it("supports list filters, snapshot search, overdue derivation, active ordering, and detail", async () => {
    const overdueProduct = await createProduct({ brand: "Original Overdue Brand", fullQty: 10 });
    const dueTodayProduct = await createProduct({ brand: "Due Today Brand", fullQty: 10 });
    const noDueProduct = await createProduct({ brand: "No Due Brand", fullQty: 10 });
    const overdue = await borrow({
      productId: overdueProduct.id,
      customerName: "Somchai Search",
      customerPhone: "0812345678",
      expectedReturnDate: "2026-07-21"
    });
    const dueToday = await borrow({
      productId: dueTodayProduct.id,
      customerName: "Another Customer",
      expectedReturnDate: "2026-07-22"
    });
    const noDue = await borrow({
      productId: noDueProduct.id,
      customerName: "No Due Customer"
    });

    await prisma.product.update({
      where: { id: overdueProduct.id },
      data: { brand: "Changed Current Brand" }
    });
    await prisma.cylinderLoan.update({
      where: { id: overdue.loan.id },
      data: { loanStatus: LOAN_STATUSES.OVERDUE }
    });

    const loans = loanService();
    const searched = await loans.list({
      page: 1,
      limit: 20,
      status: LOAN_STATUSES.OVERDUE,
      isOverdue: true,
      search: "original overdue"
    });
    expect(searched.loans).toHaveLength(1);
    expect(searched.loans[0]).toMatchObject({
      id: overdue.loan.id.toString(),
      productBrand: "Original Overdue Brand",
      isOverdue: true,
      remainingQuantity: 1
    });
    expect((await loans.list({ page: 1, limit: 20, search: "somchai" })).loans).toHaveLength(1);
    expect((await loans.list({ page: 1, limit: 20, search: "081234" })).loans).toHaveLength(1);

    const active = await loans.listActive({ page: 1, limit: 20 });
    expect(active.loans.map((loan) => loan.id)).toEqual([
      overdue.loan.id.toString(),
      dueToday.loan.id.toString(),
      noDue.loan.id.toString()
    ]);
    expect(active.loans.map((loan) => loan.isOverdue)).toEqual([true, false, false]);

    const detail = await loans.get(overdue.loan.id.toString());
    expect(detail).toMatchObject({
      borrowTransactionItemId: overdue.loan.transactionItemId.toString(),
      productBrand: "Original Overdue Brand",
      returnHistory: []
    });
  });

  it("records partial and full returns with snapshots, history, loan state, and inventory effects", async () => {
    const product = await createProduct({ brand: "Original Brand", fullQty: 10, emptyQty: 2 });
    const borrowed = await borrow({
      productId: product.id,
      quantity: 3,
      customerName: "ร้านอาหารอิ่มดี",
      customerPhone: "0899999999",
      depositAmount: "500.00"
    });
    await prisma.product.update({
      where: { id: product.id },
      data: {
        brand: "Changed Brand",
        exchangeCostPrice: new Prisma.Decimal("999.00"),
        isActive: false
      }
    });

    const transactions = transactionService();
    const partial = await transactions.returnCylinder({
      loanId: borrowed.loan.id.toString(),
      quantity: 1,
      note: "คืนบางส่วน"
    }, adminUser);
    expect(partial.transaction).toMatchObject({
      transactionType: TRANSACTION_TYPES.RETURN_CYLINDER,
      status: "COMPLETED",
      totalAmount: "0.00",
      note: "คืนบางส่วน",
      item: {
        productBrand: "Original Brand",
        costPrice: "330.00",
        unitPrice: "0.00",
        lineTotal: "0.00",
        quantity: 1
      }
    });
    expect(partial.loan).toMatchObject({
      returnedQuantity: 1,
      remainingQuantity: 2,
      loanStatus: LOAN_STATUSES.PARTIAL_RETURNED,
      returnedDate: null,
      depositAmount: "500.00"
    });

    const full = await transactions.returnCylinder({
      loanId: borrowed.loan.id.toString(),
      quantity: 2,
      note: "คืนครบ"
    }, adminUser);
    expect(full.loan).toMatchObject({
      returnedQuantity: 3,
      remainingQuantity: 0,
      loanStatus: LOAN_STATUSES.RETURNED,
      returnedDate: "2026-07-22"
    });
    expect(full.loan.returnHistory.map((item) => item.quantity)).toEqual([1, 2]);
    expect(full.loan.returnHistory.every((item) => item.returnedDate === "2026-07-22")).toBe(true);
    expect((await loanService().listActive({ page: 1, limit: 20 })).loans).toHaveLength(0);

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: product.id } });
    expect(balance).toMatchObject({ fullQty: 7, emptyQty: 5, loanedQty: 0 });
    expect(await prisma.inventoryMovement.count({
      where: { productId: product.id, movementType: "LOAN_RETURN" }
    })).toBe(2);
    const returnItems = await prisma.transactionItem.findMany({
      where: { sourceLoanId: borrowed.loan.id }
    });
    expect(returnItems).toHaveLength(2);
    expect(returnItems.reduce((total, item) => total + item.quantity, 0)).toBe(3);
  });

  it("rolls back inventory mismatches and prevents concurrent over-return", async () => {
    const mismatchProduct = await createProduct({ brand: "Mismatch", fullQty: 2 });
    const mismatch = await borrow({ productId: mismatchProduct.id, quantity: 2 });
    await prisma.inventoryBalance.update({
      where: { productId: mismatchProduct.id },
      data: { loanedQty: 0 }
    });
    await expect(transactionService().returnCylinder({
      loanId: mismatch.loan.id.toString(),
      quantity: 1
    }, adminUser)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await prisma.cylinderLoan.findUniqueOrThrow({ where: { id: mismatch.loan.id } }))
      .toMatchObject({ returnedQuantity: 0, loanStatus: LOAN_STATUSES.BORROWED });
    expect(await prisma.transaction.count({ where: { transactionType: TRANSACTION_TYPES.RETURN_CYLINDER } })).toBe(0);

    const concurrentProduct = await createProduct({ brand: "Concurrent", fullQty: 3 });
    const concurrent = await borrow({ productId: concurrentProduct.id, quantity: 3 });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () =>
      transactionService().returnCylinder({
        loanId: concurrent.loan.id.toString(),
        quantity: 1
      }, adminUser)
    ));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(2);
    expect(await prisma.cylinderLoan.findUniqueOrThrow({ where: { id: concurrent.loan.id } }))
      .toMatchObject({ returnedQuantity: 3, loanStatus: LOAN_STATUSES.RETURNED });
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: concurrentProduct.id } }))
      .toMatchObject({ loanedQty: 0, emptyQty: 3 });
    expect(await prisma.transaction.count({ where: { transactionType: TRANSACTION_TYPES.RETURN_CYLINDER } })).toBe(3);
    expect(await prisma.inventoryMovement.count({
      where: { productId: concurrentProduct.id, movementType: "LOAN_RETURN" }
    })).toBe(3);
    const returnTransactions = await prisma.transaction.findMany({
      where: { transactionType: TRANSACTION_TYPES.RETURN_CYLINDER }
    });
    expect(new Set(returnTransactions.map((transaction) => transaction.transactionNo)).size).toBe(3);
  });

  it("rolls back loan, transaction, balance, and item when movement creation fails", async () => {
    const product = await createProduct({ brand: "Movement rollback", fullQty: 2 });
    const borrowed = await borrow({ productId: product.id, quantity: 2 });
    class FailingMovementRepository extends PrismaTransactionRepository {
      override async createMovements(): Promise<void> {
        throw new Error("simulated movement failure");
      }
    }
    const service = new TransactionService(
      new FailingMovementRepository(prisma),
      new PrismaTransactionRunner(prisma),
      clock,
      new PrismaLoanRepository(prisma)
    );
    await expect(service.returnCylinder({
      loanId: borrowed.loan.id.toString(),
      quantity: 1
    }, adminUser)).rejects.toThrow("simulated movement failure");
    expect(await prisma.cylinderLoan.findUniqueOrThrow({ where: { id: borrowed.loan.id } }))
      .toMatchObject({ returnedQuantity: 0, loanStatus: LOAN_STATUSES.BORROWED });
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: product.id } }))
      .toMatchObject({ loanedQty: 2, emptyQty: 0 });
    expect(await prisma.transaction.count({ where: { transactionType: TRANSACTION_TYPES.RETURN_CYLINDER } })).toBe(0);
    expect(await prisma.transactionItem.count({ where: { sourceLoanId: borrowed.loan.id } })).toBe(0);
  });

  it("serves authenticated HTTP list/detail/return and validation/authorization errors", async () => {
    const product = await createProduct({ brand: "HTTP Brand", fullQty: 2 });
    const borrowed = await borrow({ productId: product.id, quantity: 2 });
    const adminToken = token(adminUser.id);
    const staffToken = token(staffUserId);

    expect((await request(app).get("/api/loans").set("Authorization", `Bearer ${staffToken}`)).status).toBe(403);
    expect((await request(app).get("/api/loans/0").set("Authorization", `Bearer ${adminToken}`)).status).toBe(400);
    expect((await request(app).get("/api/loans?isOverdue=yes").set("Authorization", `Bearer ${adminToken}`)).status).toBe(400);
    expect((await request(app).get("/api/loans/999999").set("Authorization", `Bearer ${adminToken}`)).status).toBe(404);
    expect((await request(app).post(`/api/loans/${borrowed.loan.id}/return`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity: 0 })).status).toBe(400);

    const list = await request(app)
      .get("/api/loans/active?page=1&limit=20")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      success: true,
      data: { loans: [{ id: borrowed.loan.id.toString() }] },
      meta: {
        requestId: expect.any(String),
        pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 }
      }
    });
    const allLoans = await request(app)
      .get("/api/loans?page=1&limit=20&search=HTTP")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(allLoans.status).toBe(200);
    expect(allLoans.body.data.loans[0].id).toBe(borrowed.loan.id.toString());
    const detail = await request(app)
      .get(`/api/loans/${borrowed.loan.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      id: borrowed.loan.id.toString(),
      returnHistory: []
    });

    const returned = await request(app)
      .post(`/api/loans/${borrowed.loan.id}/return`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity: 1, note: "HTTP return" });
    expect(returned.status).toBe(200);
    expect(returned.body).toMatchObject({
      success: true,
      data: {
        transaction: { transactionType: TRANSACTION_TYPES.RETURN_CYLINDER },
        loan: { returnedQuantity: 1, remainingQuantity: 1 }
      },
      meta: { requestId: expect.any(String) }
    });
    const serialized = JSON.stringify(returned.body);
    expect(serialized).not.toContain("sourceLoanId");
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain(adminToken);

    const excessive = await request(app)
      .post(`/api/loans/${borrowed.loan.id}/return`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity: 2 });
    expect(excessive.status).toBe(409);
    expect(excessive.body.error.code).toBe("CONFLICT");

    expect((await request(app)
      .post(`/api/loans/${borrowed.loan.id}/return`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity: 1 })).status).toBe(200);
    const finalConflict = await request(app)
      .post(`/api/loans/${borrowed.loan.id}/return`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity: 1 });
    expect(finalConflict.status).toBe(409);
    expect(finalConflict.body.error.code).toBe("CONFLICT");

    const mismatchProduct = await createProduct({ brand: "HTTP mismatch", fullQty: 1 });
    const mismatch = await borrow({ productId: mismatchProduct.id, quantity: 1 });
    await prisma.inventoryBalance.update({
      where: { productId: mismatchProduct.id },
      data: { loanedQty: 0 }
    });
    const inventoryConflict = await request(app)
      .post(`/api/loans/${mismatch.loan.id}/return`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ quantity: 1 });
    expect(inventoryConflict.status).toBe(409);
    expect(inventoryConflict.body.error.code).toBe("INSUFFICIENT_STOCK");
  });
});
