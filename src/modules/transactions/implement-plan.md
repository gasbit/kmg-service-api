# Transaction Module Implementation Plan

สถานะ: Pricing decisions approved — pending remaining contract decisions
อ้างอิงหลัก: `transaction-spec.md`  
Owning module: `transactions`  
Base path: `/api/transactions`

## 1. เป้าหมาย

Implement transaction module ให้ตรงกับ `transaction-spec.md` โดยมี endpoint checklist ต่อไปนี้:

- [ ] `GET /api/transactions` — Transaction history พร้อม filters และ pagination
- [ ] `GET /api/transactions/:transactionId` — Transaction detail พร้อม items และ status logs
- [ ] `POST /api/transactions` — สร้าง transaction และ domain effects
- [ ] `PATCH /api/transactions/:transactionId/status` — เปลี่ยนสถานะตาม allowed transition
- [ ] `POST /api/transactions/:transactionId/cancel` — Convenience action สำหรับยกเลิก transaction

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
- [ ] ยืนยันว่า `expectedReturnDate` เป็น optional ตาม Prisma/spec หรือแก้ spec ก่อนหากต้องการให้ required
- [ ] ยืนยันว่าจะคงทั้ง `PATCH .../status` และ `POST .../cancel` โดยให้ reuse service transition method เดียวกัน
- [ ] ยืนยัน transaction number รูปแบบ `TX-YYYYMMDD-NNNN` ตามวัน `Asia/Bangkok` รวม behavior เมื่อ sequence เกิน 9999
- [ ] ยืนยันว่า queue number เริ่ม 1 ใหม่ทุก business date และ generate ภายใน database transaction
- [ ] ยืนยันว่า payload อนุญาต duplicate product items แต่ aggregate quantity ตอนตรวจและเปลี่ยน stock
- [x] อัปเดต pricing/deposit decisions ที่อนุมัติแล้วกลับเข้า `transaction-spec.md`

Pricing/deposit mapping ได้รับอนุมัติและสะท้อนใน `transaction-spec.md` แล้ว ส่วน write workflow ยังต้องผ่าน remaining contract decisions ด้านบน

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

- [ ] สร้าง `src/constants/transaction.constants.ts`

- [ ] `TRANSACTION_TYPES`
- [ ] `TRANSACTION_STATUSES`
- [ ] `ITEM_ACTIONS`
- [ ] `FINAL_TRANSACTION_STATUSES`
- [ ] `ALLOWED_STATUS_TRANSITIONS`
- [ ] Mapping จาก transaction type ไป initial status และ item action

- [ ] สร้างหรือยืนยัน `src/constants/inventory.constants.ts`

- [ ] `FULL_OUT`
- [ ] `EMPTY_IN`
- [ ] `LOAN_OUT`
- [ ] `LOAN_RETURN`
- [ ] `ADJUSTMENT`

- [ ] ตรวจว่า service/repository ไม่มี hard-coded domain strings

### 5.2 Public และ internal types

- [ ] สร้าง `transaction.types.ts`

- [ ] `TransactionType`, `TransactionStatus`, `ItemAction`
- [ ] `ListTransactionsInput`
- [ ] Discriminated create inputs สำหรับ delivery, walk-in, borrow และ buy-full-tank
- [ ] `ChangeTransactionStatusInput`, `CancelTransactionInput`
- [ ] Repository records ที่ยังใช้ `bigint`, `Decimal`, `Date` ภายใน
- [ ] Public DTOs ที่ใช้ string IDs, decimal strings และ ISO timestamps
- [ ] `TransactionRepository`, `TransactionRunner`, `Clock` interfaces สำหรับ dependency injection
- [ ] Internal workflow inputs สำหรับ loan return ในอนาคต โดยไม่ expose ผ่าน public create schema

- [ ] แยก request types ออกจาก response types ที่มี server-generated fields และ snapshots

### 5.3 Zod schemas

- [ ] สร้าง `transaction.schema.ts`

- [ ] `transactionIdParamsSchema`
- [ ] `listTransactionsQuerySchema`
- [ ] `createTransactionSchema` เป็น discriminated union ด้วย `transactionType`
- [ ] `changeTransactionStatusSchema`
- [ ] `cancelTransactionSchema`

Validation rules:

