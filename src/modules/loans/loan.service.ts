import { AppError } from "../../shared/errors/app-error";
import { ERROR_CODES } from "../../shared/errors/error-codes";
import { bangkokBusinessDate, systemClock, type Clock } from "../../shared/utils/date";
import { mapLoanDetail, mapLoanSummary } from "./loan.mapper";
import { PrismaLoanRepository } from "./loan.repository";
import type { ListActiveLoansInput, ListLoansInput } from "./loan.schema";
import type { LoanDetailDto, LoanRepository } from "./loan.types";

const loanNotFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, "Loan not found");

export class LoanService {
  constructor(
    private readonly repository: LoanRepository = new PrismaLoanRepository(),
    private readonly clock: Clock = systemClock
  ) {}

  async list(input: ListLoansInput) {
    return this.listWithMode(input, false);
  }

  async listActive(input: ListActiveLoansInput) {
    return this.listWithMode(input, true);
  }

  private async listWithMode(
    input: ListLoansInput | ListActiveLoansInput,
    activeOnly: boolean
  ) {
    const businessDate = bangkokBusinessDate(this.clock.now());
    const result = await this.repository.list({
      ...input,
      activeOnly,
      businessDate
    });
    return {
      loans: result.loans.map((loan) => mapLoanSummary(loan, businessDate)),
      pagination: {
        page: input.page,
        limit: input.limit,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / input.limit)
      }
    };
  }

  async get(loanId: string): Promise<LoanDetailDto> {
    const loan = await this.repository.findDetail(loanId);
    if (!loan) throw loanNotFound();
    return mapLoanDetail(loan, bangkokBusinessDate(this.clock.now()));
  }
}
