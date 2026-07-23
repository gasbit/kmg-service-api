# Loan Module Implementation Plan

สถานะ: Implemented — build, lint, unit/HTTP และ PostgreSQL integration tests passed  
อ้างอิงหลัก: `loan-spec.md`  
Owning module: `loans` สำหรับ read APIs และ `transactions` สำหรับ return write workflow  
Base path: `/api/loans`

## 1. เป้าหมาย

Implement loan module ให้ตรงกับ `loan-spec.md` โดยมี endpoint checklist ต่อไปนี้:

- [x] `GET /api/loans` — Loan history พร้อม filters, search และ pagination
- [x] `GET /api/loans/active` — รายการ loan ที่ยังมีถังค้างคืน
- [x] `GET /api/loans/:loanId` — Loan detail พร้อม original borrow transaction และ return history
- [x] `POST /api/loans/:loanId/return` — คืนถังแบบ partial หรือ full return

ผลลัพธ์ต้องรักษา invariants ต่อไปนี้:

- Loan ถูกสร้างจาก `BORROW_CYLINDER` workflow ของ `TransactionService` เท่านั้น
- การคืนถังต้องสร้าง `RETURN_CYLINDER` transaction ที่ตรวจสอบย้อนหลังได้
- ทุก multi-table write สำเร็จหรือล้มเหลวพร้อมกันใน database transaction เดียว
- ทุก stock change ต้องมี `InventoryMovement` ประเภท `LOAN_RETURN`
- `returnedQuantity` ห้ามเกิน `quantity`
- `InventoryBalance.loanedQty` ห้ามติดลบ
- Full return ต้องเปลี่ยน loan เป็น `RETURNED` และกำหนด `returnedDate`
- Partial return ต้องคง `remainingQuantity > 0` และ `returnedDate = null`
- Read APIs คำนวณ `isOverdue` ตามวัน `Asia/Bangkok` โดยไม่ mutate database
- Historical responses ต้องอ่าน customer และ product snapshots จาก transaction records
- Database `BigInt` IDs และ Prisma `Decimal` ต้อง serialize เป็น string

## 2. ขอบเขตและ module boundaries

### อยู่ในขอบเขต

- Prisma relation สำหรับเชื่อม return transaction item กลับไปยัง source loan
- Loan constants, types, Zod schemas และ DTO mappers
- Loan repository สำหรับ list, active list, detail และ return-history queries
- Loan service สำหรับ read-only behavior และ overdue derivation
- Internal loan-return workflow ใน `TransactionService`
- Atomic loan claim, inventory update และ inventory movement
- Controllers, routes, standard API envelopes และ route wiring
- Schema, service, PostgreSQL integration และ HTTP integration tests

### ไม่อยู่ในขอบเขต

- Public endpoint สำหรับสร้าง แก้ไข ยกเลิก หรือลบ loan โดยตรง
- Public generic `POST /api/transactions` สำหรับ `RETURN_CYLINDER`
- การคืนหลาย loan ใน request เดียว
- Deposit refund, payment, discount หรือ accounting workflow
- Scheduled job ที่เขียนสถานะ `OVERDUE`
- Dashboard aggregation
- Customer master CRUD
- การแก้ไข original borrow transaction หรือ historical snapshots

Module ownership:

- `LoanService` เป็นเจ้าของ read use cases และ derived overdue presentation
- `TransactionService` เป็นเจ้าของ return workflow เพราะต้องสร้าง transaction, item, status log, inventory effect และแก้ loan ภายใน transaction เดียว
- `LoanController` เรียก `TransactionService.returnCylinder(...)` สำหรับ mutation โดยไม่เขียน business logic ซ้ำ
- Repositories รับผิดชอบ database access และ atomic primitives เท่านั้น ห้ามตัดสิน business transition เอง
- ห้ามเปิด nested Prisma transaction ระหว่าง loan และ transaction modules

## 3. Phase 0 — Contract decision gate

Contract decisions ต่อไปนี้ได้รับการยืนยันใน `loan-spec.md` แล้ว:

