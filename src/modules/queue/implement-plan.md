# Queue Module Implementation Plan

สถานะ: Implemented — Queue read/status endpoints, shared write workflow และ tests พร้อม  
อ้างอิงหลัก: `queue-spec.md`  
Owning module: `queue` สำหรับ read/API orchestration และ `transactions` สำหรับ write workflow  
Base path: `/api/queues`

## 1. เป้าหมาย

Implement Queue module ให้ตรงกับ `queue-spec.md` โดยมี endpoint checklist:

- [x] `GET /api/queues/today` — อ่านคิว `DELIVERY_EXCHANGE` ของ business date วันนี้
- [x] `GET /api/queues?date=YYYY-MM-DD` — อ่านคิวตาม persisted `queueDate`
- [x] `PATCH /api/queues/:transactionId/status` — เปลี่ยนสถานะคิวผ่าน shared Transaction workflow

ผลลัพธ์ต้องรักษา invariants:

- Queue เป็น projection ของ `Transaction` และไม่มี Queue table/ID แยก
- Queue entry ต้องเป็น `DELIVERY_EXCHANGE` ที่มี `queueDate` และ `queueNo`
- Queue read ใช้ persisted `queueDate` ไม่ derive จาก `createdAt`
- Queue number ที่ assign แล้วห้ามแก้, คืนเลข หรือ renumber
- ทุก status change สร้าง status log
- `DELIVERY_EXCHANGE` ไม่เปลี่ยน stock ตอนสร้างหรือเริ่มงาน
- Delivery ตัด full stock, รับ empty stock และสร้าง movements ครั้งเดียวเมื่อ `COMPLETED`
- Status, completion timestamp, inventory balance, movements และ status log สำเร็จหรือล้มเหลวพร้อมกัน
- QueueService ห้ามสร้าง status/inventory workflow ซ้ำจาก TransactionService
- Public response ใช้ historical snapshots และไม่ expose `costPrice`
- Database `BigInt`, Prisma `Decimal` และ dates ต้อง serialize ตาม API conventions

## 2. สถานะ baseline ปัจจุบัน

ส่วนที่ implement และทดสอบแล้ว:

- [x] `DELIVERY_EXCHANGE` เริ่มสถานะ `PENDING`
- [x] Server กำหนด `queueDate` จาก Bangkok business date
- [x] Server generate `queueNo` ภายใน database transaction
- [x] PostgreSQL advisory transaction lock ป้องกัน concurrent queue-number race
- [x] Database unique constraint `(queueDate, queueNo)`
- [x] Transaction runner ใช้ `ReadCommitted` และ bounded retry สำหรับ known write conflicts
- [x] `TransactionService.changeStatus` ตรวจ allowed transitions
- [x] Conditional status claim ป้องกัน concurrent completion ซ้ำ
- [x] Delivery completion ใช้ conditional atomic inventory update
- [x] Delivery completion สร้าง `FULL_OUT` และ `EMPTY_IN` movements
- [x] ทุก successful status change สร้าง status log
- [x] Insufficient stock และ movement failure rollback workflow
- [x] Transaction unit และ PostgreSQL concurrency tests ครอบคลุม queue generation/complete-once baseline

ส่วนที่ยังไม่มี:

- [x] Queue-specific Zod schemas และ DTO types
- [x] Query queue ด้วย exact persisted `queueDate`
- [x] Queue entry mapper ที่ไม่ expose cost
- [x] Queue read service และ repository
- [x] Queue-specific status guard สำหรับ non-delivery/missing queue data
- [x] Queue controller/routes
- [x] Route wiring ใต้ `/api/queues`
- [x] Queue schema/service/HTTP/PostgreSQL integration tests

## 3. ขอบเขตและ module boundaries

### อยู่ในขอบเขต