- [ ] IDs ตรง `^[1-9][0-9]*$`
- [ ] `page >= 1`, default `1`
- [ ] `limit` อยู่ระหว่าง `1–100`, default `20`
- [ ] `dateFrom` และ `dateTo` เป็น calendar date และ `dateFrom <= dateTo`
- [ ] `search` trim แล้วมี `1–150` characters
- [ ] `customerName` trim แล้วมี `1–150` characters
- [ ] Delivery บังคับ `customerAddress`
- [ ] `items` มีอย่างน้อยหนึ่ง item
- [ ] `quantity` เป็น integer มากกว่า 0
- [ ] `expectedReturnDate` เป็น date เมื่อส่งมา
- [ ] `depositAmount` เป็น decimal string ไม่ติดลบและไม่เกิน 2 decimal places
- [ ] ทุก object ใช้ `.strict()` เพื่อ reject server-owned หรือ unknown fields
- [ ] Public create schema ไม่รับ `RETURN_CYLINDER`

- [ ] เพิ่ม schema tests สำหรับทุก union branch, defaults, boundary values, unknown fields, server-owned fields และ invalid date range

## 6. Phase 2 — Read repository และ serialization

- [ ] Implement read path ก่อน write workflows เพื่อยืนยัน DTO shape และ query semantics

### 6.1 List query

- [ ] Implement repository list method ให้รองรับ contract ต่อไปนี้

- [ ] `transactionType`
- [ ] `status`
- [ ] inclusive `dateFrom`/`dateTo` ตาม `Asia/Bangkok`
- [ ] `search` แบบ case-insensitive OR ระหว่าง `transactionNo`, `customerNameSnapshot`, `customerPhoneSnapshot`
- [ ] filters ทุกกลุ่ม combine ด้วย AND
- [ ] order `createdAt DESC, id DESC`
- [ ] page/limit และ total count ภายใต้ where เดียวกัน

- [ ] Implement list projection ให้คืน summary fields, creator `id/name`, `itemCount` และ `totalQuantity` โดยไม่โหลดข้อมูลเกินจำเป็น

### 6.2 Detail query

- [ ] Implement detail query ให้ include ข้อมูลต่อไปนี้

- [ ] transaction header
- [ ] creator `id/name`
- [ ] items จาก snapshot columns
- [ ] status logs พร้อม changed-by user `id/name`

- [ ] กำหนด status logs order เป็น `changedAt ASC, id ASC` และ items order เป็น `id ASC`

### 6.3 Serialization

- [ ] สร้าง DTO mapper แยกจาก controller

- [ ] `bigint -> decimal string`
- [ ] `Decimal -> fixed-point string 2 ตำแหน่ง`
- [ ] `DateTime -> ISO 8601`
- [ ] Prisma `@db.Date -> YYYY-MM-DD`
- [ ] Prisma field names -> public snapshot names เช่น `customerNameSnapshot -> customerName`
- [ ] ห้ามคืน password, username ที่ไม่จำเป็น หรือ internal Prisma object

- [ ] Implement service read methods

- [ ] `list(input)` คืน `{ transactions, pagination }`
- [ ] `get(transactionId)` throw `AppError(NOT_FOUND)` เมื่อไม่พบ

## 7. Phase 3 — Write infrastructure และ concurrency safety

### 7.1 Transaction runner

- [ ] สร้าง transaction runner ที่เรียก `prisma.$transaction` และส่ง `Prisma.TransactionClient` ให้ repository methods
- [ ] ตรวจว่าทุก write repository method รับ transaction client จาก service และไม่เปิด nested transaction

- [ ] กำหนด bounded retry เฉพาะ transient write conflicts/unique races ที่รู้จัก
- [ ] ตรวจว่า validation, insufficient stock และ invalid transition ไม่ถูก retry

### 7.2 Clock และ business date

- [ ] Inject `Clock` เข้า service เพื่อให้ tests กำหนดเวลาได้
- [ ] Implement การคำนวณเวลาและวันที่ต่อไปนี้

- [ ] business date ของ `Asia/Bangkok`
- [ ] UTC start/end boundaries สำหรับ history filters
- [ ] `completedAt`
- [ ] loan `borrowedDate`

- [ ] ตรวจว่า workflow ไม่พึ่ง timezone ของ process หรือ database session โดยไม่กำหนดชัดเจน

### 7.3 Daily number generation

- [ ] เพิ่ม repository primitives สำหรับ daily number generation

- [ ] acquire transaction-scoped advisory lock ตาม business date
- [ ] อ่าน sequence ถัดไปของ transaction number ในวันนั้น
- [ ] อ่าน queue number ถัดไปของวันนั้น

- [ ] Implement ลำดับ daily number generation สำหรับ `DELIVERY_EXCHANGE`

- [ ] Begin transaction
- [ ] Acquire daily lock
- [ ] Generate unique transaction number
- [ ] Generate `queueNo` จาก rows ของ `queueDate` เดียวกัน
- [ ] Insert transaction และ dependent rows
- [ ] Commit

