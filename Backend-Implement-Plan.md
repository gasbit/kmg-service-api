# KMG-SERVICE แผน Implement ฝั่ง Backend

เอกสารนี้เป็นแผนดำเนินการของ `KMG-SERVICE-API` โดยอ้างอิงจาก `AGENTS.md`, `CONTEXT.md`, เอกสาร business/architecture/database ที่เกี่ยวข้อง และ source code จริงใน `src`

เป้าหมายคือทำ backend MVP ให้เป็น source of truth ของ auth, products, transactions, queues, loans, inventory และ dashboard โดยรักษา snapshot data, status logs และ inventory movements ให้ตรวจสอบย้อนหลังได้

## 1. สถานะปัจจุบันจาก Code จริง

ตรวจล่าสุดวันที่ `2026-07-22` จาก branch `feature/transactions` ที่ commit `277433a` รวม changes ที่ยังไม่ commit ใน working tree

Legend:

- `Done`: มี implementation และ verification ที่เพียงพอสำหรับ scope ของ phase
- `Partial`: มี implementation แล้ว แต่ยังขาด behavior, integration test หรือ runtime verification สำคัญ
- `Todo`: ยังไม่มี implementation ที่ใช้งานได้
- `Not verified`: มี code หรือ artifact แต่ยังไม่ได้ยืนยันกับ dependency ภายนอก เช่น PostgreSQL

- [x] Phase 0: App bootstrap และ route wiring
  สถานะ: `Done` - มี `app.ts`, `server.ts`, `/api/health`, `/api/auth`, `/api/products`, `/api/transactions`, 404 และ error middleware; compiled health smoke test ตอบ `200`
- [ ] Phase 1: Foundation, middleware และ response/error format
  สถานะ: `Partial` - มี env validation, request ID, Pino HTTP logger พร้อม sensitive-field redaction, standard success/error response, auth, generic role guard และ Zod body/query/params validation; ยังขาด middleware/HTTP integration tests หลายกรณีและ graceful shutdown
- [ ] Phase 2: Database schema, migrations และ seeds
  สถานะ: `Partial` - Prisma schema ครบ 11 models, มี 5 migrations, admin seed และ product test-data seed; `prisma validate`/`prisma generate`/`prisma migrate status` ผ่านกับ PostgreSQL local แต่ยังไม่ได้ rerun seed ในการตรวจล่าสุด
- [ ] Phase 3: Auth และ role base
  สถานะ: `Partial` - `POST /api/auth/login` และ `GET /api/auth/me` implement แล้ว, ไม่ expose `passwordHash`, รองรับ active user/role และ JWT BigInt ID แบบ string; มี AuthService unit tests แต่ยังไม่มี Supertest/database integration tests และ role middleware tests
- [ ] Phase 4: Product management และ product images
  สถานะ: `Partial` - CRUD, pagination/search, soft delete, initial inventory balance, local image storage, image metadata, primary image constraint และ image endpoints implement แล้ว; มี ProductService unit tests แต่ยังขาด endpoint/database integration tests และ cleanup/recovery บางกรณี
- [ ] Phase 5: Transaction core
  สถานะ: `Partial` - ทั้ง 5 transaction endpoints, snapshots, status logs, queue numbering และ create workflow ของ Delivery/Walk-in/Borrow/Buy พร้อมและผ่าน unit/HTTP/PostgreSQL integration tests; `RETURN_CYLINDER` ยังต้องสร้างผ่าน loan return workflow ใน Phase 7
- [ ] Phase 6: Queue workflow
  สถานะ: `Partial` - queue number generation ใช้ daily advisory lock ภายใน ReadCommitted transaction และผ่าน concurrent integration tests แล้ว; queue list routes ยังไม่มี
- [ ] Phase 7: Cylinder loan workflow
  สถานะ: `Partial` - borrow transaction สร้าง loan และ `LOAN_OUT` แล้ว; list/partial-return/full-return endpoints ยังไม่มี