- Queue request schemas และ public DTOs
- Read-only repository สำหรับ queue projection
- Queue mapper สำหรับ snapshot-based representation
- QueueService สำหรับ today/date reads และ orchestration ของ status update
- Queue-specific validation ก่อน shared status workflow
- Controllers, routes, auth/role/validation middleware wiring
- Unit, HTTP และ PostgreSQL integration tests
- Route wiring และ package script สำหรับ isolated queue integration suite
- อัปเดต implementation status ในเอกสารเมื่อ verification ผ่าน

### ไม่อยู่ในขอบเขต

- Queue database table หรือ Prisma model ใหม่
- Schema migration สำหรับ Queue
- Direct queue creation endpoint
- Queue number edit, reorder, delete หรือ reuse
- Rider assignment, delivery route, GPS และ notification
- Pagination ของ daily queue
- Payment, customer master และ multi-branch behavior
- Inventory list/adjustment endpoints
- Dashboard aggregation

### Ownership rules

- `QueueRepository` อ่านข้อมูลเท่านั้น
- `QueueService` เป็นเจ้าของ read use cases และ HTTP-facing Queue orchestration
- `TransactionService` เป็นเจ้าของ status transition, status log, completion timestamp และ inventory effects
- Controller ห้าม query Prisma, ตรวจ transition หรือตัด stock
- Queue status endpoint ต้องเรียก shared Transaction workflow ห้าม copy logic จาก `changeStatus`
- Repository ห้ามเปิด nested database transaction

## 4. Phase 0 — Contract decision gate

ยืนยัน decisions จาก `queue-spec.md` ก่อนเริ่ม implementation:

- [x] ยืนยันว่า read endpoints คืน terminal statuses ด้วยเมื่อไม่ส่ง `status`
- [x] ยืนยันว่า MVP daily queue ไม่ paginate
- [x] ยืนยันว่า Queue entry คืน lightweight `items` แต่ไม่คืน `costPrice`
- [x] ยืนยันว่า Queue entry ไม่คืน `statusLogs`; frontend ใช้ Transaction detail เมื่อต้องดู audit
- [x] ยืนยันว่า non-delivery transaction และ transaction ที่ไม่มี queue data คืน `404 NOT_FOUND`
- [x] ยืนยันว่า Queue ไม่มี dedicated cancel endpoint และใช้ status `CANCELLED`
- [x] ยืนยันว่า `PENDING -> COMPLETED` โดยตรงยังไม่อนุญาต
- [x] ยืนยันว่า alternate Transaction status endpoint ยังคงอยู่และไม่เปลี่ยน contract

ถ้าไม่มี requirement เพิ่ม ให้ใช้ conservative assumptions ใน `queue-spec.md` เป็น approved MVP contract แล้วเริ่ม Phase 1

## 5. โครงสร้างไฟล์เป้าหมาย

```text
src/
  modules/
    queue/
      queue-spec.md
      implement-plan.md
      queue.types.ts
      queue.schema.ts
      queue.repository.ts
      queue.mapper.ts
      queue.service.ts
      queue.controller.ts
      queue.routes.ts
      queue.schema.test.ts
      queue.mapper.test.ts
      queue.service.test.ts
      queue.routes.test.ts
      queue.integration.test.ts
    transactions/
      transaction.types.ts
      transaction.repository.ts
      transaction.service.ts
      transaction.service.test.ts
  tests/
    run-queue-integration.ts
```

ไฟล์ที่ต้องแก้:

```text
src/routes.ts
package.json
Backend-Implement-Plan.md       # อัปเดตเมื่อ implementation และ verification เสร็จ
```

ไม่ต้องแก้ `schema.prisma` หรือสร้าง migration หาก implementation ยังอยู่ใน MVP contract ปัจจุบัน

## 6. Phase 1 — Types และ validation schemas

### 6.1 Public และ internal types