- [x] ใช้ canonical base path `/api/loans`
- [x] MVP มี list, active list, detail และ return endpoint ครบทั้ง 4 endpoints
- [x] Loan creation ยังคงอยู่ใน `BORROW_CYLINDER` workflow ของ `TransactionService`
- [x] Public transaction create schema ไม่รับ `RETURN_CYLINDER`
- [x] เพิ่ม nullable `TransactionItem.sourceLoanId` เพื่อระบุว่า return item คืนให้ loan ใด
- [x] Return history อ่านผ่าน `sourceLoanId` ไม่ infer จาก product/customer/date
- [x] `remainingQuantity = quantity - returnedQuantity`
- [x] `isOverdue` เป็น derived value ตาม business date `Asia/Bangkok`; GET ไม่เขียน database
- [x] `expectedReturnDate = null` ไม่ถือว่า overdue
- [x] Partial return ของ `OVERDUE` ยังคง status `OVERDUE`
- [x] Full return เปลี่ยน status เป็น `RETURNED` และกำหนด `returnedDate`
- [x] Return transaction มี `totalAmount = 0.00`, item `unitPrice = 0.00` และ `lineTotal = 0.00`
- [x] Return item copy `costPriceSnapshot` จาก original borrow item เพื่อรักษา valuation history
- [x] Deposit เป็นข้อมูลประกอบ loan เท่านั้น; return endpoint ไม่สร้าง refund/payment และไม่รวม deposit ในยอดขาย
- [x] อนุญาตคืนถังของ product ที่ถูก soft delete หรือ inactive เพราะเป็นการปิด historical obligation
- [x] Return response คืนทั้ง created return transaction และ updated loan detail
- [x] Concurrency loser ต้องได้ deterministic conflict และห้ามเกิด over-return หรือ negative stock

## 4. โครงสร้างไฟล์เป้าหมาย

```text
src/
  constants/
    loan.constants.ts
  database/
    prisma/
      schema.prisma
      migrations/
        <timestamp>_add_loan_return_source/
          migration.sql
  modules/
    loans/
      loan-spec.md
      implement-plan.md
      loan.types.ts
      loan.schema.ts
      loan.repository.ts
      loan.service.ts
      loan.controller.ts
      loan.routes.ts
      loan.schema.test.ts
      loan.service.test.ts
      loan.routes.test.ts
    transactions/
      transaction.types.ts
      transaction.repository.ts
      transaction.service.ts
      transaction.service.test.ts
  tests/
    run-loan-integration.ts
```

ชื่อ migration ให้ใช้ timestamp ที่ Prisma สร้างจริง ไม่ต้องใช้ชื่อ placeholder ตามตัวอย่าง

## 5. Phase 1 — Database schema และ migration

### 5.1 Return-history relation

- [x] เพิ่ม `TransactionItem.sourceLoanId BigInt? @map("source_loan_id")`
- [x] เพิ่ม relation จาก `TransactionItem.sourceLoanId` ไป `CylinderLoan.id` ด้วย relation name ที่ชัดเจน เช่น `"LoanReturnItems"`
- [x] เพิ่ม inverse relation บน `CylinderLoan` สำหรับ return transaction items
- [x] ตั้งชื่อ relation เดิมระหว่าง `CylinderLoan` กับ original borrow `TransactionItem` แยกจาก return relation อย่างชัดเจน
- [x] เพิ่ม index บน `transaction_items.source_loan_id`
- [x] คง field เป็น nullable เพื่อรองรับ transaction items เดิมและ item ที่ไม่ใช่ loan return
- [x] ไม่เพิ่ม cascade behavior ที่สามารถลบ historical transaction หรือ loan โดยอ้อม
- [x] สร้างและตรวจ migration SQL ให้ existing rows มีค่า `NULL`
- [x] รัน Prisma generate หลัง migration
- [x] ตรวจ Prisma relation queries และ TypeScript generated types

### 5.2 Database invariants

- [x] ตรวจว่า `CylinderLoan.quantity` และ `returnedQuantity` ใช้ integer semantics
- [x] ตรวจว่า schema/defaults รองรับ `returnedQuantity = 0` เมื่อสร้าง loan
- [x] รักษา unique relation ของ loan กับ original borrow transaction item
- [x] บันทึก return history ผ่าน explicit `sourceLoanId` ทุกครั้ง
- [x] ไม่ใช้ database trigger สำหรับ business workflow ที่ต้องอยู่ใน service transaction