- [ ] Phase 8: Inventory workflow
  สถานะ: `Partial` - transaction effects ใช้ conditional atomic updates และสร้าง movements แล้ว; inventory list/adjustment endpoints ยังไม่มี
- [ ] Phase 9: Dashboard read aggregation
  สถานะ: `Todo` - ยังไม่มี dashboard module หรือ endpoint
- [ ] Phase 10: Tests, API docs และ hardening
  สถานะ: `Partial` - build/lint ผ่าน, main suite ผ่าน 77 tests และ transaction database integration 5 scenarios มี runner แยก; DB suite ยังไม่อยู่ใน `npm test`/CI และ module อื่นยังขาด integration coverage

## 2. Verification ล่าสุด

| Command / Check | ผลล่าสุด | หมายเหตุ |
| --- | --- | --- |
| `npm run build` | `Passed` | TypeScript strict build ผ่าน |
| `npm test` | `Passed` | 10 test files, 77 tests ผ่าน; DB integration 1 file/5 tests ถูก skip ตามค่า env |
| `npm run test:transactions:integration` | `Passed` | transaction PostgreSQL integration 5 scenarios รันผ่านด้วย isolated test database; command นี้ยังไม่รวมใน `npm test` หรือ CI |
| `npx prisma validate` | `Passed` | schema ถูกต้อง |
| `npm run prisma:generate` | `Passed` | generate Prisma Client v6.19.3 สำเร็จ |
| Compiled health smoke test | `Passed` | `GET /api/health` ตอบ `200` และ standard response |
| `npx prisma migrate status` | `Passed` | PostgreSQL local มี migrations ครบ 5 รายการและ schema up to date |
| `npm run prisma:seed` | `Not run` | ไม่รันในการตรวจล่าสุดเพราะเป็นคำสั่ง mutate data; seed code มีอยู่แต่ยังไม่ยืนยันผลรอบล่าสุด |
| `npm run lint` | `Passed` | ESLint flat config ผ่าน |

หมายเหตุ: Prisma เตือนว่า config ใต้ `package.json#prisma` จะถูกถอดใน Prisma 7 ควรย้ายไป `prisma.config.ts` ก่อน upgrade major version

## 3. Implementation Inventory