- [ ] ใช้ PostgreSQL advisory lock หรือ `Serializable` isolation พร้อม bounded retry เป็น concurrency strategy หลัก
- [ ] คง unique constraints เป็น safety net และเพิ่ม concurrent integration tests เพื่อพิสูจน์ว่าเลขไม่ซ้ำ

### 7.4 Atomic inventory update

- [ ] Aggregate required quantity ต่อ product ก่อนเปลี่ยน balance
- [ ] Implement conditional atomic inventory updates ต่อไปนี้

- [ ] `FULL_OUT`/exchange/buy: update เฉพาะ row ที่ `fullQty >= requiredQty`
- [ ] `LOAN_OUT`: ลด `fullQty` และเพิ่ม `loanedQty` ใน atomic statement เดียว
- [ ] `LOAN_RETURN`: ลด `loanedQty` และเพิ่ม `emptyQty` ใน atomic statement เดียว
- [ ] Exchange completion: ลด `fullQty` และเพิ่ม `emptyQty` ใน atomic statement เดียว

- [ ] Throw `INSUFFICIENT_STOCK` และ rollback เมื่อ affected row count ไม่ครบ
- [ ] Insert inventory movements หลัง balance update สำเร็จเท่านั้น

## 8. Phase 4 — Create transaction workflow

- [ ] Implement `TransactionService.create(input, currentUser)` ตามลำดับต่อไปนี้

- [ ] Reject `RETURN_CYLINDER` จาก public method
- [ ] รวม product IDs และอ่าน products พร้อม balances ภายใน transaction
- [ ] ตรวจว่าพบ product ครบและทุก product `isActive = true`
- [ ] Derive initial status, item action, price และ cost จาก confirmed contract mapping
- [ ] ใช้ shared pricing policy: exchange อ่าน exchange sale/cost, buy-full-tank อ่าน full-tank sale/cost และ borrow มียอดขายศูนย์พร้อม valuation snapshot
- [ ] สร้าง customer/product/price/cost snapshots
- [ ] คำนวณ `lineTotal = quantity * unitPrice` ด้วย `Prisma.Decimal` ห้ามใช้ floating-point `number`
- [ ] คำนวณ `totalAmount` จาก line totals
- [ ] Generate transaction number และ queue fields ตาม type
- [ ] Insert transaction header
- [ ] Insert transaction items
- [ ] Insert initial status log ด้วย `fromStatus = null`
- [ ] Apply inventory/loan effects ตาม transaction type
- [ ] อ่าน detail representation ภายใน transaction หรือหลัง commit ด้วย ID เดิม
- [ ] Return DTO สำหรับ `201 Created`

### 8.1 DELIVERY_EXCHANGE

- [ ] Initial status `PENDING`
- [ ] Item action `EXCHANGE`
- [ ] Set `queueDate` เป็น business date และ generate `queueNo`
- [ ] ไม่อ่าน/ลด stock เพื่อ reserve ใน MVP
- [ ] ไม่สร้าง inventory movement ตอน create
- [ ] `completedAt = null`

### 8.2 WALK_IN_EXCHANGE

- [ ] Initial status `COMPLETED`
- [ ] Item action `EXCHANGE`
- [ ] `queueDate/queueNo = null`
- [ ] Atomic balance effect: `fullQty -= quantity`, `emptyQty += quantity`
- [ ] สร้าง movements `FULL_OUT` และ `EMPTY_IN` ต่อ item
- [ ] Set `completedAt`

### 8.3 BORROW_CYLINDER

- [ ] Initial status `COMPLETED`
- [ ] Item action `BORROW`
- [ ] Atomic balance effect: `fullQty -= quantity`, `loanedQty += quantity`
- [ ] สร้าง `LOAN_OUT` movement ต่อ item
- [ ] สร้าง `CylinderLoan` หนึ่ง row ต่อ transaction item
- [ ] Copy customer snapshots, product, quantity, expected return date, deposit และ note ไป loan
- [ ] Set `borrowedDate` ตาม business date, `returnedQuantity = 0`, `loanStatus = BORROWED`
- [ ] Set `completedAt`

### 8.4 BUY_FULL_TANK

- [ ] Initial status `COMPLETED`
- [ ] Item action `BUY_FULL_TANK`
- [ ] Atomic balance effect: `fullQty -= quantity`
- [ ] สร้าง `FULL_OUT` movement ต่อ item
- [ ] ไม่สร้าง `EMPTY_IN`
- [ ] Set `completedAt`

Financial classification:

- [ ] `depositAmount` เก็บเฉพาะใน `CylinderLoan` และไม่รวม transaction totals
- [ ] `BORROW_CYLINDER` ไม่ถูกจัดเป็น sales หรือ cost of sales แม้ transaction item จะมี valuation `costPrice`
- [ ] Dashboard ในอนาคตนับ sales/cost/gross profit เฉพาะ completed exchange และ buy-full-tank transactions

### 8.5 Error mapping

- [ ] Product ID ไม่มี: `404 NOT_FOUND`
- [ ] Product inactive: `409 CONFLICT`
- [ ] Stock ไม่พอ: `409 INSUFFICIENT_STOCK`
- [ ] Queue/transaction-number race ที่ retry หมด: `409 CONFLICT`
- [ ] Invalid type-specific business input: `400 VALIDATION_ERROR`
- [ ] Unexpected database error: `500 INTERNAL_ERROR` โดยไม่ leak SQL/stack trace

## 9. Phase 5 — Status transition และ cancellation

- [ ] Implement shared status-transition method

```text
changeStatus(transactionId, targetStatus, note, currentUser)
```

- [ ] ให้ status endpoint และ cancel endpoint reuse method นี้
- [ ] เตรียม method ให้ queue module ในอนาคตเรียกใช้ได้โดยไม่ bypass `TransactionService`

- [ ] Implement status workflow ภายใน database transaction

- [ ] อ่าน transaction และ items ที่จำเป็น
- [ ] ตรวจ transition จาก `ALLOWED_STATUS_TRANSITIONS`
- [ ] Claim transition ด้วย conditional update ที่ set target status และ `completedAt` ตาม target โดย match current status เพื่อกัน concurrent requests; ถ้า affected row เป็นศูนย์ให้คืน conflict
- [ ] หาก target เป็น `COMPLETED` ของ `DELIVERY_EXCHANGE` ให้ apply inventory effects; ถ้า stock ไม่พอให้ throw เพื่อ rollback status claim
- [ ] Insert status log ด้วย from/to status, actor, timestamp และ note
- [ ] Return updated detail

ข้อกำหนด:

- [ ] `PENDING -> IN_PROGRESS`
- [ ] `PENDING -> CANCELLED`
- [ ] `IN_PROGRESS -> COMPLETED`
- [ ] `IN_PROGRESS -> CANCELLED`
- [ ] ห้าม same-state transition
- [ ] ห้ามเปลี่ยน final state
- [ ] Cancellation ไม่สร้าง movement และไม่คืน stock เพราะ delivery create ไม่ reserve stock
- [ ] Delivery completion สร้าง `FULL_OUT` และ `EMPTY_IN` ครั้งเดียว
- [ ] Concurrent complete requests ต้องมีเพียง request เดียวที่สำเร็จ อีก request คืน `INVALID_STATUS_TRANSITION`/conflict โดยไม่สร้าง movement ซ้ำ
- [ ] `cancelTransaction` เรียก `changeStatus(..., CANCELLED, ...)` เท่านั้น ห้าม duplicate workflow

## 10. Phase 6 — HTTP layer และ route wiring

### Controller

Controllers ต้องบาง:

- [ ] อ่าน validated params/query/body จาก middleware
- [ ] อ่าน authenticated user ID จาก request auth payload ซึ่งเป็น string
- [ ] เรียก service method
- [ ] ใช้ standard success envelope
- [ ] List response ใส่ `meta.pagination`
- [ ] Create คืน `201`; operations อื่นคืน `200`
- [ ] ส่ง errors ให้ global error middleware

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

- [ ] `authMiddleware`
- [ ] `requireRoles(ROLE_CODES.ADMIN)`
- [ ] `validate` สำหรับ params/query/body ตามตำแหน่งที่ถูกต้อง

Wire ใน `src/routes.ts`:

```text
apiRouter.use("/transactions", transactionRouter)
```

- [ ] สร้าง thin transaction controller functions สำหรับทั้ง 5 operations
- [ ] สร้าง `transaction.routes.ts` และ wire routes ตามลำดับที่กำหนด
- [ ] ใส่ auth, ADMIN role และ validation middleware ให้ทุก route
- [ ] Wire `transactionRouter` ใต้ `/api/transactions` ใน `src/routes.ts`

## 11. Phase 7 — Tests

### 11.1 Schema tests

- [ ] Valid payload ของ create ทั้ง 4 public types
- [ ] Reject `RETURN_CYLINDER`
- [ ] Reject client-provided price/status/total/queue/itemAction fields
- [ ] Delivery ไม่มี address
- [ ] Empty items, zero/negative/fractional quantity
- [ ] Invalid BigInt ID, pagination, dates และ date range
- [ ] Borrow deposit invalid และ optional expected return date
- [ ] Empty/unknown PATCH fields