## 6. Phase 2 — Constants, types และ validation schemas

### 6.1 Domain constants

- [x] สร้าง `src/constants/loan.constants.ts`
- [x] กำหนด `LOAN_STATUSES`
- [x] กำหนด `ACTIVE_LOAN_STATUSES`
- [x] กำหนด `RETURNABLE_LOAN_STATUSES`
- [x] กำหนด `FINAL_LOAN_STATUSES`
- [x] ตรวจว่า loan service ไม่มี hard-coded domain status strings

### 6.2 Public และ internal types

- [x] สร้าง `loan.types.ts`
- [x] เพิ่ม `LoanStatus`
- [x] เพิ่ม `ListLoansInput`
- [x] เพิ่ม `ListActiveLoansInput`
- [x] เพิ่ม `ReturnLoanInput`
- [x] เพิ่ม repository query/result types ที่คง `bigint`, `Decimal` และ `Date` ภายใน
- [x] เพิ่ม public summary/detail DTOs ที่ใช้ string IDs, decimal strings และ ISO/date strings
- [x] เพิ่ม return-history DTO
- [x] เพิ่ม repository, transaction runner และ clock interfaces ที่จำเป็นต่อ dependency injection
- [x] เพิ่ม internal `ReturnCylinderWorkflowInput` และ workflow result ใน transaction module
- [x] แยก public request types ออกจาก server-generated transaction/loan response types

### 6.3 Zod schemas

- [x] สร้าง `loan.schema.ts`
- [x] เพิ่ม `loanIdParamsSchema`
- [x] เพิ่ม `listLoansQuerySchema`
- [x] เพิ่ม `listActiveLoansQuerySchema`
- [x] เพิ่ม `returnLoanSchema`

Validation rules:

- [x] Loan ID ตรง `^[1-9][0-9]*$`
- [x] `page >= 1`, default `1`
- [x] `limit` อยู่ระหว่าง `1–100`, default `20`
- [x] `status` รับเฉพาะ loan statuses ที่รองรับ
- [x] `isOverdue` parse จาก query string เป็น boolean อย่างเข้มงวด
- [x] `search` trim แล้วมี `1–150` characters
- [x] Return `quantity` เป็น integer มากกว่า 0
- [x] Return `note` เมื่อส่งมาต้อง trim แล้วไม่เป็น empty string
- [x] ทุก object ใช้ `.strict()` เพื่อ reject unknown/server-owned fields
- [x] เพิ่ม schema tests สำหรับ defaults, boundaries, invalid IDs, invalid status, invalid boolean, empty search/note และ unknown fields

## 7. Phase 3 — Loan read repository และ DTO mapping

### 7.1 General list query

- [x] Implement repository list query ด้วย filters ต่อไปนี้
- [x] `status`
- [x] `isOverdue`
- [x] `search` แบบ case-insensitive OR ระหว่าง customer name snapshot, customer phone snapshot และ original product brand snapshot
- [x] Combine filter groups ด้วย AND
- [x] `isOverdue = true` ใช้ expected return date ก่อน current Bangkok business date และ remaining quantity มากกว่า 0
- [x] `isOverdue = false` คืนรายการที่ไม่เข้า overdue predicate ตาม contract
- [x] ใช้ business date ที่ service ส่งเข้า repository ไม่พึ่ง database session timezone
- [x] Order `createdAt DESC, id DESC`
- [x] ใช้ where เดียวกันสำหรับ rows และ total count
- [x] รองรับ page/limit อย่างถูกต้อง

### 7.2 Active list query

- [x] จำกัด status เป็น `BORROWED`, `PARTIAL_RETURNED`, `OVERDUE`
- [x] จำกัด `quantity - returnedQuantity > 0`
- [x] รองรับ `isOverdue` และ `search` ตาม semantics เดียวกับ general list
- [x] Order overdue ก่อน non-overdue
- [x] ภายในกลุ่ม order `expectedReturnDate ASC NULLS LAST`
- [x] Tie-break ด้วย `borrowedDate ASC, id ASC`
- [x] ใช้ deterministic SQL/Prisma query และทดสอบ null ordering บน PostgreSQL

