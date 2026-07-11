# OpenAPI 3.1 guidelines

## Document structure

Use OpenAPI `3.1.0` and a complete `info` object. Define servers only when their URLs are known and appropriate for the target environment. Group operations with tags based on owning modules.

Keep path definitions readable. Extract a component when it is shared, semantically stable, or important enough to name. Avoid creating layers of one-use components that make an operation difficult to review.

## JSON Schema behavior

- Use JSON Schema 2020-12-compatible constructs supported by OpenAPI 3.1.
- Express nullability with a type union, such as `type: [string, 'null']`, or an equivalent `oneOf`; do not use OpenAPI 3.0 `nullable`.
- Use `const` for invariant envelope booleans.
- Set `additionalProperties: false` only when the runtime rejects unknown keys or the strict contract is intentional.
- Add `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, and array bounds only when known.
- Use `readOnly` and `writeOnly` where they clarify client behavior, but never rely on them to hide sensitive output accidentally.

## Operation design

For every operation specify:

1. `summary` describing the user-visible action.
2. Stable, unique `operationId`.
3. Tags matching the owning module.
4. Security requirements or explicit public access.
5. All parameters with required flags and constraints.
6. Request body requirement and supported media types.
7. Success response and all expected operational failures.
8. Observable state transitions, delayed effects, or invariants in the description.
9. At least one realistic success example for non-trivial operations.

## Reuse

Prefer components for:

- bearer authentication;
- BigInt identifier parameters;
- request metadata and error envelopes;
- pagination parameters and metadata;
- shared public resource representations;
- repeated error responses.

Do not use a generic success schema that erases the concrete type of `data`. Compose a specific operation envelope with the shared metadata schema.

## Examples

Use fictional, non-sensitive data. Ensure examples satisfy required properties, formats, patterns, enums, and numeric constraints. Show domain-significant states rather than placeholder values such as `string` or `0`.

For errors, show stable codes from the project's shared error-code definitions. Do not invent a code when documenting existing behavior; mark it as unresolved if no code exists.

## Compatibility

Treat the following as potentially breaking:

- removing or renaming a path, operation, parameter, property, response, or enum value;
- making an optional input required;
- narrowing accepted values or constraints;
- changing serialization type or nullability;
- changing authentication or required role;
- changing success status or response envelope;
- changing default sorting, pagination, or observable side-effect timing.

Adding an optional response property is usually compatible, but evaluate strict clients and `additionalProperties: false`. Adding an enum output value can break exhaustive clients and must be reported.

