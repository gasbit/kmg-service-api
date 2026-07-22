# KMG-SERVICE แผน Implement ฝั่ง Backend

เอกสารนี้เป็นแผนดำเนินการของ `KMG-SERVICE-API` โดยอ้างอิงจาก `AGENTS.md`, `CONTEXT.md`, เอกสาร business/architecture/database ที่เกี่ยวข้อง และ source code จริงใน `src`

เป้าหมายคือทำ backend MVP ให้เป็น source of truth ของ auth, products, transactions, queues, loans, inventory และ dashboard โดยรักษา snapshot data, status logs และ inventory movements ให้ตรวจสอบย้อนหลังได้

## 1. สถานะปัจจุบันจาก Code จริง

ตรวจล่าสุดวันที่ `2026-07-22` จาก branch `feature/transactions` ที่ commit `43f137b` รวม changes ที่ยังไม่ commit ใน working tree

Legend:

- `Done`: มี implementation และ verification ที่เพียงพอสำหรับ scope ของ phase
- `Partial`: มี implementation แล้ว แต่ยังขาด behavior, integration test หรือ runtime verification สำคัญ
- `Todo`: ยังไม่มี implementation ที่ใช้งานได้
- `Not verified`: มี code หรือ artifact แต่ยังไม่ได้ยืนยันกับ dependency ภายนอก เช่น PostgreSQL

- [x] Phase 0: App bootstrap และ route wiring
  สถานะ: `Done` - มี `app.ts`, `server.ts`, `/api/health`, `/api/auth`, `/api/products`, 404 และ error middleware; compiled health smoke test ตอบ `200`
- [ ] Phase 1: Foundation, middleware และ response/error format
  สถานะ: `Partial` - มี env validation, request ID, standard success/error response, auth, generic role guard และ Zod body/query/params validation; ยังไม่มี logger config ตาม architecture และยังขาด middleware integration tests หลายกรณี
- [ ] Phase 2: Database schema, migrations และ seeds
  สถานะ: `Partial` - Prisma schema ครบ 11 models, มี 4 migrations, admin seed และ product test-data seed; `prisma validate`/`prisma generate` ผ่าน แต่ยังยืนยัน migration status และ seed กับ PostgreSQL ไม่ได้
- [ ] Phase 3: Auth และ role base
  สถานะ: `Partial` - `POST /api/auth/login` และ `GET /api/auth/me` implement แล้ว, ไม่ expose `passwordHash`, รองรับ active user/role และ JWT BigInt ID แบบ string; มี AuthService unit tests แต่ยังไม่มี Supertest/database integration tests และ role middleware tests
- [ ] Phase 4: Product management และ product images
  สถานะ: `Partial` - CRUD, pagination/search, soft delete, initial inventory balance, local image storage, image metadata, primary image constraint และ image endpoints implement แล้ว; มี ProductService unit tests แต่ยังขาด endpoint/database integration tests และ cleanup/recovery บางกรณี
- [ ] Phase 5: Transaction core
  สถานะ: `Done` - ทั้ง 5 endpoints, snapshots, status logs, queue numbering, inventory/loan effects, unit/schema/auth-boundary tests และ local PostgreSQL smoke checks พร้อมแล้ว
- [ ] Phase 6: Queue workflow
  สถานะ: `Partial` - queue number generation ใช้ daily advisory lock ภายใน Serializable transaction แล้ว; queue list routes และ concurrent integration tests ยังไม่มี
- [ ] Phase 7: Cylinder loan workflow
  สถานะ: `Partial` - borrow transaction สร้าง loan และ `LOAN_OUT` แล้ว; list/partial-return/full-return endpoints ยังไม่มี
- [ ] Phase 8: Inventory workflow
  สถานะ: `Partial` - transaction effects ใช้ conditional atomic updates และสร้าง movements แล้ว; inventory list/adjustment endpoints ยังไม่มี
- [ ] Phase 9: Dashboard read aggregation
  สถานะ: `Todo` - ยังไม่มี dashboard module หรือ endpoint
- [ ] Phase 10: Tests, API docs และ hardening
  สถานะ: `Partial` - build/lint ผ่าน, 65 tests ผ่าน, Prisma generate และ migrate status ผ่าน; ยังขาด full database workflow/concurrency suite

