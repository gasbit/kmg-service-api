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
import { PrismaTransactionRepository, PrismaTransactionRunner } from "../transactions/transaction.repository";
import { TransactionService } from "../transactions/transaction.service";
import { PrismaQueueRepository } from "./queue.repository";
import { QueueService } from "./queue.service";

const runDatabaseTests = process.env.RUN_QUEUE_DB_TESTS === "true";
const fixedNow = new Date("2026-07-24T03:00:00.000Z");
const clock: Clock = { now: () => fixedNow };
let adminUser: AuthenticatedRequestUser;
let staffUserId: string;

function transactionService(): TransactionService {
  return new TransactionService(
    new PrismaTransactionRepository(prisma),
    new PrismaTransactionRunner(prisma),
    clock
  );
}

function queueService(): QueueService {
  return new QueueService(new PrismaQueueRepository(prisma), clock, transactionService());
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
      data: { roleId: adminRole.id, name: "Queue Admin", username: "queue_admin", passwordHash: "not-used" }
    }),
    prisma.user.create({
      data: { roleId: staffRole.id, name: "Queue Staff", username: "queue_staff", passwordHash: "not-used" }
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

async function createProduct(options: { brand?: string; fullQty?: number } = {}) {
  return prisma.product.create({
    data: {
      brand: options.brand ?? "PTT",
      weightKg: new Prisma.Decimal("15.00"),
      exchangeCostPrice: new Prisma.Decimal("330.00"),
      exchangeSalePrice: new Prisma.Decimal("390.00"),
      fullTankCostPrice: new Prisma.Decimal("1850.00"),
      fullTankPrice: new Prisma.Decimal("2450.00"),
      inventoryBalance: {
        create: { fullQty: options.fullQty ?? 10, emptyQty: 0, loanedQty: 0 }
      }
    }
  });
}

function token(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: "1h" });
}

