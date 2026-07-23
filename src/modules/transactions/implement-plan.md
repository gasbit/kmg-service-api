# Transaction Module Implementation Plan

สถานะ: Implemented — unit, HTTP, workflow, rollback และ PostgreSQL concurrency tests passed
อ้างอิงหลัก: `transaction-spec.md`  
Owning module: `transactions`  
Base path: `/api/transactions`

## 1. เป้าหมาย

Implement transaction module ให้ตรงกับ `transaction-spec.md` โดยมี endpoint checklist ต่อไปนี้:

- [x] `GET /api/transactions` — Transaction history พร้อม filters และ pagination
- [x] `GET /api/transactions/:transactionId` — Transaction detail พร้อม items และ status logs
- [x] `POST /api/transactions` — สร้าง transaction และ domain effects
- [x] `PATCH /api/transactions/:transactionId/status` — เปลี่ยนสถานะตาม allowed transition
- [x] `POST /api/transactions/:transactionId/cancel` — Convenience action สำหรับยกเลิก transaction

ผลลัพธ์ต้องรักษา invariants ต่อไปนี้:

- ทุก multi-table write สำเร็จหรือล้มเหลวพร้อมกันใน `prisma.$transaction`
- ทุก transaction มี initial status log และทุก status change มี status log
- ทุก stock change มี inventory movement ที่ตรวจสอบย้อนหลังได้
- `DELIVERY_EXCHANGE` ไม่เปลี่ยน stock ตอนสร้าง และเปลี่ยน stock ครั้งเดียวตอน `COMPLETED`
- `COMPLETED` และ `CANCELLED` เป็น final state
- Client ไม่สามารถกำหนดราคา ทุน ยอดรวม สถานะ คิว หรือ creator เอง
- Historical responses อ่านค่าจาก snapshots ไม่พึ่ง current product/customer master
- Database `BigInt` IDs และ Prisma `Decimal` ต้อง serialize เป็น string

## 2. ขอบเขตและ module boundaries

### อยู่ในขอบเขต

- Constants และ Zod schemas ของ transaction
- Transaction repository สำหรับ database access
- Transaction service สำหรับ create, status transition, cancellation, snapshots, queue effects, inventory effects และ borrow-loan creation
- Controllers, routes และ API response serialization
- Unit tests ของ service/schema และ HTTP integration tests ของ endpoints
- Wiring `/api/transactions` ใน `src/routes.ts`

### ไม่อยู่ในขอบเขต

- Queue list endpoints
- Loan list/detail/return endpoints
- Inventory balance/movement list และ manual adjustment endpoints
- Dashboard aggregation
- Customer master CRUD
- Discount, payment, price override, idempotency key และ multi-branch behavior

`TransactionService` ต้องเป็น workflow owner แม้ queue, loan หรือ inventory modules จะเพิ่มภายหลัง Modules เหล่านั้นต้องเรียก workflow ของ `TransactionService` หรือ shared domain collaborators ภายใต้ transaction เดียว ห้าม update transaction/stock/loan ตรงจาก controller หรือ repository ของ module อื่น

## 3. Phase 0 — Contract decision gate

ต้องยืนยัน checklist ต่อไปนี้ก่อนเริ่ม write workflow เพราะเปลี่ยน public contract หรือยอดเงิน:

- [x] ยืนยัน exchange price mapping: `unitPrice = exchangeSalePrice`, `costPrice = exchangeCostPrice`
- [x] เพิ่ม `Product.fullTankCostPrice` และยืนยัน buy-full-tank mapping: `unitPrice = fullTankPrice`, `costPrice = fullTankCostPrice`
- [x] ยืนยัน borrow item pricing: `unitPrice = 0.00`, `costPrice = exchangeCostPrice` ในฐานะ valuation snapshot, `lineTotal = 0.00` และไม่ใช้คำนวณ gross profit
- [x] ยืนยันว่าไม่รวม `depositAmount` ใน `lineTotal`, `totalAmount`, Dashboard sales หรือต้นทุนขาย
- [x] ยืนยันว่า MVP ไม่มี discount, client price override หรือ cost override
- [x] ยืนยันว่า `expectedReturnDate` เป็น optional และคง Prisma nullable; ร้านติดตามการคืนจาก active loan, `borrowedDate` และ remaining quantity
- [x] ยืนยันว่าจะคงทั้ง `PATCH .../status` และ `POST .../cancel` โดยให้ reuse service transition method เดียวกัน
- [x] ยืนยัน transaction number รูปแบบ `TX-YYYYMMDD-NNNN` ตามวัน `Asia/Bangkok`; suffix มีอย่างน้อย 4 หลักและขยายเกิน 9999 ได้โดยไม่ fail
- [x] ยืนยันว่า queue number เริ่ม 1 ใหม่ทุก business date และ generate ภายใน database transaction
- [x] ยืนยันว่า public payload ต้อง reject duplicate `productId`; Frontend เพิ่ม `quantity` บน item เดิม และ service ยัง aggregate quantity ก่อน stock update เป็น defensive safety
- [x] อัปเดต pricing/deposit decisions ที่อนุมัติแล้วกลับเข้า `transaction-spec.md`

Contract decisions ทั้งหมดได้รับอนุมัติและสะท้อนใน `transaction-spec.md` แล้ว

## 4. โครงสร้างไฟล์เป้าหมาย

```text
src/
  constants/
    transaction.constants.ts
    inventory.constants.ts
  modules/
    transactions/
      transaction-spec.md
      implement-plan.md
      transaction.types.ts
      transaction.schema.ts
      transaction.repository.ts
      transaction.service.ts
      transaction.controller.ts
      transaction.routes.ts
      transaction.schema.test.ts
      transaction.service.test.ts
      transaction.routes.test.ts
  shared/
    utils/
      date.ts                 # เพิ่มเมื่อไม่มี utility ที่เหมาะสม
      serialize.ts            # เพิ่มหรือขยาย utility กลางสำหรับ BigInt/Decimal/Date
```

ไม่ต้องสร้าง queue table หรือย้าย queue fields ออกจาก `Transaction`

## 5. Phase 1 — Constants, types และ validation schemas

### 5.1 Domain constants

- [x] สร้าง `src/constants/transaction.constants.ts`

- [x] `TRANSACTION_TYPES`
- [x] `TRANSACTION_STATUSES`
- [x] `ITEM_ACTIONS`
- [x] `FINAL_TRANSACTION_STATUSES`
- [x] `ALLOWED_STATUS_TRANSITIONS`
- [x] Mapping จาก transaction type ไป initial status และ item action

- [x] สร้างหรือยืนยัน `src/constants/inventory.constants.ts`

- [x] `FULL_OUT`
- [x] `EMPTY_IN`
- [x] `LOAN_OUT`
- [x] `LOAN_RETURN`
- [x] `ADJUSTMENT`

- [x] ตรวจว่า service/repository ไม่มี hard-coded domain strings

### 5.2 Public และ internal types

- [x] สร้าง `transaction.types.ts`

- [x] `TransactionType`, `TransactionStatus`, `ItemAction`
- [x] `ListTransactionsInput`
- [x] Discriminated create inputs สำหรับ delivery, walk-in, borrow และ buy-full-tank
- [x] `ChangeTransactionStatusInput`, `CancelTransactionInput`
- [x] Repository records ที่ยังใช้ `bigint`, `Decimal`, `Date` ภายใน
- [x] Public DTOs ที่ใช้ string IDs, decimal strings และ ISO timestamps
- [x] `TransactionRepository`, `TransactionRunner`, `Clock` interfaces สำหรับ dependency injection
- [x] Internal workflow inputs สำหรับ loan return โดยไม่ expose ผ่าน public create schema

- [x] แยก request types ออกจาก response types ที่มี server-generated fields และ snapshots

### 5.3 Zod schemas

- [x] สร้าง `transaction.schema.ts`

- [x] `transactionIdParamsSchema`
- [x] `listTransactionsQuerySchema`
- [x] `createTransactionSchema` เป็น discriminated union ด้วย `transactionType`
- [x] `changeTransactionStatusSchema`
- [x] `cancelTransactionSchema`

