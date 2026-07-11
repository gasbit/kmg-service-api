# KMG-SERVICE แผน Implement ฝั่ง Backend

เอกสารนี้เป็นแผนดำเนินการสำหรับ `KMG-SERVICE-API` โดยอ้างอิงจาก `../Business-Flow.md`, `../Backend-Architecture.md`, `../Database-Design.md`, `../Planning.md`, `../Context.md`, `./CONTEXT.md` และ code จริงใน `KMG-SERVICE-API/src`

เป้าหมายคือทำ backend MVP ให้เป็น source of truth ของ business workflow ทั้งหมด ได้แก่ auth, products, product images, transactions, queues, loans, inventory และ dashboard โดยรักษา transaction history, snapshot data, status logs และ inventory movements ให้ถูกต้อง

แนวทางจัดเก็บรูปสินค้าใน MVP:

- ใช้ local storage ที่ `KMG-SERVICE-API/storage/products` ระหว่างพัฒนาในเครื่อง
- เก็บเฉพาะ `objectKey` และ metadata ใน PostgreSQL ไม่เก็บ binary/Base64 ใน database
- ให้ API เป็นผู้สร้าง/ลบไฟล์และส่ง `imageUrl` ให้ frontend
- แยก storage interface ออกจาก ProductService เพื่อให้เปลี่ยนเป็น S3-compatible object storage เช่น Cloudflare R2 หรือ AWS S3 ใน production ได้โดยไม่เปลี่ยน product API หลัก

## 1. Checklist ภาพรวมจาก Code จริง

ตรวจล่าสุดจาก source code ใน `KMG-SERVICE-API/src` บน branch `feature/authentication` ที่ commit `d0e9b5d` พบว่าเหลือเพียง directory skeleton และ `src/tests/.gitkeep` โดย implementation เดิม, Prisma schema, migration และ seed ถูกลบใน reset commit ปัจจุบันทุก phase จึงกลับเป็น `Todo` จนกว่าจะมี code และผ่าน verification ที่เกี่ยวข้อง

Legend:

- `Done`: มี implementation จริงและพร้อมใช้งานในระดับ MVP ตามที่ตรวจจาก code
- `Partial`: มี implementation แล้ว แต่ยังขาด behavior สำคัญ, edge case, test หรือความครบตาม business rule
- `Todo`: ยังไม่มี implementation ที่ใช้งานได้
- `Not verified`: ยังไม่ได้ยืนยันด้วยการรัน command หรือ integration test ล่าสุด

- [ ] Phase 0: โครง backend และ route wiring
  สถานะ: `Todo` - ยังไม่มี `app.ts`, `server.ts`, `routes.ts`, health check หรือ module routes
- [ ] Phase 1: Foundation, middleware และ response/error format
  สถานะ: `Todo` - directory มีอยู่ แต่ยังไม่มีไฟล์ config, middleware, shared errors หรือ response utilities
- [ ] Phase 2: Database schema, migration และ seed
  สถานะ: `Partial` - สร้าง Prisma schema, initial migration, database config และ admin seed แล้ว; `prisma validate`, `prisma generate` และ TypeScript build ผ่าน แต่ local PostgreSQL ที่ `localhost:5432` ยังไม่ตอบสนอง จึงยังไม่ได้ apply migration/seed จริง
- [ ] Phase 3: Auth และ role base
  สถานะ: `Todo` - ยังไม่มี auth source code, route, middleware หรือ smoke test ที่รันได้
- [ ] Phase 4: Product management
  สถานะ: `Todo` - ยังไม่มี Product module, CRUD, inventory initialization หรือ product image implementation
- [ ] Phase 5: Transaction core
  สถานะ: `Todo` - ยังไม่มี Transaction module หรือ workflow implementation
- [ ] Phase 6: Queue workflow
  สถานะ: `Todo` - ยังไม่มี Queue module, route หรือ service
- [ ] Phase 7: Cylinder loan workflow
  สถานะ: `Todo` - ยังไม่มี Loan module หรือ loan return lifecycle
- [ ] Phase 8: Inventory workflow
  สถานะ: `Todo` - ยังไม่มี Inventory module, balances หรือ movements implementation
- [ ] Phase 9: Dashboard read aggregation
  สถานะ: `Todo` - ยังไม่มี Dashboard module หรือ endpoint
- [ ] Phase 10: Tests, OpenAPI และ hardening
  สถานะ: `Todo` - build ไม่ผ่านเพราะไม่มี TypeScript inputs; ยังไม่มี test files, ESLint v9 flat config หรือ OpenAPI docs

