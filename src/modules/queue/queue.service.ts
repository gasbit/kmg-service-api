import type { AuthenticatedRequestUser } from "../../shared/types/auth.types";
import { bangkokBusinessDate, systemClock, type Clock } from "../../shared/utils/date";
import { TransactionService } from "../transactions/transaction.service";
import { mapQueueEntry, mapTransactionDetailToQueue } from "./queue.mapper";
import { PrismaQueueRepository } from "./queue.repository";
import type {
  ListQueueByDateInput,
  ListTodayQueueInput,
  UpdateQueueStatusInput
} from "./queue.schema";
import type { QueueListResult, QueueRepository, QueueStatusService } from "./queue.types";

export class QueueService {
  constructor(
    private readonly repository: QueueRepository = new PrismaQueueRepository(),
    private readonly clock: Clock = systemClock,
    private readonly transactionService: QueueStatusService = new TransactionService()
  ) {}

  listToday(input: ListTodayQueueInput): Promise<QueueListResult> {
    return this.listForDate(bangkokBusinessDate(this.clock.now()), input.status);
  }

  listByDate(input: ListQueueByDateInput): Promise<QueueListResult> {
    return this.listForDate(input.date, input.status);
  }

  private async listForDate(
    queueDate: string,
    status?: ListTodayQueueInput["status"]
  ): Promise<QueueListResult> {
    const records = await this.repository.listByDate({ queueDate, ...(status ? { status } : {}) });
    return { queueDate, queues: records.map(mapQueueEntry) };
  }

  async updateStatus(
    transactionId: string,
    input: UpdateQueueStatusInput,
    currentUser: AuthenticatedRequestUser
  ) {
    const transaction = await this.transactionService.changeQueueStatus(transactionId, input, currentUser);
    return mapTransactionDetailToQueue(transaction);
  }
}