- [x] สร้าง `queue.types.ts`
- [x] เพิ่ม `QueueStatus` โดย reuse type/constants จาก transaction module
- [x] เพิ่ม `ListTodayQueueInput`
- [x] เพิ่ม `ListQueueByDateInput`
- [x] เพิ่ม `UpdateQueueStatusInput`
- [x] เพิ่ม internal repository query type `{ queueDate, status? }`
- [x] เพิ่ม repository record type ที่คง `bigint`, `Decimal` และ `Date` ภายใน
- [x] เพิ่ม `QueueItemDto`
- [x] เพิ่ม `QueueEntryDto`
- [x] เพิ่ม `QueueListResult` รูป `{ queueDate, queues }`
- [x] เพิ่ม `QueueRepository` interface เพื่อ dependency injection
- [x] Reuse shared `Clock` type จาก date utilities/transaction types โดยไม่สร้าง timezone abstraction ซ้ำ
- [x] แยก request types ออกจาก response DTOs
- [x] Queue public types ต้องไม่มี `costPrice`, raw Prisma relation หรือ internal lock fields

Queue DTO fields:

- [x] `id` เป็น transaction ID string
- [x] `transactionNo`
- [x] `status`
- [x] non-null `queueDate`
- [x] non-null positive `queueNo`
- [x] customer snapshots
- [x] `totalAmount` เป็น fixed-point string
- [x] transaction note
- [x] lightweight item snapshots
- [x] `totalQuantity`
- [x] created-by public user
- [x] created/updated/completed timestamps

### 6.2 Zod schemas

- [x] สร้าง `queue.schema.ts`
- [x] เพิ่ม `listTodayQueueQuerySchema`
- [x] เพิ่ม `listQueueByDateQuerySchema`
- [x] เพิ่ม `queueTransactionIdParamsSchema`
- [x] เพิ่ม `updateQueueStatusSchema`

Validation rules:

- [x] Today query รับ optional `status`
- [x] Date query บังคับ `date`
- [x] Date ต้องเป็น calendar date จริงรูปแบบ `YYYY-MM-DD`
- [x] Status filter รับ `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`
- [x] Transaction ID ตรง `^[1-9][0-9]*$`
- [x] Update target รับเฉพาะ `IN_PROGRESS`, `COMPLETED`, `CANCELLED`
- [x] Update target ไม่รับ `PENDING`
- [x] Optional note ต้อง trim และมีอย่างน้อย 1 character
- [x] ทุก schema ใช้ `.strict()` เพื่อ reject unknown/server-owned fields
- [x] Query boolean/number coercion ไม่จำเป็นเพราะ contract ไม่มี pagination หรือ boolean filter

### 6.3 Schema tests

- [x] Today query ยอมรับ empty object
- [x] Today/date queries ยอมรับ Queue statuses ทุกค่า
- [x] Date query reject missing/empty date
- [x] Reject impossible calendar dates เช่น `2026-02-30`
- [x] Reject datetime แทน calendar date
- [x] Reject unknown query fields
- [x] Accept positive decimal-string transaction ID
- [x] Reject zero, negative, decimal และ non-numeric IDs
- [x] Accept update targets ทั้ง 3 ค่า
- [x] Reject `PENDING` และ unknown status
- [x] Trim valid note
- [x] Reject empty/whitespace note
- [x] Reject unknown/server-owned body fields

## 7. Phase 2 — Queue read repository และ DTO mapping

### 7.1 Repository projection

- [x] สร้าง `queue.repository.ts`
- [x] Implement `listByDate({ queueDate, status? })`
- [x] บังคับ `transactionType = DELIVERY_EXCHANGE`
- [x] Filter exact persisted `queueDate`
- [x] บังคับ `queueNo != null`
- [x] Apply optional exact status filter
- [x] Combine filters ด้วย AND
- [x] Include transaction item snapshots เท่าที่ Queue DTO ต้องใช้
- [x] Include created-by user เฉพาะ `id` และ `name`
- [x] Order `queueNo ASC, id ASC`
- [x] ไม่ join current Product เพื่อแทน snapshot fields
- [x] ไม่ mutate status หรือข้อมูลอื่นระหว่าง read
- [x] ไม่ใช้ Transaction history list method เพราะ method นั้น filter วันที่ด้วย `createdAt`

Repository select/include ต้องมีอย่างน้อย:

- [x] Transaction ID/number/status/queue fields
- [x] Customer snapshots
- [x] Total/note
- [x] Item IDs, product IDs, product snapshots, quantity, unit price, line total และ note
- [x] Creator ID/name
- [x] Created/updated/completed timestamps

### 7.2 Queue identity query สำหรับ write scope

เลือก implementation ที่ validate Queue scope ภายใน Transaction write transaction:

- [x] ขยาย `TransactionForStatus` ให้มี `queueDate` และ `queueNo`
- [x] ขยาย `findForStatus` select ให้มี queue fields
- [x] ตรวจ `transactionType = DELIVERY_EXCHANGE`
- [x] ตรวจ `queueDate != null`
- [x] ตรวจ `queueNo != null`
- [x] Map missing/non-delivery/missing-queue-data เป็น `404 NOT_FOUND`
- [x] ห้ามใช้ read-then-write จาก QueueRepository เป็น security/business guard เพียงอย่างเดียว

เหตุผล: guard ภายใน shared write transaction ทำให้ validation และ status claim ใช้ state เดียวกัน และไม่ทำให้ QueueService ต้องเขียน business workflow ซ้ำ

### 7.3 DTO mapper

- [x] สร้าง `queue.mapper.ts`
- [x] Map `bigint -> decimal string`
- [x] Map `Decimal -> fixed-point string 2 ตำแหน่ง`
- [x] Map Prisma `@db.Date -> YYYY-MM-DD`
- [x] Map DateTime -> ISO 8601
- [x] Map customer/product columns จาก snapshots เป็น public names
- [x] Assert/guard ว่า Queue record มี non-null `queueDate` และ `queueNo`
- [x] Map items order ให้ deterministic ตาม `id ASC`
- [x] Derive `totalQuantity` จาก item quantities
- [x] ไม่คืน `costPrice`
- [x] ไม่คืน `customerId`
- [x] ไม่คืน `statusLogs`
- [x] ไม่คืน raw Prisma objects

### 7.4 Mapper tests

- [x] BigInt ID serialization
- [x] Decimal money/weight serialization 2 ตำแหน่ง
- [x] Date/date-time serialization
- [x] Nullable customer phone/address/note/completedAt
- [x] Multiple items และ total quantity
- [x] Snapshot values ไม่ขึ้นกับ current product
- [x] Public output ไม่มี `costPrice` และ internal fields
- [x] Invalid internal record ที่ไม่มี queue data fail แบบ deterministic

## 8. Phase 3 — Queue read service

- [x] สร้าง `queue.service.ts`
- [x] Inject `QueueRepository`
- [x] Inject `Clock`
- [x] Inject shared Transaction status collaborator สำหรับ write operation
- [x] Implement `listToday(input)`
- [x] Implement `listByDate(input)`
- [x] `listToday` คำนวณ business date ด้วย shared `bangkokBusinessDate(clock.now())`
- [x] `listByDate` ใช้ validated `date` โดยตรง
- [x] ส่ง exact selected date และ optional status ให้ repository
- [x] Map repository rows เป็น Queue DTOs
- [x] คืน `{ queueDate, queues }`
- [x] วันที่ valid แต่ไม่มี rows คืน empty array
- [x] GET methods เป็น read-only
- [x] ห้ามใช้ process-local/UTC date slicing แทน Bangkok utility

Service unit tests:

- [x] Today ใช้ Bangkok business date
- [x] Boundary ก่อน/หลังเที่ยงคืน Bangkok
- [x] Today ส่ง optional status ถูกต้อง
- [x] By-date ใช้ requested date ไม่ใช้ clock date
- [x] Empty repository result คืน empty queues
- [x] Mapper ถูกเรียกสำหรับทุก row
- [x] Repository error propagate ไป error middleware

## 9. Phase 4 — Queue-specific status workflow

### 9.1 Shared TransactionService refactor

เป้าหมายคือเพิ่ม Queue scope โดยไม่เปลี่ยน behavior ของ existing Transaction endpoint:

