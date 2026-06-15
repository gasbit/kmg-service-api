import { toDateOnly } from "../../shared/utils/date.util";
import type { AuthUser } from "../../shared/types/auth-user.type";
import type { ChangeTransactionStatusInput } from "../transactions/transaction.schema";
import { TransactionService } from "../transactions/transaction.service";
import { QueueRepository } from "./queue.repository";

export class QueueService {
  constructor(
    private readonly queueRepository = new QueueRepository(),
    private readonly transactionService = new TransactionService()
  ) {}

  today() {
    return this.queueRepository.listByDate(toDateOnly());
  }

  byDate(date: Date) {
    return this.queueRepository.listByDate(toDateOnly(date));
  }

  updateStatus(transactionId: bigint, input: ChangeTransactionStatusInput, currentUser: AuthUser) {
    return this.transactionService.changeStatus(transactionId, input, currentUser);
  }
}
