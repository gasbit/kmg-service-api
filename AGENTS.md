# AGENTS.md

## 1. Project Overview

KMG-SERVICE-API is the backend service for KMG-SERVICE, a gas shop management system for store owners. The MVP supports admin login, product management, transaction creation, delivery queue management, cylinder loan tracking, inventory tracking, transaction history, and daily dashboard summaries.

The system starts with a single `ADMIN` role but must remain ready for future roles such as `STAFF`, `RIDER`, and `ACCOUNTANT`.

Primary goals:

- Keep transaction history accurate even when master data changes later.
- Track stock through balances and movements, not direct silent edits.
- Support multiple gas transaction types in one consistent workflow.
- Keep the backend simple enough for MVP delivery while preserving clear module boundaries.

## 2. Architecture Overview

Use a Modular Monolith architecture with Node.js, Express, TypeScript, Prisma, PostgreSQL, Zod, JWT, bcrypt, and Pino.

Main layers:

- Route Layer: defines versioned HTTP endpoints under `/api/v1`.
- Controller Layer: reads request data, calls services, and returns standard API responses.
- Service Layer: owns business workflows, validation beyond request shape, and database transaction boundaries.
- Repository Layer: owns database access only. Do not put business rules here.

Important architecture rules:

- Business workflows that touch multiple tables must run inside `prisma.$transaction`.
- `TransactionService` is the owner of transaction creation, status changes, queue effects, inventory effects, and loan effects.
- `DashboardService` should stay read-only.
- Queue data is stored on `transactions.queue_date` and `transactions.queue_no`; do not create a separate queue table for MVP.

## 3. Project Structure

```text
KMG-SERVICE-API/
  src/
    app.ts
    server.ts
    routes.ts
    config/
      env.ts
      database.ts
      logger.ts
    constants/
      inventory.constants.ts
      role.constants.ts
      transaction.constants.ts
    middlewares/
      auth.middleware.ts
      role.middleware.ts
      error.middleware.ts
      request-id.middleware.ts
      validate.middleware.ts
    modules/
      auth/
      users/
      products/
      transactions/
      queue/
      loans/
      inventory/
      dashboard/
    shared/
      errors/
      types/
      utils/
    database/
      prisma/
        schema.prisma
      seeds/
        seed.ts
    tests/
```

Module file convention:

- `*.routes.ts`: Express routes and middleware wiring.
- `*.controller.ts`: HTTP request/response handling only.
- `*.schema.ts`: Zod request schemas and input types.
- `*.service.ts`: application/business logic.
- `*.repository.ts`: Prisma queries only.
- `*.types.ts`: module-specific TypeScript types.

## 4. Coding Standards

