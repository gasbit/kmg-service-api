import type { ITEM_ACTIONS, TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../../constants/transaction.constants";

export type TransactionType = (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES];
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[keyof typeof TRANSACTION_STATUSES];
export type ItemAction = (typeof ITEM_ACTIONS)[keyof typeof ITEM_ACTIONS];
