/* DataAdapter — the seam between UI and the data layer.
   This round only the mock implementation exists; the real implementation
   will derive every value below from Transactions + Snapshots per
   spec-v2.1.md §5–§8 (localStorage/IndexedDB, CSV import). */

import type {
  Account,
  AssetSnapshot,
  ImportBatch,
  LiabilitySnapshot,
  Transaction,
  AccountType,
  UserSettings,
} from '../types/models';
import type { SyncQueueStats } from '../sync/syncQueue';

export type AccountDraft = Omit<Account, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};
export type TransactionDraft = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};
export type ImportBatchDraft = Omit<ImportBatch, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};
export type AssetSnapshotDraft = Omit<AssetSnapshot, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};
export type DebtSnapshotDraft = Omit<LiabilitySnapshot, 'id'> & {
  id?: string;
  accountId?: string | null;
};

export interface ExpenseGroupSummary {
  key: 'fixed' | 'variable' | 'growth';
  label: string;
  amount: number;
}

export interface BudgetSummary {
  category: string;
  spent: number;
  budget: number;
}

export interface IncomeSourceSummary {
  source: string;
  amount: number;
}

export interface CreditCardSummary {
  charged: number;
  due: number;
  dueDate: string; // MM/DD
  dueNote: string; // e.g. 郵局扣繳
  subscriptionCount: number;
  subscriptionTotal: number;
}

export interface SafelineSummary {
  balance: number;
  confirmedAt: string; // MM/DD
  firstLine: number; // 3 months essential spending
  comfortLine: number; // 5 months essential spending
}

export interface InvestmentSummary {
  netInvested: number;
  marketValue: number;
  snapshotDate: string; // MM/DD
  unrealizedGain: number;
  unrealizedGainPct: number;
  monthlyBuy: number;
  dividendTotal: number;
}

export interface TransactionRow {
  id: string;
  date: string; // MM/DD
  category: string;
  note: string;
  tag?: string;
  account: string; // transfer rows: "from → to"
  amount: number;
  type: 'expense' | 'income' | 'transfer';
  status: 'confirmed' | 'needs_review';
}

export interface InboxPreviewItem {
  note: string;
  amount: number;
  type: 'expense' | 'income';
}

export interface MonthOverview {
  year: number;
  month: number;
  phaseNote: string; // e.g. 月結進行中
  lastImportNote: string | null; // e.g. 07/02 · 郵局＋國泰 CSV
  needsReviewCount: number;
  income: number;
  expense: number;
  transferCount: number;
  incomeBySource: IncomeSourceSummary[];
  expenseGroups: ExpenseGroupSummary[];
  budgets: BudgetSummary[];
  creditCard: CreditCardSummary;
  safeline: SafelineSummary;
  investment: InvestmentSummary;
  inboxPreview: InboxPreviewItem[];
  recentTransactions: TransactionRow[];
}

export interface AccountBalanceRow {
  name: string;
  detail?: string; // e.g. 薪轉 · 預備金
  accountType: AccountType;
  currency: string;
  typeLabel: string; // 銀行 / 現金 / 投資 / 信用卡
  balance: number | null; // null = 待更新, excluded from net worth
  isLiability: boolean;
  confirmedAt: string; // MM/DD or YYYY/MM for stale
  sourceLabel: string; // 對帳單 / 手動 / 快照 / 帳單
  stale: boolean;
}

export interface LiabilityRow {
  name: string;
  detail?: string; // e.g. 月付 2,200 · 下期 07/20 · 剩 12 期
  remaining: number;
}

export interface NetWorthPoint {
  label: string; // e.g. 2月
  value: number;
}

export interface AssetOverview {
  netWorth: number;
  netWorthDeltaFromLastMonth: number;
  cashAndBank: number;
  investmentValue: number;
  investmentSnapshotDate: string;
  liabilityTotal: number;
  disposableCash: number;
  netWorthHistory: NetWorthPoint[];
  safeline: SafelineSummary;
  accounts: AccountBalanceRow[];
  liabilities: LiabilityRow[];
  investment: InvestmentSummary;
}

export interface DataAdapter {
  getMonthOverview(year: number, month: number): Promise<MonthOverview>;
  getAssetOverview(): Promise<AssetOverview>;
  getNeedsReviewCount(): Promise<number>;
  listAccounts?(): Promise<Account[]>;
  createAccount?(input: AccountDraft): Promise<Account>;
  updateAccount?(id: string, input: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Account>;
  deleteAccount?(id: string): Promise<void>;
  listTransactions?(year?: number, month?: number): Promise<Transaction[]>;
  listAssetSnapshots?(throughDate?: string): Promise<AssetSnapshot[]>;
  listDebtSnapshots?(throughDate?: string): Promise<LiabilitySnapshot[]>;
  createAssetSnapshot?(input: AssetSnapshotDraft): Promise<AssetSnapshot>;
  createDebtSnapshot?(input: DebtSnapshotDraft): Promise<LiabilitySnapshot>;
  getUserSettings?(): Promise<UserSettings>;
  updateUserSettings?(input: Partial<UserSettings>): Promise<UserSettings>;
  createTransaction?(input: TransactionDraft): Promise<Transaction>;
  updateTransaction?(
    id: string,
    input: Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Transaction>;
  deleteTransaction?(id: string): Promise<void>;
  createImportBatch?(input: ImportBatchDraft): Promise<ImportBatch>;
  updateImportBatch?(
    id: string,
    input: Partial<Omit<ImportBatch, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ImportBatch>;
  listImportBatches?(): Promise<ImportBatch[]>;
  rollbackImportBatch?(id: string): Promise<void>;
  cacheImportedTransactions?(transactions: Transaction[]): Promise<void>;
  flushPendingMutations?(): Promise<void>;
  getSyncQueueStats?(): Promise<SyncQueueStats>;
}