- Use TypeScript strict mode.
- Keep controllers thin. They should not contain business rules.
- Validate request payloads with Zod and the shared `validate` middleware.
- Throw `AppError` for operational errors.
- Use shared error codes from `src/shared/errors/error-codes.ts`.
- Use constants for domain codes instead of hard-coded strings.
- Never return `passwordHash` from API responses.
- Do not log passwords, tokens, or sensitive customer data.
- Keep API responses in the standard format:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "req_..."
  }
}
```

Error responses must use:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": []
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

Prisma and ID handling:

- Database IDs are `BigInt`.
- JWT/user payload IDs are strings to avoid JSON serialization issues.
- Use shared utilities for ID conversion and API serialization.

## 5. Development Workflow

Recommended workflow:

1. Read relevant documents before changing business logic:
   - `../Context.md`
   - `../Backend-Architecture.md`
   - `../Database-Design.md`
2. Locate the owning module before editing.
3. Add or update Zod schemas for request changes.
4. Put workflow logic in the service layer.
5. Put database access in repositories.
6. Use Prisma transactions for multi-table writes.
7. Run validation/build commands before finishing.

For new endpoint work:

1. Add schema in `*.schema.ts`.
2. Add service method.
3. Add repository method if database access is needed.
4. Add controller function.
5. Wire route in `*.routes.ts`.
6. Add or update tests when behavior is non-trivial.

For database changes:

1. Update `src/database/prisma/schema.prisma`.
2. Run Prisma migration.
3. Update repositories/services impacted by generated Prisma types.
4. Run Prisma generate and build.

## 6. Commands

Install dependencies:

```bash
npm install
```

Create local env:

```bash
cp .env.example .env
```

Generate Prisma client:

```bash
npm run prisma:generate
```

Run database migration:

```bash
npm run prisma:migrate
```

Seed admin user:

```bash
npm run prisma:seed
```

Run development server:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run audit:

```bash
npm audit --audit-level=high
```

Health check:

```bash
curl http://localhost:4000/api/health
```

Auth smoke test:

```bash
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin1234"}'
```

## 7. Safety Rules

- Do not bypass the service layer for transaction, inventory, queue, or loan workflows.
- Do not update inventory balances without creating inventory movements.
- Do not delete products physically; use soft delete through `isActive = false`.
- Do not mutate completed or cancelled transactions except through explicit future business rules.
- Do not change transaction status without inserting a status log.
- Do not cut stock for `DELIVERY_EXCHANGE` at creation time; cut stock only when completed.
- Do not create queue numbers outside a database transaction.
- Do not expose password hashes, JWT secrets, or `.env` values.
- Do not commit generated or local-only artifacts unless intentionally requested:
  - `node_modules/`
  - `dist/`
  - `.env`
  - `.DS_Store`
- Avoid broad refactors while implementing a specific feature.
- If existing files contain user changes, preserve them and work around them carefully.

## 8. Domain Knowledge

Transaction types:

- `DELIVERY_EXCHANGE`: customer orders delivery gas exchange.
- `WALK_IN_EXCHANGE`: customer exchanges cylinder at the shop.
- `BORROW_CYLINDER`: customer borrows a cylinder.
- `RETURN_CYLINDER`: customer returns a borrowed cylinder.
- `BUY_FULL_TANK`: customer buys a full/new tank.

Transaction statuses:

- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `CANCELLED`

Status flow:

```text
PENDING -> IN_PROGRESS -> COMPLETED
PENDING -> CANCELLED
IN_PROGRESS -> CANCELLED
```

Final states:

- `COMPLETED`
- `CANCELLED`

Inventory movement rules:

- `FULL_OUT`: `fullQty -= quantity`
- `EMPTY_IN`: `emptyQty += quantity`
- `LOAN_OUT`: `fullQty -= quantity`, `loanedQty += quantity`
- `LOAN_RETURN`: `loanedQty -= quantity`, `emptyQty += quantity`
- `ADJUSTMENT`: manual admin adjustment with required note

Transaction behavior:

- `DELIVERY_EXCHANGE`
  - Default status: `PENDING`
  - Creates queue number for today.
  - Does not update stock until status becomes `COMPLETED`.
- `WALK_IN_EXCHANGE`
  - Default status: `COMPLETED`
  - Immediately creates `FULL_OUT` and `EMPTY_IN` movements.
- `BORROW_CYLINDER`
  - Default status: `COMPLETED`
  - Immediately creates `LOAN_OUT` movement and a cylinder loan.
- `RETURN_CYLINDER`
  - Default status: `COMPLETED`
  - Immediately creates `LOAN_RETURN` movement.
- `BUY_FULL_TANK`
  - Default status: `COMPLETED`
  - Immediately creates `FULL_OUT` movement.

Snapshot rules:

- Transactions must store customer snapshot fields.
- Transaction items must store product brand, weight, unit price, cost price, and line total snapshots.
- Historical records must remain correct even if products or customers change later.

Loan statuses:

- `BORROWED`
- `PARTIAL_RETURNED`
- `RETURNED`
- `OVERDUE`
- `CANCELLED`

MVP access control:

- `ADMIN` can access all current modules.
- Keep role middleware generic so future roles can be added without rewriting route structure.