งานถัดไปที่ควรเริ่มก่อน:

- [ ] สร้าง application foundation (`app.ts`, `server.ts`, routes, config, middleware และ shared utilities)
- [ ] สร้าง Prisma schema, initial migration และ seed ใหม่
- [ ] Implement auth และ role base ก่อน business modules
- [ ] ปิด gap ของ `returnLoan`: อัปเดต `cylinder_loans.loan_status`, `returned_date` และรองรับ partial return ให้ถูกต้อง
- [ ] เพิ่ม test สำคัญของ `TransactionService`: create transaction, status transition, delivery complete ตัด stock, invalid transition, insufficient stock
- [ ] เพิ่ม test ของ loan return และ inventory movement
- [ ] Harden queue number generation ด้วย DB transaction/unique constraint retry หรือ conflict handling
- [ ] ตรวจ `adjustInventory` ว่า movement quantity/note สื่อความหมายพอสำหรับ delta หลาย field หรือควรแยก movement ต่อ balance type
- [ ] เพิ่ม OpenAPI/Swagger หรืออย่างน้อย endpoint contract สำหรับ frontend
- [ ] ทำให้ `npm run build` ผ่านหลังมี TypeScript source files
- [ ] เพิ่ม/แก้ ESLint config ของ API ให้รองรับ ESLint v9 แล้วรัน `npm run lint`
- [ ] รัน `npm test`, `npm run prisma:generate` หลังแก้ logic สำคัญ

## 2. รายละเอียดสถานะจากการตรวจ Code จริง

| ส่วนงาน | สถานะ | หลักฐานจาก code จริง | งานที่ต้องทำต่อ |
| --- | --- | --- | --- |
| App bootstrap | `Todo` | ไม่พบ `src/app.ts` หรือ `src/server.ts` | สร้าง app/server, health check และ middleware wiring |
| Route wiring | `Todo` | ไม่พบ `src/routes.ts` หรือ module route files | สร้าง `/api` และ wire module routes |
| Config/logger/database | `Partial` | มี env validation และ Prisma client แล้ว แต่ยังไม่มี logger และยังไม่ได้ยืนยัน connection กับ PostgreSQL | สร้าง logger และเปิด local PostgreSQL เพื่อทดสอบ connection |
| Standard response | `Todo` | ไม่พบ response utilities | สร้าง success/error response format และ BigInt serialization |
| Error handling | `Todo` | ไม่พบ `AppError`, error codes หรือ error middleware | Implement shared error handling และ 404 middleware |
| Auth middleware | `Todo` | ไม่พบ auth middleware | Implement Bearer token verification และ tests |
| Role middleware | `Todo` | ไม่พบ role middleware/constants | Implement role guard และ tests |
| Prisma schema | `Done` | มี schema 11 models ตาม domain รวม product images และ partial loan return; Prisma validate/generate ผ่าน | ตรวจ schema drift เมื่อเชื่อม local database ได้ |
| Migration | `Partial` | มี initial PostgreSQL migration และ SQL ตรงกับ Prisma schema | เปิด local PostgreSQL แล้ว apply migration จริง |
| Seed | `Partial` | มี idempotent seed สำหรับ ADMIN role/admin user | apply migration แล้วรัน seed กับ local database |
| Auth module | `Todo` | directory มีอยู่แต่ไม่มี source files | Implement login, current user, bcrypt และ JWT |
| Product module | `Todo` | directory มีอยู่แต่ไม่มี source files | Implement CRUD, soft delete, pagination และ initial balance |
| Product images | `Todo` | ยังไม่มี image model, storage adapter, upload/delete endpoint หรือ static local storage route | เพิ่ม `ProductImage`, local storage adapter และ API contract ที่รองรับการเปลี่ยนเป็น object storage |
| Transaction list/detail | `Todo` | ไม่พบ transaction source files | Implement list/detail และ filters ตาม contract |
| Transaction create | `Todo` | ไม่พบ TransactionService หรือ repository | Implement workflow, snapshots, status log, queue และ effects |
| Transaction status change | `Todo` | ไม่พบ status constants/service/log implementation | Implement transitions, logs และ completed effects |
| Queue number | `Todo` | ไม่มี schema หรือ queue generation code | Implement ภายใน DB transaction พร้อม unique/conflict handling |
| Cancel transaction | `Todo` | ไม่มี transaction service | Implement ผ่าน status transition rule เดียวกัน |
| Inventory movements | `Todo` | ไม่พบ inventory source files | Implement balances, movements และ negative-stock protection |
| Inventory adjustment | `Todo` | ไม่มี adjustment endpoint/service | Implement adjustment พร้อม note และ audit semantics |
| Queue module | `Todo` | directory มีอยู่แต่ไม่มี source files | Implement queue read/status endpoints |
| Loan list/detail | `Todo` | directory มีอยู่แต่ไม่มี source files | Implement list/active/detail และ filters |
| Loan return | `Todo` | ไม่มี loan return workflow | Implement partial/full return และ transaction/inventory effects |
| Dashboard | `Todo` | directory มีอยู่แต่ไม่มี source files | Implement read-only daily aggregation |
| Users module | `Todo` | directory มีอยู่แต่ไม่มี source files | ตัดสินใจ MVP scope แล้ว implement หรือระบุ future scope |
| Tests | `Todo` | ไม่พบ `*.test.ts` หรือ `*.spec.ts` ใน `src` | เพิ่ม unit/integration tests สำหรับ business-critical services |
| API docs | `Todo` | ยังไม่พบ OpenAPI/Swagger setup | เพิ่ม OpenAPI docs หรือ contract markdown สำหรับ frontend |
| Build/test verification | `Todo` | `npm run build` ไม่ผ่านด้วย TS18003 เพราะไม่มี TypeScript inputs; Prisma validate ไม่ผ่าน | Implement source/schema, เพิ่ม ESLint config แล้วรัน verification ทั้งหมด |