## 2. Verification ล่าสุด

| Command / Check | ผลล่าสุด | หมายเหตุ |
| --- | --- | --- |
| `npm run build` | `Passed` | TypeScript strict build ผ่าน |
| `npm test` | `Passed` | 10 test files, 65 tests ผ่าน |
| `npx prisma validate` | `Passed` | schema ถูกต้อง |
| `npm run prisma:generate` | `Passed` | generate Prisma Client v6.19.3 สำเร็จ |
| Compiled health smoke test | `Passed` | `GET /api/health` ตอบ `200` และ standard response |
| `npx prisma migrate status` | `Passed` | PostgreSQL local มี migrations ครบ 5 รายการและ schema up to date |
| `npm run prisma:seed` | `Not run` | ไม่รันเพราะ database ยังไม่พร้อมและคำสั่ง mutate data |
| `npm run lint` | `Passed` | ESLint flat config ผ่าน |

หมายเหตุ: Prisma เตือนว่า config ใต้ `package.json#prisma` จะถูกถอดใน Prisma 7 ควรย้ายไป `prisma.config.ts` ก่อน upgrade major version

## 3. Implementation Inventory

| ส่วนงาน | สถานะ | หลักฐานจาก code | งานที่ต้องทำต่อ |
| --- | --- | --- | --- |
| App bootstrap | `Done` | `src/app.ts`, `src/server.ts` | เพิ่ม graceful shutdown และใช้ logger แทน `console.log` |
| Health check | `Done` | `GET /api/health`; smoke test `200` | เพิ่ม endpoint integration test เพื่อกัน regression |
| Route wiring | `Partial` | wire auth, products และ transactions ใต้ `/api` | wire queues, loans, inventory และ dashboard |
| Env/config | `Partial` | validate database/JWT/CORS/storage/admin settings | ทบทวน production defaults และแยก test env |
| Logger | `Todo` | มี Pino dependency แต่ไม่มี `src/config/logger.ts` หรือ request logger | เพิ่ม redaction สำหรับ token/password/sensitive customer data |
| Standard response | `Done` | `sendSuccess` และ error middleware ใส่ request ID | พิจารณา shared pagination helper เพื่อลด manual response shape |
| Error handling | `Partial` | `AppError`, shared codes, 404/error middleware | เพิ่ม logging ของ unexpected error โดยไม่ leak รายละเอียด |
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
| Transaction module | `Done` | schemas, repository, service, controller, routes และ tests ครบ contract | เพิ่ม full PostgreSQL concurrency integration suite |
| Queue module | `Partial` | transaction workflow สร้าง daily queue อย่างปลอดภัย | เพิ่ม queue list routes และ concurrent tests |
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

ทุก product endpoint บังคับ `authMiddleware` และ role `ADMIN`

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

## 6. ลำดับงานแนะนำจากสถานะปัจจุบัน

### Phase A: ปิด Product และ Foundation Gaps

1. เพิ่ม ESLint v9 flat config และทำ `npm run lint` ให้ผ่าน
2. เพิ่ม Pino logger/request logger พร้อม sensitive-field redaction
3. เพิ่ม integration tests สำหรับ health, 404, validation, auth, role guard และ product endpoints
4. เปิด PostgreSQL แล้วรัน migrate status, migrations และ seeds
5. เพิ่ม database integration test ว่า create product และ initial balance commit/rollback พร้อมกัน
6. เพิ่ม product image endpoint tests: MIME, signature, size, max count, one primary, delete และ path safety
7. กำหนด recovery policy กรณีลบ image row สำเร็จแต่ลบไฟล์ไม่สำเร็จ ปัจจุบันมีโอกาสเหลือ orphan file
8. ยืนยัน duplicate policy ของ product เช่น `brand + weightKg`

เกณฑ์ยอมรับ:

- Build, lint และ tests ผ่าน
- Auth/Product flows ผ่าน Supertest กับ test database
- Migration/seed ใช้ได้กับ local PostgreSQL
- Product image database/file state มี cleanup หรือ retry ที่อธิบายได้