### 11.2 Service unit tests

ใช้ fake repository, fake transaction runner และ fixed clock:

- [ ] Snapshot/price/total calculation ของแต่ละ type
- [ ] Delivery create สร้าง queue แต่ไม่มี stock effect
- [ ] Walk-in สร้าง `FULL_OUT + EMPTY_IN`
- [ ] Borrow สร้าง `LOAN_OUT + CylinderLoan` ต่อ item
- [ ] Buy full tank สร้างเฉพาะ `FULL_OUT`
- [ ] Inactive/missing product
- [ ] Insufficient stock
- [ ] Initial status log
- [ ] Rollback เมื่อ step ใด stepหนึ่ง fail
- [ ] Allowed และ rejected status transitions
- [ ] Cancel delegates ไป shared transition workflow
- [ ] Delivery completed once; duplicate completion ไม่สร้าง movement ซ้ำ
- [ ] BigInt/Decimal/Date serialization และ snapshot history

### 11.3 Repository/database integration tests

ใช้ PostgreSQL test database:

- [ ] List filters/search/pagination/order
- [ ] Inclusive Asia/Bangkok date boundaries
- [ ] Detail includes ordered items/status logs
- [ ] Conditional stock update ป้องกัน negative stock
- [ ] Multi-table rollback จริง
- [ ] Concurrent delivery creation ไม่ได้ queue number ซ้ำ
- [ ] Concurrent transaction creation ไม่ได้ transaction number ซ้ำ
- [ ] Concurrent completion ตัด stock และสร้าง movements ครั้งเดียว
- [ ] Unique constraints และ Prisma errors map เป็น operational errors ที่กำหนด

### 11.4 HTTP integration tests

ใช้ Supertest:

- [ ] `401` missing/invalid token
- [ ] `403` non-admin role
- [ ] `400` invalid params/query/body
- [ ] `404` transaction/product not found
- [ ] `409` inactive product, insufficient stock, invalid transition
- [ ] `200/201` response envelope และ `requestId`
- [ ] List pagination metadata
- [ ] Responses ไม่มี password hash, token, raw BigInt หรือ internal fields

## 12. Phase 8 — Validation และ rollout

- [ ] รัน `npm run prisma:generate`
- [ ] รัน `npm run build`
- [ ] รัน `npm test`
- [ ] รัน `npm run lint`

จากนั้นรัน database-backed integration tests และ smoke tests:

- [ ] Create delivery -> `PENDING`, queue assigned, stock unchanged
- [ ] Delivery `PENDING -> IN_PROGRESS -> COMPLETED` -> stock/movements correct
- [ ] Cancel pending delivery -> no stock movement
- [ ] Create walk-in -> completed and stock changed immediately
- [ ] Create borrow -> completed, loan created, stock moved to loaned
- [ ] Create buy full tank -> completed, only full stock decreased
- [ ] Verify history/detail snapshots after product price/brand update

- [ ] อัปเดต `Backend-Implement-Plan.md` หลัง behavior ผ่าน tests และเปลี่ยนสถานะ transaction phase จาก `Todo` ตามหลักฐานจริง

## 13. Definition of done

- [ ] Phase 0 decisions ถูกอนุมัติและสะท้อนใน `transaction-spec.md`
- [ ] ทั้ง 5 operations ตรงกับ contract และ standard response envelope
- [ ] Controllers ไม่มี business rules
- [ ] Repositories มีเฉพาะ database access
- [ ] ทุก write workflow อยู่ใน database transaction เดียว
- [ ] Queue/transaction numbers ปลอดภัยภายใต้ concurrent requests
- [ ] Stock ไม่มีทางติดลบจาก transaction race
- [ ] ทุก status change มี status log
- [ ] ทุก stock change มี movement
- [ ] Delivery create ไม่ตัด stock และ completion ตัด stock ครั้งเดียว
- [ ] Completed/cancelled transactions mutate ไม่ได้
- [ ] Snapshots และ decimal/BigInt/date serialization ถูกต้อง
- [ ] Unit, integration และ HTTP tests ครอบคลุม happy paths, conflicts, rollback และ concurrency
- [ ] `prisma:generate`, build, tests และ lint ผ่าน หรือมี known tooling issue ที่บันทึกไว้ชัดเจน
- [ ] Implementation gaps/contract deviations ถูกอัปเดตกลับเข้า `transaction-spec.md`

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