| ส่วนงาน | สถานะ | หลักฐานจาก code | งานที่ต้องทำต่อ |
| --- | --- | --- | --- |
| App bootstrap | `Done` | `src/app.ts`, `src/server.ts`; startup ใช้ shared logger | เพิ่ม graceful shutdown ของ HTTP server และ Prisma |
| Health check | `Done` | `GET /api/health`; smoke test `200` | เพิ่ม endpoint integration test เพื่อกัน regression |
| Route wiring | `Partial` | wire auth, products และ transactions ใต้ `/api` | wire queues, loans, inventory และ dashboard |
| Env/config | `Partial` | validate database/JWT/CORS/storage/admin settings | ทบทวน production defaults และแยก test env |
| Logger | `Done` | `src/config/logger.ts`, Pino HTTP middleware และ redaction test ครอบคลุม token/password/sensitive customer data | รักษา redaction regression tests และทบทวน production log transport |
| Standard response | `Done` | `sendSuccess` และ error middleware ใส่ request ID | พิจารณา shared pagination helper เพื่อลด manual response shape |
| Error handling | `Partial` | `AppError`, shared codes, 404/error middleware และ unexpected-error logging โดยไม่คืน stack/SQL | เพิ่ม HTTP integration coverage ของ 404, operational error และ unexpected error |
| Validation | `Partial` | body/query/params middleware; query ใช้ `response.locals.validatedQuery` รองรับ Express 5 | เพิ่ม regression/integration tests ของทั้ง 3 middleware |
| Auth middleware | `Partial` | Bearer/JWT verification และ reload active user จาก database | เพิ่ม missing/invalid/expired token integration tests |
| Role middleware | `Partial` | generic `requireRoles(...roles)` และ future role constants | เพิ่ม unauthorized/forbidden/allowed tests |
| Prisma schema | `Done` | 11 models ครอบคลุม domain, snapshots, logs, balances, movements และ images | เพิ่ม domain checks ใน service; Prisma schema ไม่ enforce string enums |
| Migrations | `Done` | migrations 5 รายการ; local PostgreSQL schema up to date | รักษา verification ใน CI |
| Seeds | `Not verified` | idempotent admin seed; product/inventory seed สร้าง adjustment audit | รันกับ local database และตรวจผล/rollback procedure |
| Auth module | `Partial` | login/me, bcrypt, JWT, inactive checks, public DTO | เพิ่ม HTTP/database integration tests |
| Users module | `Todo` | ยังไม่มี module | คงเป็น future scope เว้นแต่ frontend MVP ต้องจัดการ users |
| Product CRUD | `Partial` | list/get/create/update/soft delete, pagination/search/includeInactive | เพิ่ม HTTP/database tests, duplicate policy และ transaction-use guard |
| Product initial balance | `Partial` | create product + balance อยู่ใน `prisma.$transaction` | เพิ่ม real database integration test |
| Product images | `Partial` | storage abstraction, local provider, upload/list/update/delete, MIME signature, size/count limits, UUID/objectKey, public URL | เพิ่ม endpoint tests, cleanup/retry policy และ file/database consistency tests |
| Transaction module | `Partial` | public create รองรับ Delivery/Walk-in/Borrow/Buy; list/detail/status/cancel, snapshots และ atomic effects พร้อม | เพิ่ม internal `RETURN_CYLINDER` workflow ผ่าน loan return และนำ isolated DB suite เข้า CI |
| Queue module | `Partial` | transaction workflow สร้าง daily queue อย่างปลอดภัยและมี concurrent DB test | เพิ่ม queue list/status routes โดย reuse `TransactionService` |
| Loan module | `Partial` | borrow transaction สร้าง loan + movement | เพิ่ม list/return lifecycle ใน Phase 7 |
| Inventory module | `Partial` | transaction workflow ทำ atomic effects + movements | เพิ่ม list/adjustment APIs ใน Phase 8 |
| Dashboard module | `Todo` | ไม่พบ source | implement Phase 9 |
| API docs | `Partial` | มี auth/product module specs แต่ไม่มี contract รวม/OpenAPI | อัปเดต specs ให้ตรง code และเพิ่ม OpenAPI หรือ contract กลาง |

## 4. API Contract ที่ Implement แล้ว

Base path: `/api`

| Module | Endpoint | สถานะ |
| --- | --- | --- |
| Health | `GET /api/health` | `Implemented` |
| Auth | `POST /api/auth/login` | `Implemented` |
| Auth | `GET /api/auth/me` | `Implemented` |
| Products | `GET /api/products` | `Implemented` |
| Products | `GET /api/products/:productId` | `Implemented` |
| Products | `POST /api/products` | `Implemented` |
| Products | `PATCH /api/products/:productId` | `Implemented` |
| Products | `DELETE /api/products/:productId` | `Implemented` แบบ soft delete |
| Product images | `GET /api/products/:productId/images` | `Implemented` |
| Product images | `POST /api/products/:productId/images` | `Implemented` แบบ multipart field `file` |
| Product images | `PATCH /api/products/:productId/images/:imageId` | `Implemented` |
| Product images | `DELETE /api/products/:productId/images/:imageId` | `Implemented` |
| Uploads | `GET /uploads/products/...` | `Implemented` static local storage นอก `/api` |
| Transactions | `GET /api/transactions`, `GET /api/transactions/:transactionId` | `Implemented` |
| Transactions | `POST /api/transactions` | `Implemented` |
| Transactions | `PATCH /api/transactions/:transactionId/status` | `Implemented` |
| Transactions | `POST /api/transactions/:transactionId/cancel` | `Implemented` |

