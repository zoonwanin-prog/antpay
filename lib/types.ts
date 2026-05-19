export type JsonRecord = Record<string, unknown>;

export type StatementDailyRow = {
  date: string;
  bank: string;
  account_no: string;
  deposit_total: number;
  withdraw_total: number;
  fee_total: number;
  ending_balance: number;
  failed_amount: number;
  failed_count: number;
  updated_at?: string;
};

export type AuditDetail = {
  id: string;
  amount: number;
  recipientName: string;
  recipientAccountNo: string;
  status: string;
  followupStatus: "paid" | "pending" | string;
  followupPaid: boolean;
  followupUpdatedAt: string;
  followupBy: string;
};

export type AuditRow = {
  date: string;
  openingBalance: number;
  bankDeposit: number;
  bankWithdraw: number;
  statementFee: number;
  sheetExpense: number;
  expectedBalance: number;
  actualBalance: number;
  diffBank: number;
  boDeposit: number;
  diffDeposit: number;
  boWithdraw: number;
  failedWithdraw: number;
  failedWithdrawCount: number;
  failedWithdrawPaid: number;
  failedWithdrawPaidCount: number;
  failedWithdrawPending: number;
  failedWithdrawPendingCount: number;
  failedWithdrawDetails: AuditDetail[];
  diffWithdraw: number;
  transferOnly: number;
  settlement: number;
  errorFollowTransfer: number;
  otherTransfer: number;
  capitalIn: number;
  capitalReturn: number;
  buyUSDTthb: number;
  buyUSDT: number;
  moveTotal: number;
  status: string;
};

export type TelegramTarget = {
  chatId: string;
  threadId?: string;
};