Validation rules:

- [x] IDs ตรง `^[1-9][0-9]*$`
- [x] `page >= 1`, default `1`
- [x] `limit` อยู่ระหว่าง `1–100`, default `20`
- [x] `dateFrom` และ `dateTo` เป็น calendar date และ `dateFrom <= dateTo`
- [x] `search` trim แล้วมี `1–150` characters
- [x] `customerName` trim แล้วมี `1–150` characters
- [x] Delivery บังคับ `customerAddress`
- [x] `items` มีอย่างน้อยหนึ่ง item
- [x] `quantity` เป็น integer มากกว่า 0
- [x] `productId` ต้องไม่ซ้ำภายใน `items`; duplicate คืน `400 VALIDATION_ERROR` พร้อม path ของ item ที่ซ้ำ
- [x] `expectedReturnDate` เป็น date เมื่อส่งมา
- [x] เมื่อไม่ส่ง `expectedReturnDate` ให้บันทึก `null`; ห้ามสร้าง default date โดยเดา
- [x] `depositAmount` เป็น decimal string ไม่ติดลบและไม่เกิน 2 decimal places
- [x] ทุก object ใช้ `.strict()` เพื่อ reject server-owned หรือ unknown fields
- [x] Public create schema ไม่รับ `RETURN_CYLINDER`

- [x] เพิ่ม schema tests สำหรับทุก union branch, defaults, boundary values, unknown fields, server-owned fields และ invalid date range

## 6. Phase 2 — Read repository และ serialization

- [x] Implement read path ก่อน write workflows เพื่อยืนยัน DTO shape และ query semantics

### 6.1 List query

- [x] Implement repository list method ให้รองรับ contract ต่อไปนี้

- [x] `transactionType`
- [x] `status`
- [x] inclusive `dateFrom`/`dateTo` ตาม `Asia/Bangkok`
- [x] `search` แบบ case-insensitive OR ระหว่าง `transactionNo`, `customerNameSnapshot`, `customerPhoneSnapshot`
- [x] filters ทุกกลุ่ม combine ด้วย AND
- [x] order `createdAt DESC, id DESC`
- [x] page/limit และ total count ภายใต้ where เดียวกัน

- [x] Implement list projection ให้คืน summary fields, creator `id/name`, `itemCount` และ `totalQuantity` โดยไม่โหลดข้อมูลเกินจำเป็น

### 6.2 Detail query

- [x] Implement detail query ให้ include ข้อมูลต่อไปนี้

- [x] transaction header
- [x] creator `id/name`
- [x] items จาก snapshot columns
- [x] status logs พร้อม changed-by user `id/name`

- [x] กำหนด status logs order เป็น `changedAt ASC, id ASC` และ items order เป็น `id ASC`

### 6.3 Serialization

- [x] สร้าง DTO mapper แยกจาก controller

- [x] `bigint -> decimal string`
- [x] `Decimal -> fixed-point string 2 ตำแหน่ง`
- [x] `DateTime -> ISO 8601`
- [x] Prisma `@db.Date -> YYYY-MM-DD`
- [x] Prisma field names -> public snapshot names เช่น `customerNameSnapshot -> customerName`
- [x] ห้ามคืน password, username ที่ไม่จำเป็น หรือ internal Prisma object

- [x] Implement service read methods

- [x] `list(input)` คืน `{ transactions, pagination }`
- [x] `get(transactionId)` throw `AppError(NOT_FOUND)` เมื่อไม่พบ

## 7. Phase 3 — Write infrastructure และ concurrency safety

### 7.1 Transaction runner

- [x] สร้าง transaction runner ที่เรียก `prisma.$transaction` และส่ง `Prisma.TransactionClient` ให้ repository methods
- [x] ตรวจว่าทุก write repository method รับ transaction client จาก service และไม่เปิด nested transaction

- [x] กำหนด bounded retry เฉพาะ transient write conflicts/unique races ที่รู้จัก
- [x] ตรวจว่า validation, insufficient stock และ invalid transition ไม่ถูก retry

### 7.2 Clock และ business date