- [x] Extract internal status workflow methodจาก `TransactionService.changeStatus`
- [x] ให้ internal method รับ optional scope เช่น `ANY_TRANSACTION` หรือ `DELIVERY_QUEUE`
- [x] `changeStatus` เดิมเรียก internal methodด้วย scope `ANY_TRANSACTION`
- [x] เพิ่ม `changeQueueStatus` เรียก internal methodด้วย scope `DELIVERY_QUEUE`
- [x] Scope validation อยู่หลังอ่าน transaction ภายใน `prisma.$transaction` และก่อน claim status
- [x] Scope `DELIVERY_QUEUE` reject non-delivery หรือ missing queue fields ด้วย `404 NOT_FOUND`
- [x] Reuse allowed transition validation เดิม
- [x] Reuse conditional status claim เดิม
- [x] Reuse delivery inventory effects เดิม
- [x] Reuse status-log creation เดิม
- [x] Reuse detail read และ error mapping เดิม
- [x] Existing `changeStatus` และ `cancel` tests ต้องผ่านโดยไม่มี contract change

ถ้าหลีกเลี่ยง refactor ด้วย private methodไม่ได้ อนุญาตให้เพิ่ม optional internal scope argumentที่มี default เป็น existing behavior แต่ห้าม expose scope ให้ HTTP client

### 9.2 QueueService update orchestration

- [x] Implement `QueueService.updateStatus(transactionId, input, currentUser)`
- [x] เรียก `TransactionService.changeQueueStatus`
- [x] Map returned Transaction detail เป็น `QueueEntryDto`
- [x] ไม่ expose `costPrice` หรือ `statusLogs` จาก Transaction detail
- [x] คืน updated Queue entry ตาม contract
- [x] ห้ามเปิด Prisma transaction ใหม่ใน QueueService
- [x] ห้าม update transaction/inventory ผ่าน QueueRepository

### 9.3 Error behavior

- [x] Missing transaction -> `404 NOT_FOUND`
- [x] Non-delivery transaction -> `404 NOT_FOUND`
- [x] Delivery ที่ queue fields ไม่ครบ -> `404 NOT_FOUND`
- [x] Invalid/duplicate/final transition -> `409 INVALID_STATUS_TRANSITION`
- [x] Concurrent status loser -> `409 INVALID_STATUS_TRANSITION`
- [x] Insufficient full stock -> `409 INSUFFICIENT_STOCK`
- [x] Unexpected failures -> `500 INTERNAL_ERROR`
- [x] Error response ต้องมี standard envelope และ `requestId`

### 9.4 Regression invariants

- [x] `PENDING -> IN_PROGRESS` ไม่เปลี่ยน inventory
- [x] `IN_PROGRESS -> COMPLETED` ลด `fullQty` และเพิ่ม `emptyQty`
- [x] Completion สร้างสอง movements ต่อ item
- [x] `PENDING/IN_PROGRESS -> CANCELLED` ไม่เปลี่ยน inventory
- [x] Status log สร้างครั้งเดียวต่อ successful change
- [x] Failed workflow ไม่เปลี่ยน status/completedAt/balance/movement/log
- [x] Concurrent completion ตัด stockครั้งเดียว

## 10. Phase 5 — HTTP layer และ route wiring

### 10.1 Controller

- [x] สร้าง `queue.controller.ts`
- [x] `listTodayQueue` อ่าน validated query และเรียก `QueueService.listToday`
- [x] `listQueueByDate` อ่าน validated query และเรียก `QueueService.listByDate`
- [x] `updateQueueStatus` อ่าน params/body/authenticated user และเรียก `QueueService.updateStatus`
- [x] Controllers ต้องบางและไม่มี date/status/inventory business rules
- [x] คืน standard success response พร้อม `meta.requestId`
- [x] Read responses ไม่มี pagination metadataตาม contract
- [x] ปล่อย `AppError` ให้ shared error middleware

### 10.2 Routes

