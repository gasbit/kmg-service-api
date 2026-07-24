# Queue API Specification

สถานะเอกสาร: Implemented contract สำหรับ MVP  
เวอร์ชัน: 0.1.0  
Base path: `/api`  
Owning module: `queue` สำหรับ read API และ `transactions` สำหรับ write workflow

## 1. ขอบเขต

เอกสารนี้กำหนด API contract สำหรับการอ่านและอัปเดตคิวส่งแก๊สของรายการ `DELIVERY_EXCHANGE`:

- อ่านคิวของ business date วันนี้
- อ่านคิวตาม business date ที่ระบุ
- กรองคิวตาม persisted transaction status
- เรียงคิวตามหมายเลขคิวของวัน
- เปลี่ยนสถานะคิวตาม transaction status workflow
- ตัด stock และสร้าง inventory movements เฉพาะเมื่อคิวเปลี่ยนเป็น `COMPLETED`
- บันทึก transaction status log ทุกครั้งที่เปลี่ยนสถานะ
- ทุก endpoint ใช้ Bearer JWT และจำกัดสิทธิ์เป็น `ADMIN` สำหรับ MVP

Queue ไม่ใช่ aggregate หรือ database table แยก ข้อมูลคิวเป็น projection ของ `Transaction` ที่มี:

```text
transactionType = DELIVERY_EXCHANGE
queueDate != null
queueNo != null
```

โดยใช้ `transactions.queue_date` และ `transactions.queue_no` เป็น source of truth

ไม่รวมการสร้างคิวโดยตรง, การเปลี่ยนหมายเลขคิว, การ reorder คิว, การลบคิว, การ assign rider, route planning, delivery tracking, notification และ multi-branch queue

คิวใหม่ต้องเกิดจาก `POST /api/transactions` ด้วย `transactionType = DELIVERY_EXCHANGE` เท่านั้น Client ห้ามส่ง `queueDate`, `queueNo` หรือ initial status เอง

## 2. แหล่งอ้างอิงและสถานะ implementation

Contract นี้อ้างอิง:

- `AGENTS.md`
- `CONTEXT.md`
- `Backend-Implement-Plan.md`
- `../Backend-Architecture.md`
- `../Database-Design.md`
- `src/modules/transactions/transaction-spec.md`
- `src/constants/transaction.constants.ts`
- `src/constants/inventory.constants.ts`
- `src/modules/transactions/transaction.service.ts`
- `src/modules/transactions/transaction.repository.ts`
- Prisma models `Transaction`, `TransactionItem`, `TransactionStatusLog`, `InventoryBalance` และ `InventoryMovement`
- shared error codes ใน `src/shared/errors/error-codes.ts`

สถานะ implementation ปัจจุบัน:

- การสร้าง `DELIVERY_EXCHANGE` กำหนด `queueDate`, `queueNo` และ initial status `PENDING` แล้ว
- Queue number ใช้ business date ตาม `Asia/Bangkok`
- Queue number generation ใช้ PostgreSQL advisory transaction lock, unique constraint `(queueDate, queueNo)` และ bounded retry
- การเปลี่ยนสถานะผ่าน `PATCH /api/transactions/{transactionId}/status` พร้อม status log มี implementation แล้ว
- การ complete delivery ตัด stock และสร้าง `FULL_OUT`/`EMPTY_IN` movements แบบ atomic แล้ว
- มี unit tests และ PostgreSQL concurrency integration tests สำหรับ queue generation และ complete-once behavior แล้ว
- มี Queue schemas, types, repository, mapper, service, controller และ routes แล้ว
- มี public endpoints ทั้ง 3 รายการใต้ `/api/queues`
- Queue read ใช้ exact persisted `queueDate`, optional status filter และ `queueNo ASC, id ASC`
- Queue-specific status operation validate Queue scope ภายใน shared Transaction write transaction
- มี schema, mapper, service, route และ PostgreSQL integration tests แล้ว

เอกสาร architecture เก่าบางส่วนใช้ `/api/v1/queues` แต่ route conventions และ route wiring ปัจจุบันใช้ `/api` Contract นี้จึงกำหนด canonical path เป็น `/api/queues`

## 3. Contract decisions

### 3.1 Queue representation