ทุก product และ transaction endpoint บังคับ `authMiddleware` และ role `ADMIN`; `POST /api/auth/login` เป็น public endpoint

## 5. API Contract เป้าหมายที่ยังไม่ Implement

| Module | Endpoint เป้าหมาย | สถานะ |
| --- | --- | --- |
| Queues | `GET /api/queues/today`, `GET /api/queues?date=...` | `Todo` |
| Queues | `PATCH /api/queues/:transactionId/status` | `Todo` |
| Loans | `GET /api/loans`, `GET /api/loans/active`, `GET /api/loans/:id` | `Todo` |
| Loans | `POST /api/loans/:id/return` | `Todo` |
| Inventory | `GET /api/inventory/balances`, `GET /api/inventory/movements` | `Todo` |
| Inventory | `POST /api/inventory/adjustments` | `Todo` |
| Dashboard | `GET /api/dashboard/today` | `Todo` |

ก่อน implement loan routes ต้องล็อกชื่อ path ระหว่าง `/loans` กับ `/cylinder-loans` ให้ตรง frontend และเอกสารทุกชุด

สถานะ endpoint ปัจจุบัน: implement แล้ว 17 จากเป้าหมาย MVP 28 endpoints; ส่วนที่ขาดหลักคือ queue 3, loan 4, inventory 3 และ dashboard 1 endpoint

## 6. ลำดับงานแนะนำจากสถานะปัจจุบัน

### Phase A: ปิด Product และ Foundation Gaps

1. เพิ่ม integration tests สำหรับ health, 404, validation, auth, role guard และ product endpoints
2. รัน seed กับ PostgreSQL local/test database และตรวจว่า rerun ได้แบบ idempotent
3. เพิ่ม database integration test ว่า create product และ initial balance commit/rollback พร้อมกัน
4. เพิ่ม product image endpoint tests: MIME, signature, size, max count, one primary, delete และ path safety
5. กำหนด recovery policy กรณีลบ image row สำเร็จแต่ลบไฟล์ไม่สำเร็จ ปัจจุบันมีโอกาสเหลือ orphan file
6. ยืนยัน duplicate policy ของ product เช่น `brand + weightKg`

เกณฑ์ยอมรับ:

- Build, lint และ tests ผ่าน
- Auth/Product flows ผ่าน Supertest กับ test database
- Migration/seed ใช้ได้กับ local PostgreSQL
- Product image database/file state มี cleanup หรือ retry ที่อธิบายได้

Transaction core สำหรับ Delivery/Walk-in/Borrow/Buy, snapshots, status logs, inventory effects และ queue-number concurrency เป็น baseline ที่ implement แล้ว งานใหม่ต้องรักษา regression suite เดิม

### Phase B: Cylinder Loans และ Return Workflow

1. สร้าง loan list/detail/active queries
2. เพิ่ม internal loan-return workflow ใน `TransactionService` โดยไม่เปิด `RETURN_CYLINDER` ผ่าน generic public create schema
3. Implement `POST /api/loans/:id/return` สำหรับ partial/full return
4. Validate `remainingQuantity = quantity - returnedQuantity` และกัน return เกินจำนวนค้างหรือ loan ที่ปิดแล้ว
5. Partial return อัปเดต `returnedQuantity` และ `PARTIAL_RETURNED`
6. Full return อัปเดต `RETURNED` และ `returnedDate`
7. ทุก return สร้าง `RETURN_CYLINDER` transaction, snapshots, initial status log และ `LOAN_RETURN` movement
8. อัปเดต loan, transaction, inventory balance และ movement ภายใน database transaction เดียว

เกณฑ์ยอมรับ:

- Active loans แสดงยอดค้างจริง
- Partial/full return audit ย้อนกลับได้จาก transaction และ movement
- Loan return concurrency ไม่ทำให้คืนเกินจำนวนหรือ inventory ติดลบ
- เมื่อ phase นี้ผ่านจึงเปลี่ยน “Transaction create รองรับทุกประเภท” เป็น `Done`

### Phase C: Queue Read/Status APIs

1. สร้าง queue read service จาก `transactions.queueDate/queueNo` โดยไม่สร้าง queue table
2. เพิ่ม today/date filter, delivery-only filter และ ordering ด้วย queue number
3. เพิ่ม `PATCH /api/queues/:transactionId/status` โดย reuse `TransactionService.changeStatus`
4. เพิ่ม HTTP/database tests สำหรับ today/date filtering, ordering, complete และ cancel

เกณฑ์ยอมรับ:

- Queue number ไม่ซ้ำในวันเดียวกัน
- Cancelled queue ไม่ตัด stock
- Completed queue ตัด stockครั้งเดียว

### Phase D: Inventory

1. สร้าง balances/movements read endpoints พร้อม pagination/filter
2. สร้าง adjustment schema/service/endpoint โดย note เป็น required
3. ระบุว่า adjustment แต่ละ movement กระทบ `fullQty`, `emptyQty` หรือ `loanedQty` อย่างไม่กำกวม
4. ใช้ atomic update หรือ row locking เพื่อกัน negative stock/race condition
5. เพิ่ม tests สำหรับ `FULL_OUT`, `EMPTY_IN`, `LOAN_OUT`, `LOAN_RETURN`, `ADJUSTMENT`

เกณฑ์ยอมรับ:

- Balance ไม่ติดลบจาก concurrent writes
- ทุก mutation มี movement ที่อ่าน audit ได้
- Adjustment ไม่ bypass service layer

### Phase E: Dashboard

1. สร้าง read-only `DashboardService`
2. สรุปยอดขายวันนี้ตาม completed transactions ที่นับเป็นยอดขาย
3. สรุป queue, active loans และ stock
4. กำหนด timezone/date boundary เป็น `Asia/Bangkok` หรือ config ที่ชัดเจน
5. เพิ่ม aggregation และ boundary tests

เกณฑ์ยอมรับ:

- Dashboard ไม่ mutate data
- ตัวเลข reconcile กับ transaction/loan/inventory source tables ได้

### Phase F: Tests, API Docs และ Hardening

1. Wire `npm run test:transactions:integration` เข้า CI ที่มี isolated PostgreSQL
2. ขยาย full workflow integration tests ไป auth, products, loans, inventory และ dashboard
3. เพิ่ม OpenAPI/Swagger หรือ contract กลางที่ frontend ใช้อ้างอิงได้
4. รวม request/response/error/pagination และ multipart upload contract
5. เพิ่ม graceful shutdown ของ HTTP server/Prisma
6. ตรวจ query performance และ indexes ของ list/dashboard
7. รัน `npm audit --audit-level=high`
8. ย้าย Prisma config ออกจาก `package.json` ก่อน Prisma 7

## 7. Checklist เกณฑ์ยอมรับ MVP

