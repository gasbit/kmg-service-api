# KMG-SERVICE domain rules

Load this reference only for KMG-SERVICE or another project explicitly adopting these rules. Verify it against current project documentation and constants before writing a contract.

## Architecture boundaries visible to the contract

- `TransactionService` owns transaction creation, status changes, queue effects, inventory effects, and loan effects.
- Multi-table workflow writes are atomic, but describe only the observable all-or-nothing behavior in the API contract.
- Dashboard operations are read-only.
- Queue position is represented by transaction `queueDate` and `queueNo`; do not expose a separate queue resource unless the implementation introduces one.

## Transaction types

- `DELIVERY_EXCHANGE`: default `PENDING`; assign today's queue number; make no inventory change until completion.
- `WALK_IN_EXCHANGE`: default `COMPLETED`; immediately create `FULL_OUT` and `EMPTY_IN` effects.
- `BORROW_CYLINDER`: default `COMPLETED`; immediately create `LOAN_OUT` and a cylinder loan.
- `RETURN_CYLINDER`: default `COMPLETED`; immediately create `LOAN_RETURN`.
- `BUY_FULL_TANK`: default `COMPLETED`; immediately create `FULL_OUT`.

## Transaction statuses

Allowed values are `PENDING`, `IN_PROGRESS`, `COMPLETED`, and `CANCELLED`.

Allowed transitions:

- `PENDING` to `IN_PROGRESS`
- `PENDING` to `CANCELLED`
- `IN_PROGRESS` to `COMPLETED`
- `IN_PROGRESS` to `CANCELLED`

`COMPLETED` and `CANCELLED` are terminal unless a later approved business rule explicitly permits another transition. Every status change creates a status log.

## Inventory effects

- `FULL_OUT`: decrease `fullQty` by quantity.
- `EMPTY_IN`: increase `emptyQty` by quantity.
- `LOAN_OUT`: decrease `fullQty` and increase `loanedQty` by quantity.
- `LOAN_RETURN`: decrease `loanedQty` and increase `emptyQty` by quantity.
- `ADJUSTMENT`: apply the declared manual adjustment and require a note.

Never describe inventory as silently overwritten. Inventory changes must have corresponding movements. Document insufficient-stock conflicts when the workflow enforces them.

## Snapshots and history

Transactions retain customer snapshot fields. Transaction items retain product brand, weight, unit price, cost price, and line total snapshots. Historical API representations must not depend on the current product or customer master record for these values.

## Loans

Loan statuses are `BORROWED`, `PARTIAL_RETURNED`, `RETURNED`, `OVERDUE`, and `CANCELLED`. Verify partial-return quantities, remaining quantities, and eligible source loan behavior from current implementation before specifying a return endpoint.

## Products and access

- Product deletion is a soft delete represented by `isActive = false`.
- MVP access is `ADMIN`, while authorization descriptions and schemas should remain extensible to future `STAFF`, `RIDER`, and `ACCOUNTANT` roles.
- Never expose password hashes.

