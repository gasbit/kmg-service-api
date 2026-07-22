# Transaction API Specification

สถานะเอกสาร: Proposed contract สำหรับ MVP (ยังไม่มี implementation)  
เวอร์ชัน: 0.1.0  
Base path: `/api`  
Owning module: `transactions`

## 1. ขอบเขต

เอกสารนี้กำหนด API contract สำหรับ transaction history, transaction detail, การสร้าง transaction และการเปลี่ยนสถานะ transaction

- รองรับ transaction types `DELIVERY_EXCHANGE`, `WALK_IN_EXCHANGE`, `BORROW_CYLINDER`, `RETURN_CYLINDER` และ `BUY_FULL_TANK` ใน representation และ history
- `POST /api/transactions` สร้าง `DELIVERY_EXCHANGE`, `WALK_IN_EXCHANGE`, `BORROW_CYLINDER` และ `BUY_FULL_TANK`
- `RETURN_CYLINDER` ต้องสร้างผ่าน loan return workflow เพื่อบังคับอ้างอิง loan เดิมและตรวจ remaining quantity; transaction ที่ workflow นั้นสร้างยังอ่านได้จาก endpoints ในเอกสารนี้
- Transaction และ item เก็บ customer/product/price/cost snapshots เพื่อรักษาประวัติเมื่อ master data เปลี่ยน
- Queue, status log, inventory movement, inventory balance และ loan effects ของหนึ่ง workflow ต้องสำเร็จหรือล้มเหลวพร้อมกัน
- ทุก endpoint ใช้ Bearer JWT และจำกัดสิทธิ์เป็น `ADMIN` สำหรับ MVP

ไม่รวม queue list, loan list/return, inventory list/adjustment และ dashboard endpoints ซึ่งอยู่ใน owning modules อื่น

## 2. แหล่งอ้างอิงและสถานะ implementation

Contract นี้อ้างอิง `AGENTS.md`, `CONTEXT.md`, `Backend-Implement-Plan.md`, `../Context.md`, `../Backend-Architecture.md`, `../Database-Design.md`, `../Business-Flow.md`, Prisma models และ shared error codes

ณ เวลาที่จัดทำยังไม่มี transaction constants, routes, Zod schemas, controllers, services, repositories หรือ tests ดังนั้น contract นี้เป็นเป้าหมายสำหรับ implementation ไม่ใช่คำอธิบาย behavior ปัจจุบัน

เอกสารเก่าบางฉบับใช้ base path `/api/v1` แต่ route ปัจจุบัน, `AGENTS.md` และ API conventions ของโปรเจกต์ใช้ `/api` Contract นี้จึงยึด `/api`

## 3. Contract decisions