- Queue entry เป็น representation ของ `DELIVERY_EXCHANGE` transaction ไม่ใช่ resource ที่มี ID แยก
- `id` ใน Queue entry คือ transaction ID
- Path parameter ใช้ชื่อ `transactionId`
- `queueDate` และ `queueNo` ต้องไม่เป็น `null` สำหรับ Queue entry
- Historical customer, product และ price fields อ่านจาก transaction snapshots
- Product master ที่ถูกแก้หรือ inactive ภายหลังต้องไม่เปลี่ยนข้อมูลที่แสดงในคิวเก่า
- Queue API ห้าม expose internal lock, retry, database row หรือ inventory implementation details

### 3.2 Security

ทุก operation ต้องส่ง:

```http
Authorization: Bearer <access-token>
```

User และ role ต้อง active สำหรับ MVP อนุญาตเฉพาะ role `ADMIN` โครงสร้าง authorization ต้องรองรับ role เพิ่มในอนาคตโดยไม่เปลี่ยน path

### 3.3 Identifier, decimal และเวลา

- Database IDs เป็น `BigInt` และ serialize เป็น decimal string เช่น `"42"`
- Monetary values เป็น fixed-point decimal string 2 ตำแหน่ง เช่น `"780.00"`
- DateTime เป็น ISO 8601 UTC string
- `queueDate` เป็น business date รูปแบบ `YYYY-MM-DD`
- Business date วันนี้คำนวณตาม timezone `Asia/Bangkok`
- Queue date ไม่ derive ใหม่จาก `createdAt` ตอนอ่าน แต่ใช้ persisted `transactions.queue_date`

### 3.4 Queue number lifecycle

- `queueNo` เริ่มจาก `1` ใหม่ในแต่ละ business date
- Server เป็นผู้กำหนด `queueNo` ตอนสร้าง `DELIVERY_EXCHANGE`
- Client ห้ามกำหนดหรือแก้ `queueDate` และ `queueNo`
- Queue number ที่ assign แล้วต้องคงเดิมตลอดอายุ transaction
- การ cancel คิวไม่คืนหมายเลขและไม่ renumber คิวอื่น
- ระบบยอมให้ลำดับมีช่องว่างเพื่อรักษาประวัติและ audit
- Combination `(queueDate, queueNo)` ต้องไม่ซ้ำ

### 3.5 Status workflow

Queue ใช้ persisted transaction status:

- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `CANCELLED`

Allowed transitions:

```text
PENDING -> IN_PROGRESS
PENDING -> CANCELLED
IN_PROGRESS -> COMPLETED
IN_PROGRESS -> CANCELLED
```

Rules:

- `PENDING -> COMPLETED` โดยตรงไม่ได้
- `COMPLETED` และ `CANCELLED` เป็น terminal
- Status เดิมกับ status ใหม่เหมือนกันไม่ถือเป็น idempotent success และคืน conflict
- ทุก status change ต้องสร้าง `TransactionStatusLog`
- Queue API ต้องตรวจว่า target เป็น `DELIVERY_EXCHANGE` ที่มี queue data ก่อนเรียก shared status workflow
- ID ที่ไม่มีอยู่หรือเป็น transaction ประเภทอื่นไม่ถือเป็น Queue entry และคืน `404 NOT_FOUND`

### 3.6 Inventory effects

ตอนสร้างคิว:

```text
inventory balance: ไม่เปลี่ยน
inventory movement: ไม่สร้าง
```

เมื่อเปลี่ยน `PENDING -> IN_PROGRESS`:

```text
inventory balance: ไม่เปลี่ยน
inventory movement: ไม่สร้าง
```

เมื่อเปลี่ยน `IN_PROGRESS -> COMPLETED` สำหรับแต่ละ item:

```text
fullQty -= quantity
emptyQty += quantity
create FULL_OUT movement
create EMPTY_IN movement
completedAt = current timestamp
```

เมื่อเปลี่ยนเป็น `CANCELLED`:

```text
inventory balance: ไม่เปลี่ยน
inventory movement: ไม่สร้าง
completedAt = null
```

ถ้า stock เต็มไม่พอ การ complete ต้องคืน `409 INSUFFICIENT_STOCK` และไม่เปลี่ยน status, `completedAt`, inventory balance, movement หรือ status log