### Phase B: Transaction Core

1. เพิ่ม constants และ Zod schemas สำหรับ transaction type/status/item action
2. เพิ่ม transaction repository สำหรับ database access เท่านั้น
3. สร้าง `TransactionService` เป็น owner ของ create/status/queue/inventory/loan effects
4. Implement list/detail พร้อม filters และ BigInt/Decimal/Date serialization
5. Implement create transaction ใน `prisma.$transaction`
6. เก็บ customer snapshot และ product/price/cost/line-total snapshots ทุกครั้ง
7. สร้าง initial status log ทุกครั้งที่สร้าง transaction
8. Validate mapping ระหว่าง transaction type กับ item action/required fields
9. บังคับใช้เฉพาะ active products และตรวจ stock แบบ atomic
10. Implement status transitions และห้าม mutate final state

Test matrix ขั้นต่ำ:

- `DELIVERY_EXCHANGE`: default `PENDING`, สร้าง queue, ไม่ตัด stock ตอน create, ตัด stock ตอน `COMPLETED`
- `WALK_IN_EXCHANGE`: default `COMPLETED`, สร้าง `FULL_OUT` + `EMPTY_IN`
- `BORROW_CYLINDER`: default `COMPLETED`, สร้าง `LOAN_OUT` + loan
- `RETURN_CYLINDER`: default `COMPLETED`, สร้าง `LOAN_RETURN` ผ่าน loan workflow
- `BUY_FULL_TANK`: default `COMPLETED`, สร้าง `FULL_OUT`
- invalid transition, insufficient stock, inactive product, rollback และ snapshot correctness

เกณฑ์ยอมรับ:

- ทุก multi-table write อยู่ใน database transaction เดียว
- ทุก status change มี status log
- ทุก stock change มี inventory movement
- Queue/loan/inventory effects เกิดตาม timing ของ domain เท่านั้น

### Phase C: Queue

1. สร้าง queue read service จาก `transactions.queueDate/queueNo` โดยไม่สร้าง queue table
2. Generate queue number ภายใน transaction เดียวกับ transaction creation
3. รองรับ unique-conflict retry หรือ strategy ที่ปลอดภัยเมื่อ concurrent requests
4. ให้ queue status action reuse `TransactionService` transition logic
5. เพิ่ม today/date filter, delivery-only filter และ ordering ด้วย queue number

เกณฑ์ยอมรับ:

- Queue number ไม่ซ้ำในวันเดียวกัน
- Cancelled queue ไม่ตัด stock
- Completed queue ตัด stockครั้งเดียว

### Phase D: Cylinder Loans

1. สร้าง loan list/detail/active queries
2. Implement partial/full return ผ่าน `TransactionService`
3. Validate `remainingQuantity = quantity - returnedQuantity`
4. Partial return อัปเดต `returnedQuantity` และ `PARTIAL_RETURNED`
5. Full return อัปเดต `RETURNED` และ `returnedDate`
6. ทุก return สร้าง `RETURN_CYLINDER` transaction และ `LOAN_RETURN` movement
7. กัน return เกินจำนวนค้างและกัน return loan ที่ปิดแล้ว

เกณฑ์ยอมรับ:

- Active loans แสดงยอดค้างจริง
- Partial/full return audit ย้อนกลับได้จาก transaction และ movement
- Loan, transaction และ inventory update atomically

### Phase E: Inventory

1. สร้าง balances/movements read endpoints พร้อม pagination/filter
2. สร้าง adjustment schema/service/endpoint โดย note เป็น required
3. ระบุว่า adjustment แต่ละ movement กระทบ `fullQty`, `emptyQty` หรือ `loanedQty` อย่างไม่กำกวม
4. ใช้ atomic update หรือ row locking เพื่อกัน negative stock/race condition
5. เพิ่ม tests สำหรับ `FULL_OUT`, `EMPTY_IN`, `LOAN_OUT`, `LOAN_RETURN`, `ADJUSTMENT`

เกณฑ์ยอมรับ:

- Balance ไม่ติดลบจาก concurrent writes
- ทุก mutation มี movement ที่อ่าน audit ได้
- Adjustment ไม่ bypass service layer

