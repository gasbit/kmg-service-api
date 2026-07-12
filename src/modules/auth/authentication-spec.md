# Authentication API Specification

สถานะเอกสาร: Proposed contract สำหรับ MVP  
เวอร์ชัน: 0.1.0  
Base path: `/api`  
Owning module: `auth`

## 1. ขอบเขต

เอกสารนี้กำหนด API contract สำหรับ:

- เข้าสู่ระบบด้วย username และ password
- อ่านข้อมูลผู้ใช้ปัจจุบันจาก JWT access token
- ปฏิเสธผู้ใช้หรือ role ที่ inactive
- คืน response และ error ตาม standard envelope ของระบบ

ไม่รวม refresh token, logout/token revocation, forgot password, reset password และ user management ใน MVP นี้

## 2. ข้อตกลงและสมมติฐาน

- ใช้ JWT access token เพียงชนิดเดียว อายุ token มาจาก `JWT_EXPIRES_IN`; ค่า default ปัจจุบันคือ `1d`
- Client ส่ง token ผ่าน `Authorization: Bearer <access-token>`
- JWT user identifier ต้อง serialize เป็น string เพราะ database ID เป็น `BigInt`
- Login failure ทุกกรณีที่เกี่ยวกับ username, password, user inactive หรือ role inactive คืนข้อความทั่วไปแบบเดียวกัน เพื่อลดการเปิดเผยข้อมูลบัญชี
- Response ห้ามมี `passwordHash`, JWT secret หรือข้อมูลภายใน token signing
- `/auth/me` อนุญาตทุก role ที่ active; business endpoints เป็นผู้กำหนด allowed roles ผ่าน role middleware
- ไม่มี refresh token และไม่มี server-side logout ใน contract นี้ เมื่อ access token หมดอายุ client ต้อง login ใหม่

## 3. Security model

| Endpoint | Authentication | Role |
| --- | --- | --- |
| `POST /api/auth/login` | Public | ไม่บังคับก่อน login แต่บัญชีและ role ต้อง active |
| `GET /api/auth/me` | Bearer JWT | ทุก role ที่ active |

JWT payload อย่างน้อยต้องทำให้ middleware ระบุ user ID ได้ โดย user ID ต้องเป็น string การกำหนด claims ภายในอื่นเป็น implementation detail ตราบใดที่ API behavior ตรงตามเอกสารนี้

## 4. Endpoints

### 4.1 Login

`POST /api/auth/login`

ตรวจสอบ username/password และออก JWT access token ให้บัญชีที่ active และมี role active

Operation ID: `login`

#### Request

Content-Type: `application/json`

| Field | Type | Required | Constraints | Description |
| --- | --- | --- | --- | --- |
| `username` | string | Yes | 1–100 characters | ชื่อผู้ใช้ ห้าม trim หรือเปลี่ยน case โดยไม่กำหนดเป็น business rule เพิ่มเติม |
| `password` | string | Yes | อย่างน้อย 8 characters | รหัสผ่านแบบ plain text ใช้เฉพาะ request และห้าม log |

ตัวอย่าง:

```json
{
  "username": "admin",
  "password": "example-password"
}
```

#### Success response

Status: `200 OK`

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...example-only",
    "tokenType": "Bearer",
    "expiresIn": "1d",
    "user": {
      "id": "1",
      "name": "KMG Admin",
      "username": "admin",
      "role": {
        "id": "1",
        "code": "ADMIN",
        "name": "เจ้าของร้าน"
      }
    }
  },
  "meta": {
    "requestId": "req_01JABCDEF1234567890"
  }
}
```

`expiresIn` ใช้ config expression จาก `JWT_EXPIRES_IN` เช่น `"1d"` และไม่ได้รับประกันว่าเป็นจำนวนวินาที

#### Error responses

| Status | Code | Condition |
| --- | --- | --- |
| `400 Bad Request` | `VALIDATION_ERROR` | JSON ไม่ถูกต้อง, field ขาด, type ผิด หรือไม่ผ่าน constraints |
| `401 Unauthorized` | `UNAUTHORIZED` | username/password ไม่ถูกต้อง, user inactive หรือ role inactive |
| `500 Internal Server Error` | `INTERNAL_ERROR` | เกิดข้อผิดพลาดที่ไม่คาดคิด |

ตัวอย่าง invalid credentials:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid username or password",
    "details": []
  },
  "meta": {
    "requestId": "req_01JABCDEF1234567890"
  }
}
```