### 7.3 Detail query และ return history

- [x] Query loan header และ original borrow transaction item
- [x] Query original borrow transaction ที่จำเป็นต่อ detail response
- [x] อ่าน customer snapshots จาก `CylinderLoan`
- [x] อ่าน product brand/weight snapshots จาก original borrow item
- [x] Query return items ด้วย `sourceLoanId`
- [x] Include return transaction header ที่จำเป็นต่อ history
- [x] Order return history ด้วย public field `returnedDate ASC, transactionId ASC` ตาม OpenAPI schema (`returnedAt` ในหัวข้อ 5.3 ของ spec ให้ถือเป็นคำพิมพ์คลาดเคลื่อน)
- [x] ตรวจว่า sum ของ return history quantities สอดคล้องกับ `returnedQuantity` ใน test fixtures
- [x] ไม่ expose internal `sourceLoanId` ใน public response เว้นแต่ contract ระบุ

### 7.4 DTO mapping และ serialization

- [x] สร้าง loan DTO mapper แยกจาก controller
- [x] `bigint -> decimal string`
- [x] `Decimal -> fixed-point string 2 ตำแหน่ง`
- [x] `DateTime -> ISO 8601`
- [x] Prisma `@db.Date -> YYYY-MM-DD`
- [x] คำนวณ `remainingQuantity`
- [x] คำนวณ `isOverdue` จาก injected business date
- [x] Map snapshot fields เป็น public names ตาม OpenAPI contract
- [x] ห้ามคืน Prisma objects หรือ internal relation fields โดยตรง

## 8. Phase 4 — Loan read service

- [x] Implement `LoanService.list(input)`
- [x] Implement `LoanService.listActive(input)`
- [x] Implement `LoanService.get(loanId)`
- [x] Inject `Clock` เพื่อกำหนด current time ใน tests
- [x] คำนวณ business date ด้วย timezone `Asia/Bangkok`
- [x] ส่ง business date เดียวกันให้ query predicate และ DTO mapper
- [x] `get` throw `AppError(NOT_FOUND)` เมื่อไม่พบ loan
- [x] GET methods ต้อง read-only และห้าม update status เป็น `OVERDUE`
- [x] ตรวจว่า `expectedReturnDate = null` ให้ `isOverdue = false`
- [x] ตรวจ boundary: due date เท่ากับ business date ยังไม่ overdue
- [x] ตรวจ boundary ใกล้เที่ยงคืน UTC/Bangkok ด้วย fixed clock

## 9. Phase 5 — Return write infrastructure

### 9.1 Repository primitives

- [x] เพิ่ม transaction-aware repository method สำหรับอ่าน loan พร้อม original borrow snapshots
- [x] เพิ่ม conditional loan claim/update primitive ที่ตรวจ status และ remaining quantity ใน statement เดียว
- [x] ให้ conditional claim update quantity, partial/full status และ returned date ใน statement เดียวโดยไม่เปิด nested transaction
- [x] Reuse daily transaction-number advisory lock และ sequence ของ transaction module
- [x] เพิ่ม create transaction item support สำหรับ `sourceLoanId`
- [x] Reuse initial transaction status-log creation
- [x] เพิ่ม atomic inventory update `loanedQty -= quantity`, `emptyQty += quantity`
- [x] Atomic inventory update ต้องสำเร็จเมื่อ `loanedQty >= returnQuantity` เท่านั้น
- [x] เพิ่ม `LOAN_RETURN` inventory movement หลัง balance update สำเร็จ
- [x] Repository methods ต้องรับ `Prisma.TransactionClient` จาก transaction runner

### 9.2 Conflict classification

- [x] แยก loan not found เป็น `404 NOT_FOUND`
- [x] แยก final loan (`RETURNED`/`CANCELLED`) เป็น `409 CONFLICT`
- [x] แยก requested quantity มากกว่า remaining เป็น `409 CONFLICT`
- [x] แยก concurrent loser เป็น `409 CONFLICT`
- [x] แยก loaned inventory ไม่พอเป็น `409 INSUFFICIENT_STOCK`
- [x] ห้าม retry deterministic validation/business conflicts
- [x] ใช้ bounded retry เฉพาะ transient database conflicts ที่ transaction runner รองรับ

