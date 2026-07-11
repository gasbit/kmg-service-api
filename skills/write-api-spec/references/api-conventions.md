# API conventions

## Paths and media types

- Put application endpoints below `/api`. Do not add a version segment unless the project explicitly adopts API versioning later.
- Use JSON request and response bodies unless file transfer requires another media type.
- Use plural resource nouns and lower-case kebab-case path segments.
- Put resource identifiers in path parameters and optional selection controls in query parameters.

## Authentication and authorization

- Model JWT authentication as an HTTP bearer security scheme with bearer format `JWT`.
- Apply security at the operation level when an endpoint is public, such as login or health checks.
- Document allowed roles in the operation description or a consistent extension when the contract needs role information.
- Never include real credentials or usable tokens in examples.

## Identifiers and time

- Serialize database `BigInt` identifiers as strings matching `^[1-9][0-9]*$` unless zero is explicitly valid.
- Use `type: string`, `format: date-time` for ISO 8601 timestamps.
- Use `type: string`, `format: date` for business dates such as queue dates.
- State the timezone rule when a date boundary affects business behavior.

## Response envelope

Use this success shape:

```yaml
type: object
required: [success, data, meta]
properties:
  success:
    type: boolean
    const: true
  data: {}
  meta:
    $ref: '#/components/schemas/ResponseMeta'
```

Use this error shape:

```yaml
type: object
required: [success, error, meta]
properties:
  success:
    type: boolean
    const: false
  error:
    $ref: '#/components/schemas/ApiError'
  meta:
    $ref: '#/components/schemas/ResponseMeta'
```

`ResponseMeta` must contain `requestId`. Add pagination metadata only for paginated operations.

## HTTP status guidance

- `200`: successful read, update, action, or login.
- `201`: resource created synchronously.
- `204`: successful operation intentionally returning no body; avoid it when the project requires the standard envelope.
- `400`: malformed or semantically invalid request not better represented by another status.
- `401`: missing or invalid authentication.
- `403`: authenticated but not authorized.
- `404`: referenced public resource not found.
- `409`: state transition, uniqueness, stock, or other current-state conflict.
- `422`: use only when established by project convention for validation.
- `500`: unexpected server error without internal details.

Use the project's existing behavior when it differs, and report the mismatch rather than silently changing it.

## Pagination and filtering

Before documenting pagination, inspect existing implementation. Prefer `page` and `limit` for page-based APIs or `cursor` and `limit` for cursor-based APIs, but never mix both in one operation. Define bounds, defaults, ordering stability, and pagination metadata.

Document filter semantics precisely, including whether multiple filters combine with AND or OR. Document default sort and tie-breaker fields.

## Naming and schemas

- Use lower camel case for JSON properties.
- Use UpperCamelCase for component schema names.
- Use verb-led lower camel case operation IDs, for example `createTransaction` and `listProducts`.
- Do not reuse an input schema as an output schema when server-generated, immutable, sensitive, or snapshot fields differ.
- Describe money representation explicitly. Match the implementation's string/number serialization and currency assumptions.
- Distinguish absent properties from properties whose value may be `null`.