### 4.2 Get current user

`GET /api/auth/me`

คืนข้อมูล public profile ของผู้ใช้ที่ token ระบุ โดยตรวจสอบสถานะ user และ role จากข้อมูลปัจจุบัน

Operation ID: `getCurrentUser`

#### Request headers

| Header | Required | Value |
| --- | --- | --- |
| `Authorization` | Yes | `Bearer <access-token>` |

ไม่มี request body

#### Success response

Status: `200 OK`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "1",
      "name": "KMG Admin",
      "username": "admin",
      "role": {
        "id": "1",
        "code": "ADMIN",
        "name": "เจ้าของร้าน"
      }
    }
  },
  "meta": {
    "requestId": "req_01JABCDEF1234567890"
  }
}
```

#### Error responses

| Status | Code | Condition |
| --- | --- | --- |
| `401 Unauthorized` | `UNAUTHORIZED` | ไม่มี token, scheme ไม่ใช่ Bearer, token ไม่ถูกต้อง/หมดอายุ, ไม่พบ user, user inactive หรือ role inactive |
| `500 Internal Server Error` | `INTERNAL_ERROR` | เกิดข้อผิดพลาดที่ไม่คาดคิด |

## 5. OpenAPI 3.1 contract

```yaml
openapi: 3.1.0
info:
  title: KMG-SERVICE Authentication API
  version: 0.1.0
  description: Authentication contract for the KMG-SERVICE MVP.
servers:
  - url: http://localhost:4000
    description: Local development
tags:
  - name: Authentication
    description: Login and current-user operations
paths:
  /api/auth/login:
    post:
      tags: [Authentication]
      summary: Log in with username and password
      operationId: login
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
            examples:
              admin:
                value:
                  username: admin
                  password: example-password
      responses:
        '200':
          description: Login successful
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LoginSuccessResponse'
        '400':
          $ref: '#/components/responses/ValidationError'
        '401':
          $ref: '#/components/responses/UnauthorizedError'
        '500':
          $ref: '#/components/responses/InternalError'
  /api/auth/me:
    get:
      tags: [Authentication]
      summary: Get the current authenticated user
      description: Rejects tokens whose current user or role is inactive.
      operationId: getCurrentUser
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Current user returned successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CurrentUserSuccessResponse'
        '401':
          $ref: '#/components/responses/UnauthorizedError'
        '500':
          $ref: '#/components/responses/InternalError'
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    LoginRequest:
      type: object
      additionalProperties: false
      required: [username, password]
      properties:
        username:
          type: string
          minLength: 1
          maxLength: 100
          example: admin
        password:
          type: string
          minLength: 8
          writeOnly: true
          example: example-password
    Role:
      type: object
      additionalProperties: false
      required: [id, code, name]
      properties:
        id:
          $ref: '#/components/schemas/BigIntId'
        code:
          type: string
          example: ADMIN
        name:
          type: string
          maxLength: 100
          example: เจ้าของร้าน
    AuthenticatedUser:
      type: object
      additionalProperties: false
      required: [id, name, username, role]
      properties:
        id:
          $ref: '#/components/schemas/BigIntId'
        name:
          type: string
          maxLength: 100
          example: KMG Admin
        username:
          type: string
          maxLength: 100
          example: admin
        role:
          $ref: '#/components/schemas/Role'
    LoginData:
      type: object
      additionalProperties: false
      required: [accessToken, tokenType, expiresIn, user]
      properties:
        accessToken:
          type: string
          minLength: 1
          description: JWT access token. Example value is not usable.
          example: eyJhbGciOi...example-only
        tokenType:
          type: string
          const: Bearer
        expiresIn:
          type: string
          minLength: 1
          description: Configured JWT lifetime expression, for example `1d`.
          example: 1d
        user:
          $ref: '#/components/schemas/AuthenticatedUser'
    CurrentUserData:
      type: object
      additionalProperties: false
      required: [user]
      properties:
        user:
          $ref: '#/components/schemas/AuthenticatedUser'
    ResponseMeta:
      type: object
      additionalProperties: false
      required: [requestId]
      properties:
        requestId:
          type: string
          minLength: 1
          example: req_01JABCDEF1234567890
    ApiError:
      type: object
      additionalProperties: false
      required: [code, message, details]
      properties:
        code:
          type: string
          enum: [VALIDATION_ERROR, UNAUTHORIZED, INTERNAL_ERROR]
        message:
          type: string
          minLength: 1
        details:
          type: array
          items: {}
    BigIntId:
      type: string
      pattern: '^[1-9][0-9]*$'
      example: '1'
    LoginSuccessResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success:
          type: boolean
          const: true
        data:
          $ref: '#/components/schemas/LoginData'
        meta:
          $ref: '#/components/schemas/ResponseMeta'
    CurrentUserSuccessResponse:
      type: object
      additionalProperties: false
      required: [success, data, meta]
      properties:
        success:
          type: boolean
          const: true
        data:
          $ref: '#/components/schemas/CurrentUserData'
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
      description: Request validation failed
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
    UnauthorizedError:
      description: Authentication failed
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
    InternalError:
      description: Unexpected internal error
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