Status change, inventory effects และ status log ต้องสำเร็จหรือล้มเหลวพร้อมกัน

### 3.7 Concurrency

Concurrent queue creation ต้องไม่ทำให้:

- transaction number ซ้ำ
- queue number ซ้ำใน business date เดียวกัน

Concurrent status updates ของคิวเดียวกันต้องไม่ทำให้:

- status transition สำเร็จมากกว่าหนึ่งครั้งจาก source status เดียวกัน
- stock ถูกตัดซ้ำ
- inventory movement ถูกสร้างซ้ำ
- stock ติดลบ

Request ที่แพ้ race คืน `409 INVALID_STATUS_TRANSITION` ตาม current shared workflow และไม่ทิ้ง partial writes

### 3.8 Filters และ ordering

`GET /api/queues/today`:

- ใช้ `queueDate = business date วันนี้ใน Asia/Bangkok`
- `status` เป็น optional exact-match filter

`GET /api/queues`:

- `date` เป็น required exact-match business date
- `status` เป็น optional exact-match filter

ทุก filter combine ด้วย AND และทุก query บังคับ:

```text
transactionType = DELIVERY_EXCHANGE
queueDate = selected date
queueNo IS NOT NULL
```

Default ordering:

```text
queueNo ASC, id ASC
```

MVP คืนคิวทั้งหมดของหนึ่งวันโดยไม่ paginate เพราะ operation จำกัดข้อมูลด้วย exact business date เสมอ หากอนาคตเพิ่ม multi-branch หรือปริมาณคิวต่อวันสูง ต้องเพิ่ม pagination เป็น contract revision โดยรักษา ordering เดิม

### 3.9 Queue entry representation

```json
{
  "id": "9001",
  "transactionNo": "TX-20260724-0001",
  "status": "PENDING",
  "queueDate": "2026-07-24",
  "queueNo": 1,
  "customerName": "ร้านอาหารอิ่มดี",
  "customerPhone": "0899999999",
  "customerAddress": "12 ถนนพระราม 4 กรุงเทพฯ",
  "totalAmount": "780.00",
  "note": "โทรก่อนถึงร้าน",
  "items": [
    {
      "id": "12001",
      "productId": "42",
      "productBrand": "ปตท.",
      "productWeightKg": "15.00",
      "quantity": 2,
      "unitPrice": "390.00",
      "lineTotal": "780.00",
      "note": null
    }
  ],
  "totalQuantity": 2,
  "createdBy": {
    "id": "1",
    "name": "Admin"
  },
  "createdAt": "2026-07-24T02:15:00.000Z",
  "updatedAt": "2026-07-24T02:15:00.000Z",
  "completedAt": null
}
```

Queue representation ไม่คืน `costPrice` เพราะไม่จำเป็นต่อการจัดคิวส่งและเป็นข้อมูลต้นทุนภายใน หากหน้าจอต้องใช้ข้อมูลบัญชีให้เรียก Transaction detail ภายใต้สิทธิ์ที่เหมาะสม

## 4. Endpoint summary

| Method | Path | Operation ID | Result |
| --- | --- | --- | --- |
| `GET` | `/api/queues/today` | `listTodayQueue` | อ่านคิวส่งแก๊สของวันนี้ |
| `GET` | `/api/queues` | `listQueueByDate` | อ่านคิวส่งแก๊สตามวันที่ |
| `PATCH` | `/api/queues/{transactionId}/status` | `updateQueueStatus` | เปลี่ยนสถานะคิวผ่าน transaction workflow |

## 5. Endpoint behavior

### 5.1 List today's queue

`GET /api/queues/today` — Operation ID: `listTodayQueue`

Query parameters:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `status` | QueueStatus | No | — | Exact-match persisted transaction status |

Success: `200 OK`

- `data.queueDate` คือ business date วันนี้ใน `Asia/Bangkok`
- `data.queues` เป็น array และอาจว่าง
- เรียง `queueNo ASC, id ASC`
- Operation เป็น read-only

### 5.2 List queue by date

`GET /api/queues` — Operation ID: `listQueueByDate`

Query parameters:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `date` | date (`YYYY-MM-DD`) | Yes | — | Exact persisted queue business date |
| `status` | QueueStatus | No | — | Exact-match persisted transaction status |

