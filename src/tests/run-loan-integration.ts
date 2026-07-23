import { spawnSync } from "node:child_process";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const TEST_DATABASE_NAME = "kmg_service_loans_test";

function checkedTestDatabase(): { url: string; name: string } {
  const configured = process.env.TEST_DATABASE_URL;
  const baseUrl = configured ?? process.env.DATABASE_URL;
  if (!baseUrl) throw new Error("DATABASE_URL is required");
  const url = new URL(baseUrl);
  if (!configured) url.pathname = `/${TEST_DATABASE_NAME}`;
  const databaseName = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+_test$/.test(databaseName)) {
    throw new Error("Refusing to run integration tests against a database whose name does not end with _test");
  }
  return { url: url.toString(), name: databaseName };
}

function runNode(script: string, args: string[], environment: NodeJS.ProcessEnv): void {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const testDatabase = checkedTestDatabase();
  const sourceUrl = new URL(process.env.DATABASE_URL);
  const admin = new PrismaClient({ datasources: { db: { url: sourceUrl.toString() } } });
  try {
    const existing = await admin.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${testDatabase.name}) AS exists
    `;
    if (!existing[0]?.exists) await admin.$executeRawUnsafe(`CREATE DATABASE "${testDatabase.name}"`);
  } finally {
    await admin.$disconnect();
  }

  const environment = {
    ...process.env,
    DATABASE_URL: testDatabase.url,
    TEST_DATABASE_URL: testDatabase.url,
    RUN_LOAN_DB_TESTS: "true",
    NODE_ENV: "test",
    LOG_LEVEL: "silent"
  };
  runNode(path.resolve("node_modules/prisma/build/index.js"), ["generate"], environment);
  runNode(path.resolve("node_modules/prisma/build/index.js"), ["migrate", "deploy"], environment);
  runNode(path.resolve("node_modules/vitest/vitest.mjs"), [
    "run",
    "src/modules/loans/loan.integration.test.ts"
  ], environment);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Loan integration test setup failed");
  process.exit(1);
});
