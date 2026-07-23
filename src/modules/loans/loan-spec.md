# Loan API Specification

สถานะเอกสาร: Proposed contract สำหรับ MVP (ยังไม่มี implementation)  
เวอร์ชัน: 0.1.0  
Base path: `/api`  
Owning module: `loans`

## 1. ขอบเขต

เอกสารนี้กำหนด API contract สำหรับการติดตาม cylinder loans และการคืนถังที่ยืม:

- อ่าน loan ทั้งหมดแบบแบ่งหน้า พร้อม status, overdue และ customer search
- อ่านเฉพาะ active loans ที่ยังคืนไม่ครบ
- อ่าน loan detail พร้อมประวัติการคืนที่อ้างอิง transaction จริง
- คืนถังแบบบางส่วนหรือเต็มจำนวนผ่าน loan เดิม
- ทุกการคืนสร้าง `RETURN_CYLINDER` transaction, transaction item snapshot, initial status log และ `LOAN_RETURN` inventory movement
- การอัปเดต loan, transaction, inventory balance และ movement ต้องสำเร็จหรือล้มเหลวพร้อมกัน
- ทุก endpoint ใช้ Bearer JWT และจำกัดสิทธิ์เป็น `ADMIN` สำหรับ MVP

ไม่รวมการสร้าง loan โดยตรง, การแก้ไข loan terms, การยกเลิก loan, การคืนเงินมัดจำ, payment workflow, notification, automated overdue scheduler และ customer master CRUD

Loan ใหม่เกิดจาก `BORROW_CYLINDER` transaction เท่านั้น ส่วน `RETURN_CYLINDER` ห้ามสร้างผ่าน generic `POST /api/transactions` และต้องเกิดจาก `POST /api/loans/{loanId}/return` เท่านั้น

## 2. แหล่งอ้างอิงและสถานะ implementation

Contract นี้อ้างอิง:

- `AGENTS.md`
- `CONTEXT.md`
- `Backend-Implement-Plan.md`
- `../Business-Flow.md`
- `../Backend-Architecture.md`
- `../Database-Design.md`
- `src/modules/transactions/transaction-spec.md`
- Prisma models `CylinderLoan`, `Transaction`, `TransactionItem`, `TransactionStatusLog`, `InventoryBalance` และ `InventoryMovement`
- shared error codes ใน `src/shared/errors/error-codes.ts`

ณ เวลาจัดทำ:

- `BORROW_CYLINDER` transaction สามารถสร้าง `CylinderLoan` ได้แล้ว
- ยังไม่มี loan routes, schemas, controllers, services หรือ repositories
- ยังไม่มี public loan list/detail/return endpoints
- Prisma schema ยังไม่มี relation จาก return transaction item กลับไปยัง source loan

ดังนั้นเอกสารนี้เป็นเป้าหมายสำหรับ implementation ไม่ใช่คำอธิบาย behavior ที่เปิดใช้งานอยู่แล้ว

เอกสารเก่าบางชุดใช้ `/api/v1/loans` หรือ `/api/cylinder-loans` แต่ route conventions ปัจจุบันใช้ `/api` และ frontend implementation plan ใช้ module path `/loans` Contract นี้จึงกำหนด canonical path เป็น `/api/loans`

## 3. Contract decisions

### 3.1 Loan creation และ ownership

- Client ไม่สามารถสร้าง `CylinderLoan` โดยตรง
- Loan หนึ่งรายการเกิดจาก transaction item หนึ่งรายการของ `BORROW_CYLINDER`
- `TransactionService` เป็นเจ้าของ return workflow เพราะ workflow แตะ transaction, status log, inventory และ loan พร้อมกัน
- Loan controller ต้องบางและห้าม update loan หรือ inventory โดยตรง
- Loan repository รับผิดชอบ database access เท่านั้นและห้ามเปิด nested transaction

### 3.2 Identifiers, decimal และเวลา

- Database IDs เป็น `BigInt` และ serialize เป็น decimal string เช่น `"42"`
- Monetary values เป็น fixed-point decimal string 2 ตำแหน่ง เช่น `"500.00"`
- DateTime เป็น ISO 8601 UTC string
- Business date เช่น `borrowedDate`, `expectedReturnDate` และ `returnedDate` ใช้ `YYYY-MM-DD`
- การคำนวณ overdue, return business date และ transaction number ใช้เขตเวลา `Asia/Bangkok`

### 3.3 Loan status และ remaining quantity

Loan statuses:

- `BORROWED`: ยังไม่คืน
- `PARTIAL_RETURNED`: คืนบางส่วนและยังไม่เลยกำหนด
- `RETURNED`: คืนครบแล้ว
- `OVERDUE`: ยังคืนไม่ครบและถูก overdue process กำหนดสถานะไว้
- `CANCELLED`: loan ถูกยกเลิกตาม future workflow

Server derive:

```text
remainingQuantity = quantity - returnedQuantity
```

Invariant:

```text
0 <= returnedQuantity <= quantity
remainingQuantity >= 0
```