## 10. Phase 6 — `TransactionService.returnCylinder` workflow

Implement internal workflow ตามลำดับต่อไปนี้ภายใน database transaction เดียว:

- [x] รับ validated `loanId`, `quantity`, optional `note` และ authenticated user ID
- [x] อ่าน loan, original borrow transaction item และ snapshot fields ที่จำเป็น
- [x] ยืนยัน loan อยู่ใน `BORROWED`, `PARTIAL_RETURNED` หรือ `OVERDUE`
- [x] ยืนยัน `quantity <= remainingQuantity`
- [x] อนุญาต workflow ต่อแม้ current product `isActive = false`
- [x] Claim return quantity แบบ atomic ก่อนสร้าง side effects
- [x] Acquire transaction-number lock ตาม business date `Asia/Bangkok`
- [x] Generate `TX-YYYYMMDD-NNNN` ด้วย daily sequence เดิม
- [x] สร้าง transaction header ประเภท `RETURN_CYLINDER`
- [x] กำหนด status `COMPLETED`, `queueDate = null`, `queueNo = null`
- [x] กำหนด `totalAmount = 0.00` และ `completedAt = now`
- [x] Copy customer name, phone และ address snapshots จาก source loan
- [x] สร้าง return transaction item action `RETURN`
- [x] ใช้ product ID จาก original borrow item
- [x] Copy product brand, weight และ cost price snapshots จาก original borrow item
- [x] กำหนด `quantity` เท่ากับจำนวนที่คืน
- [x] กำหนด `unitPrice = 0.00` และ `lineTotal = 0.00`
- [x] บันทึก `sourceLoanId`
- [x] สร้าง initial status log `null -> COMPLETED`
- [x] Atomic update inventory balance โดยลด `loanedQty` และเพิ่ม `emptyQty`
- [x] สร้าง `InventoryMovement` ประเภท `LOAN_RETURN` ที่ link transaction ตาม data model ปัจจุบัน
- [x] หากยังเหลือและ source status ไม่ใช่ `OVERDUE` ให้เปลี่ยนเป็น `PARTIAL_RETURNED`
- [x] หากยังเหลือและ source status เป็น `OVERDUE` ให้คง `OVERDUE`
- [x] หากคืนครบให้เปลี่ยนเป็น `RETURNED`
- [x] Full return กำหนด `returnedDate` เป็น Bangkok business date
- [x] Partial return คง `returnedDate = null`
- [x] เมื่อมี note ให้บันทึกบน return transaction และ return item; status log/movement จะ copy note เดียวกันได้เพื่อ audit ตาม implementation decision
- [x] ห้ามเขียน customer snapshots หรือ note ลง application logs
- [x] อ่าน created transaction DTO และ updated loan detail ภายใน transaction
- [x] Commit แล้วคืน `{ transaction, loan }`

Rollback requirements:

- [x] หากสร้าง transaction ไม่สำเร็จ loan quantity ต้องไม่เปลี่ยน
- [x] หาก inventory balance update ไม่สำเร็จ transaction/item/log และ loan claim ต้อง rollback
- [x] หาก movement creation ไม่สำเร็จ balance และ loan ต้อง rollback
- [x] หาก conditional loan lifecycle update ไม่สำเร็จ ต้องไม่มี transaction หรือ inventory effects
- [x] ห้ามเหลือ orphan return item หรือ status log หลัง workflow fail

## 11. Phase 7 — HTTP layer และ route wiring

### 11.1 Controller

- [x] สร้าง `loan.controller.ts`
- [x] `list` อ่าน validated query และเรียก `LoanService.list`
- [x] `listActive` อ่าน validated query และเรียก `LoanService.listActive`
- [x] `get` อ่าน validated params และเรียก `LoanService.get`
- [x] `returnLoan` อ่าน params/body/authenticated user และเรียก `TransactionService.returnCylinder`
- [x] Controllers ต้องบางและไม่ตัดสิน status, quantity, overdue หรือ stock rules
- [x] คืน standard success envelope พร้อม `requestId`
- [x] ปล่อย `AppError` ให้ shared error middleware จัดรูปแบบ