- [x] สร้าง `queue.routes.ts`
- [x] ใช้ `authMiddleware` กับทุก route
- [x] ใช้ `requireRoles(ROLE_CODES.ADMIN)` กับทุก route
- [x] ใช้ shared validation middleware สำหรับ query, params และ body
- [x] ประกาศ `/today` ก่อน dynamic status route
- [x] Wire `GET /today`
- [x] Wire `GET /`
- [x] Wire `PATCH /:transactionId/status`
- [x] Mount `queueRouter` ที่ `/api/queues` ใน `src/routes.ts`

### 10.3 API response verification

- [x] `GET /api/queues/today` คืน `{ success, data: { queueDate, queues }, meta }`
- [x] `GET /api/queues?date=...` คืน response shape เดียวกัน
- [x] `PATCH .../status` คืน `{ success, data: QueueEntry, meta }`
- [x] BigInt/Decimal serialization ไม่ทำให้ JSON runtime error
- [x] Validation errors คืน `400 VALIDATION_ERROR`
- [x] Missing/invalid auth คืน `401`
- [x] Non-admin คืน `403`
- [x] Non-queue target คืน `404`
- [x] Business/concurrency conflicts คืน `409`

## 11. Phase 6 — Tests

### 11.1 Unit tests

- [x] รัน schema tests จาก Phase 1
- [x] รัน mapper tests จาก Phase 2
- [x] รัน QueueService read tests จาก Phase 3
- [x] เพิ่ม QueueService update delegation/mapping tests
- [x] เพิ่ม TransactionService tests สำหรับ Queue scope guard
- [x] ยืนยัน existing TransactionService tests ทั้งหมดผ่าน
- [x] Mock repository/clock/collaborator ผ่าน interfaces ไม่ผูก Prisma client ใน unit tests

### 11.2 Route/HTTP tests

- [x] ทุก Queue route ไม่มี token ได้ `401`
- [x] Invalid token ได้ `401`
- [x] Valid non-admin token ได้ `403`
- [x] Valid admin เรียก today ได้
- [x] Valid admin เรียก by-date ได้
- [x] Valid admin เปลี่ยน status ได้
- [x] Invalid/missing date ได้ `400`
- [x] Invalid status filter ได้ `400`
- [x] Invalid transaction ID ได้ `400`
- [x] Invalid body/unknown field ได้ `400`
- [x] Non-queue target ได้ `404`
- [x] Empty date result ได้ `200` และ `queues: []`
- [x] Success/error envelope มี request ID

### 11.3 PostgreSQL integration suite

- [x] สร้าง `queue.integration.test.ts`
- [x] สร้าง isolated runner `src/tests/run-queue-integration.ts`
- [x] เพิ่ม `npm run test:queues:integration`
- [x] Runner ปฏิเสธ database ที่ชื่อไม่ลงท้าย `_test`
- [x] Apply migrations และ generate Prisma Client ก่อน suiteตาม pattern ปัจจุบัน
- [x] Seed fixtures แบบ deterministic และ cleanup เฉพาะ isolated test database

Read scenarios:

- [x] Today คืนเฉพาะ `DELIVERY_EXCHANGE` ของ persisted Bangkok queue date
- [x] By-date ใช้ `queueDate` ไม่ใช่ `createdAt`
- [x] Status filter combine กับ date ด้วย AND
- [x] Walk-in/Borrow/Buy/Return ไม่ปรากฏใน Queue
- [x] Delivery ที่ queue fields ไม่ครบไม่ปรากฏ
- [x] Ordering `queueNo ASC, id ASC`
- [x] Valid date ไม่มีข้อมูลคืน empty array
- [x] Snapshot fieldsยังเป็นค่าเดิมหลังแก้ Product master
- [x] Response ไม่ expose cost

Write scenarios:

- [x] `PENDING -> IN_PROGRESS` success พร้อม status log และไม่มี movement
- [x] `IN_PROGRESS -> COMPLETED` success พร้อม balance/movements/completedAt
- [x] Cancel จาก `PENDING` success และไม่ตัด stock
- [x] Cancel จาก `IN_PROGRESS` success และไม่ตัด stock
- [x] Direct `PENDING -> COMPLETED` conflict
- [x] Completed/Cancelled terminal conflicts
- [x] Insufficient stock rollback ทุกผล
- [x] Movement failure rollback ทุกผล
- [x] Concurrent completion สำเร็จครั้งเดียว
- [x] Non-delivery ID และ missing queue fields คืน `404`