Active loan คือ loan ที่:

- `remainingQuantity > 0`
- `loanStatus` อยู่ใน `BORROWED`, `PARTIAL_RETURNED` หรือ `OVERDUE`

`RETURNED` และ `CANCELLED` ไม่ถือเป็น active

### 3.4 Overdue policy

- Response มี `isOverdue` ซึ่ง derive ขณะอ่านข้อมูล
- `isOverdue = true` เมื่อ:
  - `expectedReturnDate` ไม่เป็น `null`
  - `expectedReturnDate` ก่อน business date วันนี้ใน `Asia/Bangkok`
  - `remainingQuantity > 0`
  - loan ไม่เป็น `RETURNED` หรือ `CANCELLED`
- Loan ที่ไม่มี `expectedReturnDate` จะไม่ overdue โดยอัตโนมัติ
- GET endpoints เป็น read-only และห้ามเปลี่ยน `loanStatus`
- `loanStatus` เป็น persisted lifecycle status ส่วน `isOverdue` เป็น read-time indicator
- Future scheduled process อาจเปลี่ยน persisted `loanStatus` เป็น `OVERDUE` แต่ไม่อยู่ในขอบเขต contract นี้
- ถ้า loan ที่ persisted status เป็น `OVERDUE` คืนบางส่วนแล้วเหลือยอดค้าง ให้คง `OVERDUE`
- ถ้าคืนครบ ให้เปลี่ยนเป็น `RETURNED` ไม่ว่าสถานะก่อนหน้าจะเป็น `BORROWED`, `PARTIAL_RETURNED` หรือ `OVERDUE`

### 3.5 Return history relation และ schema requirement

เพื่อให้ loan detail แสดง return history ที่ audit ย้อนกลับได้ ต้องเพิ่ม nullable relation จาก return transaction item ไปยัง source loan:

```text
TransactionItem.sourceLoanId -> CylinderLoan.id
```

ข้อกำหนด:

- `sourceLoanId = null` สำหรับ transaction items ทั่วไป
- `sourceLoanId` ต้องมีค่าสำหรับ `RETURN_CYLINDER` item
- `sourceLoanId` ต้องอ้าง loan ที่ endpoint กำลังคืน
- MVP `POST /api/loans/{loanId}/return` สร้างหนึ่ง return transaction และหนึ่ง transaction item ต่อหนึ่ง loan
- Database relation นี้เป็นข้อมูลภายใน ไม่จำเป็นต้องเพิ่ม `sourceLoanId` ใน generic Transaction API response
- Loan detail ใช้ relation นี้เพื่ออ่าน return history ห้าม infer จาก customer, product, note หรือ timestamp

Prisma migration ที่ต้องมีโดยสรุป:

```prisma
model TransactionItem {
  sourceLoanId BigInt?       @map("source_loan_id")
  sourceLoan   CylinderLoan? @relation("LoanReturnItems", fields: [sourceLoanId], references: [id])

  @@index([sourceLoanId])
}

model CylinderLoan {
  returnItems TransactionItem[] @relation("LoanReturnItems")
}
```

Relation เดิมระหว่าง `CylinderLoan.transactionItemId` กับ borrow transaction item ต้องคงอยู่และใช้ relation name แยกจาก `LoanReturnItems`

### 3.6 Return transaction snapshots และ pricing

ทุก return สร้าง transaction:

```text
transactionType = RETURN_CYLINDER
status = COMPLETED
queueDate = null
queueNo = null
totalAmount = 0.00
completedAt = now
```

Return transaction item:

```text
itemAction = RETURN
quantity = จำนวนที่คืนครั้งนี้
unitPrice = 0.00
costPrice = costPrice snapshot จาก borrow transaction item เดิม
lineTotal = 0.00
sourceLoanId = loanId
```

Snapshot rules:

- Customer snapshots copy จาก `CylinderLoan`
- Product brand, weight และ cost snapshots copy จาก original borrow transaction item
- ห้ามใช้ current product brand, weight หรือ price เพราะอาจเปลี่ยนหลังยืม
- การคืนยังทำได้เมื่อ current product เป็น inactive เพราะเป็นการปิดภาระ loan เดิม ไม่ใช่การเลือกสินค้าไปสร้างธุรกรรมใหม่
- Deposit ไม่รวม transaction total, sales, cost of sales หรือ refund
- Return note เมื่อส่งมาให้บันทึกบน return transaction และ item ส่วน status log/movement อาจ copy note เดียวกันเพื่อ audit

### 3.7 Return state transition

Eligible source statuses:

- `BORROWED`
- `PARTIAL_RETURNED`
- `OVERDUE`

Ineligible:

- `RETURNED`
- `CANCELLED`

เมื่อคืนบางส่วน:

- เพิ่ม `returnedQuantity`
- `returnedDate = null`
- ถ้า persisted status เดิมเป็น `OVERDUE` ให้คง `OVERDUE`
- กรณีอื่นให้เป็น `PARTIAL_RETURNED`

เมื่อคืนครบ:

- `returnedQuantity = quantity`
- `remainingQuantity = 0`
- `loanStatus = RETURNED`
- `returnedDate = business date วันนี้ใน `Asia/Bangkok`

### 3.8 Atomic inventory effect

ทุก return ลดจำนวนถังที่ถูกยืมและเพิ่มถังเปล่า:

```text
loanedQty -= returnQuantity
emptyQty += returnQuantity
```

ต้องเป็น conditional atomic update ที่สำเร็จเฉพาะเมื่อ `loanedQty >= returnQuantity`

หลัง balance update สำเร็จจึงสร้าง movement:

```text
movementType = LOAN_RETURN
quantity = returnQuantity
transactionId = return transaction ID
```

ห้าม update inventory balance โดยไม่มี movement

### 3.9 Concurrency

Concurrent returns ของ loan เดียวกันต้องไม่ทำให้:

- `returnedQuantity > quantity`
- `loanedQty < 0`
- เกิด return transaction หรือ movement เกินจำนวนที่สำเร็จจริง

Service ต้อง claim return ด้วย conditional database write ภายใน transaction เดียว ถ้า request แพ้ race ให้คืน `409 CONFLICT` และไม่ทิ้ง partial rows

### 3.10 Search, filters และ ordering

Loan list filters combine ด้วย AND

`search` ค้นแบบ case-insensitive partial match ด้วย OR ใน:

- customer name snapshot
- customer phone snapshot
- original product brand snapshot

General list เรียง:

```text
createdAt DESC, id DESC
```

Active list เรียงรายการที่ต้องติดตามก่อน:

```text
isOverdue DESC
expectedReturnDate ASC NULLS LAST
borrowedDate ASC
id ASC
```

## 4. Endpoint summary

| Method | Path | Operation ID | Result |
| --- | --- | --- | --- |
| `GET` | `/api/loans` | `listLoans` | อ่าน loan ทั้งหมดแบบแบ่งหน้า |
| `GET` | `/api/loans/active` | `listActiveLoans` | อ่าน loan ที่ยังคืนไม่ครบ |
| `GET` | `/api/loans/{loanId}` | `getLoan` | อ่าน loan detail พร้อม return history |
| `POST` | `/api/loans/{loanId}/return` | `returnLoan` | คืนถังบางส่วนหรือครบและสร้าง transaction/inventory effects |

ทุก endpoint ต้องใช้ Bearer JWT และ role `ADMIN`

## 5. Endpoint behavior

### 5.1 List loans

`GET /api/loans`

Query parameters:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `page` | integer ≥ 1 | No | `1` | หน้าที่ต้องการ |
| `limit` | integer 1–100 | No | `20` | จำนวนรายการต่อหน้า |
| `status` | LoanStatus | No | — | persisted loan status |
| `isOverdue` | boolean | No | — | filter ด้วย derived overdue indicator |
| `search` | string 1–150 chars | No | — | customer name/phone หรือ original product brand |

Response เรียง `createdAt DESC, id DESC`

### 5.2 List active loans

`GET /api/loans/active`

คืนเฉพาะ loan ที่ยังมียอดค้างและ status ยัง active

Query parameters:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `page` | integer ≥ 1 | No | `1` | หน้าที่ต้องการ |
| `limit` | integer 1–100 | No | `20` | จำนวนรายการต่อหน้า |
| `isOverdue` | boolean | No | — | filter active loans ตาม overdue indicator |
| `search` | string 1–150 chars | No | — | customer name/phone หรือ original product brand |

### 5.3 Get loan detail

`GET /api/loans/{loanId}`

คืน loan representation พร้อม `returnHistory` ซึ่งอ่านจาก `TransactionItem.sourceLoanId`

Return history เรียง:

```text
returnedAt ASC, transactionId ASC
```

ถ้าไม่พบ loan คืน `404 NOT_FOUND`

### 5.4 Return loan

`POST /api/loans/{loanId}/return`

Request:

```json
{
  "quantity": 1,
  "note": "ลูกค้านำถังมาคืนบางส่วน"
}
```

Rules:

- `quantity` เป็น positive integer
- `quantity <= remainingQuantity`
- loan ต้องอยู่ใน eligible status
- `note` เมื่อส่งมาต้อง trim แล้วเหลืออย่างน้อย 1 character
- Request object strict และ reject unknown/server-owned fields
- Client ห้ามส่ง transaction ID/type/status, price, cost, total, movement หรือ updated loan status

Success คืน `200 OK` พร้อม return transaction และ updated loan detail

## 6. OpenAPI 3.1 contract

```yaml
openapi: 3.1.0
info:
  title: KMG-SERVICE Loan API
  version: 0.1.0
  description: Proposed Cylinder Loan Management contract for the KMG-SERVICE MVP.
servers:
  - url: http://localhost:4000
    description: Local development
tags:
  - name: Loans
    description: Cylinder loan tracking and return operations