### 11.2 Routes

- [x] สร้าง `loan.routes.ts`
- [x] ใช้ auth middleware กับทุก endpoint
- [x] ใช้ generic role middleware สำหรับ `ADMIN`
- [x] ใช้ shared validation middleware กับ params, query และ body
- [x] ประกาศ `/active` ก่อน `/:loanId` เพื่อไม่ให้ route parameter จับคำว่า `active`
- [x] Wire routes ตาม OpenAPI paths และ methods
- [x] Mount router ที่ `/api/loans` ใน `src/routes.ts`

### 11.3 API behavior

- [x] List responses คืน pagination metadata ตาม spec
- [x] Detail response คืน original borrow information และ return history
- [x] Return response status code และ body ตรง OpenAPI contract
- [x] Validation errors คืน `400 VALIDATION_ERROR`
- [x] Missing/invalid auth คืน `401`
- [x] Non-admin คืน `403`
- [x] Missing loan คืน `404`
- [x] Business/concurrency conflicts คืน `409` พร้อม error code ที่กำหนด
- [x] ไม่มี response ใด expose password hash, JWT data หรือ raw Prisma types

## 12. Phase 8 — Tests

### 12.1 Schema tests

- [x] Valid/invalid loan ID
- [x] List defaults และ maximum limit
- [x] ทุก valid/invalid status
- [x] Strict boolean parsing ของ `isOverdue`
- [x] Search trimming, empty value และ maximum length
- [x] Return quantity positive integer
- [x] Optional note trimming และ empty-note rejection
- [x] Unknown/server-owned fields rejection

### 12.2 Service unit tests

- [x] List ส่ง filters, business date และ pagination ให้ repository ถูกต้อง
- [x] Active list ใช้ active semantics และ deterministic order
- [x] Detail not found
- [x] `remainingQuantity` derivation
- [x] `isOverdue` true/false/null/boundary cases
- [x] Bangkok timezone boundary ด้วย fixed clock
- [x] Successful partial return
- [x] Successful full return
- [x] Partial return ของ overdue loan ยังคง overdue
- [x] Return ของ inactive product สำเร็จ
- [x] Final/cancelled loan conflict
- [x] Excess return conflict
- [x] Insufficient loaned stock
- [x] Snapshot, zero pricing, cost copy และ source-loan relation
- [x] Deposit ไม่กระทบ transaction totals
- [x] Repository failure ทุกจุด rollback workflow

### 12.3 PostgreSQL integration tests

- [x] เพิ่ม isolated PostgreSQL loan integration runner โดย reuse pattern ของ transaction module
- [x] Apply real Prisma migrations และ generate client ก่อน suite
- [x] List search ครอบคลุม customer name, phone และ original product brand
- [x] General list filters combine ด้วย AND
- [x] Overdue predicate ใช้ Bangkok business date ถูกต้อง
- [x] Active ordering: overdue first, due date ascending nulls last, borrowed date และ ID tie-break
- [x] Detail return history อ่านผ่าน `sourceLoanId` และ order ถูกต้อง
- [x] Partial return เขียน transaction/item/log/loan/balance/movement ครบ
- [x] Full return เขียน status และ returned date ถูกต้อง
- [x] Concurrent requests ที่รวมกันเกิน remaining quantity สำเร็จได้เท่าที่อนุญาตและที่เหลือ conflict
- [x] Concurrent returns ห้ามทำ `loanedQty` ติดลบ
- [x] Concurrent transaction-number generation ไม่ซ้ำ
- [x] Inventory failure rollback transaction และ loan changes ทั้งหมด
- [x] Movement failure rollback balance, transaction และ loan changes ทั้งหมด

### 12.4 HTTP integration tests

- [x] `GET /api/loans` success, filters, search และ pagination
- [x] `GET /api/loans/active` success และ route precedence
- [x] `GET /api/loans/:loanId` success/not found
- [x] `POST /api/loans/:loanId/return` partial/full success
- [x] Return validation errors
- [x] Return final/excess/concurrency conflicts
- [x] Return insufficient stock
- [x] Standard success/error envelopes และ request ID
- [x] Authentication และ ADMIN authorization ทุก endpoint
- [x] BigInt/Decimal serialization ไม่มี runtime JSON error

