# Product API Specification

สถานะเอกสาร: Proposed contract สำหรับ MVP (ยังไม่มี implementation)  
เวอร์ชัน: 0.1.0  
Base path: `/api`  
Owning module: `products`

## 1. ขอบเขต

เอกสารนี้กำหนด API contract สำหรับการอ่าน สร้าง แก้ไข และ soft delete สินค้า รวมถึงการจัดการรูปสินค้า

- Product CRUD ใช้ `isActive = false` แทนการลบ row จริง
- การสร้างสินค้าต้องสร้าง inventory balance เริ่มต้นเป็นศูนย์แบบ all-or-nothing
- Product list รองรับ search, active filter และ pagination
- Product list/detail คืนรูปพร้อม public URL ที่สร้างขณะตอบ response
- รูปสินค้าเก็บเป็น object key และ metadata ไม่เก็บ binary, Base64, absolute path หรือ host URL ในฐานข้อมูล
- ทุก endpoint ต้องใช้ Bearer JWT และจำกัดสิทธิ์เป็น `ADMIN` สำหรับ MVP

ไม่รวม inventory adjustment, stock movement, bulk import/export, product variants และ image transformation

## 2. แหล่งอ้างอิงและสถานะ implementation

Contract นี้อ้างอิง `AGENTS.md`, `CONTEXT.md`, `Backend-Implement-Plan.md`, Prisma models `Product`, `ProductImage`, `InventoryBalance` และ shared error codes

ณ เวลาที่จัดทำยังไม่มี Product routes, Zod schemas, controllers, services, repositories หรือ tests ดังนั้น endpoint และ constraints ในเอกสารนี้เป็นเป้าหมายสำหรับ implementation ไม่ใช่คำอธิบาย behavior ปัจจุบัน

## 3. ข้อตกลงร่วม

### 3.1 Security

ทุก operation ต้องส่ง `Authorization: Bearer <access-token>` และ user/role ต้อง active สำหรับ MVP อนุญาตเฉพาะ role `ADMIN` โครงสร้าง authorization ต้องรองรับ role เพิ่มในอนาคตโดยไม่เปลี่ยน path

### 3.2 Identifier, decimal และเวลา

- IDs จาก database เป็น `BigInt` และ serialize เป็น decimal string เช่น `"42"`
- ราคาและน้ำหนักซึ่งเก็บด้วย Prisma `Decimal` serialize เป็น fixed-point decimal string เพื่อไม่สูญเสีย precision เช่น `"15.00"` และ `"390.00"`
- `createdAt` และ `updatedAt` เป็น ISO 8601 date-time
- Monetary fields มีหน่วยเป็นบาทไทย (THB) และห้ามติดลบ

### 3.3 Product representation

```json
{
  "id": "42",
  "brand": "ปตท.",
  "weightKg": "15.00",
  "exchangeCostPrice": "330.00",
  "exchangeSalePrice": "390.00",
  "fullTankCostPrice": "1850.00",
  "fullTankPrice": "2450.00",
  "isActive": true,
  "images": [
    {
      "id": "108",
      "url": "http://localhost:4000/uploads/products/42/example.webp",
      "originalName": "ptt-15kg.webp",
      "mimeType": "image/webp",
      "fileSize": 184320,
      "sortOrder": 0,
      "isPrimary": true,
      "createdAt": "2026-07-12T03:15:00.000Z",
      "updatedAt": "2026-07-12T03:15:00.000Z"
    }
  ],
  "createdAt": "2026-07-12T03:10:00.000Z",
  "updatedAt": "2026-07-12T03:15:00.000Z"
}
```

`objectKey` เป็นข้อมูลภายในและไม่คืนผ่าน public API ส่วน `url` อาจเปลี่ยนตาม storage provider หรือ configuration จึงไม่ควรใช้เป็น persistent identifier

## 4. Endpoint summary

