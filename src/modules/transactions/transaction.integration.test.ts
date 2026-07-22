import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../app";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { ROLE_CODES } from "../../constants/role.constants";
import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../../constants/transaction.constants";
import type { AuthenticatedRequestUser } from "../../shared/types/auth.types";
import type { Clock } from "../../shared/utils/date";
import { PrismaTransactionRepository, PrismaTransactionRunner } from "./transaction.repository";
import { TransactionService } from "./transaction.service";

const runDatabaseTests = process.env.RUN_TRANSACTION_DB_TESTS === "true";
const fixedNow = new Date("2026-07-22T03:00:00.000Z");
const clock: Clock = { now: () => fixedNow };
let adminUser: AuthenticatedRequestUser;
let staffUserId: string;

function service(): TransactionService {
  return new TransactionService(
    new PrismaTransactionRepository(prisma),
    new PrismaTransactionRunner(prisma),
    clock
  );
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
      data: { roleId: adminRole.id, name: "Test Admin", username: "integration_admin", passwordHash: "not-used" }
    }),
    prisma.user.create({
      data: { roleId: staffRole.id, name: "Test Staff", username: "integration_staff", passwordHash: "not-used" }
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

async function createProduct(options: { brand?: string; fullQty?: number; emptyQty?: number; loanedQty?: number; isActive?: boolean } = {}) {
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

function token(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: "1h" });
}

describe.skipIf(!runDatabaseTests)("transaction PostgreSQL integration", () => {
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

  it("supports list filters, Bangkok dates, pagination, ordered detail, initial logs, and immutable snapshots", async () => {
    const product = await createProduct({ brand: "Original Brand", fullQty: 20 });
    const secondProduct = await createProduct({ brand: "Second Brand", fullQty: 20 });
    const transactions = service();
    const delivery = await transactions.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "Somchai Searchable",
      customerPhone: "0812345678",
      customerAddress: "Bangkok",
      items: [
        { productId: product.id.toString(), quantity: 2 },
        { productId: secondProduct.id.toString(), quantity: 1 }
      ]
    }, adminUser);
    const purchase = await transactions.create({
      transactionType: TRANSACTION_TYPES.BUY_FULL_TANK,
      customerName: "Another Customer",
      items: [{ productId: product.id.toString(), quantity: 1 }]
    }, adminUser);
    await transactions.changeStatus(delivery.id, { status: TRANSACTION_STATUSES.IN_PROGRESS }, adminUser);

    await prisma.transaction.update({
      where: { id: BigInt(delivery.id) },
      data: { createdAt: new Date("2026-07-21T17:00:00.000Z") }
    });
    await prisma.transaction.update({
      where: { id: BigInt(purchase.id) },
      data: { createdAt: new Date("2026-07-22T17:00:00.000Z") }
    });

    const filtered = await transactions.list({
      page: 1,
      limit: 20,
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      status: TRANSACTION_STATUSES.IN_PROGRESS,
      dateFrom: "2026-07-22",
      dateTo: "2026-07-22",
      search: "searchable"
    });
    expect(filtered.transactions).toHaveLength(1);
    expect(filtered.transactions[0].id).toBe(delivery.id);

    const dateFiltered = await transactions.list({ page: 1, limit: 20, dateFrom: "2026-07-22", dateTo: "2026-07-22" });
    expect(dateFiltered.transactions.map((transaction) => transaction.id)).toEqual([delivery.id]);

    const paginated = await transactions.list({ page: 1, limit: 1 });
    expect(paginated.pagination).toMatchObject({ page: 1, limit: 1, totalItems: 2, totalPages: 2 });
    expect(paginated.transactions[0].id).toBe(purchase.id);

    await prisma.product.update({
      where: { id: product.id },
      data: { brand: "Changed Brand", exchangeSalePrice: new Prisma.Decimal("999.00") }
    });
    const detail = await transactions.get(delivery.id);
    expect(detail.items[0]).toMatchObject({ productBrand: "Original Brand", unitPrice: "390.00" });
    expect(detail.items).toHaveLength(2);
    expect(detail.items.map((item) => BigInt(item.id))).toEqual([...detail.items.map((item) => BigInt(item.id))].sort((a, b) => a < b ? -1 : 1));
    expect(detail.statusLogs).toHaveLength(2);
    expect(detail.statusLogs[0]).toMatchObject({ fromStatus: null, toStatus: TRANSACTION_STATUSES.PENDING });
    expect(detail.statusLogs[1]).toMatchObject({ fromStatus: TRANSACTION_STATUSES.PENDING, toStatus: TRANSACTION_STATUSES.IN_PROGRESS });
  });

  it("executes delivery, cancellation, walk-in, borrow, and full-tank workflows with correct balances and movements", async () => {
    const deliveryProduct = await createProduct({ brand: "Delivery", fullQty: 10 });
    const walkInProduct = await createProduct({ brand: "Walk-in", fullQty: 10, emptyQty: 1 });
    const borrowProduct = await createProduct({ brand: "Borrow", fullQty: 10 });
    const buyProduct = await createProduct({ brand: "Buy", fullQty: 10, emptyQty: 4 });
    const transactions = service();

    const delivery = await transactions.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "Delivery Customer",
      customerAddress: "Address",
      items: [{ productId: deliveryProduct.id.toString(), quantity: 2 }]
    }, adminUser);
    expect(delivery).toMatchObject({ status: TRANSACTION_STATUSES.PENDING, queueNo: 1, queueDate: "2026-07-22" });
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: deliveryProduct.id } })).toMatchObject({ fullQty: 10 });
    await transactions.cancel(delivery.id, { note: "Cancelled" }, adminUser);
    expect(await prisma.inventoryMovement.count({ where: { transactionId: BigInt(delivery.id) } })).toBe(0);

    const walkIn = await transactions.create({
      transactionType: TRANSACTION_TYPES.WALK_IN_EXCHANGE,
      customerName: "Walk-in Customer",
      items: [{ productId: walkInProduct.id.toString(), quantity: 2 }]
    }, adminUser);
    expect(walkIn.status).toBe(TRANSACTION_STATUSES.COMPLETED);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: walkInProduct.id } })).toMatchObject({ fullQty: 8, emptyQty: 3 });
    expect(await prisma.inventoryMovement.count({ where: { transactionId: BigInt(walkIn.id) } })).toBe(2);

    const borrow = await transactions.create({
      transactionType: TRANSACTION_TYPES.BORROW_CYLINDER,
      customerName: "Borrow Customer",
      items: [{ productId: borrowProduct.id.toString(), quantity: 1, depositAmount: "500.00" }]
    }, adminUser);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: borrowProduct.id } })).toMatchObject({ fullQty: 9, loanedQty: 1 });
    const loan = await prisma.cylinderLoan.findFirstOrThrow({ where: { transactionId: BigInt(borrow.id) } });
    expect(loan).toMatchObject({ quantity: 1, returnedQuantity: 0, expectedReturnDate: null, loanStatus: "BORROWED" });
    expect(loan.depositAmount.toFixed(2)).toBe("500.00");

    const purchase = await transactions.create({
      transactionType: TRANSACTION_TYPES.BUY_FULL_TANK,
      customerName: "Buy Customer",
      items: [{ productId: buyProduct.id.toString(), quantity: 3 }]
    }, adminUser);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: buyProduct.id } })).toMatchObject({ fullQty: 7, emptyQty: 4 });
    expect(await prisma.inventoryMovement.count({ where: { transactionId: BigInt(purchase.id) } })).toBe(1);
  });

  it("rolls back transaction rows, movements, and earlier stock updates when a later product has insufficient stock", async () => {
    const sufficient = await createProduct({ brand: "Sufficient", fullQty: 5 });
    const insufficient = await createProduct({ brand: "Insufficient", fullQty: 0 });
    await expect(service().create({
      transactionType: TRANSACTION_TYPES.WALK_IN_EXCHANGE,
      customerName: "Rollback Customer",
      items: [
        { productId: sufficient.id.toString(), quantity: 2 },
        { productId: insufficient.id.toString(), quantity: 1 }
      ]
    }, adminUser)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.inventoryMovement.count()).toBe(0);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: sufficient.id } })).toMatchObject({ fullQty: 5, emptyQty: 0 });
  });

  it("allocates unique daily numbers, prevents negative stock races, and completes a delivery exactly once", async () => {
    const product = await createProduct({ brand: "Concurrent", fullQty: 100 });
    const transactions = service();
    const deliveries = await Promise.all(Array.from({ length: 6 }, (_, index) => transactions.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: `Concurrent ${index}`,
      customerAddress: "Address",
      items: [{ productId: product.id.toString(), quantity: 1 }]
    }, adminUser)));

    expect(new Set(deliveries.map((transaction) => transaction.transactionNo)).size).toBe(6);
    expect(new Set(deliveries.map((transaction) => transaction.queueNo)).size).toBe(6);
    await transactions.changeStatus(deliveries[0].id, { status: TRANSACTION_STATUSES.IN_PROGRESS }, adminUser);
    const completions = await Promise.allSettled(Array.from({ length: 5 }, () =>
      transactions.changeStatus(deliveries[0].id, { status: TRANSACTION_STATUSES.COMPLETED }, adminUser)
    ));
    expect(completions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(completions.filter((result) => result.status === "rejected")).toHaveLength(4);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: product.id } })).toMatchObject({ fullQty: 99, emptyQty: 1 });
    expect(await prisma.inventoryMovement.count({ where: { transactionId: BigInt(deliveries[0].id) } })).toBe(2);

    const scarceProduct = await createProduct({ brand: "Scarce", fullQty: 1 });
    const purchases = await Promise.allSettled(Array.from({ length: 5 }, (_, index) => transactions.create({
      transactionType: TRANSACTION_TYPES.BUY_FULL_TANK,
      customerName: `Stock race ${index}`,
      items: [{ productId: scarceProduct.id.toString(), quantity: 1 }]
    }, adminUser)));
    expect(purchases.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(purchases.filter((result) => result.status === "rejected")).toHaveLength(4);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: scarceProduct.id } })).toMatchObject({ fullQty: 0 });
    expect(await prisma.inventoryMovement.count({ where: { productId: scarceProduct.id } })).toBe(1);
  });

  it("returns authenticated HTTP validation, authorization, domain errors, pagination, and public-only DTOs", async () => {
    const adminToken = token(adminUser.id);
    const staffToken = token(staffUserId);
    const inactive = await createProduct({ brand: "Inactive", isActive: false });
    const empty = await createProduct({ brand: "Empty", fullQty: 0 });

    expect((await request(app).get("/api/transactions").set("Authorization", `Bearer ${staffToken}`)).status).toBe(403);
    expect((await request(app).get("/api/transactions/0").set("Authorization", `Bearer ${adminToken}`)).status).toBe(400);
    expect((await request(app).get("/api/transactions?page=0").set("Authorization", `Bearer ${adminToken}`)).status).toBe(400);
    expect((await request(app).post("/api/transactions").set("Authorization", `Bearer ${adminToken}`).send({
      transactionType: TRANSACTION_TYPES.BUY_FULL_TANK,
      customerName: "Invalid body",
      items: [{ productId: empty.id.toString(), quantity: 1 }],
      status: TRANSACTION_STATUSES.COMPLETED
    })).status).toBe(400);
    expect((await request(app).get("/api/transactions/999999").set("Authorization", `Bearer ${adminToken}`)).status).toBe(404);

    const missingProduct = await request(app).post("/api/transactions").set("Authorization", `Bearer ${adminToken}`).send({
      transactionType: TRANSACTION_TYPES.BUY_FULL_TANK,
      customerName: "Missing",
      items: [{ productId: "999999", quantity: 1 }]
    });
    expect(missingProduct.status).toBe(404);

    const inactiveProduct = await request(app).post("/api/transactions").set("Authorization", `Bearer ${adminToken}`).send({
      transactionType: TRANSACTION_TYPES.BUY_FULL_TANK,
      customerName: "Inactive",
      items: [{ productId: inactive.id.toString(), quantity: 1 }]
    });
    expect(inactiveProduct.status).toBe(409);

    const insufficient = await request(app).post("/api/transactions").set("Authorization", `Bearer ${adminToken}`).send({
      transactionType: TRANSACTION_TYPES.BUY_FULL_TANK,
      customerName: "No stock",
      items: [{ productId: empty.id.toString(), quantity: 1 }]
    });
    expect(insufficient.status).toBe(409);
    expect(insufficient.body.error.code).toBe("INSUFFICIENT_STOCK");

    const delivery = await service().create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "HTTP Customer",
      customerAddress: "Address",
      items: [{ productId: empty.id.toString(), quantity: 1 }]
    }, adminUser);
    const invalidTransition = await request(app)
      .patch(`/api/transactions/${delivery.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: TRANSACTION_STATUSES.COMPLETED });
    expect(invalidTransition.status).toBe(409);
    expect(invalidTransition.body.error.code).toBe("INVALID_STATUS_TRANSITION");

    const created = await request(app).post("/api/transactions").set("Authorization", `Bearer ${adminToken}`).send({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "HTTP Success",
      customerAddress: "Address",
      items: [{ productId: empty.id.toString(), quantity: 1 }]
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      success: true,
      data: { status: TRANSACTION_STATUSES.PENDING },
      meta: { requestId: expect.any(String) }
    });
    const createdId = created.body.data.id as string;
    expect((await request(app).get(`/api/transactions/${createdId}`).set("Authorization", `Bearer ${adminToken}`)).status).toBe(200);
    expect((await request(app).patch(`/api/transactions/${createdId}/status`).set("Authorization", `Bearer ${adminToken}`).send({
      status: TRANSACTION_STATUSES.IN_PROGRESS
    })).status).toBe(200);
    const cancelled = await request(app).post(`/api/transactions/${createdId}/cancel`).set("Authorization", `Bearer ${adminToken}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe(TRANSACTION_STATUSES.CANCELLED);

    const list = await request(app).get("/api/transactions?page=1&limit=1").set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.meta).toMatchObject({ requestId: expect.any(String), pagination: { page: 1, limit: 1, totalItems: 2, totalPages: 2 } });
    expect(typeof list.body.data.transactions[0].id).toBe("string");
    const serialized = JSON.stringify(list.body);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("integration_admin");
    expect(serialized).not.toContain(adminToken);
  });
});