## 13. Phase 9 — Verification และ rollout

- [x] รัน `npm run prisma:generate`
- [x] รัน migration กับ isolated/test PostgreSQL database
- [x] รัน `npm run build`
- [x] รัน `npm test`
- [x] รัน loan PostgreSQL integration suite
- [x] รัน `git diff --check`
- [x] ตรวจ generated migration และ Prisma schema diff
- [x] ตรวจว่าไม่มี `.env`, `dist/`, `node_modules/` หรือ local database artifacts ถูกเพิ่ม
- [x] Smoke test ทั้ง 4 endpoints ด้วย admin JWT
- [x] Smoke test partial return แล้วตรวจ loan, transaction history และ inventory movements
- [x] Smoke test full return แล้วตรวจว่า loan หายจาก active list
- [x] อัปเดตสถานะ checklist ในไฟล์นี้ตามผลจริง
- [x] อัปเดต transaction implementation checklist เรื่อง internal loan-return workflow
- [x] อัปเดต parent backend implementation plan เมื่อ loan phase ผ่านทั้งหมด

## 14. Definition of Done

Loan module ถือว่าเสร็จเมื่อ:

- [x] ทั้ง 4 endpoints ตรงกับ `loan-spec.md`
- [x] Return workflow อยู่ใน `TransactionService` และ atomic ตลอดทั้ง workflow
- [x] Loan reads อยู่ใน `LoanService` และไม่มี side effect
- [x] Return transaction มี snapshots, zero pricing และ `sourceLoanId` ถูกต้อง
- [x] Loan quantity/status/date และ inventory balance/movement สอดคล้องกัน
- [x] Concurrent returns ไม่ทำให้ over-return, duplicate effect หรือ negative inventory
- [x] API serialization และ standard envelopes ถูกต้อง
- [x] Schema, unit, HTTP และ PostgreSQL integration tests ผ่าน
- [x] Prisma generate, migration verification และ TypeScript build ผ่าน
- [x] ไม่มี broad refactor หรือ unrelated user changes ถูกแก้ทับ

## 15. ความเสี่ยงและแนวทางป้องกัน

| ความเสี่ยง | ผลกระทบ | แนวทางป้องกัน |
| --- | --- | --- |
| Return history ไม่มี explicit loan relation | อาจจับ return ผิด loan เมื่อ product/customer ซ้ำกัน | ใช้ nullable `TransactionItem.sourceLoanId` และบังคับ set ใน workflow |
| Concurrent partial returns อ่าน remaining quantity เดียวกัน | Over-return หรือ `returnedQuantity` เกินต้นฉบับ | ใช้ conditional atomic claim/update ภายใน transaction |
| Loan claim สำเร็จแต่ inventory update ล้มเหลว | Loan กับ stock ไม่ตรงกัน | ทำทุก write ใน Prisma transaction เดียวและทดสอบ rollback |
| `loanedQty` น้อยกว่า loan remaining เพราะข้อมูลเดิมผิด | Stock ติดลบ | ใช้ conditional inventory update และคืน `INSUFFICIENT_STOCK` |
| Server/DB timezone ต่างกัน | Overdue, transaction number หรือ returned date ผิดวัน | Inject clock และคำนวณ Bangkok business date อย่าง explicit |
| Product ถูก soft delete ก่อนคืน | ผู้ใช้คืน obligation เดิมไม่ได้ | อ่าน snapshot/original product relationและอนุญาต inactive product |
| Prisma relation naming ชนกัน | Generate client ไม่ผ่านหรือ query สับสน | ตั้งชื่อ original-loan และ return-item relations แยกกัน |
| Route `/:loanId` จับ `/active` | Active endpoint คืน validation error | ประกาศ `/active` ก่อน dynamic route |
| Retry workflow ทั้งก้อนบน business conflict | อาจสร้าง side effect ซ้ำหรือซ่อน conflict | Retry เฉพาะ transient DB errors ที่รู้จักและมี bounded attempts |