Success: `200 OK`

- วันที่ที่ไม่มีคิวคืน `200` พร้อม `queues: []`
- ไม่คืน `404` สำหรับวันที่ไม่มีข้อมูล
- Operation เป็น read-only

### 5.3 Update queue status

`PATCH /api/queues/{transactionId}/status` — Operation ID: `updateQueueStatus`

Path parameters:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `transactionId` | BigInt decimal string | Yes | ID ของ `DELIVERY_EXCHANGE` transaction ที่เป็น Queue entry |

Content-Type: `application/json`

Request:

```json
{
  "status": "IN_PROGRESS",
  "note": "พนักงานรับงานแล้ว"
}
```

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `status` | enum | Yes | `IN_PROGRESS`, `COMPLETED` หรือ `CANCELLED` |
| `note` | string | No | trim แล้วต้องมีอย่างน้อย 1 character |

Request object เป็น strict object และ reject unknown/server-owned fields

Success: `200 OK`

- คืน Queue entry หลัง update
- การเปลี่ยนเป็น `COMPLETED` สร้าง inventory effects ก่อน response
- การเปลี่ยนเป็น `CANCELLED` ไม่ตัด stock

## 6. OpenAPI 3.1 contract

```yaml
openapi: 3.1.0
info:
  title: KMG-SERVICE Queue API
  version: 0.1.0
  description: Implemented delivery queue contract for the KMG-SERVICE MVP.
servers:
  - url: http://localhost:4000
    description: Local development
tags:
  - name: Queues
    description: Delivery queue views backed by DELIVERY_EXCHANGE transactions
paths:
  /api/queues/today:
    get:
      tags: [Queues]
      summary: List today's delivery queue
      operationId: listTodayQueue
      description: >-
        ADMIN only. Returns DELIVERY_EXCHANGE transactions whose persisted
        queueDate equals today's business date in Asia/Bangkok. The optional
        status filter combines with the date filter using AND. Results are
        ordered by queueNo ascending, then transaction id ascending. This
        operation is read-only.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/QueueStatusFilter'
      responses:
        '200':
          description: Queue entries for today's business date
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/QueueListResponse'
              example:
                success: true
                data:
                  queueDate: '2026-07-24'
                  queues:
                    - id: '9001'
                      transactionNo: TX-20260724-0001
                      status: PENDING
                      queueDate: '2026-07-24'
                      queueNo: 1
                      customerName: ร้านอาหารอิ่มดี
                      customerPhone: '0899999999'
                      customerAddress: 12 ถนนพระราม 4 กรุงเทพฯ
                      totalAmount: '780.00'
                      note: โทรก่อนถึงร้าน
                      items:
                        - id: '12001'
                          productId: '42'
                          productBrand: ปตท.
                          productWeightKg: '15.00'
                          quantity: 2
                          unitPrice: '390.00'
                          lineTotal: '780.00'
                          note: null
                      totalQuantity: 2
                      createdBy:
                        id: '1'
                        name: Admin
                      createdAt: '2026-07-24T02:15:00.000Z'
                      updatedAt: '2026-07-24T02:15:00.000Z'
                      completedAt: null
                meta:
                  requestId: req_01KMGQUEUE000000000000001
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '500': { $ref: '#/components/responses/InternalError' }
  /api/queues:
    get:
      tags: [Queues]
      summary: List delivery queue by date
      operationId: listQueueByDate
      description: >-
        ADMIN only. Returns DELIVERY_EXCHANGE transactions for the exact
        persisted queue business date. The optional status filter combines
        with date using AND. Results are ordered by queueNo ascending, then
        transaction id ascending. A valid date with no queue returns an empty
        array. This operation is read-only.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/QueueDate'
        - $ref: '#/components/parameters/QueueStatusFilter'
      responses:
        '200':
          description: Queue entries for the selected business date
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/QueueListResponse'
              example:
                success: true
                data:
                  queueDate: '2026-07-23'
                  queues: []
                meta:
                  requestId: req_01KMGQUEUE000000000000002
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '500': { $ref: '#/components/responses/InternalError' }
  /api/queues/{transactionId}/status:
    patch:
      tags: [Queues]
      summary: Update delivery queue status
      operationId: updateQueueStatus
      description: >-
        ADMIN only. Updates the status of a DELIVERY_EXCHANGE transaction that
        has persisted queue data. Allowed transitions are PENDING to
        IN_PROGRESS or CANCELLED and IN_PROGRESS to COMPLETED or CANCELLED.
        Every successful change creates a status log. Completing a queue
        atomically decreases full stock, increases empty stock, creates
        FULL_OUT and EMPTY_IN movements, and sets completedAt. Cancelling a
        queue has no inventory effect. The operation succeeds or fails as one
        unit.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/TransactionId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateQueueStatusRequest'
            examples:
              startDelivery:
                value:
                  status: IN_PROGRESS
                  note: พนักงานรับงานแล้ว
              completeDelivery:
                value:
                  status: COMPLETED
                  note: ส่งและรับถังเปล่าเรียบร้อย
              cancelDelivery:
                value:
                  status: CANCELLED
                  note: ลูกค้ายกเลิกรายการ
      responses:
        '200':
          description: Updated queue entry
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/QueueEntryResponse'
              example:
                success: true
                data:
                  id: '9001'
                  transactionNo: TX-20260724-0001
                  status: IN_PROGRESS
                  queueDate: '2026-07-24'
                  queueNo: 1
                  customerName: ร้านอาหารอิ่มดี
                  customerPhone: '0899999999'
                  customerAddress: 12 ถนนพระราม 4 กรุงเทพฯ
                  totalAmount: '780.00'
                  note: โทรก่อนถึงร้าน
                  items:
                    - id: '12001'
                      productId: '42'
                      productBrand: ปตท.
                      productWeightKg: '15.00'
                      quantity: 2
                      unitPrice: '390.00'
                      lineTotal: '780.00'
                      note: null
                  totalQuantity: 2
                  createdBy:
                    id: '1'
                    name: Admin
                  createdAt: '2026-07-24T02:15:00.000Z'
                  updatedAt: '2026-07-24T03:00:00.000Z'
                  completedAt: null
                meta:
                  requestId: req_01KMGQUEUE000000000000003
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/QueueNotFound' }
        '409':
          description: Invalid transition, insufficient stock, or concurrent state conflict
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              examples:
                invalidTransition:
                  value:
                    success: false
                    error:
                      code: INVALID_STATUS_TRANSITION
                      message: Cannot change transaction status from PENDING to COMPLETED
                      details: []
                    meta:
                      requestId: req_01KMGQUEUE000000000000004
                insufficientStock:
                  value:
                    success: false
                    error:
                      code: INSUFFICIENT_STOCK
                      message: Insufficient product stock
                      details: []
                    meta:
                      requestId: req_01KMGQUEUE000000000000005
        '500': { $ref: '#/components/responses/InternalError' }
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  parameters:
    QueueDate:
      name: date
      in: query
      required: true
      description: Exact queue business date in YYYY-MM-DD format.
      schema:
        type: string
        format: date
        pattern: '^\d{4}-\d{2}-\d{2}$'
      example: '2026-07-24'
    QueueStatusFilter:
      name: status
      in: query
      required: false
      description: Exact persisted transaction status.
      schema:
        $ref: '#/components/schemas/QueueStatus'
    TransactionId:
      name: transactionId
      in: path
      required: true
      description: BigInt ID of the DELIVERY_EXCHANGE transaction represented by the queue entry.
      schema:
        $ref: '#/components/schemas/BigIntId'
  schemas:
    BigIntId:
      type: string
      pattern: '^[1-9][0-9]*$'
      example: '42'
    DecimalMoney:
      type: string
      pattern: '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      description: Non-negative fixed-point amount in Thai baht (THB).
      example: '390.00'
    DecimalMeasurement:
      type: string
      pattern: '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      description: Non-negative fixed-point measurement.
      example: '15.00'
    QueueStatus:
      type: string
      enum: [PENDING, IN_PROGRESS, COMPLETED, CANCELLED]
    QueueStatusInput:
      type: string
      enum: [IN_PROGRESS, COMPLETED, CANCELLED]
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
    QueueItem:
      type: object
      additionalProperties: false
      required:
        - id
        - productId
        - productBrand
        - productWeightKg
        - quantity
        - unitPrice
        - lineTotal
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
          description: Historical product brand snapshot.
        productWeightKg:
          $ref: '#/components/schemas/DecimalMeasurement'
        quantity:
          type: integer
          minimum: 1
        unitPrice:
          $ref: '#/components/schemas/DecimalMoney'
        lineTotal:
          $ref: '#/components/schemas/DecimalMoney'
        note:
          type: [string, 'null']
    QueueEntry:
      type: object
      additionalProperties: false
      required:
        - id
        - transactionNo
        - status
        - queueDate
        - queueNo
        - customerName
        - customerPhone
        - customerAddress
        - totalAmount
        - note
        - items
        - totalQuantity
        - createdBy
        - createdAt
        - updatedAt
        - completedAt
      properties:
        id:
          $ref: '#/components/schemas/BigIntId'
        transactionNo:
          type: string
          maxLength: 50
          example: TX-20260724-0001
        status:
          $ref: '#/components/schemas/QueueStatus'
        queueDate:
          type: string
          format: date
          description: Persisted queue business date.
        queueNo:
          type: integer
          minimum: 1
        customerName:
          type: string
          minLength: 1
          maxLength: 150
          description: Historical customer name snapshot.
        customerPhone:
          type: [string, 'null']
          maxLength: 50
          description: Historical customer phone snapshot.
        customerAddress:
          type: [string, 'null']
          description: Historical customer address snapshot.
        totalAmount:
          $ref: '#/components/schemas/DecimalMoney'
        note:
          type: [string, 'null']
        items:
          type: array
          minItems: 1
          items:
            $ref: '#/components/schemas/QueueItem'
        totalQuantity:
          type: integer
          minimum: 1
        createdBy:
          $ref: '#/components/schemas/PublicUser'
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
        completedAt:
          type: [string, 'null']
          format: date-time
    UpdateQueueStatusRequest:
      type: object
      additionalProperties: false
      required: [status]
      properties:
        status:
          $ref: '#/components/schemas/QueueStatusInput'
        note:
          type: string
          minLength: 1
    QueueListData:
      type: object
      additionalProperties: false
      required: [queueDate, queues]
      properties:
        queueDate:
          type: string
          format: date
        queues:
          type: array
          items:
            $ref: '#/components/schemas/QueueEntry'
    ResponseMeta:
      type: object
      additionalProperties: false
      required: [requestId]
      properties:
        requestId:
          type: string
          minLength: 1
          example: req_01KMGQUEUE000000000000001
    ApiError:
      type: object
      additionalProperties: false
      required: [code, message, details]
      properties:
        code:
          type: string
          enum:
            - VALIDATION_ERROR
            - UNAUTHORIZED
            - FORBIDDEN
            - NOT_FOUND
            - CONFLICT
            - INSUFFICIENT_STOCK
            - INVALID_STATUS_TRANSITION
            - INTERNAL_ERROR
        message:
          type: string
          minLength: 1
        details:
          type: array
          items: {}
    QueueListResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success:
          type: boolean
          const: true
        data:
          $ref: '#/components/schemas/QueueListData'
        meta:
          $ref: '#/components/schemas/ResponseMeta'
    QueueEntryResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success:
          type: boolean
          const: true
        data:
          $ref: '#/components/schemas/QueueEntry'
        meta:
          $ref: '#/components/schemas/ResponseMeta'
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
      description: Request path, query, or body validation failed
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
              requestId: req_01KMGQUEUE000000000000006
    Unauthorized:
      description: Missing, invalid, or inactive-user authentication
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
              requestId: req_01KMGQUEUE000000000000007
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
              message: Forbidden
              details: []
            meta:
              requestId: req_01KMGQUEUE000000000000008
    QueueNotFound:
      description: Transaction does not exist or is not a queue-backed DELIVERY_EXCHANGE
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            success: false
            error:
              code: NOT_FOUND
              message: Queue transaction not found
              details: []
            meta:
              requestId: req_01KMGQUEUE000000000000009
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
              requestId: req_01KMGQUEUE000000000000010
security:
  - bearerAuth: []
```