paths:
  /api/loans:
    get:
      tags: [Loans]
      summary: List cylinder loans
      operationId: listLoans
      description: >-
        ADMIN only. Filters combine with AND. Search matches customer name,
        customer phone, or the original borrowed product brand using
        case-insensitive partial matching. isOverdue is derived using the
        Asia/Bangkok business date. Results are ordered by createdAt descending,
        then id descending. This operation does not mutate loan status.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - name: status
          in: query
          required: false
          schema:
            $ref: '#/components/schemas/LoanStatus'
        - name: isOverdue
          in: query
          required: false
          schema:
            type: boolean
        - name: search
          in: query
          required: false
          schema:
            type: string
            minLength: 1
            maxLength: 150
      responses:
        '200':
          description: Paginated loan list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LoanListResponse'
              example:
                success: true
                data:
                  loans:
                    - id: '301'
                      borrowTransactionId: '9001'
                      customerId: null
                      customerName: ร้านอาหารอิ่มดี
                      customerPhone: '0899999999'
                      customerAddress: 12 ถนนพระราม 4 กรุงเทพฯ
                      productId: '42'
                      productBrand: ปตท.
                      productWeightKg: '15.00'
                      quantity: 3
                      returnedQuantity: 1
                      remainingQuantity: 2
                      loanStatus: PARTIAL_RETURNED
                      isOverdue: false
                      borrowedDate: '2026-07-20'
                      expectedReturnDate: null
                      returnedDate: null
                      depositAmount: '500.00'
                      note: null
                      createdAt: '2026-07-20T03:10:00.000Z'
                      updatedAt: '2026-07-22T04:00:00.000Z'
                meta:
                  requestId: req_01JABCDEF1234567890
                  pagination:
                    page: 1
                    limit: 20
                    totalItems: 1
                    totalPages: 1
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '500': { $ref: '#/components/responses/InternalError' }
  /api/loans/active:
    get:
      tags: [Loans]
      summary: List active cylinder loans
      operationId: listActiveLoans
      description: >-
        ADMIN only. Returns loans with remainingQuantity greater than zero and
        persisted status BORROWED, PARTIAL_RETURNED, or OVERDUE. Overdue loans
        are ordered first, followed by expectedReturnDate ascending with nulls
        last, borrowedDate ascending, and id ascending. This operation is read-only.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - name: isOverdue
          in: query
          required: false
          schema:
            type: boolean
        - name: search
          in: query
          required: false
          schema:
            type: string
            minLength: 1
            maxLength: 150
      responses:
        '200':
          description: Paginated active loan list
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LoanListResponse'
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '500': { $ref: '#/components/responses/InternalError' }
  /api/loans/{loanId}:
    get:
      tags: [Loans]
      summary: Get cylinder loan detail
      operationId: getLoan
      description: >-
        ADMIN only. Returns the loan snapshots and exact return history linked
        through return transaction items. Historical customer and product fields
        do not change when master data changes.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/LoanId'
      responses:
        '200':
          description: Loan detail
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LoanDetailResponse'
              example:
                success: true
                data:
                  id: '301'
                  borrowTransactionId: '9001'
                  borrowTransactionItemId: '12001'
                  customerId: null
                  customerName: ร้านอาหารอิ่มดี
                  customerPhone: '0899999999'
                  customerAddress: 12 ถนนพระราม 4 กรุงเทพฯ
                  productId: '42'
                  productBrand: ปตท.
                  productWeightKg: '15.00'
                  quantity: 3
                  returnedQuantity: 1
                  remainingQuantity: 2
                  loanStatus: PARTIAL_RETURNED
                  isOverdue: false
                  borrowedDate: '2026-07-20'
                  expectedReturnDate: null
                  returnedDate: null
                  depositAmount: '500.00'
                  note: null
                  returnHistory:
                    - transactionId: '9010'
                      transactionNo: TX-20260722-0004
                      quantity: 1
                      returnedDate: '2026-07-22'
                      note: ลูกค้านำถังมาคืนบางส่วน
                      createdBy:
                        id: '1'
                        name: เจ้าของร้าน
                      createdAt: '2026-07-22T04:00:00.000Z'
                  createdAt: '2026-07-20T03:10:00.000Z'
                  updatedAt: '2026-07-22T04:00:00.000Z'
                meta:
                  requestId: req_01JABCDEF1234567890
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '500': { $ref: '#/components/responses/InternalError' }
  /api/loans/{loanId}/return:
    post:
      tags: [Loans]
      summary: Return borrowed cylinders
      operationId: returnLoan
      description: >-
        ADMIN only. Returns part or all of one source loan. Creates a completed
        RETURN_CYLINDER transaction, historical item snapshots, initial status
        log, LOAN_RETURN movement, inventory balance changes, and loan lifecycle
        changes as one all-or-nothing operation. Concurrent requests cannot
        return more than the remaining quantity.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/LoanId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ReturnLoanRequest'
            examples:
              partialReturn:
                summary: Return one of three borrowed cylinders
                value:
                  quantity: 1
                  note: ลูกค้านำถังมาคืนบางส่วน
              fullReturn:
                summary: Return the entire remaining quantity
                value:
                  quantity: 2
      responses:
        '200':
          description: Return recorded and loan updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ReturnLoanResponse'
              example:
                success: true
                data:
                  transaction:
                    id: '9010'
                    transactionNo: TX-20260722-0004
                    transactionType: RETURN_CYLINDER
                    status: COMPLETED
                    customerName: ร้านอาหารอิ่มดี
                    customerPhone: '0899999999'
                    customerAddress: 12 ถนนพระราม 4 กรุงเทพฯ
                    totalAmount: '0.00'
                    note: ลูกค้านำถังมาคืนบางส่วน
                    createdBy:
                      id: '1'
                      name: เจ้าของร้าน
                    item:
                      id: '12010'
                      productId: '42'
                      productBrand: ปตท.
                      productWeightKg: '15.00'
                      quantity: 1
                      unitPrice: '0.00'
                      costPrice: '330.00'
                      lineTotal: '0.00'
                      itemAction: RETURN
                      note: ลูกค้านำถังมาคืนบางส่วน
                    createdAt: '2026-07-22T04:00:00.000Z'
                    completedAt: '2026-07-22T04:00:00.000Z'
                  loan:
                    id: '301'
                    borrowTransactionId: '9001'
                    borrowTransactionItemId: '12001'
                    customerId: null
                    customerName: ร้านอาหารอิ่มดี
                    customerPhone: '0899999999'
                    customerAddress: 12 ถนนพระราม 4 กรุงเทพฯ
                    productId: '42'
                    productBrand: ปตท.
                    productWeightKg: '15.00'
                    quantity: 3
                    returnedQuantity: 1
                    remainingQuantity: 2
                    loanStatus: PARTIAL_RETURNED
                    isOverdue: false
                    borrowedDate: '2026-07-20'
                    expectedReturnDate: null
                    returnedDate: null
                    depositAmount: '500.00'
                    note: null
                    returnHistory:
                      - transactionId: '9010'
                        transactionNo: TX-20260722-0004
                        quantity: 1
                        returnedDate: '2026-07-22'
                        note: ลูกค้านำถังมาคืนบางส่วน
                        createdBy:
                          id: '1'
                          name: เจ้าของร้าน
                        createdAt: '2026-07-22T04:00:00.000Z'
                    createdAt: '2026-07-20T03:10:00.000Z'
                    updatedAt: '2026-07-22T04:00:00.000Z'
                meta:
                  requestId: req_01JABCDEF1234567890
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }
        '500': { $ref: '#/components/responses/InternalError' }
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  parameters:
    LoanId:
      name: loanId
      in: path
      required: true
      description: CylinderLoan BigInt identifier serialized as a decimal string.
      schema:
        $ref: '#/components/schemas/BigIntId'
    Page:
      name: page
      in: query
      required: false
      schema:
        type: integer
        minimum: 1
        default: 1
    Limit:
      name: limit
      in: query
      required: false
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
  schemas:
    BigIntId:
      type: string
      pattern: '^[1-9][0-9]*$'
      example: '42'
    DecimalMoney:
      type: string
      pattern: '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      description: Non-negative fixed-point decimal amount in Thai baht (THB).
      example: '500.00'
    DecimalMeasurement:
      type: string
      pattern: '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      description: Non-negative fixed-point decimal measurement.
      example: '15.00'
    LoanStatus:
      type: string
      enum: [BORROWED, PARTIAL_RETURNED, RETURNED, OVERDUE, CANCELLED]
    PublicUser:
      type: object
      additionalProperties: false
      required: [id, name]
      properties:
        id:
          $ref: '#/components/schemas/BigIntId'
        name:
          type: string
          minLength: 1
          maxLength: 100
    LoanSummary:
      type: object
      additionalProperties: false
      required:
        - id
        - borrowTransactionId
        - customerId
        - customerName
        - customerPhone
        - customerAddress
        - productId
        - productBrand
        - productWeightKg
        - quantity
        - returnedQuantity
        - remainingQuantity
        - loanStatus
        - isOverdue
        - borrowedDate
        - expectedReturnDate
        - returnedDate
        - depositAmount
        - note
        - createdAt
        - updatedAt
      properties:
        id:
          $ref: '#/components/schemas/BigIntId'
        borrowTransactionId:
          $ref: '#/components/schemas/BigIntId'
        customerId:
          oneOf:
            - $ref: '#/components/schemas/BigIntId'
            - type: 'null'
        customerName:
          type: string
          minLength: 1
          maxLength: 150
        customerPhone:
          type: [string, 'null']
          maxLength: 50
        customerAddress:
          type: [string, 'null']
        productId:
          $ref: '#/components/schemas/BigIntId'
        productBrand:
          type: string
          minLength: 1
          maxLength: 100
          description: Original borrow transaction item snapshot.
        productWeightKg:
          $ref: '#/components/schemas/DecimalMeasurement'
        quantity:
          type: integer
          minimum: 1
        returnedQuantity:
          type: integer
          minimum: 0
        remainingQuantity:
          type: integer
          minimum: 0
          description: Server-derived quantity minus returnedQuantity.
        loanStatus:
          $ref: '#/components/schemas/LoanStatus'
        isOverdue:
          type: boolean
          description: Derived using expectedReturnDate and the Asia/Bangkok business date.
        borrowedDate:
          type: string
          format: date
        expectedReturnDate:
          type: [string, 'null']
          format: date
        returnedDate:
          type: [string, 'null']
          format: date
        depositAmount:
          $ref: '#/components/schemas/DecimalMoney'
        note:
          type: [string, 'null']
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
    LoanDetail:
      type: object
      additionalProperties: false
      required:
        - id
        - borrowTransactionId
        - borrowTransactionItemId
        - customerId
        - customerName
        - customerPhone
        - customerAddress
        - productId
        - productBrand
        - productWeightKg
        - quantity
        - returnedQuantity
        - remainingQuantity
        - loanStatus
        - isOverdue
        - borrowedDate
        - expectedReturnDate
        - returnedDate
        - depositAmount
        - note
        - returnHistory
        - createdAt
        - updatedAt
      properties:
        id:
          $ref: '#/components/schemas/BigIntId'
        borrowTransactionId:
          $ref: '#/components/schemas/BigIntId'
        borrowTransactionItemId:
          $ref: '#/components/schemas/BigIntId'
        customerId:
          oneOf:
            - $ref: '#/components/schemas/BigIntId'
            - type: 'null'
        customerName:
          type: string
          minLength: 1
          maxLength: 150
        customerPhone:
          type: [string, 'null']
          maxLength: 50
        customerAddress:
          type: [string, 'null']
        productId:
          $ref: '#/components/schemas/BigIntId'
        productBrand:
          type: string
          minLength: 1
          maxLength: 100
        productWeightKg:
          $ref: '#/components/schemas/DecimalMeasurement'
        quantity:
          type: integer
          minimum: 1
        returnedQuantity:
          type: integer
          minimum: 0
        remainingQuantity:
          type: integer
          minimum: 0
        loanStatus:
          $ref: '#/components/schemas/LoanStatus'
        isOverdue:
          type: boolean
        borrowedDate:
          type: string
          format: date
        expectedReturnDate:
          type: [string, 'null']
          format: date
        returnedDate:
          type: [string, 'null']
          format: date
        depositAmount:
          $ref: '#/components/schemas/DecimalMoney'
        note:
          type: [string, 'null']
        returnHistory:
          type: array
          description: Ordered by returnedDate ascending, then transactionId ascending.
          items:
            $ref: '#/components/schemas/LoanReturnHistoryItem'
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
    LoanReturnHistoryItem:
      type: object
      additionalProperties: false
      required:
        - transactionId
        - transactionNo
        - quantity
        - returnedDate
        - note
        - createdBy
        - createdAt
      properties:
        transactionId:
          $ref: '#/components/schemas/BigIntId'
        transactionNo:
          type: string
          maxLength: 50
        quantity:
          type: integer
          minimum: 1
        returnedDate:
          type: string
          format: date
        note:
          type: [string, 'null']
        createdBy:
          $ref: '#/components/schemas/PublicUser'
        createdAt:
          type: string
          format: date-time
    ReturnLoanRequest:
      type: object
      additionalProperties: false
      required: [quantity]
      properties:
        quantity:
          type: integer
          minimum: 1
        note:
          type: string
          minLength: 1
    ReturnTransaction:
      type: object
      additionalProperties: false
      required:
        - id
        - transactionNo
        - transactionType
        - status
        - customerName
        - customerPhone
        - customerAddress
        - totalAmount
        - note
        - createdBy
        - item
        - createdAt
        - completedAt
      properties:
        id:
          $ref: '#/components/schemas/BigIntId'
        transactionNo:
          type: string
          maxLength: 50
        transactionType:
          type: string
          const: RETURN_CYLINDER
        status:
          type: string
          const: COMPLETED
        customerName:
          type: string
          minLength: 1
          maxLength: 150
        customerPhone:
          type: [string, 'null']
          maxLength: 50
        customerAddress:
          type: [string, 'null']
        totalAmount:
          type: string
          const: '0.00'
        note:
          type: [string, 'null']
        createdBy:
          $ref: '#/components/schemas/PublicUser'
        item:
          $ref: '#/components/schemas/ReturnTransactionItem'
        createdAt:
          type: string
          format: date-time
        completedAt:
          type: string
          format: date-time
    ReturnTransactionItem:
      type: object
      additionalProperties: false
      required:
        - id
        - productId
        - productBrand
        - productWeightKg
        - quantity
        - unitPrice
        - costPrice
        - lineTotal
        - itemAction
        - note
      properties:
        id:
          $ref: '#/components/schemas/BigIntId'
        productId:
          $ref: '#/components/schemas/BigIntId'
        productBrand:
          type: string
          minLength: 1
          maxLength: 100
        productWeightKg:
          $ref: '#/components/schemas/DecimalMeasurement'
        quantity:
          type: integer
          minimum: 1
        unitPrice:
          type: string
          const: '0.00'
        costPrice:
          $ref: '#/components/schemas/DecimalMoney'
        lineTotal:
          type: string
          const: '0.00'
        itemAction:
          type: string
          const: RETURN
        note:
          type: [string, 'null']
    LoanListResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success:
          type: boolean
          const: true
        data:
          type: object
          additionalProperties: false
          required: [loans]
          properties:
            loans:
              type: array
              items:
                $ref: '#/components/schemas/LoanSummary'
        meta:
          $ref: '#/components/schemas/PaginatedResponseMeta'
    LoanDetailResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success:
          type: boolean
          const: true
        data:
          $ref: '#/components/schemas/LoanDetail'
        meta:
          $ref: '#/components/schemas/ResponseMeta'
    ReturnLoanResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success:
          type: boolean
          const: true
        data:
          type: object
          additionalProperties: false
          required: [transaction, loan]
          properties:
            transaction:
              $ref: '#/components/schemas/ReturnTransaction'
            loan:
              $ref: '#/components/schemas/LoanDetail'
        meta:
          $ref: '#/components/schemas/ResponseMeta'
    PaginationMeta:
      type: object
      additionalProperties: false
      required: [page, limit, totalItems, totalPages]
      properties:
        page:
          type: integer
          minimum: 1
        limit:
          type: integer
          minimum: 1
          maximum: 100
        totalItems:
          type: integer
          minimum: 0
        totalPages:
          type: integer
          minimum: 0
    ResponseMeta:
      type: object
      additionalProperties: false
      required: [requestId]
      properties:
        requestId:
          type: string
          minLength: 1
    PaginatedResponseMeta:
      type: object
      additionalProperties: false
      required: [requestId, pagination]
      properties:
        requestId:
          type: string
          minLength: 1
        pagination:
          $ref: '#/components/schemas/PaginationMeta'
    ApiError:
      type: object
      additionalProperties: false
      required: [code, message, details]
      properties:
        code:
          type: string
        message:
          type: string
        details:
          type: array
          items: {}
    ErrorResponse:
      type: object
      additionalProperties: false
      required: [success, error, meta]
      properties:
        success:
          type: boolean
          const: false
        error:
          $ref: '#/components/schemas/ApiError'
        meta:
          $ref: '#/components/schemas/ResponseMeta'
  responses:
    ValidationError:
      description: Invalid path, query, or request body
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            success: false
            error:
              code: VALIDATION_ERROR
              message: Invalid request payload
              details: []
            meta:
              requestId: req_01JABCDEF1234567890
    Unauthorized:
      description: Missing, invalid, or expired bearer token
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            success: false
            error:
              code: UNAUTHORIZED
              message: Authentication required
              details: []
            meta:
              requestId: req_01JABCDEF1234567890
    Forbidden:
      description: Authenticated user does not have an allowed role
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            success: false
            error:
              code: FORBIDDEN
              message: Insufficient permissions
              details: []
            meta:
              requestId: req_01JABCDEF1234567890
    NotFound:
      description: Loan was not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            success: false
            error:
              code: NOT_FOUND
              message: Loan not found
              details: []
            meta:
              requestId: req_01JABCDEF1234567890
    Conflict:
      description: >-
        Loan is not returnable, quantity exceeds the remaining amount, inventory
        is inconsistent, or a concurrent request already claimed the return.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          examples:
            quantityConflict:
              summary: Return quantity exceeds remaining quantity
              value:
                success: false
                error:
                  code: CONFLICT
                  message: Return quantity exceeds remaining loan quantity
                  details: []
                meta:
                  requestId: req_01JABCDEF1234567890
            inventoryConflict:
              summary: Inventory loaned quantity is insufficient
              value:
                success: false
                error:
                  code: INSUFFICIENT_STOCK
                  message: Insufficient loaned inventory
                  details: []
                meta:
                  requestId: req_01JABCDEF1234567890
    InternalError:
      description: Unexpected server error without internal details
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            success: false
            error:
              code: INTERNAL_ERROR
              message: Internal server error
              details: []
            meta:
              requestId: req_01JABCDEF1234567890