### Phase F: Dashboard

1. สร้าง read-only `DashboardService`
2. สรุปยอดขายวันนี้ตาม completed transactions ที่นับเป็นยอดขาย
3. สรุป queue, active loans และ stock
4. กำหนด timezone/date boundary เป็น `Asia/Bangkok` หรือ config ที่ชัดเจน
5. เพิ่ม aggregation และ boundary tests

เกณฑ์ยอมรับ:

- Dashboard ไม่ mutate data
- ตัวเลข reconcile กับ transaction/loan/inventory source tables ได้

### Phase G: API Docs และ Hardening

1. เพิ่ม OpenAPI/Swagger หรือ contract กลางที่ frontend ใช้อ้างอิงได้
2. รวม request/response/error/pagination และ multipart upload contract
3. เพิ่ม full workflow integration tests
4. เพิ่ม graceful shutdown ของ HTTP server/Prisma
5. ตรวจ query performance และ indexes ของ list/dashboard
6. รัน `npm audit --audit-level=high`
7. ย้าย Prisma config ออกจาก `package.json` ก่อน Prisma 7

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
| 8 | Transaction create รองรับทุกประเภท | `Done` | public create รองรับ Delivery/Walk-in/Borrow/Buy; Return อยู่ใน loan workflow ตาม contract |
| 9 | Queue generation/concurrency ถูกต้อง | `Partial` | advisory lock + Serializable + retry พร้อมแล้ว; เพิ่ม concurrent DB integration tests |
| 10 | Delivery ตัด stock เฉพาะตอน complete | `Done` | conditional status claim + atomic stock + unit tests ผ่าน |
| 11 | Walk-in/Buy/Borrow effects ถูกต้อง | `Done` | atomic balances, movements และ loan creation พร้อม unit tests |
| 12 | Loan partial/full return ถูกต้อง | `Todo` | implement lifecycle |
| 13 | Status transition/log ถูกต้อง | `Done` | shared status/cancel workflow, conditional claim และ status log |
| 14 | Inventory balance/movement/adjustment ถูกต้อง | `Partial` | transaction-owned effects พร้อม; inventory list/adjustment module ยังเหลือ |
| 15 | Transaction history/filter ใช้งานได้ | `Partial` | read APIs พร้อม; เพิ่ม database filter/pagination integration tests |
| 16 | Dashboard today ใช้งานได้ | `Todo` | implement read aggregation |
| 17 | API docs พร้อม frontend | `Partial` | สร้าง contract กลาง/OpenAPI |
| 18 | Build ผ่าน | `Done` | รักษาใน CI |
| 19 | Unit tests ปัจจุบันผ่าน | `Done` | 65 tests ผ่าน; เพิ่ม full database concurrency coverage |
| 20 | Lint ผ่าน | `Done` | รักษาใน CI |
| 21 | Migration/seed ผ่าน local database | `Partial` | migrations 5 รายการ up to date; seed ยังไม่ได้ rerun |

## 8. ความเสี่ยงปัจจุบัน

| ความเสี่ยง | ผลกระทบ | วิธีลดความเสี่ยง |
| --- | --- | --- |
| Loan return และ inventory endpoints ยังไม่มี | ยังคืนถัง/ดูหรือปรับ stock ผ่าน API ไม่ได้ | ทำ Phase D-E โดยคง ownership ของ `TransactionService` |
| PostgreSQL full workflow ยังไม่มี automated integration suite | concurrency/schema behavior อาจ regress ได้ | เพิ่ม disposable test database ใน CI |
| Queue number concurrency | คิวซ้ำหรือ request ล้มเหลว | transaction + unique constraint + retry/locking strategy |
| Inventory race condition | stock ติดลบหรือ balance ผิด | atomic conditional update/row lock และ concurrency tests |
| Product image delete แยก DB/file operation | orphan file หรือ state ไม่สอดคล้อง | retry/outbox/cleanup job และ failure tests |
| Integration tests ยังครอบคลุมเฉพาะ auth boundary และ DB smoke checks | route/workflow/database mismatch ยังอาจหลุดได้ | เพิ่ม Supertest + disposable test database ก่อนขยาย frontend integration |
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