| Method | Path | Operation ID | Result |
| --- | --- | --- | --- |
| `GET` | `/api/products` | `listProducts` | อ่านรายการสินค้าแบบแบ่งหน้า |
| `GET` | `/api/products/{productId}` | `getProduct` | อ่านสินค้าหนึ่งรายการ |
| `POST` | `/api/products` | `createProduct` | สร้างสินค้าและ inventory balance เริ่มต้น |
| `PATCH` | `/api/products/{productId}` | `updateProduct` | แก้ไขข้อมูลสินค้า |
| `DELETE` | `/api/products/{productId}` | `deactivateProduct` | soft delete สินค้า |
| `GET` | `/api/products/{productId}/images` | `listProductImages` | อ่านรูปของสินค้า |
| `POST` | `/api/products/{productId}/images` | `uploadProductImage` | อัปโหลดรูปสินค้า |
| `PATCH` | `/api/products/{productId}/images/{imageId}` | `updateProductImage` | แก้ลำดับหรือกำหนดรูปหลัก |
| `DELETE` | `/api/products/{productId}/images/{imageId}` | `deleteProductImage` | ลบรูปและ metadata |

## 5. Product endpoints

### 5.1 List products

`GET /api/products` — Operation ID: `listProducts`

Query parameters:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `page` | integer ≥ 1 | No | `1` | หน้าที่ต้องการ |
| `limit` | integer 1–100 | No | `20` | จำนวนรายการต่อหน้า |
| `search` | string 1–100 chars | No | — | ค้นหา `brand` แบบ case-insensitive partial match |
| `includeInactive` | boolean | No | `false` | เมื่อ `true` คืนทั้ง active และ inactive |

ทุก filter ใช้เงื่อนไข AND เรียง `createdAt DESC, id DESC` เพื่อให้ผลลัพธ์คงที่

Success: `200 OK` โดย `data.products` เป็น array และ `meta.pagination` มี `page`, `limit`, `totalItems`, `totalPages`

### 5.2 Get product

`GET /api/products/{productId}` — Operation ID: `getProduct`

คืนสินค้าไม่ว่าสถานะ active หรือ inactive เพื่อให้ admin ตรวจสอบ master data เก่าได้ หากไม่มี ID คืน `404 NOT_FOUND`

### 5.3 Create product

`POST /api/products` — Operation ID: `createProduct`

Content-Type: `application/json`

| Field | Type | Required | Constraints |
| --- | --- | --- | --- |
| `brand` | string | Yes | trim แล้วต้องมี 1–100 characters |
| `weightKg` | decimal string | Yes | `> 0`, ไม่เกิน 2 decimal places |
| `exchangeCostPrice` | decimal string | Yes | `>= 0`, ไม่เกิน 2 decimal places |
| `exchangeSalePrice` | decimal string | Yes | `>= 0`, ไม่เกิน 2 decimal places |
| `fullTankCostPrice` | decimal string | Yes | `>= 0`, ไม่เกิน 2 decimal places; ต้นทุนถังเต็มรวมตัวถังที่ใช้ snapshot สำหรับ `BUY_FULL_TANK` |
| `fullTankPrice` | decimal string | Yes | `>= 0`, ไม่เกิน 2 decimal places |

`isActive` ไม่รับจาก client และเริ่มต้นเป็น `true` เสมอ การสร้าง Product และ InventoryBalance (`fullQty = 0`, `emptyQty = 0`, `loanedQty = 0`) ต้องสำเร็จหรือล้มเหลวพร้อมกัน

Success: `201 Created`

### 5.4 Update product

`PATCH /api/products/{productId}` — Operation ID: `updateProduct`

รับ field เดียวกับ create แบบ optional และเพิ่ม `isActive` เป็น optional boolean ต้องมีอย่างน้อยหนึ่ง field การแก้ราคา/ชื่อ/น้ำหนักไม่มีผลย้อนหลังต่อ transaction item snapshots

Success: `200 OK`

### 5.5 Deactivate product

`DELETE /api/products/{productId}` — Operation ID: `deactivateProduct`