- Client ไม่ส่ง `status`, `transactionNo`, `queueDate`, `queueNo`, `createdBy`, `completedAt`, `itemAction`, `unitPrice`, `costPrice`, `lineTotal` หรือ `totalAmount` ตอนสร้าง; server derive ค่าเหล่านี้จาก transaction type, authenticated user และ product master
- ราคาและทุนที่ใช้คำนวณเป็นค่าจาก product ณ เวลาสร้าง เพื่อป้องกัน client กำหนดราคาหรือทุนเอง และถูกเก็บเป็น snapshot
- `DELIVERY_EXCHANGE` และ `WALK_IN_EXCHANGE` ใช้ `exchangeSalePrice` เป็น `unitPrice` และ `exchangeCostPrice` เป็น `costPrice`
- `BUY_FULL_TANK` ใช้ `fullTankPrice` เป็น `unitPrice` และ `fullTankCostPrice` เป็น `costPrice`; ห้ามใช้ exchange cost แทนต้นทุนถังเต็ม
- `BORROW_CYLINDER` ใช้ `unitPrice = 0.00`, `lineTotal = 0.00` และ snapshot `exchangeCostPrice` ไว้ใน `costPrice` เพื่อเป็นมูลค่าอ้างอิงเท่านั้น ไม่ใช่ต้นทุนขาย
- `lineTotal = quantity * unitPrice` และ `totalAmount` เป็นผลรวม line totals โดยคำนวณด้วย decimal arithmetic ฝั่ง server
- `BORROW_CYLINDER` เก็บ `expectedReturnDate` และ `depositAmount` แยกต่อ item เพราะ database สร้างหนึ่ง loan ต่อ transaction item
- `depositAmount` เป็นข้อมูลของ loan ไม่รวมใน `lineTotal`, `totalAmount`, Dashboard sales หรือต้นทุนขาย
- MVP ไม่รองรับ discount, client price override หรือ cost override และต้อง reject server-owned monetary fields ใน create payload
- `customerId` ยังไม่รับจาก client ใน MVP เพราะยังไม่มี customer master workflow; response ยังคงมี field นี้เป็น nullable เพื่อรองรับข้อมูลที่อาจเชื่อม customer ในอนาคต โดย snapshot fields เป็น source of truth สำหรับ history
- `PATCH /api/transactions/{transactionId}/status` เป็น status transition หลัก ส่วน `POST /api/transactions/{transactionId}/cancel` เป็น convenience action ที่มีผลเท่ากับ transition ไป `CANCELLED`
- วันที่ queue และตัวกรองแบบ date ตีความตามเขตเวลา `Asia/Bangkok`
- Transaction history เรียง `createdAt DESC, id DESC` และ filters ทั้งหมด combine ด้วย AND; `search` ค้นแบบ case-insensitive partial match ด้วย OR ใน `transactionNo`, `customerName` และ `customerPhone`

## 4. Endpoint summary

| Method | Path | Operation ID | Result |
| --- | --- | --- | --- |
| `GET` | `/api/transactions` | `listTransactions` | อ่าน transaction history แบบแบ่งหน้า |
| `GET` | `/api/transactions/{transactionId}` | `getTransaction` | อ่าน transaction detail พร้อม items และ status logs |
| `POST` | `/api/transactions` | `createTransaction` | สร้าง transaction และ domain effects ที่เกี่ยวข้อง |
| `PATCH` | `/api/transactions/{transactionId}/status` | `changeTransactionStatus` | เปลี่ยนสถานะตาม allowed transition |
| `POST` | `/api/transactions/{transactionId}/cancel` | `cancelTransaction` | ยกเลิก transaction ที่ยังไม่เป็น final state |

## 5. Domain behavior

| Type | Initial status | Item action | Observable effects |
| --- | --- | --- | --- |
| `DELIVERY_EXCHANGE` | `PENDING` | `EXCHANGE` | สร้าง queue วันนี้; ยังไม่เปลี่ยน stock จน `COMPLETED` |
| `WALK_IN_EXCHANGE` | `COMPLETED` | `EXCHANGE` | สร้าง `FULL_OUT` และ `EMPTY_IN` ทันที |
| `BORROW_CYLINDER` | `COMPLETED` | `BORROW` | สร้าง `LOAN_OUT` และ loan ต่อ item ทันที |
| `RETURN_CYLINDER` | `COMPLETED` | `RETURN` | สร้างโดย loan return workflow; สร้าง `LOAN_RETURN` และอัปเดต loan |
| `BUY_FULL_TANK` | `COMPLETED` | `BUY_FULL_TANK` | สร้าง `FULL_OUT` ทันที |

Allowed status transitions:

```text
PENDING -> IN_PROGRESS
PENDING -> CANCELLED
IN_PROGRESS -> COMPLETED
IN_PROGRESS -> CANCELLED
```

`COMPLETED` และ `CANCELLED` เป็น final state ทุกการสร้างและเปลี่ยนสถานะต้องมี status log การ complete `DELIVERY_EXCHANGE` สร้าง stock effects เพียงครั้งเดียว ส่วนการ cancel ไม่สร้าง stock movement

Sales aggregation ในอนาคตต้องนับเฉพาะ transaction สถานะ `COMPLETED` ของ `DELIVERY_EXCHANGE`, `WALK_IN_EXCHANGE` และ `BUY_FULL_TANK` เท่านั้น โดยไม่รวม borrow, return, cancellation หรือ deposit ส่วน `costPrice` ของ borrow เป็น valuation snapshot และห้ามนำไปคำนวณ gross profit