Existing-core regression:

- [x] Concurrent create หลายรายการได้ transaction/queue numbers ไม่ซ้ำ
- [x] Queue number เริ่มใหม่เมื่อ business date เปลี่ยน
- [x] Cancelled queue คงหมายเลขเดิม
- [x] Existing `/api/transactions/:id/status` behavior ไม่เปลี่ยน

### 11.4 Test runner integration

- [x] กำหนดให้ queue DB suite เป็น isolated command `npm run test:queues:integration`
- [x] Main `npm test` ต้องไม่เชื่อมต่อ production/local non-test database
- [x] CI database ต้องเป็น isolated PostgreSQL
- [ ] เพิ่ม CI job ให้ทุก PR รัน Queue/Transaction/Loan PostgreSQL integration suites เมื่อ repository เริ่มใช้ CI

## 12. Phase 7 — Verification, documentation และ rollout

- [x] รัน `npm run prisma:generate`
- [x] รัน `npx prisma validate`
- [x] รัน `npm run build`
- [x] รัน `npm run lint`
- [x] รัน `npm test`
- [x] รัน `npm run test:transactions:integration`
- [x] รัน `npm run test:queues:integration`
- [x] รัน `git diff --check`
- [x] ตรวจว่าไม่มี migration/schema change ที่ไม่จำเป็น
- [x] ตรวจว่าไม่มี `.env`, `dist/`, `node_modules` หรือ test database artifacts ถูกเพิ่ม
- [x] Smoke test ทั้ง 3 endpoints ด้วย ADMIN JWT
- [x] Smoke test status flow `PENDING -> IN_PROGRESS -> COMPLETED`
- [x] ตรวจ transaction detail/status logs หลัง Queue status update
- [x] ตรวจ inventory balance/movements หลัง complete
- [x] ตรวจ cancelled queue ว่า stock ไม่เปลี่ยน
- [x] ตรวจ Queue responses ไม่มี `costPrice`
- [x] อัปเดตสถานะใน `queue-spec.md` จาก Proposed เป็น Implemented เมื่อผ่านครบ
- [x] อัปเดต checklist ในไฟล์นี้ตามผลจริง
- [x] อัปเดต Queue phase และ endpoint count ใน `Backend-Implement-Plan.md`
- [x] OpenAPI 3.1 contract ปัจจุบันอยู่ใน `queue-spec.md`; ยังไม่มี contract กลางแยกที่ต้องอัปเดต

## 13. Definition of Done

Queue module ถือว่าเสร็จเมื่อ:

- [x] ทั้ง 3 endpoints ตรง `queue-spec.md`
- [x] Queue reads ใช้ persisted `queueDate/queueNo` และ deterministic ordering
- [x] Queue entry อ่าน customer/product/price snapshots ถูกต้อง
- [x] Queue response ไม่ expose cost/internal fields
- [x] Today ใช้ business date `Asia/Bangkok`
- [x] Date query และ status filter ทำงานตาม AND semantics
- [x] Queue-specific status path รับเฉพาะ queue-backed delivery transaction
- [x] Status workflow reuse TransactionService และไม่มี duplicate business logic
- [x] Completion/cancellation effects ตรง domain rules
- [x] Status/log/inventory writes atomic และ rollback ได้
- [x] Concurrent create/complete ไม่สร้างเลขซ้ำหรือตัด stockซ้ำ
- [x] Auth, ADMIN role, validation และ standard envelopes ถูกต้อง
- [x] Schema, mapper, service, route, HTTP และ PostgreSQL integration tests ผ่าน
- [x] Prisma validation/generate, TypeScript build, lint และ main tests ผ่าน
- [x] Existing Transaction API ไม่มี regression
- [x] เอกสารสถานะและ parent implementation plan ถูกอัปเดต
- [x] ไม่มี broad refactor หรือ unrelated user changes ถูกแก้ทับ