ตั้ง `isActive = false` โดยไม่ลบ Product, images, inventory balance หรือ historical relations การเรียกซ้ำกับสินค้าที่ inactive แล้วสำเร็จแบบ idempotent และคืน representation ปัจจุบัน สินค้าที่ inactive ห้ามใช้สร้าง transaction ใหม่

Success: `200 OK`

## 6. Product image endpoints

### 6.1 List product images

`GET /api/products/{productId}/images` — Operation ID: `listProductImages`

คืนรูปเรียง `sortOrder ASC, id ASC` ไม่แบ่งหน้า หากไม่มีรูปคืน array ว่าง

### 6.2 Upload product image

`POST /api/products/{productId}/images` — Operation ID: `uploadProductImage`

Content-Type: `multipart/form-data`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `file` | binary | Yes | ไฟล์รูปหนึ่งไฟล์ |
| `sortOrder` | integer ≥ 0 | No | Default `0` |
| `isPrimary` | boolean | No | Default `false`; ถ้าเป็น `true` ต้องยกเลิก primary รูปเดิมแบบ atomic |

ระบบต้องสร้างชื่อ object ใหม่เองและป้องกัน path traversal หากบันทึกไฟล์สำเร็จแต่บันทึก metadata ล้มเหลว ต้องพยายาม cleanup ไฟล์ orphan

Success: `201 Created`

### 6.3 Update product image

`PATCH /api/products/{productId}/images/{imageId}` — Operation ID: `updateProductImage`

รับ `sortOrder` และ/หรือ `isPrimary` ต้องมีอย่างน้อยหนึ่ง field `isPrimary: true` ทำให้รูปนี้เป็น primary เพียงรูปเดียวของสินค้า ส่วน `isPrimary: false` อนุญาตให้สินค้าไม่มี primary image

Success: `200 OK`

### 6.4 Delete product image

`DELETE /api/products/{productId}/images/{imageId}` — Operation ID: `deleteProductImage`

ลบ metadata และไฟล์ที่ storage provider หาก `imageId` ไม่ได้เป็นของ `productId` ให้คืน `404 NOT_FOUND` การเลือก primary ใหม่หลังลบ primary ไม่เกิดขึ้นอัตโนมัติ

Success: `200 OK` พร้อม `{ "deletedImageId": "108" }`

## 7. Errors

ทุก error ใช้ standard error envelope และ stable codes ที่มีอยู่ใน `src/shared/errors/error-codes.ts`

| Status | Code | Condition |
| --- | --- | --- |
| `400 Bad Request` | `VALIDATION_ERROR` | path/query/body/multipart ไม่ถูกต้อง, PATCH ว่าง, file type/size ไม่ผ่าน policy |
| `401 Unauthorized` | `UNAUTHORIZED` | token ขาด ไม่ถูกต้อง หรือหมดอายุ |
| `403 Forbidden` | `FORBIDDEN` | role ไม่มีสิทธิ์ |
| `404 Not Found` | `NOT_FOUND` | ไม่พบ product/image หรือ image ไม่ได้อยู่ใต้ product ที่ระบุ |
| `409 Conflict` | `CONFLICT` | current-state conflict ที่ทำให้ operation สำเร็จอย่างปลอดภัยไม่ได้ |
| `500 Internal Server Error` | `INTERNAL_ERROR` | ข้อผิดพลาดที่ไม่คาดคิด โดยไม่เปิดเผย stack trace หรือ storage path |

ตัวอย่าง:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": []
  },
  "meta": {
    "requestId": "req_01JABCDEF1234567890"
  }
}
```

## 8. OpenAPI 3.1 contract

```yaml
openapi: 3.1.0
info:
  title: KMG-SERVICE Product API
  version: 0.1.0
  description: Proposed Product Management contract for the KMG-SERVICE MVP.
servers:
  - url: http://localhost:4000
    description: Local development
tags:
  - name: Products
    description: Product master data and product image operations