## 7. Error behavior

| HTTP | Code | Operations | Condition |
| --- | --- | --- | --- |
| `400` | `VALIDATION_ERROR` | All | Invalid date/status, invalid BigInt ID, missing required query/body หรือ unknown field |
| `401` | `UNAUTHORIZED` | All | Missing/invalid JWT หรือ user/role inactive |
| `403` | `FORBIDDEN` | All | Authenticated user ไม่มี role ที่อนุญาต |
| `404` | `NOT_FOUND` | Update | Transaction ไม่มีอยู่หรือไม่ใช่ queue-backed `DELIVERY_EXCHANGE` |
| `409` | `INVALID_STATUS_TRANSITION` | Update | Transition ไม่ได้รับอนุญาต, terminal state, duplicate status หรือแพ้ concurrent status claim |
| `409` | `INSUFFICIENT_STOCK` | Complete | Full stock ไม่พอสำหรับทุก item |
| `500` | `INTERNAL_ERROR` | All | Unexpected server error โดยไม่ expose stack/SQL/internal details |

Valid business date ที่ไม่มีคิวไม่ใช่ error และต้องคืน `200` พร้อม empty array

## 8. Implementation requirements

### 8.1 Target files

```text
src/modules/queue/
  queue.routes.ts
  queue.controller.ts
  queue.schema.ts
  queue.service.ts
  queue.repository.ts
  queue.mapper.ts
  queue.types.ts
  queue-spec.md
```