## 6. OpenAPI 3.1 contract

```yaml
openapi: 3.1.0
info:
  title: KMG-SERVICE Transaction API
  version: 0.1.0
  description: Proposed Transaction Management contract for the KMG-SERVICE MVP.
servers:
  - url: http://localhost:4000
    description: Local development
tags:
  - name: Transactions
    description: Transaction history and transaction workflow operations
paths:
  /api/transactions:
    get:
      tags: [Transactions]
      summary: List transactions
      operationId: listTransactions
      description: >-
        ADMIN only. Filters combine with AND. Search matches transaction number,
        customer name, or customer phone with OR. Business dates use Asia/Bangkok.
        Results are ordered by createdAt descending, then id descending.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - name: transactionType
          in: query
          required: false
          schema:
            $ref: '#/components/schemas/TransactionType'
        - name: status
          in: query
          required: false
          schema:
            $ref: '#/components/schemas/TransactionStatus'
        - name: dateFrom
          in: query
          required: false
          description: Inclusive created date in Asia/Bangkok. Must not be after dateTo.
          schema:
            type: string
            format: date
        - name: dateTo
          in: query
          required: false
          description: Inclusive created date in Asia/Bangkok. Must not be before dateFrom.
          schema:
            type: string
            format: date
        - name: search
          in: query
          required: false
          schema:
            type: string
            minLength: 1
            maxLength: 150
      responses:
        '200':
          description: Transaction history
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TransactionListResponse'
              example:
                success: true
                data:
                  transactions:
                    - id: '9001'
                      transactionNo: TX-20260714-0001
                      transactionType: DELIVERY_EXCHANGE
                      status: PENDING
                      queueDate: '2026-07-14'
                      queueNo: 1
                      customerName: สมชาย ใจดี
                      customerPhone: '0812345678'
                      customerAddress: 99/1 ถนนสุขุมวิท กรุงเทพฯ
                      totalAmount: '780.00'
                      note: ส่งก่อนเที่ยง
                      itemCount: 1
                      totalQuantity: 2
                      createdBy:
                        id: '1'
                        name: เจ้าของร้าน
                      createdAt: '2026-07-14T02:15:00.000Z'
                      updatedAt: '2026-07-14T02:15:00.000Z'
                      completedAt: null
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
    post:
      tags: [Transactions]
      summary: Create a transaction
      operationId: createTransaction
      description: >-
        ADMIN only. Creates the transaction, snapshots, initial status log, and any
        queue, inventory, or loan effects as one all-or-nothing operation. The server
        derives item actions, prices, costs, totals, status, queue values, and creator.
        RETURN_CYLINDER is created through the loan return operation, not this endpoint.
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateTransactionRequest'
            examples:
              deliveryExchange:
                summary: Delivery exchange entering today's queue
                value:
                  transactionType: DELIVERY_EXCHANGE
                  customerName: สมชาย ใจดี
                  customerPhone: '0812345678'
                  customerAddress: 99/1 ถนนสุขุมวิท กรุงเทพฯ
                  note: ส่งก่อนเที่ยง
                  items:
                    - productId: '42'
                      quantity: 2
              borrowCylinder:
                summary: Borrow cylinders with loan terms per product
                value:
                  transactionType: BORROW_CYLINDER
                  customerName: ร้านอาหารอิ่มดี
                  customerPhone: '0899999999'
                  customerAddress: 12 ถนนพระราม 4 กรุงเทพฯ
                  items:
                    - productId: '42'
                      quantity: 1
                      expectedReturnDate: '2026-07-21'
                      depositAmount: '500.00'
      responses:
        '201':
          description: Transaction created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TransactionDetailResponse'
              example:
                success: true
                data:
                  id: '9001'
                  transactionNo: TX-20260714-0001
                  transactionType: DELIVERY_EXCHANGE
                  status: PENDING
                  queueDate: '2026-07-14'
                  queueNo: 1
                  customerId: null
                  customerName: สมชาย ใจดี
                  customerPhone: '0812345678'
                  customerAddress: 99/1 ถนนสุขุมวิท กรุงเทพฯ
                  totalAmount: '780.00'
                  note: ส่งก่อนเที่ยง
                  createdBy:
                    id: '1'
                    name: เจ้าของร้าน
                  items:
                    - id: '12001'
                      productId: '42'
                      productBrand: ปตท.
                      productWeightKg: '15.00'
                      quantity: 2
                      unitPrice: '390.00'
                      costPrice: '330.00'
                      lineTotal: '780.00'
                      itemAction: EXCHANGE
                      note: null
                  statusLogs:
                    - id: '15001'
                      fromStatus: null
                      toStatus: PENDING
                      changedBy:
                        id: '1'
                        name: เจ้าของร้าน
                      changedAt: '2026-07-14T02:15:00.000Z'
                      note: null
                  createdAt: '2026-07-14T02:15:00.000Z'
                  updatedAt: '2026-07-14T02:15:00.000Z'
                  completedAt: null
                meta:
                  requestId: req_01JABCDEF1234567890
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404':
          $ref: '#/components/responses/ReferencedResourceNotFound'
        '409':
          $ref: '#/components/responses/CreateTransactionConflict'
        '500': { $ref: '#/components/responses/InternalError' }
  /api/transactions/{transactionId}:
    get:
      tags: [Transactions]
      summary: Get transaction detail
      operationId: getTransaction
      description: ADMIN only. Snapshot values are returned even if current master data has changed or become inactive.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/TransactionId'
      responses:
        '200':
          description: Transaction detail
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TransactionDetailResponse'
              examples:
                transactionDetail:
                  $ref: '#/components/examples/TransactionDetailSuccess'
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/TransactionNotFound' }
        '500': { $ref: '#/components/responses/InternalError' }
  /api/transactions/{transactionId}/status:
    patch:
      tags: [Transactions]
      summary: Change transaction status
      operationId: changeTransactionStatus
      description: >-
        ADMIN only. Applies only an allowed transition and records a status log.
        Completing a DELIVERY_EXCHANGE creates FULL_OUT and EMPTY_IN effects exactly once.
        Completed and cancelled transactions are immutable.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/TransactionId'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ChangeTransactionStatusRequest'
            example:
              status: IN_PROGRESS
              note: มอบหมายให้พนักงานส่งแล้ว
      responses:
        '200':
          description: Updated transaction detail
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TransactionDetailResponse'
              examples:
                transactionDetail:
                  $ref: '#/components/examples/TransactionDetailSuccess'
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/TransactionNotFound' }
        '409': { $ref: '#/components/responses/StatusTransitionConflict' }
        '500': { $ref: '#/components/responses/InternalError' }
  /api/transactions/{transactionId}/cancel:
    post:
      tags: [Transactions]
      summary: Cancel a transaction
      operationId: cancelTransaction
      description: >-
        ADMIN only. Cancels a PENDING or IN_PROGRESS transaction and records a status log.
        Cancellation does not create inventory movements. Final-state transactions cannot be cancelled.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/TransactionId'
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CancelTransactionRequest'
            example:
              note: ลูกค้ายกเลิกรายการ
      responses:
        '200':
          description: Cancelled transaction detail
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TransactionDetailResponse'
              examples:
                transactionDetail:
                  $ref: '#/components/examples/CancelledTransactionSuccess'
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/TransactionNotFound' }
        '409': { $ref: '#/components/responses/StatusTransitionConflict' }
        '500': { $ref: '#/components/responses/InternalError' }
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  parameters:
    TransactionId:
      name: transactionId
      in: path
      required: true
      description: Transaction BigInt identifier serialized as a decimal string.
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
  examples:
    CancelledTransactionSuccess:
      summary: Cancelled delivery exchange transaction detail
      value:
        success: true
        data:
          id: '9001'
          transactionNo: TX-20260714-0001
          transactionType: DELIVERY_EXCHANGE
          status: CANCELLED
          queueDate: '2026-07-14'
          queueNo: 1
          customerId: null
          customerName: สมชาย ใจดี
          customerPhone: '0812345678'
          customerAddress: 99/1 ถนนสุขุมวิท กรุงเทพฯ
          totalAmount: '780.00'
          note: ส่งก่อนเที่ยง
          createdBy:
            id: '1'
            name: เจ้าของร้าน
          items:
            - id: '12001'
              productId: '42'
              productBrand: ปตท.
              productWeightKg: '15.00'
              quantity: 2
              unitPrice: '390.00'
              costPrice: '330.00'
              lineTotal: '780.00'
              itemAction: EXCHANGE
              note: null
          statusLogs:
            - id: '15001'
              fromStatus: null
              toStatus: PENDING
              changedBy:
                id: '1'
                name: เจ้าของร้าน
              changedAt: '2026-07-14T02:15:00.000Z'
              note: null
            - id: '15002'
              fromStatus: PENDING
              toStatus: CANCELLED
              changedBy:
                id: '1'
                name: เจ้าของร้าน
              changedAt: '2026-07-14T02:20:00.000Z'
              note: ลูกค้ายกเลิกรายการ
          createdAt: '2026-07-14T02:15:00.000Z'
          updatedAt: '2026-07-14T02:20:00.000Z'
          completedAt: null
        meta:
          requestId: req_01JABCDEF1234567890
    TransactionDetailSuccess:
      summary: Delivery exchange transaction detail
      value:
        success: true
        data:
          id: '9001'
          transactionNo: TX-20260714-0001
          transactionType: DELIVERY_EXCHANGE
          status: IN_PROGRESS
          queueDate: '2026-07-14'
          queueNo: 1
          customerId: null
          customerName: สมชาย ใจดี
          customerPhone: '0812345678'
          customerAddress: 99/1 ถนนสุขุมวิท กรุงเทพฯ
          totalAmount: '780.00'
          note: ส่งก่อนเที่ยง
          createdBy:
            id: '1'
            name: เจ้าของร้าน
          items:
            - id: '12001'
              productId: '42'
              productBrand: ปตท.
              productWeightKg: '15.00'
              quantity: 2
              unitPrice: '390.00'
              costPrice: '330.00'
              lineTotal: '780.00'
              itemAction: EXCHANGE
              note: null
          statusLogs:
            - id: '15001'
              fromStatus: null
              toStatus: PENDING
              changedBy:
                id: '1'
                name: เจ้าของร้าน
              changedAt: '2026-07-14T02:15:00.000Z'
              note: null
            - id: '15002'
              fromStatus: PENDING
              toStatus: IN_PROGRESS
              changedBy:
                id: '1'
                name: เจ้าของร้าน
              changedAt: '2026-07-14T02:20:00.000Z'
              note: มอบหมายให้พนักงานส่งแล้ว
          createdAt: '2026-07-14T02:15:00.000Z'
          updatedAt: '2026-07-14T02:20:00.000Z'
          completedAt: null
        meta:
          requestId: req_01JABCDEF1234567890
  schemas:
    BigIntId:
      type: string
      pattern: '^[1-9][0-9]*$'
      example: '42'
    DecimalMoney:
      type: string
      pattern: '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      description: Non-negative fixed-point decimal amount in Thai baht (THB).
      example: '390.00'
    DecimalMeasurement:
      type: string
      pattern: '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
      description: Non-negative fixed-point decimal measurement.
      example: '15.00'
    TransactionType:
      type: string
      enum: [DELIVERY_EXCHANGE, WALK_IN_EXCHANGE, BORROW_CYLINDER, RETURN_CYLINDER, BUY_FULL_TANK]
    TransactionStatus:
      type: string
      enum: [PENDING, IN_PROGRESS, COMPLETED, CANCELLED]
    ItemAction:
      type: string
      enum: [EXCHANGE, BORROW, RETURN, BUY_FULL_TANK]
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
    TransactionSummary:
      type: object
      additionalProperties: false
      required:
        - id
        - transactionNo
        - transactionType
        - status
        - queueDate
        - queueNo
        - customerName
        - customerPhone
        - customerAddress
        - totalAmount
        - note
        - itemCount
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
          example: TX-20260714-0001
        transactionType:
          $ref: '#/components/schemas/TransactionType'
        status:
          $ref: '#/components/schemas/TransactionStatus'
        queueDate:
          type: [string, 'null']
          format: date
        queueNo:
          type: [integer, 'null']
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
        itemCount:
          type: integer
          minimum: 1
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
    TransactionDetail:
      type: object
      additionalProperties: false
      required:
        - id
        - transactionNo
        - transactionType
        - status
        - queueDate
        - queueNo
        - customerId
        - customerName
        - customerPhone
        - customerAddress
        - totalAmount
        - note
        - createdBy
        - items
        - statusLogs
        - createdAt
        - updatedAt
        - completedAt
      properties:
        id:
          $ref: '#/components/schemas/BigIntId'
        transactionNo:
          type: string
          maxLength: 50
        transactionType:
          $ref: '#/components/schemas/TransactionType'
        status:
          $ref: '#/components/schemas/TransactionStatus'
        queueDate:
          type: [string, 'null']
          format: date
        queueNo:
          type: [integer, 'null']
          minimum: 1
        customerId:
          oneOf:
            - $ref: '#/components/schemas/BigIntId'
            - type: 'null'
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
        createdBy:
          $ref: '#/components/schemas/PublicUser'
        items:
          type: array
          minItems: 1
          items:
            $ref: '#/components/schemas/TransactionItem'
        statusLogs:
          type: array
          minItems: 1
          description: Ordered by changedAt ascending, then id ascending.
          items:
            $ref: '#/components/schemas/TransactionStatusLog'
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time
        completedAt:
          type: [string, 'null']
          format: date-time
    TransactionItem:
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
          description: Historical product brand snapshot.
        productWeightKg:
          $ref: '#/components/schemas/DecimalMeasurement'
        quantity:
          type: integer
          minimum: 1
        unitPrice:
          $ref: '#/components/schemas/DecimalMoney'
        costPrice:
          $ref: '#/components/schemas/DecimalMoney'
        lineTotal:
          $ref: '#/components/schemas/DecimalMoney'
        itemAction:
          $ref: '#/components/schemas/ItemAction'
        note:
          type: [string, 'null']
    TransactionStatusLog:
      type: object
      additionalProperties: false
      required: [id, fromStatus, toStatus, changedBy, changedAt, note]
      properties:
        id:
          $ref: '#/components/schemas/BigIntId'
        fromStatus:
          oneOf:
            - $ref: '#/components/schemas/TransactionStatus'
            - type: 'null'
        toStatus:
          $ref: '#/components/schemas/TransactionStatus'
        changedBy:
          $ref: '#/components/schemas/PublicUser'
        changedAt:
          type: string
          format: date-time
        note:
          type: [string, 'null']
    CommonCreateItem:
      type: object
      additionalProperties: false
      required: [productId, quantity]
      properties:
        productId:
          $ref: '#/components/schemas/BigIntId'
        quantity:
          type: integer
          minimum: 1
        note:
          type: string
          minLength: 1
    BorrowCreateItem:
      type: object
      additionalProperties: false
      required: [productId, quantity]
      properties:
        productId:
          $ref: '#/components/schemas/BigIntId'
        quantity:
          type: integer
          minimum: 1
        expectedReturnDate:
          type: string
          format: date
          description: Optional expected return date for the loan created from this item.
        depositAmount:
          $ref: '#/components/schemas/DecimalMoney'
        note:
          type: string
          minLength: 1
    CreateTransactionRequest:
      oneOf:
        - $ref: '#/components/schemas/CreateDeliveryExchangeRequest'
        - $ref: '#/components/schemas/CreateWalkInExchangeRequest'
        - $ref: '#/components/schemas/CreateBorrowCylinderRequest'
        - $ref: '#/components/schemas/CreateBuyFullTankRequest'
      discriminator:
        propertyName: transactionType
        mapping:
          DELIVERY_EXCHANGE: '#/components/schemas/CreateDeliveryExchangeRequest'
          WALK_IN_EXCHANGE: '#/components/schemas/CreateWalkInExchangeRequest'
          BORROW_CYLINDER: '#/components/schemas/CreateBorrowCylinderRequest'
          BUY_FULL_TANK: '#/components/schemas/CreateBuyFullTankRequest'
    CreateDeliveryExchangeRequest:
      type: object
      additionalProperties: false
      required: [transactionType, customerName, customerAddress, items]
      properties:
        transactionType:
          type: string
          const: DELIVERY_EXCHANGE
        customerName:
          type: string
          minLength: 1
          maxLength: 150
        customerPhone:
          type: string
          minLength: 1
          maxLength: 50
        customerAddress:
          type: string
          minLength: 1
        note:
          type: string
          minLength: 1
        items:
          type: array
          minItems: 1
          items:
            $ref: '#/components/schemas/CommonCreateItem'
    CreateWalkInExchangeRequest:
      $ref: '#/components/schemas/CreateStandardCompletedRequest'
    CreateBuyFullTankRequest:
      type: object
      additionalProperties: false
      required: [transactionType, customerName, items]
      properties:
        transactionType:
          type: string
          const: BUY_FULL_TANK
        customerName:
          type: string
          minLength: 1
          maxLength: 150
        customerPhone:
          type: string
          minLength: 1
          maxLength: 50
        customerAddress:
          type: string
          minLength: 1
        note:
          type: string
          minLength: 1
        items:
          type: array
          minItems: 1
          items:
            $ref: '#/components/schemas/CommonCreateItem'
    CreateStandardCompletedRequest:
      type: object
      additionalProperties: false
      required: [transactionType, customerName, items]
      properties:
        transactionType:
          type: string
          const: WALK_IN_EXCHANGE
        customerName:
          type: string
          minLength: 1
          maxLength: 150
        customerPhone:
          type: string
          minLength: 1
          maxLength: 50
        customerAddress:
          type: string
          minLength: 1
        note:
          type: string
          minLength: 1
        items:
          type: array
          minItems: 1
          items:
            $ref: '#/components/schemas/CommonCreateItem'
    CreateBorrowCylinderRequest:
      type: object
      additionalProperties: false
      required: [transactionType, customerName, items]
      properties:
        transactionType:
          type: string
          const: BORROW_CYLINDER
        customerName:
          type: string
          minLength: 1
          maxLength: 150
        customerPhone:
          type: string
          minLength: 1
          maxLength: 50
        customerAddress:
          type: string
          minLength: 1
        note:
          type: string
          minLength: 1
        items:
          type: array
          minItems: 1
          items:
            $ref: '#/components/schemas/BorrowCreateItem'
    ChangeTransactionStatusRequest:
      type: object
      additionalProperties: false
      required: [status]
      properties:
        status:
          type: string
          enum: [IN_PROGRESS, COMPLETED, CANCELLED]
        note:
          type: string
          minLength: 1
    CancelTransactionRequest:
      type: object
      additionalProperties: false
      properties:
        note:
          type: string
          minLength: 1
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
          example: req_01JABCDEF1234567890
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
    TransactionListResponse:
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
          required: [transactions]
          properties:
            transactions:
              type: array
              items:
                $ref: '#/components/schemas/TransactionSummary'
        meta:
          $ref: '#/components/schemas/PaginatedResponseMeta'
    TransactionDetailResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success:
          type: boolean
          const: true
        data:
          $ref: '#/components/schemas/TransactionDetail'
        meta:
          $ref: '#/components/schemas/ResponseMeta'
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
      description: Invalid path, query, body shape, date range, or transaction-type-specific input.
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
      description: Missing, invalid, or expired access token.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            success: false
            error:
              code: UNAUTHORIZED
              message: Authentication is required
              details: []
            meta:
              requestId: req_01JABCDEF1234567890
    Forbidden:
      description: Authenticated user does not have an allowed role.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            success: false
            error:
              code: FORBIDDEN
              message: You do not have permission to perform this action
              details: []
            meta:
              requestId: req_01JABCDEF1234567890
    TransactionNotFound:
      description: Transaction does not exist.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            success: false
            error:
              code: NOT_FOUND
              message: Transaction not found
              details: []
            meta:
              requestId: req_01JABCDEF1234567890
    ReferencedResourceNotFound:
      description: A referenced product does not exist.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            success: false
            error:
              code: NOT_FOUND
              message: Product not found
              details: []
            meta:
              requestId: req_01JABCDEF1234567890
    CreateTransactionConflict:
      description: Product is inactive, stock is insufficient, or another current-state conflict prevents atomic creation.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          examples:
            insufficientStock:
              value:
                success: false
                error:
                  code: INSUFFICIENT_STOCK
                  message: Insufficient full cylinder stock
                  details: []
                meta:
                  requestId: req_01JABCDEF1234567890
            inactiveProduct:
              value:
                success: false
                error:
                  code: CONFLICT
                  message: Product is inactive
                  details: []
                meta:
                  requestId: req_01JABCDEF1234567890
    StatusTransitionConflict:
      description: Transition is not allowed, transaction is final, or completion cannot apply required stock effects.
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
                  message: Transaction status transition is not allowed
                  details: []
                meta:
                  requestId: req_01JABCDEF1234567890
            insufficientStock:
              value:
                success: false
                error:
                  code: INSUFFICIENT_STOCK
                  message: Insufficient full cylinder stock
                  details: []
                meta:
                  requestId: req_01JABCDEF1234567890
    InternalError:
      description: Unexpected server error without internal implementation details.
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ErrorResponse'
          example:
            success: false
            error:
              code: INTERNAL_ERROR
              message: An unexpected error occurred
              details: []
            meta:
              requestId: req_01JABCDEF1234567890
security:
  - bearerAuth: []
```

