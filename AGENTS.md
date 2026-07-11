# AGENTS.md

## 1. ภาพรวมโปรเจกต์

`KMG-SERVICE-API` คือ backend service ของ `KMG-SERVICE` ระบบจัดการร้านแก๊สสำหรับเจ้าของร้าน MVP รองรับ admin login, product management, transaction creation, delivery queue management, cylinder loan tracking, inventory tracking, transaction history และ daily dashboard summaries

ระบบเริ่มจาก role เดียวคือ `ADMIN` แต่ต้องเตรียมโครงสร้างให้รองรับ role ในอนาคต เช่น `STAFF`, `RIDER` และ `ACCOUNTANT`

เป้าหมายหลัก:

- เก็บ transaction history ให้ถูกต้อง แม้ master data จะเปลี่ยนภายหลัง
- ติดตาม stock ผ่าน balances และ movements ไม่ใช่แก้ยอดเงียบ ๆ
- รองรับ transaction หลายประเภทของร้านแก๊สด้วย workflow ที่สอดคล้องกัน
- ทำ backend ให้เรียบง่ายพอสำหรับ MVP แต่ยังมี module boundaries ชัดเจน

## 2. ภาพรวมสถาปัตยกรรม

ใช้ Modular Monolith architecture ด้วย Node.js, Express, TypeScript, Prisma, PostgreSQL, Zod, JWT, bcrypt และ Pino

Layer หลัก:

- Route Layer: กำหนด versioned HTTP endpoints ใต้ `/api/v1`
- Controller Layer: อ่าน request data, เรียก services และคืน standard API responses
- Service Layer: เป็นเจ้าของ business workflows, validation ที่มากกว่า request shape และ database transaction boundaries
- Repository Layer: รับผิดชอบ database access เท่านั้น ห้ามใส่ business rules ใน layer นี้

กฎสถาปัตยกรรมสำคัญ:

- Business workflows ที่แตะหลาย table ต้องรันใน `prisma.$transaction`
- `TransactionService` เป็นเจ้าของ transaction creation, status changes, queue effects, inventory effects และ loan effects
- `DashboardService` ต้องเป็น read-only
- Queue data เก็บบน `transactions.queue_date` และ `transactions.queue_no`; MVP ไม่ต้องสร้าง queue table แยก

## 3. โครงสร้างโปรเจกต์

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

Convention ของ module files:

- `*.routes.ts`: Express routes และ middleware wiring
- `*.controller.ts`: จัดการ HTTP request/response เท่านั้น
- `*.schema.ts`: Zod request schemas และ input types
- `*.service.ts`: application/business logic
- `*.repository.ts`: Prisma queries เท่านั้น
- `*.types.ts`: TypeScript types เฉพาะ module

## 4. มาตรฐานการเขียน Code