```

## 7. Error behavior

| HTTP status | Code | Condition |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Invalid loan ID, pagination, filter, quantity, empty note หรือ unknown field |
| `401` | `UNAUTHORIZED` | Token ขาด ไม่ถูกต้อง หรือหมดอายุ |
| `403` | `FORBIDDEN` | Authenticated user ไม่มี role ที่อนุญาต |
| `404` | `NOT_FOUND` | ไม่พบ loan |
| `409` | `CONFLICT` | Loan เป็น final/ineligible state, return quantity เกินยอดค้าง หรือแพ้ concurrent claim |
| `409` | `INSUFFICIENT_STOCK` | `loanedQty` ใน inventory ต่ำกว่าจำนวนที่จะคืน |
| `500` | `INTERNAL_ERROR` | Unexpected error โดยไม่เปิดเผย SQL, stack trace หรือ internal state |

Validation precedence:

- Invalid path/query/body คืน `400` ก่อน business lookup
- Loan ID รูปแบบถูกต้องแต่ไม่มี row คืน `404`
- Loan มีอยู่แต่คืนไม่ได้ตาม current state คืน `409`

## 8. Implementation requirements

### 8.1 Target files

```text
src/
  modules/
    loans/
      loan-spec.md
      loan.types.ts
      loan.schema.ts
      loan.repository.ts
      loan.service.ts
      loan.controller.ts
      loan.routes.ts
      loan.schema.test.ts
      loan.service.test.ts
      loan.routes.test.ts
  modules/
    transactions/
      transaction.types.ts
      transaction.repository.ts
      transaction.service.ts
  database/
    prisma/
      schema.prisma
      migrations/