## 3. หลักการดำเนินงาน

1. Backend เป็น business source of truth ของระบบ
2. `TransactionService` ต้องเป็นเจ้าของ workflow สำคัญที่กระทบ transaction, status, queue, inventory และ loan
3. Repository ห้ามเปิด transaction เอง ให้รับ Prisma transaction client จาก service เมื่อต้องอยู่ใน workflow เดียวกัน
4. ทุก stock mutation ต้องสร้าง `inventory_movements`
5. ทุก status change ต้องสร้าง `transaction_status_logs`
6. `DELIVERY_EXCHANGE` ต้องตัด stock ตอนเปลี่ยนเป็น `COMPLETED` เท่านั้น
7. Dashboard ต้องเป็น read-only aggregation
8. BigInt IDs ต้อง serialize เป็น string ใน API response
9. ห้ามส่ง `passwordHash` หรือ secrets ออก API
10. ทุก mutation endpoint ต้อง validate payload ด้วย Zod
11. Product image ต้องเก็บเป็น object/file key และ metadata ใน database ไม่เก็บ binary หรือ Base64
12. Product image storage ต้องเข้าถึงผ่าน storage abstraction ไม่ให้ business module ผูกกับ local filesystem หรือ provider ใด provider หนึ่ง
13. Local image URL ต้องสร้างจาก configuration เช่น `PUBLIC_API_URL` ไม่ hardcode domain ใน database

## 4. API Contract ปัจจุบัน

Base path:

```text
/api
```

| Module | Endpoint เป้าหมาย | สถานะปัจจุบัน |
| --- | --- | --- |
| Health | `GET /api/health` | `Todo` - ยังไม่มี app/route |
| Auth | `POST /auth/login`, `GET /auth/me` | `Todo` - ยังไม่มี module/route |
| Products | `GET /products`, `GET /products/:id`, `POST /products`, `PATCH /products/:id`, `DELETE /products/:id` | `Todo` - ยังไม่มี module/route |
| Product images | `POST /products/:id/images`, `GET /products/:id/images`, `PATCH /products/:id/images/:imageId`, `DELETE /products/:id/images/:imageId` | `Todo` - MVP ใช้ local storage; ภายหลังเปลี่ยน implementation เป็น object storage |
| Transactions | `GET /transactions`, `GET /transactions/:id`, `POST /transactions`, `PATCH /transactions/:id/status`, `POST /transactions/:id/cancel` | `Todo` |
| Queues | `GET /queues/today`, `GET /queues?date=...`, `PATCH /queues/:transactionId/status` | `Todo` |
| Loans | `GET /loans`, `GET /loans/active`, `GET /loans/:id`, `POST /loans/:id/return` | `Todo` |
| Inventory | `GET /inventory/balances`, `GET /inventory/movements`, `POST /inventory/adjustments` | `Todo` |
| Dashboard | `GET /dashboard/today` | `Todo` |