และ wire:

```text
src/routes.ts -> apiRouter.use("/queues", queueRouter)
```

### 8.2 Ownership boundaries

- Queue controller อ่าน validated input, เรียก service และคืน standard response เท่านั้น
- Queue read service เป็น read-only และอ่าน queue projection จาก Transaction records
- Queue repository มีเฉพาะ database queries ไม่มี business rules
- Status update ต้อง delegate ไปยัง `TransactionService` หรือ shared internal method ที่คง transaction boundary เดิม
- ห้ามสร้าง status transition หรือ inventory workflow ซ้ำใน QueueService
- `TransactionService` ยังคงเป็น owner ของ status log, completion timestamp, inventory balance และ movements
- ห้ามสร้าง Queue model/table ใหม่ใน MVP

### 8.3 Query requirements

Read repository ต้อง:

- filter `transactionType = DELIVERY_EXCHANGE`
- filter exact `queueDate`
- require `queueNo != null`
- apply optional exact status filter
- include transaction item snapshots และ created-by public user
- order `queueNo ASC, id ASC`
- ไม่อ่าน current product fields เพื่อแทน snapshot

`GET /api/queues/today` ต้องใช้ shared Bangkok business-date utility ห้ามใช้ server-local `new Date().toISOString().slice(0, 10)` โดยตรง