```

### 8.2 Internal workflow boundary

Public loan endpoint เรียก internal method ของ `TransactionService`:

```text
returnCylinder(
  {
    loanId,
    quantity,
    note
  },
  currentUser
)
```

`LoanService` อาจเป็นเจ้าของ read methods แต่ห้าม implement return mutations ซ้ำกับ `TransactionService`

### 8.3 Return write order

ภายใน database transaction:

1. อ่าน source loan และ original borrow item snapshots
2. ตรวจ eligible status และ remaining quantity
3. Claim returned quantity แบบ conditional write
4. Acquire daily transaction-number lock ตาม Bangkok business date
5. Generate transaction number จาก sequence ร่วมกับ transaction types อื่น
6. สร้าง `RETURN_CYLINDER` transaction header
7. สร้าง return item พร้อม `sourceLoanId`
8. สร้าง initial status log `null -> COMPLETED`
9. Atomic inventory update `loanedQty -= quantity`, `emptyQty += quantity`
10. สร้าง `LOAN_RETURN` movement
11. Set loan status/returned date ตาม partial/full rules
12. อ่าน return transaction และ updated loan representation
13. Commit

ลำดับ implementation อาจปรับได้ถ้ายังคง all-or-nothing behavior, conditional concurrency safety และไม่มี inventory mutation ที่ขาด movement

## 9. Test requirements

### 9.1 Schema tests

- Loan ID ต้องตรง `^[1-9][0-9]*$`
- Pagination defaults และ bounds
- Loan status enum
- Boolean overdue query
- Search trim/min/max
- Return quantity zero, negative, fractional
- Empty note
- Unknown/server-owned request fields

### 9.2 Service tests

- List filters/search/order
- Active status and remaining-quantity rules
- `isOverdue` Bangkok boundary
- `expectedReturnDate = null` ไม่ overdue
- Missing loan
- `RETURNED`/`CANCELLED` return conflict
- Partial return จาก `BORROWED` -> `PARTIAL_RETURNED`
- Partial return จาก `OVERDUE` -> `OVERDUE`
- Full return -> `RETURNED` + returned date
- Return quantity เกิน remaining
- Original snapshots/cost ถูกใช้หลัง product เปลี่ยน
- Deposit ไม่กระทบ totals
- Initial completed status log
- Rollback เมื่อ inventory update หรือ movement insert fail

### 9.3 PostgreSQL integration tests

- Return transaction เชื่อม source loan ด้วย foreign key จริง
- Partial/full return reconcile quantity และ balances
- `LOAN_RETURN` movement quantity ตรง inventory delta
- Multi-table rollback จริง
- Concurrent return ไม่เกิน remaining quantity
- Concurrent return ไม่ทำ `loanedQty` ติดลบ
- Transaction number ไม่ชนกับ transaction type อื่น
- Loan detail return history ถูกต้องและเรียงตาม contract

### 9.4 HTTP integration tests

- `401` missing/invalid token
- `403` non-admin
- `400` invalid params/query/body
- `404` loan not found
- `409` final loan, excessive quantity, inventory mismatch และ concurrent conflict
- `200` list/active/detail/return envelopes
- Pagination metadata
- Response ไม่มี password hash, token, raw BigInt หรือ internal Prisma fields

## 10. Compatibility and implementation notes

- **Path decision:** `/api/loans` แทนเอกสารเก่าที่ใช้ `/api/v1/loans` หรือ `/api/cylinder-loans`
- **Schema change required:** เพิ่ม nullable `TransactionItem.sourceLoanId` และ foreign key/index
- **No generic return create:** `POST /api/transactions` ยังคง reject `RETURN_CYLINDER`
- **No read mutation:** overdue indicator บน GET เป็น derived field
- **No automatic deposit refund:** deposit เป็น informational data ใน MVP
- **Snapshot stability:** loan และ return history ไม่เปลี่ยนตาม product/customer master
- **Additive response field:** `isOverdue`, `remainingQuantity` และ `returnHistory` เป็น Loan API fields ใหม่
- **Transaction API compatibility:** `sourceLoanId` เป็น internal relation จึงไม่บังคับให้เปลี่ยน generic TransactionItem response
- **Future extension:** หากเพิ่ม batch return หลาย loans ใน transaction เดียว relation ระดับ item รองรับได้โดยไม่เปลี่ยน loan history model
