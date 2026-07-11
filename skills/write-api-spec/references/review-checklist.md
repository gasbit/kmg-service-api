# API specification review checklist

## Source alignment

- Confirm path and method against route wiring.
- Confirm path, query, header, and body inputs against Zod schemas and middleware.
- Confirm response properties and serialization against controllers, services, and shared serializers.
- Confirm model relations and identifier types against Prisma.
- Confirm enums against constants or generated Prisma types.
- Confirm error codes against shared error-code definitions.
- Confirm side effects and transaction boundaries against the owning service.
- Confirm examples against tests or fixtures when available.

## Contract completeness

- Verify a unique stable `operationId`, summary, tags, and security for every operation.
- Verify all parameters state location, requirement, schema, and meaningful description.
- Verify request body media type, requirement, and constraints.
- Verify success status and concrete envelope schema.
- Verify authentication, authorization, validation, not-found, conflict, and unexpected-error responses as applicable.
- Verify required and nullable properties independently.
- Verify pagination bounds, defaults, stable ordering, and metadata.
- Verify filtering and sorting semantics.
- Verify dates, timezones, money, quantities, and BigInt ID serialization.
- Verify observable side effects and state transitions.

## Safety and privacy

- Ensure no password hash, secret, real token, stack trace, or unnecessary sensitive customer data appears.
- Ensure examples use fictional data.
- Ensure completed or cancelled transaction mutation is not promised without an approved rule.
- Ensure inventory mutations include movement behavior.
- Ensure delivery exchange does not deduct inventory at creation.
- Ensure queue numbering is not presented as a client-assigned value.
- Ensure product deletion is soft deletion.
- Ensure dashboard operations remain read-only.

## OpenAPI quality

- Confirm OpenAPI version is `3.1.0`.
- Confirm every `$ref` resolves.
- Confirm examples satisfy their schemas.
- Confirm error and success envelopes follow project convention.
- Confirm reusable components reduce genuine duplication without obscuring operations.
- Confirm no OpenAPI 3.0-only `nullable` keyword is used.
- Run an available OpenAPI parser or linter and resolve all errors.

## Compatibility report

- Identify removed or renamed operations and properties.
- Identify newly required inputs or narrower constraints.
- Identify serialization, nullability, status-code, security, enum, pagination, and default-order changes.
- State whether each concern is blocker, major, or minor and reference the affected operation.