## 7. Assumptions and unresolved decisions

Approved monetary decisions:

- Exchange ใช้ exchange sale/cost จาก Product
- Buy full tank ใช้ full-tank sale/cost จาก Product ซึ่งมี `fullTankCostPrice` แยกจาก exchange cost
- Borrow ไม่มียอดขาย แต่เก็บ exchange cost เป็น valuation snapshot
- Deposit แยกอยู่บน loan และไม่รวม transaction total หรือ Dashboard sales
- MVP ไม่มี discount, price override หรือ cost override

Other assumptions used by this proposed contract:

- `customerName` is required for every client-created transaction; `customerAddress` is additionally required for `DELIVERY_EXCHANGE`
- `expectedReturnDate` is optional because Prisma allows null, despite an older frontend document describing it as required
- `depositAmount` defaults to `"0.00"` when omitted
- `POST /api/transactions/{transactionId}/cancel` accepts an omitted body; when present, the body must contain only optional `note`

Consequential decisions still requiring product approval before implementation:

1. Whether `expectedReturnDate` should be mandatory for every borrowed item.
2. Whether the separate cancel endpoint should remain, since the status endpoint already supports `CANCELLED`.
3. The exact transaction number generation and retry strategy. The public contract only guarantees uniqueness and the example format, not the algorithm.
4. Whether history search must include address or item product snapshots; this contract limits search to transaction number, customer name, and phone.

## 8. Implementation and compatibility notes

- **Major implementation gap:** transaction module and every operation in this contract are not implemented yet.
- **Major documentation conflict:** older architecture/business-flow documents use `/api/v1`; this contract follows the current unversioned `/api` application convention.
- **Major documentation conflict:** an older frontend document expects client-supplied `unitPrice` and `costPrice`; this contract derives them on the server to preserve trustworthy snapshots. Implementing the older form shape instead would be a breaking request-contract change.
- Product master now requires a dedicated `fullTankCostPrice`; existing rows are initially backfilled from `exchangeCostPrice` by migration and must be reviewed before relying on full-tank profit reporting.
- **Major workflow constraint:** direct generic creation of `RETURN_CYLINDER` is intentionally excluded. The loan return endpoint must create it through `TransactionService`; accepting it here without a loan reference would permit inconsistent loan state.
- This is a new, unimplemented contract, so it does not break an existing transaction API. Once implemented, changing path versioning, decimal serialization, required snapshot fields, status transitions, pagination ordering, or side-effect timing must be treated as potentially breaking.
