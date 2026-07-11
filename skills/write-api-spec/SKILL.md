---
name: write-api-spec
description: Create, update, and review OpenAPI 3.1 API specifications from requirements, existing Express routes, controllers, Zod schemas, Prisma models, tests, and business rules. Use when Codex needs to design a REST API contract, document an endpoint, synchronize an API specification with implementation, add request and response examples, review API consistency, or identify breaking API changes.
---

# Write API Spec

Create API contracts precise enough for frontend implementation, backend implementation, testing, and review.

## Load references

- Read `references/api-conventions.md` for response envelopes, authentication, identifiers, dates, pagination, and naming.
- Read `references/openapi-guidelines.md` before creating or modifying an OpenAPI document.
- Read `references/domain-rules.md` for transaction, inventory, queue, loan, product, or dashboard endpoints in KMG-SERVICE.
- Read `references/review-checklist.md` before reviewing or completing a specification.
- Start new standalone specifications from `assets/openapi-template.yaml`.

## Follow the workflow

1. Determine whether the request is new API design, documentation of existing behavior, an update, or a review.
2. Inspect the available sources of truth: requirements, architecture documents, existing OpenAPI files, routes, Zod schemas, controllers, services, repositories, Prisma schema, constants, error codes, and tests.
3. Resolve conflicts using this priority: explicit user requirement; approved domain documentation; current tested behavior; current implementation; inferred convention. Report every conflict that affects the contract.
4. Identify consequential unresolved decisions. Do not silently invent authorization, state transitions, stock effects, idempotency, pagination, filtering, nullability, or destructive behavior. Ask only when the missing decision materially changes the public contract; otherwise make and report a conservative assumption.
5. Design each operation before writing YAML: method and versioned path; stable `operationId`; authentication and authorization; parameters and request body; success and error responses; reusable schemas; realistic examples; observable side effects; invariants.
6. Write OpenAPI 3.1-compatible YAML. Reuse schemas, parameters, responses, and security schemes under `components` when doing so reduces duplication without hiding important behavior.
7. Validate the result against implementation sources and `references/review-checklist.md`. Run a repository-provided OpenAPI validator when available.
8. Report changed files, assumptions, unresolved decisions, implementation mismatches, and breaking-change concerns.

## Enforce contract rules

- Keep controllers, repositories, database transactions, and other internal implementation details out of the public contract.
- Represent database `BigInt` identifiers as decimal strings.
- Never expose password hashes, secrets, JWT values, internal stack traces, or sensitive customer data not required by the operation.
- Document expected operational errors with stable machine-readable codes.
- Mark required, optional, and nullable properties independently and explicitly.
- Include constraints actually enforced by the system; do not promise unsupported validation.
- Give every operation a stable, unique, verb-led `operationId`.
- Use public domain constants as enums when inputs or outputs restrict values.
- Describe observable side effects and timing without prescribing repository internals.
- Preserve historical snapshot fields in transaction representations.
- Ensure every example conforms to its declared schema.
- Avoid adding write behavior to read-only dashboard operations.

## Review specifications

Classify findings as:

- Blocker: unsafe, contradictory, or impossible to implement reliably.
- Major: contract mismatch, missing required behavior, or likely breaking behavior.
- Minor: ambiguity, weak example, naming inconsistency, or maintainability issue.

Reference the file and operation for every finding. Lead with findings, then list assumptions and open questions. Do not modify implementation during a review unless explicitly asked.