paths:
  /api/products:
    get:
      tags: [Products]
      summary: List products
      operationId: listProducts
      description: ADMIN only. Filters combine with AND. Results are ordered by createdAt descending, then id descending.
      security: [{ bearerAuth: [] }]
      parameters:
        - $ref: '#/components/parameters/Page'
        - $ref: '#/components/parameters/Limit'
        - name: search
          in: query
          required: false
          description: Case-insensitive partial match against brand.
          schema: { type: string, minLength: 1, maxLength: 100 }
        - name: includeInactive
          in: query
          required: false
          schema: { type: boolean, default: false }
      responses:
        '200':
          description: Products returned successfully
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ProductListSuccessResponse' }
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/UnauthorizedError' }
        '403': { $ref: '#/components/responses/ForbiddenError' }
        '500': { $ref: '#/components/responses/InternalError' }
    post:
      tags: [Products]
      summary: Create a product
      operationId: createProduct
      description: ADMIN only. Creates the product and its zero-valued inventory balance atomically.
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateProductRequest' }
            example:
              brand: ปตท.
              weightKg: '15.00'
              exchangeCostPrice: '330.00'
              exchangeSalePrice: '390.00'
              fullTankCostPrice: '1850.00'
              fullTankPrice: '2450.00'
      responses:
        '201':
          description: Product and initial inventory balance created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ProductSuccessResponse' }
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/UnauthorizedError' }
        '403': { $ref: '#/components/responses/ForbiddenError' }
        '409': { $ref: '#/components/responses/ConflictError' }
        '500': { $ref: '#/components/responses/InternalError' }
  /api/products/{productId}:
    parameters:
      - $ref: '#/components/parameters/ProductId'
    get:
      tags: [Products]
      summary: Get a product
      operationId: getProduct
      description: ADMIN only. Returns active or inactive products.
      security: [{ bearerAuth: [] }]
      responses:
        '200':
          description: Product returned successfully
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ProductSuccessResponse' }
        '401': { $ref: '#/components/responses/UnauthorizedError' }
        '403': { $ref: '#/components/responses/ForbiddenError' }
        '404': { $ref: '#/components/responses/NotFoundError' }
        '500': { $ref: '#/components/responses/InternalError' }
    patch:
      tags: [Products]
      summary: Update a product
      operationId: updateProduct
      description: ADMIN only. Existing transaction snapshots are unchanged.
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateProductRequest' }
      responses:
        '200':
          description: Product updated successfully
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ProductSuccessResponse' }
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/UnauthorizedError' }
        '403': { $ref: '#/components/responses/ForbiddenError' }
        '404': { $ref: '#/components/responses/NotFoundError' }
        '409': { $ref: '#/components/responses/ConflictError' }
        '500': { $ref: '#/components/responses/InternalError' }
    delete:
      tags: [Products]
      summary: Deactivate a product
      operationId: deactivateProduct
      description: ADMIN only. Sets isActive to false without deleting historical or inventory data. Repeated calls are idempotent.
      security: [{ bearerAuth: [] }]
      responses:
        '200':
          description: Product is inactive
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ProductSuccessResponse' }
        '401': { $ref: '#/components/responses/UnauthorizedError' }
        '403': { $ref: '#/components/responses/ForbiddenError' }
        '404': { $ref: '#/components/responses/NotFoundError' }
        '500': { $ref: '#/components/responses/InternalError' }
  /api/products/{productId}/images:
    parameters:
      - $ref: '#/components/parameters/ProductId'
    get:
      tags: [Products]
      summary: List product images
      operationId: listProductImages
      description: ADMIN only. Images are ordered by sortOrder ascending, then id ascending.
      security: [{ bearerAuth: [] }]
      responses:
        '200':
          description: Product images returned successfully
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ProductImageListSuccessResponse' }
        '401': { $ref: '#/components/responses/UnauthorizedError' }
        '403': { $ref: '#/components/responses/ForbiddenError' }
        '404': { $ref: '#/components/responses/NotFoundError' }
        '500': { $ref: '#/components/responses/InternalError' }
    post:
      tags: [Products]
      summary: Upload a product image
      operationId: uploadProductImage
      description: ADMIN only. Generates a safe object key. Setting isPrimary true clears the previous primary image atomically.
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              $ref: '#/components/schemas/UploadProductImageRequest'
      responses:
        '201':
          description: Image uploaded and metadata created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ProductImageSuccessResponse' }
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/UnauthorizedError' }
        '403': { $ref: '#/components/responses/ForbiddenError' }
        '404': { $ref: '#/components/responses/NotFoundError' }
        '409': { $ref: '#/components/responses/ConflictError' }
        '500': { $ref: '#/components/responses/InternalError' }
  /api/products/{productId}/images/{imageId}:
    parameters:
      - $ref: '#/components/parameters/ProductId'
      - $ref: '#/components/parameters/ImageId'
    patch:
      tags: [Products]
      summary: Update product image metadata
      operationId: updateProductImage
      description: ADMIN only. Supports sort order and primary-image selection.
      security: [{ bearerAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateProductImageRequest' }
      responses:
        '200':
          description: Image metadata updated
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ProductImageSuccessResponse' }
        '400': { $ref: '#/components/responses/ValidationError' }
        '401': { $ref: '#/components/responses/UnauthorizedError' }
        '403': { $ref: '#/components/responses/ForbiddenError' }
        '404': { $ref: '#/components/responses/NotFoundError' }
        '409': { $ref: '#/components/responses/ConflictError' }
        '500': { $ref: '#/components/responses/InternalError' }
    delete:
      tags: [Products]
      summary: Delete a product image
      operationId: deleteProductImage
      description: ADMIN only. Deletes image metadata and the corresponding stored object. No replacement primary image is selected automatically.
      security: [{ bearerAuth: [] }]
      responses:
        '200':
          description: Product image deleted
          content:
            application/json:
              schema: { $ref: '#/components/schemas/DeleteProductImageSuccessResponse' }
        '401': { $ref: '#/components/responses/UnauthorizedError' }
        '403': { $ref: '#/components/responses/ForbiddenError' }
        '404': { $ref: '#/components/responses/NotFoundError' }
        '500': { $ref: '#/components/responses/InternalError' }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT }
  parameters:
    ProductId:
      name: productId
      in: path
      required: true
      schema: { $ref: '#/components/schemas/BigIntId' }
    ImageId:
      name: imageId
      in: path
      required: true
      schema: { $ref: '#/components/schemas/BigIntId' }
    Page:
      name: page
      in: query
      required: false
      schema: { type: integer, minimum: 1, default: 1 }
    Limit:
      name: limit
      in: query
      required: false
      schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
  schemas:
    BigIntId:
      type: string
      pattern: '^[1-9][0-9]*$'
      example: '42'
    Decimal2:
      type: string
      pattern: '^(0|[1-9][0-9]*)(\\.[0-9]{1,2})?$'
      example: '390.00'
    PositiveDecimal2:
      type: string
      pattern: '^(0*[1-9][0-9]*)(\\.[0-9]{1,2})?$|^0*\\.(0[1-9]|[1-9][0-9]?)$'
      example: '15.00'
    ProductInputFields:
      type: object
      properties:
        brand: { type: string, minLength: 1, maxLength: 100 }
        weightKg: { $ref: '#/components/schemas/PositiveDecimal2' }
        exchangeCostPrice: { $ref: '#/components/schemas/Decimal2' }
        exchangeSalePrice: { $ref: '#/components/schemas/Decimal2' }
        fullTankCostPrice: { $ref: '#/components/schemas/Decimal2' }
        fullTankPrice: { $ref: '#/components/schemas/Decimal2' }
    CreateProductRequest:
      type: object
      additionalProperties: false
      required: [brand, weightKg, exchangeCostPrice, exchangeSalePrice, fullTankCostPrice, fullTankPrice]
      properties:
        brand: { type: string, minLength: 1, maxLength: 100 }
        weightKg: { $ref: '#/components/schemas/PositiveDecimal2' }
        exchangeCostPrice: { $ref: '#/components/schemas/Decimal2' }
        exchangeSalePrice: { $ref: '#/components/schemas/Decimal2' }
        fullTankCostPrice: { $ref: '#/components/schemas/Decimal2' }
        fullTankPrice: { $ref: '#/components/schemas/Decimal2' }
    UpdateProductRequest:
      type: object
      additionalProperties: false
      minProperties: 1
      properties:
        brand: { type: string, minLength: 1, maxLength: 100 }
        weightKg: { $ref: '#/components/schemas/PositiveDecimal2' }
        exchangeCostPrice: { $ref: '#/components/schemas/Decimal2' }
        exchangeSalePrice: { $ref: '#/components/schemas/Decimal2' }
        fullTankCostPrice: { $ref: '#/components/schemas/Decimal2' }
        fullTankPrice: { $ref: '#/components/schemas/Decimal2' }
        isActive: { type: boolean }
    ProductImage:
      type: object
      additionalProperties: false
      required: [id, url, originalName, mimeType, fileSize, sortOrder, isPrimary, createdAt, updatedAt]
      properties:
        id: { $ref: '#/components/schemas/BigIntId' }
        url: { type: string, format: uri }
        originalName: { type: [string, 'null'], maxLength: 255 }
        mimeType: { type: string, maxLength: 100 }
        fileSize: { type: integer, minimum: 1 }
        sortOrder: { type: integer, minimum: 0 }
        isPrimary: { type: boolean }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }
    Product:
      type: object
      additionalProperties: false
      required: [id, brand, weightKg, exchangeCostPrice, exchangeSalePrice, fullTankCostPrice, fullTankPrice, isActive, images, createdAt, updatedAt]
      properties:
        id: { $ref: '#/components/schemas/BigIntId' }
        brand: { type: string, maxLength: 100 }
        weightKg: { $ref: '#/components/schemas/PositiveDecimal2' }
        exchangeCostPrice: { $ref: '#/components/schemas/Decimal2' }
        exchangeSalePrice: { $ref: '#/components/schemas/Decimal2' }
        fullTankCostPrice: { $ref: '#/components/schemas/Decimal2' }
        fullTankPrice: { $ref: '#/components/schemas/Decimal2' }
        isActive: { type: boolean }
        images:
          type: array
          items: { $ref: '#/components/schemas/ProductImage' }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }
    UploadProductImageRequest:
      type: object
      additionalProperties: false
      required: [file]
      properties:
        file: { type: string, format: binary }
        sortOrder: { type: integer, minimum: 0, default: 0 }
        isPrimary: { type: boolean, default: false }
    UpdateProductImageRequest:
      type: object
      additionalProperties: false
      minProperties: 1
      properties:
        sortOrder: { type: integer, minimum: 0 }
        isPrimary: { type: boolean }
    ResponseMeta:
      type: object
      additionalProperties: false
      required: [requestId]
      properties:
        requestId: { type: string, minLength: 1, example: req_01JABCDEF1234567890 }
    PaginationMeta:
      type: object
      additionalProperties: false
      required: [page, limit, totalItems, totalPages]
      properties:
        page: { type: integer, minimum: 1 }
        limit: { type: integer, minimum: 1, maximum: 100 }
        totalItems: { type: integer, minimum: 0 }
        totalPages: { type: integer, minimum: 0 }
    PaginatedResponseMeta:
      type: object
      additionalProperties: false
      required: [requestId, pagination]
      properties:
        requestId: { type: string, minLength: 1 }
        pagination: { $ref: '#/components/schemas/PaginationMeta' }
    ApiError:
      type: object
      additionalProperties: false
      required: [code, message, details]
      properties:
        code:
          type: string
          enum: [VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, INTERNAL_ERROR]
        message: { type: string, minLength: 1 }
        details: { type: array, items: {} }
    ErrorResponse:
      type: object
      additionalProperties: false
      required: [success, error, meta]
      properties:
        success: { type: boolean, const: false }
        error: { $ref: '#/components/schemas/ApiError' }
        meta: { $ref: '#/components/schemas/ResponseMeta' }
    ProductSuccessResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success: { type: boolean, const: true }
        data: { $ref: '#/components/schemas/Product' }
        meta: { $ref: '#/components/schemas/ResponseMeta' }
    ProductListSuccessResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success: { type: boolean, const: true }
        data:
          type: object
          additionalProperties: false
          required: [products]
          properties:
            products: { type: array, items: { $ref: '#/components/schemas/Product' } }
        meta: { $ref: '#/components/schemas/PaginatedResponseMeta' }
    ProductImageSuccessResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success: { type: boolean, const: true }
        data: { $ref: '#/components/schemas/ProductImage' }
        meta: { $ref: '#/components/schemas/ResponseMeta' }
    ProductImageListSuccessResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success: { type: boolean, const: true }
        data:
          type: object
          additionalProperties: false
          required: [images]
          properties:
            images: { type: array, items: { $ref: '#/components/schemas/ProductImage' } }
        meta: { $ref: '#/components/schemas/ResponseMeta' }
    DeleteProductImageSuccessResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success: { type: boolean, const: true }
        data:
          type: object
          additionalProperties: false
          required: [deletedImageId]
          properties:
            deletedImageId: { $ref: '#/components/schemas/BigIntId' }
        meta: { $ref: '#/components/schemas/ResponseMeta' }
  responses:
    ValidationError:
      description: Request validation failed
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
    UnauthorizedError:
      description: Authentication is missing or invalid
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
    ForbiddenError:
      description: Authenticated role is not allowed
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
    NotFoundError:
      description: Product or image was not found
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
    ConflictError:
      description: Operation conflicts with current state
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
    InternalError:
      description: Unexpected server error
      content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } }
```

## 9. สมมติฐานและประเด็นที่ยังต้องยืนยัน

สมมติฐานเชิง contract ที่ใช้ในฉบับนี้:

- Decimal รับและคืนเป็น string เพื่อรักษา precision; implementation ต้องทำให้ Zod และ serializer ตรงกัน
- List pagination ใช้ `page=1`, `limit=20`, สูงสุด `100`
- `search` ค้นเฉพาะ brand แบบ case-insensitive partial match
- Product detail คืน inactive product ได้ และ DELETE เป็น idempotent
- Product response คืนรูปทั้งหมด; list อาจต้องทบทวนหาก payload ใหญ่เกินไป

ประเด็นที่ยังไม่ควร implement แบบเดา:

- MIME types, extensions, maximum file size และจำนวนรูปสูงสุดต่อสินค้า ยังไม่มี approved policy
- ยังไม่มี unique constraint หรือ approved rule สำหรับ brand + weight; ห้ามสัญญาว่าจะ reject duplicate จนกว่าจะตัดสินใจ
- ยังไม่กำหนดว่าการ reactivate ผ่าน `PATCH isActive: true` ต้องตรวจ conflict เพิ่มเติมหรือไม่
- Failure semantics ระหว่างลบ metadata กับลบ stored file ต้องออกแบบให้ retry/reconcile ได้ โดยห้ามเปิดเผย storage detail ผ่าน API

## 10. Implementation acceptance checklist

- Route, Zod schema และ controller response ตรงกับ contract
- Product creation และ inventory balance initialization อยู่ใน database transaction เดียวกัน
- Product delete เป็น soft delete และ inactive product ใช้สร้าง transaction ใหม่ไม่ได้
- IDs และ Decimal serialize ตามชนิดที่ระบุ
- ทุก list มี stable ordering และ pagination meta ถูกต้อง
- ทุก image URL สร้างจาก runtime configuration/provider; database เก็บ object key
- Upload ตรวจ content และสร้างชื่อไฟล์ใหม่ ป้องกัน path traversal
- การกำหนด primary รูปเดียวเป็น atomic
- ไม่มี response ใดเปิดเผย object key, filesystem path หรือ stack trace
- เพิ่ม unit/integration tests สำหรับ create, list/filter, update, deactivate, upload, primary selection และ cleanup failure