| ข้อ | เกณฑ์ | สถานะปัจจุบัน | งานที่เหลือ |
| --- | --- | --- | --- |
| 1 | Health check ใช้งานได้ | `Done` | เพิ่ม automated integration test |
| 2 | Standard success/error response | `Done` | เพิ่ม coverage ของ unexpected error/404 |
| 3 | Admin login และ current user | `Partial` | เพิ่ม HTTP/database integration tests |
| 4 | Generic role guard | `Partial` | เพิ่ม forbidden/allowed tests |
| 5 | Product CRUD + soft delete | `Partial` | เพิ่ม integration tests/duplicate policy |
| 6 | Product ใหม่สร้าง inventory balance | `Partial` | verify กับ PostgreSQL จริง |
| 7 | Product images ใช้งาน local และเปลี่ยน provider ได้ | `Partial` | เพิ่ม endpoint/file consistency tests |
| 8 | Transaction workflow รองรับทุกประเภท | `Partial` | Delivery/Walk-in/Borrow/Buy พร้อม; ต้อง implement Return ผ่าน loan workflow โดยไม่เปิด generic public create |
| 9 | Queue generation/concurrency ถูกต้อง | `Done` | advisory lock + ReadCommitted + bounded retry ผ่าน concurrent DB integration tests |
| 10 | Delivery ตัด stock เฉพาะตอน complete | `Done` | conditional status claim + atomic stock + unit tests ผ่าน |
| 11 | Walk-in/Buy/Borrow effects ถูกต้อง | `Done` | atomic balances, movements และ loan creation พร้อม unit tests |
| 12 | Loan partial/full return ถูกต้อง | `Todo` | implement lifecycle |
| 13 | Status transition/log ถูกต้อง | `Done` | shared status/cancel workflow, conditional claim และ status log |
| 14 | Inventory balance/movement/adjustment ถูกต้อง | `Partial` | transaction-owned effects พร้อม; inventory list/adjustment module ยังเหลือ |
| 15 | Transaction history/filter ใช้งานได้ | `Done` | database filter/search/pagination/order/date-boundary tests ผ่าน |
| 16 | Dashboard today ใช้งานได้ | `Todo` | implement read aggregation |
| 17 | API docs พร้อม frontend | `Partial` | สร้าง contract กลาง/OpenAPI |
| 18 | Build ผ่าน | `Done` | รักษาใน CI |
| 19 | Automated tests ปัจจุบันผ่าน | `Partial` | main suite 77 tests ผ่าน; transaction DB integration 5 scenarios ใช้ runner แยกและยังไม่อยู่ใน CI |
| 20 | Lint ผ่าน | `Done` | รักษาใน CI |
| 21 | Migration/seed ผ่าน local database | `Partial` | migrations 5 รายการ up to date; seed ยังไม่ได้ rerun |

## 8. ความเสี่ยงปัจจุบัน

| ความเสี่ยง | ผลกระทบ | วิธีลดความเสี่ยง |
| --- | --- | --- |
| Loan return และ inventory endpoints ยังไม่มี | ยังคืนถัง/ดูหรือปรับ stock ผ่าน API ไม่ได้ | ทำ Phase B และ Phase D โดยคง ownership ของ `TransactionService` |
| Transaction integration runner ยังไม่ได้ wire เข้า CI | concurrency/schema behavior อาจ regress หาก CI รันเฉพาะ `npm test` | เพิ่ม `npm run test:transactions:integration` ใน CI ที่มี PostgreSQL |
| Inventory race condition | stock ติดลบหรือ balance ผิด | atomic conditional update/row lock และ concurrency tests |
| Product image delete แยก DB/file operation | orphan file หรือ state ไม่สอดคล้อง | retry/outbox/cleanup job และ failure tests |
| Integration tests ของ module อื่นยังไม่ครบ | route/workflow/database mismatch นอก transactions ยังอาจหลุดได้ | ขยาย isolated PostgreSQL + Supertest pattern ไป auth/products/loans/inventory |
| Date/timezone boundary | queue/dashboard วันนี้ผิด | กำหนด timezone policy และ boundary tests |
| Prisma config deprecation | upgrade Prisma 7 สะดุด | ย้ายไป `prisma.config.ts` |

## 9. รายการที่ไม่อยู่ใน MVP

1. Payment gateway
2. Customer master workflow แบบเต็ม
3. Rider mobile workflow
4. Accounting/report แบบเต็ม
5. Multi-branch
6. GPS/route planning
7. LINE/SMS notification
8. Receipt/print/export
9. User management UI/API เว้นแต่ยืนยันเพิ่มเข้า MVP