### 8.4 Status update requirements

ก่อน delegate status workflow ต้องยืนยันว่า:

```text
transaction exists
transactionType = DELIVERY_EXCHANGE
queueDate != null
queueNo != null
```

Write workflow ต้องคง behavior ปัจจุบัน:

1. อ่าน current persisted status
2. ตรวจ allowed transition
3. claim status แบบ conditional write
4. ถ้า target เป็น `COMPLETED` ให้ apply exchange stock แบบ conditional atomic update
5. สร้าง `FULL_OUT` และ `EMPTY_IN` movements
6. สร้าง status log
7. อ่าน Queue entry หลัง update
8. commit ทั้งหมดพร้อมกัน

ลำดับภายในอาจเปลี่ยนได้หากยังรักษา observable all-or-nothing behavior และ concurrency invariants

## 9. Test requirements

### 9.1 Schema tests

- accept no query และ valid status สำหรับ today endpoint
- require valid `date` สำหรับ date endpoint
- reject impossible calendar dates
- reject unknown query fields
- accept decimal-string positive transaction ID
- reject zero, negative, decimal และ non-numeric IDs
- accept `IN_PROGRESS`, `COMPLETED`, `CANCELLED`
- reject `PENDING` เป็น update target
- reject empty/whitespace note และ unknown body fields

### 9.2 Service tests

- today ใช้ business date ตาม `Asia/Bangkok`
- list คืนเฉพาะ `DELIVERY_EXCHANGE` ของ exact `queueDate`
- status filter combine ด้วย AND
- sort `queueNo ASC, id ASC`
- valid date without rows returns empty list
- Queue mapper ใช้ customer/product/price snapshots
- non-delivery transaction คืน `404 NOT_FOUND`
- missing queue data คืน `404 NOT_FOUND`
- status update delegate shared Transaction workflow

