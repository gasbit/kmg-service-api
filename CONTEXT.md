# KMG-SERVICE-API บริบท Backend

เอกสารนี้สรุป context สำคัญของ backend โดยดึงสาระจาก `../Context.md`, `../Backend-Architecture.md`, `../Database-Design.md`, `../Planning.md` และโครงสร้างปัจจุบันของ `KMG-SERVICE-API`

## 1. ภาพรวมของระบบ

KMG-SERVICE คือระบบจัดการร้านแก๊สสำหรับ Admin เจ้าของร้าน โดยมีเป้าหมายให้จัดการงานประจำวันได้ครบในระบบเดียว ได้แก่ login, จัดการสินค้าแก๊ส, ทำรายการสั่งส่ง, แลกถังหน้าร้าน, ยืมถัง, คืนถัง, จัดการคิวส่งแก๊ส, ดูประวัติรายการ, ติดตาม stock และดู dashboard สรุปประจำวัน

MVP เริ่มจากผู้ใช้ role เดียวคือ `ADMIN` แต่ database และ backend ต้องรองรับการเพิ่ม role ในอนาคต เช่น `STAFF`, `RIDER` และ `ACCOUNTANT`

ขอบเขต MVP:

- Authentication สำหรับ Admin
- Product Management สำหรับสินค้าแก๊ส
- Transaction Management สำหรับธุรกรรมหลักของร้าน
- Queue Management สำหรับรายการส่งแก๊ส
- Cylinder Loan Management สำหรับลูกค้าที่ยืมถัง
- Inventory Management สำหรับยอดคงเหลือและ movement
- Dashboard รายวัน
- Transaction History พร้อม filter/search

ระบบถูกออกแบบเป็น backend API ให้ `KMG-SERVICE-WEB` เรียกใช้งานผ่าน versioned API ใต้ `/api/v1`

## 2. Business Logic

### ประเภท Transaction

ระบบรองรับ transaction หลัก 5 ประเภท:

- `DELIVERY_EXCHANGE`: ลูกค้าสั่งส่งแก๊สเพื่อแลกถัง
- `WALK_IN_EXCHANGE`: ลูกค้ามาแลกถังหน้าร้าน
- `BORROW_CYLINDER`: ลูกค้ายืมถัง
- `RETURN_CYLINDER`: ลูกค้านำถังที่ยืมมาคืน
- `BUY_FULL_TANK`: ลูกค้าซื้อถังเต็มหรือซื้อถังใหม่

Transaction หนึ่งรายการสามารถมีสินค้าได้มากกว่า 1 รายการ

### Flow สถานะ

สถานะ transaction:

- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `CANCELLED`

flow ที่อนุญาต:

```text
PENDING -> IN_PROGRESS
PENDING -> CANCELLED
IN_PROGRESS -> COMPLETED
IN_PROGRESS -> CANCELLED
```

`COMPLETED` และ `CANCELLED` เป็น final state

ทุกครั้งที่เปลี่ยนสถานะต้องสร้าง `transaction_status_logs` เพื่อเก็บประวัติว่าเปลี่ยนจากสถานะใด ไปสถานะใด โดยใคร และเมื่อไร

### กฎสินค้า

- สินค้าใช้ soft delete ผ่าน `is_active = false`
- ห้ามลบสินค้าออกจาก database จริง เพราะ transaction เก่าอาจอ้างอิงสินค้าเดิมอยู่
- สินค้าที่ inactive ห้ามถูกเลือกในการสร้าง transaction ใหม่
- เมื่อสร้างสินค้าใหม่ต้องสร้าง `inventory_balances` ตั้งต้นให้สินค้านั้น

### กฎ Snapshot

Transaction ต้องเก็บ snapshot เพื่อให้ประวัติย้อนหลังถูกต้อง แม้ข้อมูล master จะเปลี่ยนภายหลัง:

- customer snapshot: ชื่อ เบอร์โทร ที่อยู่
- product snapshot: ยี่ห้อ น้ำหนัก ราคา ทุน
- item snapshot: quantity, unit price, cost price, line total, item action

### กฎ Queue

- เฉพาะ `DELIVERY_EXCHANGE` ต้องสร้างคิวส่งแก๊ส
- ใช้ `transactions.queue_date` และ `transactions.queue_no` ไม่ต้องมี queue table แยกใน MVP
- `queue_no` ต้อง generate ใน database transaction เพื่อลดความเสี่ยงเลขคิวชนกัน
- รายการ `DELIVERY_EXCHANGE` เริ่มต้นด้วย `PENDING`
- ห้ามตัด stock ตอนสร้างรายการส่งแก๊ส ให้ตัด stock ตอนรายการเปลี่ยนเป็น `COMPLETED`

### กฎ Inventory

ระบบแยก stock เป็น:

- `full_qty`: ถังเต็ม
- `empty_qty`: ถังเปล่า
- `loaned_qty`: ถังที่ถูกยืมอยู่

ทุกการเปลี่ยน stock ต้องมี `inventory_movements` กำกับ ห้ามแก้ balance เงียบ ๆ

movement effects:

- `FULL_OUT`: `full_qty -= quantity`
- `EMPTY_IN`: `empty_qty += quantity`
- `LOAN_OUT`: `full_qty -= quantity`, `loaned_qty += quantity`
- `LOAN_RETURN`: `loaned_qty -= quantity`, `empty_qty += quantity`
- `ADJUSTMENT`: ปรับยอดด้วย note บังคับ