## 14. ลำดับการลงมือทำ

ลำดับ dependency ที่แนะนำ:

```text
Contract decisions
  -> Types/Schemas
  -> Read repository
  -> Queue mapper
  -> Queue read service
  -> Transaction queue-scope guard
  -> Queue update orchestration
  -> Controller/Routes
  -> Unit/HTTP tests
  -> PostgreSQL integration tests
  -> Verification/Docs
```

แบ่ง delivery checkpoints:

1. Read slice: types, schemas, repository, mapper, service และ GET endpoints
2. Write slice: queue-scope guard, shared status workflow และ PATCH endpoint
3. Quality slice: schema/unit/HTTP/DB tests, smoke tests และ documentation update

แต่ละ checkpoint ต้องรักษา build และ existing test suite ให้ผ่าน ห้ามรอแก้ regression ตอนท้ายทั้งหมด

## 15. ความเสี่ยงและแนวทางป้องกัน

| ความเสี่ยง | ผลกระทบ | แนวทางป้องกัน |
| --- | --- | --- |
| Reuse Transaction history list โดย filter `createdAt` | คิวผิดวันเมื่อ `createdAt` กับ `queueDate` ต่างกัน | สร้าง exact queue-date repository query |
| QueueService copy status/inventory workflow | กฎสองชุด drift และอาจตัด stockซ้ำ | เพิ่ม queue scope ใน shared TransactionService |
| Precheck Queue นอก write transactionเท่านั้น | Scope validation อาจไม่สอดคล้องกับ claimed state | ตรวจ queue identity ภายใน Transaction transaction |
| Queue mapper reuse Transaction detailตรง ๆ | อาจ expose `costPrice` และ status logs | สร้าง explicit Queue DTO mapper |
| Today ใช้ UTC/process timezone | คิวเปลี่ยนวันผิดช่วงเที่ยงคืนไทย | Inject Clock และใช้ `bangkokBusinessDate` |
| Missing deterministic order | UI แสดงลำดับคิวไม่นิ่ง | Order `queueNo ASC, id ASC` ใน repository |
| Terminal statuses ถูกซ่อนโดยไม่ตั้งใจ | Admin ตรวจประวัติคิวทั้งวันไม่ได้ | Default ไม่ filter status; filter เฉพาะเมื่อ client ส่ง |
| Queue ต่อวันมากกว่าคาด | Response ใหญ่เพราะไม่มี pagination | Monitor usage และทำ contract revision ก่อน scale/multi-branch |
| Alternate status paths ให้ผลต่างกัน | Client behavior และ audit ไม่สอดคล้อง | ใช้ internal workflow methodเดียวและ regression test ทั้งสอง paths |
| Concurrent completion | Stock/movement ซ้ำ | คง conditional status claim และ atomic inventory update |
| Partial write เมื่อ movement fail | Status กับ stockไม่ตรง | รักษา Prisma transaction boundary และ rollback integration test |
| Prisma generated client stale | Build fail หลัง schema changesอื่น | รัน `prisma:generate` ก่อน build/DB suites |
| Route wiring precedence ผิด | `/today` ถูกจับเป็น dynamic parameter | ประกาศ static route ก่อน dynamic route |

## 16. Out-of-scope follow-up

หลัง Queue MVP เสร็จ สามารถพิจารณาแยกงานต่อไปนี้:

- Dashboard today aggregation จาก Queue read query
- Role `RIDER` และ assignment fields
- Queue reordering พร้อม explicit audit trail
- Delivery attempt/history
- Notification/outbox
- Multi-branch queue partition
- Pagination/cursor สำหรับปริมาณคิวสูง
- Read model/materialized view เมื่อ query volume สูง

งานเหล่านี้ห้ามถูกรวมเข้า Queue MVP โดยไม่มี contract และ database design ที่อนุมัติเพิ่ม
