import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "../../config/database";
import { ACTIVE_LOAN_STATUSES, LOAN_STATUSES } from "../../constants/loan.constants";
import type { DatabaseClient } from "../transactions/transaction.types";
import {
  loanDetailInclude,
  loanSummaryInclude,
  returnSourceSelect,
  type LoanListRepositoryInput,
  type LoanRepository
} from "./loan.types";

const asId = (value: string | bigint) => typeof value === "bigint" ? value : BigInt(value);

function overduePredicate(businessDate: string): Prisma.Sql {
  return Prisma.sql`
    cl.expected_return_date IS NOT NULL
    AND cl.expected_return_date < CAST(${businessDate} AS date)
    AND cl.quantity > cl.returned_quantity
    AND cl.loan_status NOT IN (${LOAN_STATUSES.RETURNED}, ${LOAN_STATUSES.CANCELLED})
  `;
}

function listWhere(input: LoanListRepositoryInput): Prisma.Sql {
  const clauses: Prisma.Sql[] = [];
  if (input.activeOnly) {
    clauses.push(Prisma.sql`
      cl.quantity > cl.returned_quantity
      AND cl.loan_status IN (${Prisma.join(ACTIVE_LOAN_STATUSES)})
    `);
  }
  if (input.status) clauses.push(Prisma.sql`cl.loan_status = ${input.status}`);
  if (input.isOverdue !== undefined) {
    const overdue = overduePredicate(input.businessDate);
    clauses.push(input.isOverdue ? overdue : Prisma.sql`NOT (${overdue})`);
  }
  if (input.search) {
    const pattern = `%${input.search}%`;
    clauses.push(Prisma.sql`
      (
        cl.customer_name_snapshot ILIKE ${pattern}
        OR cl.customer_phone_snapshot ILIKE ${pattern}
        OR original_item.product_brand_snapshot ILIKE ${pattern}
      )
    `);
  }
  return clauses.length ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}` : Prisma.empty;
}

export class PrismaLoanRepository implements LoanRepository {
  constructor(private readonly database: PrismaClient = prisma) {}

  async list(input: LoanListRepositoryInput) {
    const where = listWhere(input);
    const offset = (input.page - 1) * input.limit;
    const order = input.activeOnly
      ? Prisma.sql`
          CASE WHEN ${overduePredicate(input.businessDate)} THEN 1 ELSE 0 END DESC,
          cl.expected_return_date ASC NULLS LAST,
          cl.borrowed_date ASC,
          cl.id ASC
        `
      : Prisma.sql`cl.created_at DESC, cl.id DESC`;

    const [idRows, countRows] = await Promise.all([
      this.database.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT cl.id
        FROM cylinder_loans cl
        JOIN transaction_items original_item ON original_item.id = cl.transaction_item_id
        ${where}
        ORDER BY ${order}
        LIMIT ${input.limit}
        OFFSET ${offset}
      `),
      this.database.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM cylinder_loans cl
        JOIN transaction_items original_item ON original_item.id = cl.transaction_item_id
        ${where}
      `)
    ]);

    const ids = idRows.map((row) => row.id);
    if (!ids.length) return { loans: [], totalItems: Number(countRows[0]?.total ?? 0) };
    const records = await this.database.cylinderLoan.findMany({
      where: { id: { in: ids } },
      include: loanSummaryInclude
    });
    const orderById = new Map(ids.map((id, index) => [id.toString(), index]));
    records.sort((left, right) =>
      (orderById.get(left.id.toString()) ?? 0) - (orderById.get(right.id.toString()) ?? 0)
    );
    return { loans: records, totalItems: Number(countRows[0]?.total ?? 0) };
  }

  findDetail(loanId: string | bigint, client?: DatabaseClient) {
    const database = client ?? this.database;
    return database.cylinderLoan.findUnique({
      where: { id: asId(loanId) },
      include: loanDetailInclude
    });
  }

  findReturnSource(loanId: bigint, client: DatabaseClient) {
    return client.cylinderLoan.findUnique({
      where: { id: loanId },
      select: returnSourceSelect
    });
  }

  async claimReturn(loanId: bigint, quantity: number, returnedDate: string, client: DatabaseClient): Promise<boolean> {
    const affected = await client.$executeRaw`
      UPDATE cylinder_loans
      SET
        returned_quantity = returned_quantity + ${quantity},
        loan_status = CASE
          WHEN returned_quantity + ${quantity} = quantity THEN ${LOAN_STATUSES.RETURNED}
          WHEN loan_status = ${LOAN_STATUSES.OVERDUE} THEN ${LOAN_STATUSES.OVERDUE}
          ELSE ${LOAN_STATUSES.PARTIAL_RETURNED}
        END,
        returned_date = CASE
          WHEN returned_quantity + ${quantity} = quantity THEN CAST(${returnedDate} AS date)
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE id = ${loanId}
        AND loan_status IN (${Prisma.join(ACTIVE_LOAN_STATUSES)})
        AND returned_quantity + ${quantity} <= quantity
    `;
    return affected === 1;
  }
}