describe.skipIf(!runDatabaseTests)("queue PostgreSQL integration", () => {
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

  it("reads exact persisted queue dates in queue order and preserves snapshots", async () => {
    const product = await createProduct({ brand: "Original Brand", fullQty: 20 });
    const transactions = transactionService();
    const first = await transactions.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "First Customer",
      customerAddress: "First Address",
      items: [{ productId: product.id.toString(), quantity: 2 }]
    }, adminUser);
    const second = await transactions.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "Second Customer",
      customerAddress: "Second Address",
      items: [{ productId: product.id.toString(), quantity: 1 }]
    }, adminUser);
    await transactions.create({
      transactionType: TRANSACTION_TYPES.WALK_IN_EXCHANGE,
      customerName: "Walk-in",
      items: [{ productId: product.id.toString(), quantity: 1 }]
    }, adminUser);
    await prisma.transaction.update({
      where: { id: BigInt(first.id) },
      data: { createdAt: new Date("2026-07-22T03:00:00.000Z") }
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { brand: "Changed Brand", exchangeSalePrice: new Prisma.Decimal("999.00") }
    });

    const queues = await queueService().listByDate({ date: "2026-07-24" });
    expect(queues.queueDate).toBe("2026-07-24");
    expect(queues.queues.map((queue) => queue.id)).toEqual([first.id, second.id]);
    expect(queues.queues.map((queue) => queue.queueNo)).toEqual([1, 2]);
    expect(queues.queues[0]).toMatchObject({
      customerName: "First Customer",
      totalQuantity: 2,
      items: [{ productBrand: "Original Brand", unitPrice: "390.00" }]
    });
    expect(JSON.stringify(queues)).not.toContain("costPrice");

    await queueService().updateStatus(first.id, { status: TRANSACTION_STATUSES.IN_PROGRESS }, adminUser);
    const pending = await queueService().listByDate({
      date: "2026-07-24",
      status: TRANSACTION_STATUSES.PENDING
    });
    expect(pending.queues.map((queue) => queue.id)).toEqual([second.id]);
    expect((await queueService().listByDate({ date: "2026-07-23" })).queues).toEqual([]);
  });

  it("reuses atomic status effects and completes a queue exactly once", async () => {
    const product = await createProduct({ brand: "Concurrent", fullQty: 5 });
    const delivery = await transactionService().create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "Delivery Customer",
      customerAddress: "Address",
      items: [{ productId: product.id.toString(), quantity: 2 }]
    }, adminUser);
    const queues = queueService();
    await queues.updateStatus(delivery.id, { status: TRANSACTION_STATUSES.IN_PROGRESS }, adminUser);
    const completions = await Promise.allSettled(Array.from({ length: 5 }, () =>
      queues.updateStatus(delivery.id, { status: TRANSACTION_STATUSES.COMPLETED }, adminUser)
    ));
    expect(completions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(completions.filter((result) => result.status === "rejected")).toHaveLength(4);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: product.id } }))
      .toMatchObject({ fullQty: 3, emptyQty: 2 });
    expect(await prisma.inventoryMovement.count({ where: { transactionId: BigInt(delivery.id) } })).toBe(2);
    expect(await prisma.transactionStatusLog.count({ where: { transactionId: BigInt(delivery.id) } })).toBe(3);

    const walkIn = await transactionService().create({
      transactionType: TRANSACTION_TYPES.WALK_IN_EXCHANGE,
      customerName: "Walk-in",
      items: [{ productId: product.id.toString(), quantity: 1 }]
    }, adminUser);
    await expect(queues.updateStatus(
      walkIn.id,
      { status: TRANSACTION_STATUSES.CANCELLED },
      adminUser
    )).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Queue transaction not found"
    });
  });

  it("keeps cancelled and failed queues auditable without inventory side effects", async () => {
    const product = await createProduct({ brand: "Lifecycle", fullQty: 5 });
    const emptyProduct = await createProduct({ brand: "Empty", fullQty: 0 });
    const transactions = transactionService();
    const queues = queueService();

    const cancelled = await transactions.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "Cancelled Customer",
      customerAddress: "Address",
      items: [{ productId: product.id.toString(), quantity: 1 }]
    }, adminUser);
    const cancelledResult = await queues.updateStatus(
      cancelled.id,
      { status: TRANSACTION_STATUSES.CANCELLED, note: "Customer cancelled" },
      adminUser
    );
    expect(cancelledResult).toMatchObject({
      status: TRANSACTION_STATUSES.CANCELLED,
      queueDate: "2026-07-24",
      queueNo: cancelled.queueNo
    });
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: product.id } }))
      .toMatchObject({ fullQty: 5, emptyQty: 0 });
    expect(await prisma.inventoryMovement.count({ where: { transactionId: BigInt(cancelled.id) } })).toBe(0);

    const insufficient = await transactions.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "Insufficient Customer",
      customerAddress: "Address",
      items: [{ productId: emptyProduct.id.toString(), quantity: 1 }]
    }, adminUser);
    await queues.updateStatus(insufficient.id, { status: TRANSACTION_STATUSES.IN_PROGRESS }, adminUser);
    await expect(queues.updateStatus(
      insufficient.id,
      { status: TRANSACTION_STATUSES.COMPLETED },
      adminUser
    )).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: BigInt(insufficient.id) } }))
      .toMatchObject({ status: TRANSACTION_STATUSES.IN_PROGRESS, completedAt: null });
    expect(await prisma.transactionStatusLog.count({ where: { transactionId: BigInt(insufficient.id) } })).toBe(2);
    expect(await prisma.inventoryMovement.count({ where: { transactionId: BigInt(insufficient.id) } })).toBe(0);

    const movementFailure = await transactions.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "Movement Failure",
      customerAddress: "Address",
      items: [{ productId: product.id.toString(), quantity: 1 }]
    }, adminUser);
    await queues.updateStatus(movementFailure.id, { status: TRANSACTION_STATUSES.IN_PROGRESS }, adminUser);
    const failingRepository = new PrismaTransactionRepository(prisma);
    failingRepository.createMovements = async () => {
      throw new Error("simulated movement failure");
    };
    const failingQueues = new QueueService(
      new PrismaQueueRepository(prisma),
      clock,
      new TransactionService(failingRepository, new PrismaTransactionRunner(prisma), clock)
    );
    await expect(failingQueues.updateStatus(
      movementFailure.id,
      { status: TRANSACTION_STATUSES.COMPLETED },
      adminUser
    )).rejects.toThrow("simulated movement failure");
    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: BigInt(movementFailure.id) } }))
      .toMatchObject({ status: TRANSACTION_STATUSES.IN_PROGRESS, completedAt: null });
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: product.id } }))
      .toMatchObject({ fullQty: 5, emptyQty: 0 });
    expect(await prisma.inventoryMovement.count({ where: { transactionId: BigInt(movementFailure.id) } })).toBe(0);
    expect(await prisma.transactionStatusLog.count({ where: { transactionId: BigInt(movementFailure.id) } })).toBe(2);

    const cancelAfterStart = await transactions.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "Started Then Cancelled",
      customerAddress: "Address",
      items: [{ productId: product.id.toString(), quantity: 1 }]
    }, adminUser);
    await queues.updateStatus(cancelAfterStart.id, { status: TRANSACTION_STATUSES.IN_PROGRESS }, adminUser);
    await queues.updateStatus(cancelAfterStart.id, { status: TRANSACTION_STATUSES.CANCELLED }, adminUser);
    expect(await prisma.inventoryMovement.count({ where: { transactionId: BigInt(cancelAfterStart.id) } })).toBe(0);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { productId: product.id } }))
      .toMatchObject({ fullQty: 5, emptyQty: 0 });

    const directComplete = await transactions.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "Direct Complete",
      customerAddress: "Address",
      items: [{ productId: product.id.toString(), quantity: 1 }]
    }, adminUser);
    await expect(queues.updateStatus(
      directComplete.id,
      { status: TRANSACTION_STATUSES.COMPLETED },
      adminUser
    )).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION" });

    const incompleteIdentity = await transactions.create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "Broken Queue",
      customerAddress: "Address",
      items: [{ productId: product.id.toString(), quantity: 1 }]
    }, adminUser);
    await prisma.transaction.update({
      where: { id: BigInt(incompleteIdentity.id) },
      data: { queueDate: null, queueNo: null }
    });
    await expect(queues.updateStatus(
      incompleteIdentity.id,
      { status: TRANSACTION_STATUSES.IN_PROGRESS },
      adminUser
    )).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    expect((await queues.listByDate({ date: "2026-07-24" })).queues.map((queue) => queue.id))
      .not.toContain(incompleteIdentity.id);
    await expect(queues.updateStatus(
      "999999",
      { status: TRANSACTION_STATUSES.IN_PROGRESS },
      adminUser
    )).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Queue transaction not found"
    });
  });

  it("serves authenticated Queue HTTP contracts and validation errors", async () => {
    const product = await createProduct({ fullQty: 10 });
    const delivery = await transactionService().create({
      transactionType: TRANSACTION_TYPES.DELIVERY_EXCHANGE,
      customerName: "HTTP Customer",
      customerAddress: "Address",
      items: [{ productId: product.id.toString(), quantity: 1 }]
    }, adminUser);
    const adminToken = token(adminUser.id);
    const staffToken = token(staffUserId);
    const walkIn = await transactionService().create({
      transactionType: TRANSACTION_TYPES.WALK_IN_EXCHANGE,
      customerName: "HTTP Walk-in",
      items: [{ productId: product.id.toString(), quantity: 1 }]
    }, adminUser);

    expect((await request(app)
      .get("/api/queues/today")
      .set("Authorization", `Bearer ${staffToken}`)).status).toBe(403);
    const today = await request(app)
      .get("/api/queues/today")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(today.status).toBe(200);
    expect(today.body).toMatchObject({
      success: true,
      data: { queueDate: expect.any(String), queues: expect.any(Array) },
      meta: { requestId: expect.any(String) }
    });
    expect((await request(app)
      .get("/api/queues?date=2026-02-30")
      .set("Authorization", `Bearer ${adminToken}`)).status).toBe(400);
    expect((await request(app)
      .patch("/api/queues/0/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: TRANSACTION_STATUSES.IN_PROGRESS })).status).toBe(400);
    const nonQueue = await request(app)
      .patch(`/api/queues/${walkIn.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: TRANSACTION_STATUSES.CANCELLED });
    expect(nonQueue.status).toBe(404);
    expect(nonQueue.body.error.code).toBe("NOT_FOUND");
    expect((await request(app)
      .patch(`/api/queues/${delivery.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: TRANSACTION_STATUSES.IN_PROGRESS, queueNo: 99 })).status).toBe(400);

    const list = await request(app)
      .get("/api/queues?date=2026-07-24")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      success: true,
      data: {
        queueDate: "2026-07-24",
        queues: [{ id: delivery.id, status: TRANSACTION_STATUSES.PENDING }]
      },
      meta: { requestId: expect.any(String) }
    });
    expect(JSON.stringify(list.body)).not.toContain("costPrice");

    const updated = await request(app)
      .patch(`/api/queues/${delivery.id}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ status: TRANSACTION_STATUSES.IN_PROGRESS, note: "รับงานแล้ว" });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      success: true,
      data: {
        id: delivery.id,
        status: TRANSACTION_STATUSES.IN_PROGRESS,
        queueDate: "2026-07-24",
        queueNo: 1
      },
      meta: { requestId: expect.any(String) }
    });
    expect(JSON.stringify(updated.body)).not.toContain("costPrice");
    expect(JSON.stringify(updated.body)).not.toContain("statusLogs");
  });
});