- [x] Inject `Clock` เข้า service เพื่อให้ tests กำหนดเวลาได้
- [x] Implement การคำนวณเวลาและวันที่ต่อไปนี้

- [x] business date ของ `Asia/Bangkok`
- [x] UTC start/end boundaries สำหรับ history filters
- [x] `completedAt`
- [x] loan `borrowedDate`

- [x] ตรวจว่า workflow ไม่พึ่ง timezone ของ process หรือ database session โดยไม่กำหนดชัดเจน

### 7.3 Daily number generation

- [x] เพิ่ม repository primitives สำหรับ daily number generation

- [x] acquire transaction-scoped advisory lock ตาม business date
- [x] อ่าน sequence ถัดไปของ transaction number ในวันนั้น
- [x] อ่าน queue number ถัดไปของวันนั้น

- [x] Implement ลำดับ daily number generation สำหรับ `DELIVERY_EXCHANGE`

- [x] Begin transaction
- [x] Acquire daily lock
- [x] Generate unique transaction number
- [x] Generate `queueNo` จาก rows ของ `queueDate` เดียวกัน
- [x] Insert transaction และ dependent rows
- [x] Commit

- [x] ใช้ PostgreSQL transaction-scoped advisory lock ภายใต้ explicit `ReadCommitted` พร้อม bounded retry เป็น concurrency strategy หลัก
- [x] คง unique constraints เป็น safety net และเพิ่ม concurrent integration tests เพื่อพิสูจน์ว่าเลขไม่ซ้ำ
- [x] Sequence ใช้ร่วมกันทุก transaction type, reset ทุก business date และห้าม reuse เลขของ cancelled transaction
- [x] อ่าน suffix ด้วย numeric cast ไม่ใช้ lexical `MAX(transactionNo)` เพื่อให้ลำดับหลัง `9999` ถูกต้อง

### 7.4 Atomic inventory update

- [x] Aggregate required quantity ต่อ product ก่อนเปลี่ยน balance
- [x] Implement conditional atomic inventory updates ต่อไปนี้

- [x] `FULL_OUT`/exchange/buy: update เฉพาะ row ที่ `fullQty >= requiredQty`
- [x] `LOAN_OUT`: ลด `fullQty` และเพิ่ม `loanedQty` ใน atomic statement เดียว
- [x] `LOAN_RETURN`: ลด `loanedQty` และเพิ่ม `emptyQty` ใน atomic statement เดียว
- [x] Exchange completion: ลด `fullQty` และเพิ่ม `emptyQty` ใน atomic statement เดียว

- [x] Throw `INSUFFICIENT_STOCK` และ rollback เมื่อ affected row count ไม่ครบ
- [x] Insert inventory movements หลัง balance update สำเร็จเท่านั้น

## 8. Phase 4 — Create transaction workflow

- [x] Implement `TransactionService.create(input, currentUser)` ตามลำดับต่อไปนี้

- [x] Reject `RETURN_CYLINDER` จาก public method
- [x] รวม product IDs และอ่าน products ภายใน transaction; inventory ใช้ conditional atomic update โดยตรง
- [x] ตรวจว่าพบ product ครบและทุก product `isActive = true`
- [x] Derive initial status, item action, price และ cost จาก confirmed contract mapping
- [x] ใช้ shared pricing policy: exchange อ่าน exchange sale/cost, buy-full-tank อ่าน full-tank sale/cost และ borrow มียอดขายศูนย์พร้อม valuation snapshot
- [x] สร้าง customer/product/price/cost snapshots
- [x] คำนวณ `lineTotal = quantity * unitPrice` ด้วย `Prisma.Decimal` ห้ามใช้ floating-point `number`
- [x] คำนวณ `totalAmount` จาก line totals
- [x] Generate transaction number และ queue fields ตาม type
- [x] Insert transaction header
- [x] Insert transaction items
- [x] Insert initial status log ด้วย `fromStatus = null`
- [x] Apply inventory/loan effects ตาม transaction type
- [x] อ่าน detail representation ภายใน transaction ด้วย ID เดิม
- [x] Return DTO สำหรับ `201 Created`

### 8.1 DELIVERY_EXCHANGE