### 9.3 PostgreSQL integration tests

- concurrent delivery creation ได้ queue numbers ไม่ซ้ำ
- queue numbers เริ่มใหม่เมื่อ business date เปลี่ยน
- today/date filter ใช้ `queueDate` ไม่ใช่ `createdAt`
- cancelled queue ยังคง queue number เดิมและไม่ตัด stock
- `PENDING -> IN_PROGRESS` ไม่ตัด stock
- `IN_PROGRESS -> COMPLETED` ตัด stockและสร้าง movements ครั้งเดียว
- insufficient stock rollback status, log, balance และ movements
- concurrent completion สำเร็จเพียง request เดียว
- completed/cancelled queue เปลี่ยนต่อไม่ได้
- status log มี from/to/user/time/note ถูกต้อง

### 9.4 HTTP integration tests

- ทุก route ป้องกันด้วย Bearer auth
- role ที่ไม่อนุญาตได้ `403`
- today response ใช้ standard envelope
- date response ใช้ standard envelope
- invalid query/path/body ได้ `400 VALIDATION_ERROR`
- non-queue transaction ID ได้ `404 NOT_FOUND`
- successful status update คืน Queue entry หลัง mutation
- error responses มี `meta.requestId`

## 10. Assumptions and unresolved decisions

1. MVP daily queue ไม่ paginate เพราะทั้งสอง read operations จำกัด exact business date และปริมาณคิวต่อวันคาดว่าจัดการได้ใน response เดียว
2. Read endpoints คืน terminal statuses ด้วย หาก client ไม่ส่ง status filter เพื่อให้ตรวจสอบคิวทั้งวันและ audit ได้
3. Queue entry รวม lightweight item snapshots เพื่อให้หน้าคิวแสดงสินค้าที่ต้องส่งโดยไม่ต้องยิง Transaction detail แยกทุกแถว
4. Queue entry ไม่คืน `costPrice` เพราะไม่จำเป็นต่อ delivery workflow
5. Non-delivery transaction ID บน Queue status path คืน `404` เพื่อให้ resource semantics ชัดและไม่เปิดเผย transaction อื่นผ่าน Queue module
6. Queue API ไม่มี dedicated cancel endpoint; client ส่ง `{ "status": "CANCELLED" }` ไปที่ status endpoint
7. Assignment, rider และ queue reordering เป็น future scope การเพิ่ม field หรือ endpoint เหล่านี้ต้องทบทวน authorization และ concurrency contract ใหม่

ประเด็นที่ต้องยืนยันก่อน implementation หากความต้องการ frontend ต่างจาก assumptions:

- ต้องการซ่อน `COMPLETED`/`CANCELLED` โดย default หรือไม่
- ต้องการ pagination สำหรับ daily queue ตั้งแต่ MVP หรือไม่
- ต้องการคืน `statusLogs` ใน Queue entry หรือให้เปิด Transaction detail เมื่อดู audit

## 11. Compatibility and implementation notes

- Contract นี้เพิ่ม endpoints ใหม่และ implementation ตรงตาม contract จึงไม่เป็น breaking change ต่อ API เดิม
- `PATCH /api/queues/{transactionId}/status` เป็น alternate module-specific path ของ existing `PATCH /api/transactions/{transactionId}/status` ทั้งสอง path ต้องให้ผลด้าน status, log, stock และ errors สอดคล้องกัน
- Queue response intentionally แคบกว่า Transaction detail และไม่คืน `costPrice`, `customerId` หรือ status logs
- การเพิ่ม pagination ภายหลังจะเปลี่ยน response metadata และอาจเป็น breaking change ควรตัดสินใจก่อน frontend production integration
- Current transaction list filter วันที่จาก `createdAt`; ห้าม reuse semantics นั้นแทน exact persisted `queueDate`
- Queue core, routes, exact-date read query, mapper และ shared status workflow ผ่าน unit/HTTP/PostgreSQL integration tests
- Isolated PostgreSQL suite รันผ่าน `npm run test:queues:integration`