- ใช้ TypeScript strict mode
- Controllers ต้องบางและไม่ใส่ business rules
- Validate request payloads ด้วย Zod และ shared `validate` middleware
- Throw `AppError` สำหรับ operational errors
- ใช้ shared error codes จาก `src/shared/errors/error-codes.ts`
- ใช้ constants สำหรับ domain codes แทน hard-coded strings
- ห้ามคืน `passwordHash` จาก API responses
- ห้าม log passwords, tokens หรือ sensitive customer data
- API responses ต้องอยู่ใน standard format:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "req_..."
  }
}
```

Error responses ต้องใช้:

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

Prisma และ ID handling:

- Database IDs เป็น `BigInt`
- JWT/user payload IDs ใช้ string เพื่อเลี่ยง JSON serialization issues
- ใช้ shared utilities สำหรับ ID conversion และ API serialization

## 5. Workflow การพัฒนา

Workflow ที่แนะนำ:

1. อ่านเอกสารที่เกี่ยวข้องก่อนแก้ business logic:
   - `../Context.md`
   - `../Backend-Architecture.md`
   - `../Database-Design.md`
2. หา owning module ให้เจอก่อนแก้ไฟล์
3. เพิ่มหรืออัปเดต Zod schemas เมื่อ request เปลี่ยน
4. วาง workflow logic ไว้ใน service layer
5. วาง database access ไว้ใน repositories
6. ใช้ Prisma transactions สำหรับ multi-table writes
7. รัน validation/build commands ก่อนจบงาน

สำหรับ endpoint ใหม่:

1. เพิ่ม schema ใน `*.schema.ts`
2. เพิ่ม service method
3. เพิ่ม repository method ถ้าต้อง access database
4. เพิ่ม controller function
5. Wire route ใน `*.routes.ts`
6. เพิ่มหรืออัปเดต tests เมื่อ behavior มีความซับซ้อน

สำหรับ database changes:

1. อัปเดต `src/database/prisma/schema.prisma`
2. รัน Prisma migration
3. อัปเดต repositories/services ที่กระทบจาก generated Prisma types
4. รัน Prisma generate และ build

## 6. Commands

ติดตั้ง dependencies:

```bash
npm install
```

สร้าง local env:

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

## 7. กฎความปลอดภัย (Safety Rules)

- ห้าม bypass service layer สำหรับ transaction, inventory, queue หรือ loan workflows
- ห้าม update inventory balances โดยไม่สร้าง inventory movements
- ห้ามลบ products จริงจาก database; ให้ใช้ soft delete ผ่าน `isActive = false`
- ห้าม mutate completed หรือ cancelled transactions ยกเว้น future business rules ที่ระบุชัด
- ห้ามเปลี่ยน transaction status โดยไม่ insert status log
- ห้ามตัด stock สำหรับ `DELIVERY_EXCHANGE` ตอนสร้างรายการ ให้ตัด stock เฉพาะเมื่อ completed
- ห้ามสร้าง queue numbers นอก database transaction
- ห้าม expose password hashes, JWT secrets หรือ `.env` values
- ห้าม commit generated หรือ local-only artifacts เว้นแต่ผู้ใช้ขอชัดเจน:
  - `node_modules/`
  - `dist/`
  - `.env`
  - `.DS_Store`
- หลีกเลี่ยง broad refactors ระหว่าง implement feature เฉพาะจุด
- ถ้าไฟล์เดิมมี user changes ต้อง preserve changes เหล่านั้นและทำงานรอบ ๆ อย่างระมัดระวัง

## 8. ความรู้ Domain (Domain Knowledge)

ประเภท Transaction:

- `DELIVERY_EXCHANGE`: ลูกค้าสั่งส่งแก๊สเพื่อแลกถัง
- `WALK_IN_EXCHANGE`: ลูกค้ามาแลกถังที่หน้าร้าน
- `BORROW_CYLINDER`: ลูกค้ายืมถัง
- `RETURN_CYLINDER`: ลูกค้าคืนถังที่ยืม
- `BUY_FULL_TANK`: ลูกค้าซื้อถังเต็มหรือถังใหม่

สถานะ Transaction:

- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `CANCELLED`

Flow สถานะ:

```text
PENDING -> IN_PROGRESS -> COMPLETED
PENDING -> CANCELLED
IN_PROGRESS -> CANCELLED
```

สถานะสุดท้าย:

- `COMPLETED`
- `CANCELLED`

กฎ Inventory movement:

- `FULL_OUT`: `fullQty -= quantity`
- `EMPTY_IN`: `emptyQty += quantity`
- `LOAN_OUT`: `fullQty -= quantity`, `loanedQty += quantity`
- `LOAN_RETURN`: `loanedQty -= quantity`, `emptyQty += quantity`
- `ADJUSTMENT`: manual admin adjustment พร้อม note บังคับ

พฤติกรรมของ Transaction:

- `DELIVERY_EXCHANGE`
  - Default status: `PENDING`
  - สร้าง queue number ของวันนี้
  - ไม่ update stock จนกว่า status จะเป็น `COMPLETED`
- `WALK_IN_EXCHANGE`
  - Default status: `COMPLETED`
  - สร้าง `FULL_OUT` และ `EMPTY_IN` movements ทันที
- `BORROW_CYLINDER`
  - Default status: `COMPLETED`
  - สร้าง `LOAN_OUT` movement และ cylinder loan ทันที
- `RETURN_CYLINDER`
  - Default status: `COMPLETED`
  - สร้าง `LOAN_RETURN` movement ทันที
- `BUY_FULL_TANK`
  - Default status: `COMPLETED`
  - สร้าง `FULL_OUT` movement ทันที

กฎ Snapshot:

- Transactions ต้องเก็บ customer snapshot fields
- Transaction items ต้องเก็บ product brand, weight, unit price, cost price และ line total snapshots
- Historical records ต้องถูกต้องอยู่เสมอ แม้ products หรือ customers จะเปลี่ยนภายหลัง

สถานะ Loan:

- `BORROWED`
- `PARTIAL_RETURNED`
- `RETURNED`
- `OVERDUE`
- `CANCELLED`

Access control ของ MVP:

- `ADMIN` เข้าถึง current modules ได้ทั้งหมด
- Role middleware ต้อง generic เพื่อเพิ่ม future roles ได้โดยไม่ต้อง rewrite route structure