หมายเหตุ: endpoint ทั้งหมดในตารางเป็น contract เป้าหมายและยังไม่มี implementation ปัจจุบัน frontend plan เดิมคาด endpoint บางจุดเป็น `/cylinder-loans` จึงต้องยืนยันว่าจะใช้ `/loans` หรือ `/cylinder-loans` ก่อน implement

## 5. Phase 0: Alignment และ Contract

เป้าหมาย: ยืนยัน contract ระหว่าง backend, frontend และ database ก่อน harden logic เพิ่ม

งานที่ต้องทำ:

1. สรุป endpoint ปัจจุบันจาก `src/routes.ts` และ module routes
2. ยืนยัน path naming ระหว่าง frontend กับ backend โดยเฉพาะ `/loans` vs `/cylinder-loans`
3. ยืนยัน request/response DTO ที่ frontend ต้องใช้
4. ยืนยัน enum constants:
   - `TRANSACTION_TYPES`
   - `TRANSACTION_STATUSES`
   - `ITEM_ACTIONS`
   - `INVENTORY_MOVEMENT_TYPES`
   - `LOAN_STATUSES`
   - `ROLE_CODES`
5. ยืนยันรายการ filter ที่ MVP ต้องรองรับจริง
6. ระบุ business gaps ที่ต้องปิดก่อน frontend integration

เกณฑ์ยอมรับ:

1. Frontend และ backend ใช้ endpoint contract เดียวกัน
2. DTO สำคัญถูกบันทึกไว้หรือ generate ได้
3. ไม่มี business flow สำคัญที่ frontend ต้องเดาเอง

## 6. Phase 1: Foundation Hardening

เป้าหมาย: สร้าง foundation ให้มั่นคงและพร้อม production-like MVP

งานที่ต้องทำ:

1. เพิ่ม 404 middleware ที่คืน standard error response
2. ตรวจ env validation ให้ครบ เช่น `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `PORT`
3. ตรวจ logging ว่าไม่ log password/token/customer sensitive data เกินจำเป็น
4. เพิ่ม helper pagination meta ถ้าต้องการ response format เดียวกันทุก list
5. เพิ่ม tests สำหรับ middleware สำคัญ:
   - validation error
   - auth missing/invalid token
   - forbidden role
   - standard error response

เกณฑ์ยอมรับ:

1. ทุก error ออก standard response format
2. Unknown route ไม่หลุด HTML/default Express response
3. Protected route บังคับ auth/role ถูกต้อง

## 7. Phase 2: Database และ Migration Verification

เป้าหมาย: ตรวจ database schema กับ business rules ให้พร้อมใช้จริง

งานที่ต้องทำ:

1. รัน `npm run prisma:generate`
2. รัน migration ใน local database
3. รัน seed admin
4. ตรวจ indexes/unique constraints สำคัญ:
   - `transaction_no`
   - `(queue_date, queue_no)`
   - transaction status/type/date
   - loan status
   - inventory movements by product/date
5. พิจารณา schema สำหรับ partial return:
   - ถ้าใช้ loan row เดียว ต้องรู้ returned quantity/remaining quantity
   - ถ้าใช้ transaction history คำนวณ remaining ต้องมี query ที่ reliable

เกณฑ์ยอมรับ:

1. Prisma client generate ได้
2. Migration และ seed ทำงานได้
3. Schema รองรับ loan return lifecycle ได้ชัดเจน

## 8. Phase 3: Auth และ Users

เป้าหมาย: สร้าง auth ให้ครบพร้อม frontend integration

งานที่ต้องทำ:

1. เพิ่ม integration tests สำหรับ `POST /auth/login`
2. เพิ่ม integration tests สำหรับ `GET /auth/me`
3. ตรวจว่า response ไม่ส่ง `passwordHash`
4. ตรวจ inactive user/role ถูก reject
5. ตัดสินใจ User Management ใน MVP:
   - ถ้าอยู่ใน MVP ให้เพิ่ม routes/services สำหรับ user list/create/update/soft delete
   - ถ้าไม่อยู่ ให้ระบุเป็น future scope ใน plan และ frontend

เกณฑ์ยอมรับ:

1. Admin login ได้
2. Password ผิดได้ `UNAUTHORIZED`
3. Token ใช้เรียก protected endpoints ได้
4. Inactive user ใช้งานไม่ได้

## 9. Phase 4: Products

เป้าหมาย: สร้าง Product Management ให้พร้อมเป็น master data สำหรับ transaction

งานที่ต้องทำ:

1. เพิ่ม tests สำหรับ create product และ initial inventory balance
2. เพิ่ม tests สำหรับ list/search/includeInactive/pagination
3. เพิ่ม tests สำหรับ update product
4. เพิ่ม tests สำหรับ soft delete
5. ตรวจว่า inactive product ไม่ถูกใช้ใน transaction ใหม่
6. พิจารณา conflict validation เช่น brand+weight duplicate ถ้า business ต้องการ

เกณฑ์ยอมรับ:

1. Product CRUD ทำงานครบ
2. Soft delete ไม่ลบ row จริง
3. Product ใหม่มี inventory balance ตั้งต้น
4. Transaction ใหม่ใช้เฉพาะ active product

### Product image storage

แนวทาง MVP ใน local environment:

```text
KMG-SERVICE-API/
└── storage/
    └── products/
        └── {productId}/
            └── {uuid}.{extension}