- [x] Initial status `PENDING`
- [x] Item action `EXCHANGE`
- [x] Set `queueDate` เป็น business date และ generate `queueNo`
- [x] ไม่อ่าน/ลด stock เพื่อ reserve ใน MVP
- [x] ไม่สร้าง inventory movement ตอน create
- [x] `completedAt = null`

### 8.2 WALK_IN_EXCHANGE

- [x] Initial status `COMPLETED`
- [x] Item action `EXCHANGE`
- [x] `queueDate/queueNo = null`
- [x] Atomic balance effect: `fullQty -= quantity`, `emptyQty += quantity`
- [x] สร้าง movements `FULL_OUT` และ `EMPTY_IN` ต่อ item
- [x] Set `completedAt`

### 8.3 BORROW_CYLINDER

- [x] Initial status `COMPLETED`
- [x] Item action `BORROW`
- [x] Atomic balance effect: `fullQty -= quantity`, `loanedQty += quantity`
- [x] สร้าง `LOAN_OUT` movement ต่อ item
- [x] สร้าง `CylinderLoan` หนึ่ง row ต่อ transaction item
- [x] Copy customer snapshots, product, quantity, expected return date, deposit และ note ไป loan
- [x] Set `borrowedDate` ตาม business date, `returnedQuantity = 0`, `loanStatus = BORROWED`
- [x] Set `completedAt`

### 8.4 BUY_FULL_TANK

- [x] Initial status `COMPLETED`
- [x] Item action `BUY_FULL_TANK`
- [x] Atomic balance effect: `fullQty -= quantity`
- [x] สร้าง `FULL_OUT` movement ต่อ item
- [x] ไม่สร้าง `EMPTY_IN`
- [x] Set `completedAt`

Financial classification:

- [x] `depositAmount` เก็บเฉพาะใน `CylinderLoan` และไม่รวม transaction totals
- [x] `BORROW_CYLINDER` ไม่ถูกจัดเป็น sales หรือ cost of sales แม้ transaction item จะมี valuation `costPrice`
- [ ] Dashboard ในอนาคตนับ sales/cost/gross profit เฉพาะ completed exchange และ buy-full-tank transactions

### 8.5 Error mapping

- [x] Product ID ไม่มี: `404 NOT_FOUND`
- [x] Product inactive: `409 CONFLICT`
- [x] Stock ไม่พอ: `409 INSUFFICIENT_STOCK`
- [x] Queue/transaction-number race ที่ retry หมด: `409 CONFLICT`
- [x] Invalid type-specific business input: `400 VALIDATION_ERROR`
- [x] Unexpected database error: `500 INTERNAL_ERROR` โดยไม่ leak SQL/stack trace

## 9. Phase 5 — Status transition และ cancellation

- [x] Implement shared status-transition method

```text
changeStatus(transactionId, targetStatus, note, currentUser)
```

- [x] ให้ status endpoint และ cancel endpoint reuse method นี้
- [x] เตรียม method ให้ queue module ในอนาคตเรียกใช้ได้โดยไม่ bypass `TransactionService`

- [x] Implement status workflow ภายใน database transaction

- [x] อ่าน transaction และ items ที่จำเป็น
- [x] ตรวจ transition จาก `ALLOWED_STATUS_TRANSITIONS`
- [x] Claim transition ด้วย conditional update ที่ set target status และ `completedAt` ตาม target โดย match current status เพื่อกัน concurrent requests; ถ้า affected row เป็นศูนย์ให้คืน conflict
- [x] หาก target เป็น `COMPLETED` ของ `DELIVERY_EXCHANGE` ให้ apply inventory effects; ถ้า stock ไม่พอให้ throw เพื่อ rollback status claim
- [x] Insert status log ด้วย from/to status, actor, timestamp และ note
- [x] Return updated detail

ข้อกำหนด:

- [x] `PENDING -> IN_PROGRESS`
- [x] `PENDING -> CANCELLED`
- [x] `IN_PROGRESS -> COMPLETED`
- [x] `IN_PROGRESS -> CANCELLED`
- [x] ห้าม same-state transition
- [x] ห้ามเปลี่ยน final state
- [x] Cancellation ไม่สร้าง movement และไม่คืน stock เพราะ delivery create ไม่ reserve stock
- [x] Delivery completion สร้าง `FULL_OUT` และ `EMPTY_IN` ครั้งเดียว
- [x] Concurrent complete requests ใช้ conditional claim + serializable retry เพื่อให้มีเพียง request เดียวที่สำเร็จ
- [x] `cancelTransaction` เรียก `changeStatus(..., CANCELLED, ...)` เท่านั้น ห้าม duplicate workflow

## 10. Phase 6 — HTTP layer และ route wiring

### Controller

Controllers ต้องบาง:

- [x] อ่าน validated params/query/body จาก middleware
- [x] อ่าน authenticated user ID จาก request auth payload ซึ่งเป็น string
- [x] เรียก service method
- [x] ใช้ standard success envelope
- [x] List response ใส่ `meta.pagination`
- [x] Create คืน `201`; operations อื่นคืน `200`
- [x] ส่ง errors ให้ global error middleware

### Routes

สร้าง `transaction.routes.ts` และเรียง route อย่างไม่กำกวม:

```text
GET    /
POST   /
GET    /:transactionId
PATCH  /:transactionId/status
POST   /:transactionId/cancel
```

ทุก route ใช้:

- [x] `authMiddleware`
- [x] `requireRoles(ROLE_CODES.ADMIN)`
- [x] `validate` สำหรับ params/query/body ตามตำแหน่งที่ถูกต้อง

Wire ใน `src/routes.ts`:

```text
apiRouter.use("/transactions", transactionRouter)
```

- [x] สร้าง thin transaction controller functions สำหรับทั้ง 5 operations
- [x] สร้าง `transaction.routes.ts` และ wire routes ตามลำดับที่กำหนด
- [x] ใส่ auth, ADMIN role และ validation middleware ให้ทุก route
- [x] Wire `transactionRouter` ใต้ `/api/transactions` ใน `src/routes.ts`

## 11. Phase 7 — Tests

### 11.1 Schema tests

- [x] Valid payload ของ create ทั้ง 4 public types
- [x] Reject `RETURN_CYLINDER`
- [x] Reject client-provided price/status/total/queue/itemAction fields
- [x] Delivery ไม่มี address
- [x] Empty items, zero/negative/fractional quantity
- [x] Duplicate `productId` ใน create payload
- [x] Invalid BigInt ID, pagination, dates และ date range
- [x] Borrow deposit invalid และ optional expected return date
- [x] Empty/unknown PATCH fields

### 11.2 Service unit tests

ใช้ fake repository, fake transaction runner และ fixed clock:

- [x] Snapshot/price/total calculation ของแต่ละ type
- [x] Delivery create สร้าง queue แต่ไม่มี stock effect
- [x] Walk-in สร้าง `FULL_OUT + EMPTY_IN`
- [x] Borrow สร้าง `LOAN_OUT + CylinderLoan` ต่อ item
- [x] Buy full tank สร้างเฉพาะ `FULL_OUT`
- [x] Inactive/missing product
- [x] Insufficient stock
- [x] Initial status log repository integration test
- [x] Rollback เมื่อ step ใด stepหนึ่ง fail
- [x] Allowed และ rejected status transitions ครบทุก transition
- [x] Cancel delegates ไป shared transition workflow
- [x] Delivery completion inventory effects หลัง conditional status claim
- [x] BigInt/Decimal/Date serialization

### 11.3 Repository/database integration tests

ใช้ PostgreSQL test database:

- [x] List filters/search/pagination/order
- [x] Inclusive Asia/Bangkok date boundaries
- [x] Detail includes ordered items/status logs
- [x] Conditional stock update ป้องกัน negative stock — verified against local PostgreSQL in a rolled-back smoke transaction
- [x] Multi-table rollback จริง
- [x] Concurrent delivery creation ไม่ได้ queue number ซ้ำ
- [x] Concurrent transaction creation ไม่ได้ transaction number ซ้ำ
- [x] Concurrent completion ตัด stock และสร้าง movements ครั้งเดียว
- [x] Unique constraints และ Prisma errors map เป็น operational errors ที่กำหนด