ต้อง validate ไม่ให้ stock ติดลบ

### ผลกระทบของ Transaction

- `DELIVERY_EXCHANGE`
  - Default status: `PENDING`
  - สร้าง queue
  - ยังไม่ update inventory จนกว่าจะ `COMPLETED`
- `WALK_IN_EXCHANGE`
  - Default status: `COMPLETED`
  - สร้าง `FULL_OUT` และ `EMPTY_IN` ทันที
- `BORROW_CYLINDER`
  - Default status: `COMPLETED`
  - สร้าง `LOAN_OUT` และสร้าง `cylinder_loans`
- `RETURN_CYLINDER`
  - Default status: `COMPLETED`
  - สร้าง `LOAN_RETURN`
  - ควรผูกกับ workflow ของ loan เพื่อให้ history และ inventory ครบ
- `BUY_FULL_TANK`
  - Default status: `COMPLETED`
  - สร้าง `FULL_OUT`

### กฎการยืมถัง

ใช้ติดตามลูกค้าที่ยืมถัง โดยเก็บ customer snapshot, product, quantity, borrowed date, expected return date, returned date, deposit amount และ status

loan statuses:

- `BORROWED`
- `PARTIAL_RETURNED`
- `RETURNED`
- `OVERDUE`
- `CANCELLED`

การคืนถังควรทำผ่าน transaction type `RETURN_CYLINDER` เพื่อให้เกิด transaction history และ inventory movement ครบ

## 3. ข้อจำกัด

### ข้อจำกัดของ MVP

- ระบบเริ่มจาก `ADMIN` role เท่านั้น
- ยังไม่มี customer master แบบเต็มใน workflow หลัก ลูกค้าสามารถถูกบันทึกผ่าน snapshot ใน transaction ได้
- ไม่มี payment gateway ใน MVP
- ไม่มี GPS, route planning, LINE/SMS notification, accounting เต็มรูปแบบ หรือ mobile app แยก
- Dashboard เป็น read-only aggregation ไม่ควรมี business mutation

### ข้อจำกัดด้านความถูกต้องของข้อมูล

- ห้าม hard delete ข้อมูลสำคัญ เช่น products, users, customers
- ห้ามแก้ stock balance โดยไม่มี movement
- ห้ามเปลี่ยน status โดยไม่มี status log
- ห้ามใช้สินค้า inactive ใน transaction ใหม่
- ห้ามให้ stock ติดลบ
- Transaction workflow สำคัญต้อง atomic ด้วย DB transaction
- Repository ห้ามเปิด transaction เอง ควรรับ transaction client จาก service เมื่ออยู่ใน workflow ใหญ่

### ข้อจำกัดด้าน Security

- Password ต้อง hash ด้วย bcrypt
- Auth ใช้ JWT access token
- ห้ามส่ง `password_hash` ออก API
- ห้าม log password หรือ token
- ทุก endpoint mutation ต้อง validate payload ด้วย Zod
- Access control MVP ใช้ `ADMIN` แต่ middleware ต้องรองรับ role array เพื่อขยายต่อ

### ข้อจำกัดของ API

Success response format:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "req_..."
  }
}
```

Error response format:

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

error codes หลัก:

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `INSUFFICIENT_STOCK`
- `INVALID_STATUS_TRANSITION`
- `INTERNAL_ERROR`

## 4. Technology

### Runtime และ Framework

- Node.js LTS
- Express
- TypeScript

### Database

- PostgreSQL เป็นตัวเลือกหลัก
- Prisma เป็น ORM/query layer หลัก
- Prisma schema อยู่ที่ `src/database/prisma/schema.prisma`
- Seed admin user อยู่ที่ `src/database/seeds/seed.ts`

### Validation และ Auth

- Zod สำหรับ request validation
- JWT สำหรับ access token
- bcryptjs สำหรับ password hashing
- Role-based access control ผ่าน `auth.middleware.ts` และ `role.middleware.ts`

### Logging และ Middleware

- Pino และ `pino-http` สำหรับ logging
- Helmet สำหรับ security headers
- CORS สำหรับ frontend origin
- Request ID middleware สำหรับ trace response/error
- Global error middleware ใช้ `AppError` และ standard API error response

### Testing และ Quality

- Vitest สำหรับ test runner
- Supertest สำหรับ integration test API
- TypeScript strict mode
- `npm run build` ใช้ตรวจ type safety
- `npm audit --audit-level=high` ใช้ตรวจ dependency vulnerability

### Commands หลัก

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
npm run build
npm test
```

### โครงสร้าง Backend ปัจจุบัน

Backend ใช้ Modular Monolith:

- `auth`: login, current user, JWT
- `users`: user repository/service base
- `products`: CRUD, soft delete, inventory balance init
- `transactions`: transaction workflow หลัก
- `queue`: delivery queue view/status update
- `loans`: cylinder loan list/return workflow
- `inventory`: balances, movements, manual adjustment
- `dashboard`: daily aggregate read APIs

Layering:

- routes: HTTP path และ middleware wiring
- controllers: request/response handling
- schemas: Zod validation
- services: business workflow และ transaction boundary
- repositories: Prisma database access
