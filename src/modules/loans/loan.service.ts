import { LOAN_STATUSES } from "../../constants/inventory.constants";
import { ITEM_ACTIONS, TRANSACTION_TYPES } from "../../constants/transaction.constants";
import { AppError } from "../../shared/errors/AppError";
import { ERROR_CODES } from "../../shared/errors/error-codes";
import type { AuthUser } from "../../shared/types/auth-user.type";
import { TransactionService } from "../transactions/transaction.service";
import type { ListLoansQuery, ReturnLoanInput } from "./loan.schema";
import { LoanRepository } from "./loan.repository";

export class LoanService {
  constructor(
    private readonly loanRepository = new LoanRepository(),
    private readonly transactionService = new TransactionService()
  ) {}

  async list(query: ListLoansQuery) {
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.loanRepository.list({ ...query, skip, take: query.limit }),
      this.loanRepository.count(query)
    ]);
    return { items, page: query.page, limit: query.limit, total };
  }

  active() {
    return this.loanRepository.active();
  }

  async get(id: bigint) {
    const loan = await this.loanRepository.findById(id);
    if (!loan) throw new AppError(ERROR_CODES.NOT_FOUND, "Loan not found", 404);
    return loan;
  }

  async returnLoan(id: bigint, input: ReturnLoanInput, currentUser: AuthUser) {
    const loan = await this.get(id);
    const activeStatuses: string[] = [LOAN_STATUSES.BORROWED, LOAN_STATUSES.PARTIAL_RETURNED, LOAN_STATUSES.OVERDUE];
    if (!activeStatuses.includes(loan.loanStatus)) {
      throw new AppError(ERROR_CODES.CONFLICT, "Loan is not active", 409);
    }
    if (input.quantity > loan.quantity) {
      throw new AppError(ERROR_CODES.CONFLICT, "Return quantity exceeds borrowed quantity", 409);
    }

    return this.transactionService.create(
      {
        transactionType: TRANSACTION_TYPES.RETURN_CYLINDER,
        customerId: loan.customerId ?? undefined,
        customerName: loan.customerNameSnapshot,
        customerPhone: loan.customerPhoneSnapshot ?? undefined,
        customerAddress: loan.customerAddressSnapshot ?? undefined,
        note: input.note,
        depositAmount: 0,
        items: [
          {
            productId: loan.productId,
            quantity: input.quantity,
            itemAction: ITEM_ACTIONS.RETURN,
            unitPrice: 0,
            costPrice: 0,
            note: `Return loan ${loan.id.toString()}`
          }
        ]
      },
      currentUser
    );
  }
}