```

Database ควรเก็บ key เช่น `products/1/{uuid}.webp` และ metadata ที่จำเป็น เช่น MIME type, file size, sort order และ primary flag โดยไม่เก็บ absolute path หรือ URL ที่ผูกกับ `localhost` ไว้ถาวร

แนะนำ model แยกสำหรับหลายรูปต่อสินค้า:

```prisma
model ProductImage {
  id           BigInt   @id @default(autoincrement())
  productId    BigInt   @map("product_id")
  objectKey    String   @unique @map("object_key") @db.VarChar(500)
  originalName String?  @map("original_name") @db.VarChar(255)
  mimeType     String   @map("mime_type") @db.VarChar(100)
  fileSize     Int      @map("file_size")
  sortOrder    Int      @default(0) @map("sort_order")
  isPrimary    Boolean  @default(false) @map("is_primary")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId, sortOrder])
  @@map("product_images")
}
```

เพิ่ม `images ProductImage[]` ใน `Product` และสร้าง migration แยกจาก initial migration

งานที่ต้องทำ:

1. สร้าง `ProductImage` schema, migration และ repository methods
2. สร้าง `StorageProvider` interface เช่น `save`, `delete`, `getPublicUrl`
3. ทำ `LocalStorageProvider` ที่เขียนไฟล์ใน `storage/products`
4. เปิด static route เช่น `/uploads` โดยไม่ expose path อื่นของ filesystem
5. เพิ่ม multipart upload พร้อมตรวจ MIME type, extension, file size และจำนวนรูปต่อสินค้า
6. สร้างชื่อไฟล์ใหม่ด้วย UUID และไม่ใช้ชื่อไฟล์จากผู้ใช้เป็น path โดยตรง
7. สร้าง endpoint เพิ่ม/อ่าน/แก้ลำดับ/ลบรูป และกำหนด primary image ได้เพียงหนึ่งรูปต่อสินค้า
8. ให้ Product list/detail ส่ง `images` พร้อม `url` ที่สร้างจาก runtime configuration
9. เมื่อเพิ่ม object-storage provider ใน production ให้เปลี่ยนเฉพาะ provider/config และใช้ `objectKey` เดิมเป็นหลัก
10. เพิ่ม cleanup กรณี upload สำเร็จแต่บันทึก database ไม่สำเร็จ และกรณีลบ database record แล้วลบไฟล์ไม่สำเร็จ

เกณฑ์ยอมรับ:

1. Upload รูปสินค้าใน local ได้และไฟล์อยู่ภายใต้ `storage/products`
2. รูปที่ไม่ใช่ image, ขนาดเกินกำหนด และ path traversal ถูก reject
3. ลบรูปแล้วไม่สามารถแสดงผ่าน public URL ได้อีก
4. Product API ส่ง URL ที่ frontend ใช้งานได้โดยไม่ต้องรู้ตำแหน่ง filesystem
5. เปลี่ยนจาก local provider เป็น R2/S3 ได้โดยไม่ต้องแก้ database contract หรือ ProductService

## 10. Phase 5: Transactions Core

เป้าหมาย: ทำ transaction workflow ให้ถูกต้องครบตาม business flow

งานที่ต้องทำ:

1. เพิ่ม validation mapping ระหว่าง `transactionType` และ `itemAction`
2. ตรวจ required fields ตาม transaction type:
   - `BORROW_CYLINDER` ควรรองรับ `expectedReturnDate`, `depositAmount`
   - `RETURN_CYLINDER` ควรผูก loan หรือเกิดผ่าน loan return workflow
   - `BUY_FULL_TANK` ใช้ `fullTankPrice`
3. เพิ่ม transaction create tests สำหรับ:
   - `DELIVERY_EXCHANGE`
   - `WALK_IN_EXCHANGE`
   - `BORROW_CYLINDER`
   - `RETURN_CYLINDER`
   - `BUY_FULL_TANK`
4. เพิ่ม status transition tests
5. เพิ่ม tests ว่า `DELIVERY_EXCHANGE` ไม่ตัด stock ตอน create
6. เพิ่ม tests ว่า `DELIVERY_EXCHANGE` ตัด stock ตอน `COMPLETED`
7. เพิ่ม insufficient stock tests
8. เพิ่ม invalid transition tests
9. Harden queue number conflict handling เมื่อ concurrent request ชนกัน

เกณฑ์ยอมรับ:

1. Transaction ทุกประเภทสร้างได้ถูกต้อง
2. Snapshot customer/product/price/cost ถูกต้อง
3. Status logs ถูกสร้างครบ
4. Inventory movements ถูกสร้างใน timing ที่ถูกต้อง
5. Final states mutate ต่อไม่ได้

## 11. Phase 6: Queue

เป้าหมาย: Queue เป็น view/action layer ของ `DELIVERY_EXCHANGE`

งานที่ต้องทำ:

1. เพิ่ม tests สำหรับ `/queues/today`
2. เพิ่ม tests สำหรับ `/queues?date=...`
3. เพิ่ม tests สำหรับ update queue status
4. ตรวจว่า queue list แสดงเฉพาะ `DELIVERY_EXCHANGE`
5. ตรวจ ordering ด้วย `queueNo`
6. ตรวจว่า complete queue trigger inventory movements

เกณฑ์ยอมรับ:

1. Queue รายวันเรียงถูกต้อง
2. Status update ใช้ status transition rule เดียวกับ transaction
3. Queue cancelled ไม่ตัด stock
4. Queue completed ตัด stock ถูกต้อง

## 12. Phase 7: Cylinder Loans

เป้าหมาย: Loan lifecycle ต้องสะท้อนการยืม/คืนจริงและ audit ได้ครบ

งานที่ต้องทำ:

1. ปิด gap `returnLoan`
   - validate remaining quantity ไม่ใช่แค่ `loan.quantity`
   - update `loan_status` เป็น `PARTIAL_RETURNED` หรือ `RETURNED`
   - set `returned_date` เมื่อคืนครบ
   - เก็บ transaction history ผ่าน `RETURN_CYLINDER`
2. ตัดสินใจ data model สำหรับ partial return:
   - เพิ่ม returned quantity หรือ
   - คำนวณจาก return transactions ที่อ้าง loan
3. เพิ่ม tests สำหรับ borrow creates loan
4. เพิ่ม tests สำหรับ partial return
5. เพิ่ม tests สำหรับ full return
6. เพิ่ม tests กัน return เกินจำนวนค้าง
7. เพิ่ม tests กัน return loan ที่ปิดแล้ว

เกณฑ์ยอมรับ:

1. Active loans แสดงรายการค้างจริง
2. Partial return ลดจำนวนค้างหรือสะท้อนสถานะได้ถูกต้อง
3. Full return ปิด loan
4. Return สร้าง transaction history และ inventory movement ครบ

## 13. Phase 8: Inventory

เป้าหมาย: Stock balance และ movement ต้องถูกต้องและ audit ได้

งานที่ต้องทำ:

1. เพิ่ม tests สำหรับ `FULL_OUT`, `EMPTY_IN`, `LOAN_OUT`, `LOAN_RETURN`
2. เพิ่ม tests กัน stock ติดลบ
3. เพิ่ม tests สำหรับ inventory adjustment
4. ทบทวน `ADJUSTMENT` movement quantity เมื่อมี delta หลาย field ใน request เดียว
5. พิจารณา atomic update หรือ row lock เพื่อกัน race condition
6. เพิ่ม filter movement ตาม date/type ถ้า frontend ต้องใช้

เกณฑ์ยอมรับ:

1. ทุก stock change มี movement
2. Balance ไม่ติดลบ
3. Adjustment ต้องมี note
4. Movement history อ่าน audit ได้

## 14. Phase 9: Dashboard

เป้าหมาย: Dashboard เป็น read-only aggregate ที่ frontend ใช้ได้ทันที

งานที่ต้องทำ:

1. เพิ่ม tests สำหรับ `/dashboard/today`
2. ตรวจ timezone/date boundary
3. ตรวจ today sales นับเฉพาะ completed ที่ต้องนับเป็นยอดขาย
4. ตรวจ active loans และ stock summary
5. เพิ่ม DTO documentation สำหรับ frontend

เกณฑ์ยอมรับ:

1. Dashboard ไม่ mutate data
2. Dashboard summary ตรงกับ transactions/loans/inventory
3. Response shape ชัดเจนสำหรับ frontend

## 15. Phase 10: Tests, API Docs และ Hardening

เป้าหมาย: ทำ backend MVP ให้เชื่อถือได้ก่อน frontend integration เต็ม

งานที่ต้องทำ:

1. เพิ่ม unit tests สำหรับ service layer ที่มี business rules
2. เพิ่ม integration tests ด้วย Supertest สำหรับ endpoint สำคัญ
3. เพิ่ม OpenAPI/Swagger หรือ contract docs
4. รัน `npm run build`
5. รัน `npm test`
6. รัน `npm run prisma:generate`
7. ทำ auth smoke test
8. ตรวจ performance query เบื้องต้นของ list/dashboard
9. เพิ่ม ESLint v9 flat config (`eslint.config.*`) ก่อนรัน `npm run lint`
10. เพิ่ม regression test สำหรับ `validate.middleware.ts` เพื่อกัน Express 5 `req.query` getter-only กลับมาเป็น 500 อีก

เกณฑ์ยอมรับ:

1. Build ผ่าน
2. Lint ผ่านหลังมี ESLint config
3. Tests สำคัญผ่าน
4. Frontend มี API contract ใช้งานต่อได้
5. Known business gaps ถูกปิดหรือระบุเป็น future scope ชัดเจน

## 16. Checklist เกณฑ์ยอมรับ MVP

| ข้อ | เกณฑ์ | สถานะปัจจุบัน | หลักฐานจาก code จริง | งานที่ต้องทำต่อ |
| --- | --- | --- | --- | --- |
| 1 | Health check ใช้งานได้ | `Todo` | ไม่พบ `app.ts` หรือ health route | Implement แล้วเพิ่ม smoke test |
| 2 | Standard success/error response | `Todo` | ไม่พบ response/error utilities | Implement response helpers และ middleware |
| 3 | Admin login สำเร็จ | `Todo` | ไม่พบ Auth module | Implement แล้วเพิ่ม integration test |
| 4 | Current user ใช้งานได้ | `Todo` | ไม่พบ `/auth/me` หรือ auth middleware | Implement แล้วเพิ่ม integration test |
| 5 | Role guard ป้องกัน endpoint ได้ | `Todo` | ไม่พบ role middleware | Implement แล้วเพิ่ม forbidden tests |
| 6 | Product CRUD + soft delete | `Todo` | ไม่พบ Product module | Implement แล้วเพิ่ม tests |
| 7 | Product ใหม่สร้าง inventory balance | `Todo` | ไม่พบ ProductService หรือ schema | Implement แล้วเพิ่ม test |
| 8 | Transaction create รองรับหลายสินค้า | `Todo` | ไม่พบ Transaction module | Implement validation/service และ tests |
| 9 | `DELIVERY_EXCHANGE` สร้าง queue | `Todo` | ไม่พบ queue generation code | Implement concurrency handling และ tests |
| 10 | `DELIVERY_EXCHANGE` ไม่ตัด stock ตอน create | `Todo` | ไม่พบ transaction/inventory workflow | Implement rule แล้วเพิ่ม test |
| 11 | `DELIVERY_EXCHANGE` ตัด stock ตอน complete | `Todo` | ไม่พบ status/inventory workflow | Implement แล้วเพิ่ม insufficient stock tests |
| 12 | `WALK_IN_EXCHANGE` ตัด stock ทันที | `Todo` | ไม่พบ completed effects | Implement แล้วเพิ่ม test |
| 13 | `BORROW_CYLINDER` สร้าง loan | `Todo` | ไม่พบ loan creation workflow | Implement แล้วเพิ่ม tests |
| 14 | `RETURN_CYLINDER` คืนถังและ update loan | `Todo` | ไม่พบ loan return workflow | Implement loan lifecycle update |
| 15 | `BUY_FULL_TANK` ตัดเฉพาะถังเต็ม | `Todo` | ไม่พบ completed effects | Implement แล้วเพิ่ม test |
| 16 | Status transition ถูกต้อง | `Todo` | ไม่พบ status constants/service | Implement แล้วเพิ่ม invalid/final-state tests |
| 17 | Status log ถูกสร้างทุกครั้ง | `Todo` | ไม่พบ status log schema/service | Implement แล้วเพิ่ม tests |
| 18 | Inventory balance/movement ทำงาน | `Todo` | ไม่พบ Inventory module | Implement แล้วเพิ่ม concurrency/audit tests |
| 19 | Active loans แสดงรายการค้าง | `Todo` | ไม่พบ Loan repository/service | Implement return lifecycle และ active query |
| 20 | Dashboard today ใช้งานได้ | `Todo` | ไม่พบ Dashboard module | Implement แล้วเพิ่ม timezone tests |
| 21 | Transaction history filter ได้ | `Todo` | ไม่พบ Transaction repository/routes | Implement filters ตาม contract |
| 22 | API docs พร้อม frontend | `Todo` | ยังไม่พบ OpenAPI/Swagger | เพิ่ม API docs หรือ contract รวม product image upload/response |
| 23 | Tests สำคัญครบ | `Todo` | ไม่พบ test files | เพิ่ม unit/integration tests |
| 24 | `npm run build` ผ่าน | `Todo` | ไม่ผ่านด้วย `TS18003` เพราะไม่มี TypeScript inputs | เพิ่ม source files แล้วรันใหม่ |
| 25 | `npm test` ผ่าน | `Todo` | ยังไม่มี test files | เพิ่ม tests แล้วรัน |
| 26 | `npm run lint` ผ่าน | `Todo` | `npm run lint` ยังรันไม่ได้เพราะไม่มี `eslint.config.*` สำหรับ ESLint v9 | เพิ่ม ESLint flat config แล้วรัน lint |
| 27 | Product images ใช้งานได้ใน local | `Todo` | ยังไม่มี `ProductImage` หรือ storage implementation | เพิ่ม local provider, upload/delete API และ tests |
| 28 | Product image เปลี่ยน provider ได้ | `Todo` | ยังไม่มี storage abstraction | เพิ่ม `StorageProvider` และทดสอบด้วย fake provider |

## 17. ความเสี่ยงและวิธีลดความเสี่ยง

| ความเสี่ยง | ผลกระทบ | วิธีลดความเสี่ยง |
| --- | --- | --- |
| Loan return ไม่ update loan status | รายการยืมค้างผิดและ dashboard เพี้ยน | ปิด gap Phase 7 ก่อน frontend ใช้ return flow |
| Queue number ชนจาก concurrent requests | สร้างรายการส่งแก๊สล้มเหลวหรือคิวผิด | ใช้ unique constraint + retry/conflict handling |
| Inventory race condition | Stock ติดลบหรือยอดผิด | ใช้ transaction + atomic update/row lock |
| Adjustment movement audit ไม่ชัด | ตรวจย้อนหลังไม่ได้ว่า delta ไป balance ไหน | แยก movement หรือเพิ่ม metadata สำหรับ adjustment |
| Endpoint path ไม่ตรง frontend | Frontend integration สะดุด | ล็อก API contract ใน Phase 0 |
| เก็บไฟล์ไว้ใน frontend หรือ local disk แบบผูกกับ deployment | รูปหายเมื่อ build/redeploy หรือใช้หลาย instance | เก็บ `objectKey` ใน database และห่อ storage ด้วย provider; local เป็นเพียง MVP provider |
| URL รูปผูกกับ localhost | Frontend production เรียกรูปไม่ได้ | สร้าง URL จาก `PUBLIC_API_URL`/provider config ตอน response |
| Upload ไฟล์ไม่ตรวจสอบ | ไฟล์อันตรายหรือใช้พื้นที่เกินควบคุม | จำกัด MIME/ขนาด/จำนวน และสร้างชื่อไฟล์ใหม่ด้วย UUID |
| ไม่มี tests business-critical | Regression ง่ายตอนต่อ frontend | เพิ่ม tests ก่อนขยาย feature |
| Date boundary/timezone | Dashboard/queue วันนี้ผิด | กำหนด timezone และเพิ่ม tests |

## 18. รายการที่ไม่อยู่ใน MVP

1. Payment gateway
2. Customer master workflow แบบเต็ม
3. Rider mobile workflow
4. Accounting/report แบบเต็ม
5. Multi-branch
6. GPS/route planning
7. LINE/SMS notification
8. Receipt/print/export