## 6. Validation และ security requirements

- Validate login body ด้วย Zod ก่อนเข้า service layer
- เปรียบเทียบ password ด้วย bcrypt และห้ามแยกข้อความระหว่าง username ไม่พบกับ password ผิด
- ตรวจทั้ง `User.isActive` และ `Role.isActive` ก่อนออก token และทุกครั้งที่อ่าน current user
- ห้าม log request password, Authorization header หรือ access token
- ห้ามคืน `passwordHash` จาก repository/service/controller serialization ทุกกรณี
- Token ที่ malformed, signature ผิด หรือหมดอายุต้องคืน `401 UNAUTHORIZED`
- Role middleware ต้องรับ allowed roles เป็น array เพื่อรองรับ role ในอนาคต
- ควรจำกัดอัตราการเรียก login ที่ infrastructure หรือ middleware layer ก่อนเปิดใช้งาน production

## 7. Acceptance scenarios

1. Admin ที่ active และ role active ใช้ credentials ถูกต้องแล้วได้ `200`, access token และ public user profile
2. Password ผิดแล้วได้ `401 UNAUTHORIZED` โดย response ไม่บอกว่า username มีอยู่หรือไม่
3. Username ไม่พบแล้วได้ response แบบเดียวกับ password ผิด
4. User inactive หรือ role inactive login ไม่ได้
5. Token ที่ถูกต้องเรียก `/auth/me` แล้วได้ current public user profile
6. ไม่มี token, token หมดอายุ หรือ signature ผิดแล้วได้ `401 UNAUTHORIZED`
7. User หรือ role ถูกปิดหลังออก token แล้ว token เดิมเรียก `/auth/me` ไม่ได้
8. ทุก success/error response มี `meta.requestId`
9. ไม่มี response หรือ log ใดมี `passwordHash`, password, JWT secret หรือ access token ที่รับมาจาก client

## 8. Future considerations

- พิจารณา token revocation หรือ refresh token เมื่อระบบต้องรองรับ session lifecycle ที่ยาวขึ้น
- พิจารณา rate limiting policy สำหรับ login ก่อนเปิดใช้งาน production
- Username ใน contract ปัจจุบันเป็น case-sensitive และไม่ trim อัตโนมัติ