### 11.4 HTTP integration tests

ใช้ Supertest:

- [x] `401` missing/invalid token ครบทั้ง 5 routes
- [x] `403` non-admin role
- [x] `400` invalid params/query/body
- [x] `404` transaction/product not found
- [x] `409` inactive product, insufficient stock, invalid transition
- [x] Error response envelope และ `requestId` สำหรับ auth boundary
- [x] List pagination metadata
- [x] Responses ไม่มี password hash, token, raw BigInt หรือ internal fields

## 12. Phase 8 — Validation และ rollout

- [x] รัน `npm run prisma:generate`
- [x] รัน `npm run build`
- [x] รัน `npm test` — 100 tests passed; transaction database integration 5 scenarios และ loan database integration 5 scenarios passed
- [x] รัน `npm run lint`

จากนั้นรัน database-backed integration tests และ smoke tests:

- [x] Create delivery -> `PENDING`, queue assigned, stock unchanged
- [x] Delivery `PENDING -> IN_PROGRESS -> COMPLETED` -> stock/movements correct
- [x] Cancel pending delivery -> no stock movement
- [x] Create walk-in -> completed and stock changed immediately
- [x] Create borrow -> completed, loan created, stock moved to loaned
- [x] Create buy full tank -> completed, only full stock decreased
- [x] Verify history/detail snapshots after product price/brand update

- [x] อัปเดต `Backend-Implement-Plan.md` หลัง behavior ผ่าน tests และเปลี่ยนสถานะ transaction phase ตามหลักฐานจริง

## 13. Definition of done

- [x] Phase 0 decisions ถูกอนุมัติและสะท้อนใน `transaction-spec.md`
- [x] ทั้ง 5 operations ตรงกับ contract และ standard response envelope
- [x] Controllers ไม่มี business rules
- [x] Repositories มีเฉพาะ database access
- [x] ทุก write workflow อยู่ใน database transaction เดียว
- [x] Queue/transaction numbers ปลอดภัยภายใต้ concurrent requests
- [x] Stock ไม่มีทางติดลบจาก transaction race
- [x] ทุก status change มี status log
- [x] ทุก stock change มี movement
- [x] Delivery create ไม่ตัด stock และ completion ตัด stock ครั้งเดียว
- [x] Completed/cancelled transactions mutate ไม่ได้
- [x] Snapshots และ decimal/BigInt/date serialization ถูกต้อง
- [x] Unit, integration และ HTTP tests ครอบคลุม happy paths, conflicts, rollback และ concurrency
- [x] `prisma:generate`, build, tests และ lint ผ่าน หรือมี known tooling issue ที่บันทึกไว้ชัดเจน
- [x] Implementation gaps/contract deviations ถูกอัปเดตกลับเข้า `transaction-spec.md`

## 14. Risks และ mitigations

| Risk | Mitigation |
| --- | --- |
| Queue/transaction number ซ้ำ | Daily advisory lock หรือ Serializable transaction + bounded retry + unique constraint |
| Stock ถูกตัดซ้ำจาก concurrent complete | Conditional status claim ภายใน transaction และ movement หลัง claim สำเร็จ |
| Stock ติดลบ | Aggregate quantities และ conditional atomic balance update |
| Decimal precision ผิด | ใช้ `Prisma.Decimal`; serialize เป็น fixed-point string |
| วันที่คลาดเพราะ timezone | Inject clock และแปลง business date/boundaries ด้วย `Asia/Bangkok` |
| Historical data เปลี่ยนตาม product | อ่านและคืน snapshot columns เสมอ |
| Partial write ระหว่าง transaction/loan/inventory | Service-owned `prisma.$transaction`; repository รับ transaction client |
| Return workflow bypass loan state | ไม่รับ `RETURN_CYLINDER` จาก public create; loan module ต้องเรียก TransactionService |
| Service ใหญ่เกินไป | แยก pure helpers/collaborators สำหรับ pricing, serialization และ inventory effects โดยคง orchestration ownership ที่ TransactionService |
