/* Data entities — single source of truth: spec-v2.1.md §4.
   These are the persistence-level shapes the future storage/import layer
   will produce; UI never hardcodes amounts derived from them. */

export type TransactionType = 'expense' | 'income' | 'transfer';
export type TransactionStatus = 'confirmed' | 'needs_review';
export type TransactionSource = 'manual' | 'import';

export interface Transaction {
  id: string;
  accountId?: string;
  toAccountId?: string | null;
  importBatchId?: string | null;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  amount: number; // TWD; refunds/reversals may be negative
  category: string;
  account: string;
  toAccount?: string; // transfer only
  note: string;
  tags: string[];
  status: TransactionStatus;
  source: TransactionSource;
  rawPayload?: Record<string, unknown>;
  createdAt: string; // ISO 8601
  updatedAt?: string;
}

export type ImportBatchStatus = 'uploaded' | 'processing' | 'completed' | 'failed';

export interface ImportBatch {
  id: string;
  source: string;
  status: ImportBatchStatus;
  fileName?: string | null;
  rowCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export type AccountType = 'cash' | 'bank' | 'credit_card' | 'virtual';

export interface Account {
  id?: string;
  name: string;
  type: AccountType;
  note?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CategoryGroup = 'fixed' | 'variable' | 'growth' | 'other';

export interface Category {
  name: string;
  kind: TransactionType;
  budget?: number | null;
  group?: CategoryGroup;
}

export type RecurringCycle = 'monthly' | 'semiannual' | 'yearly' | 'irregular';

export interface RecurringExpense {
  id?: string;
  name: string;
  amount: number | null;
  cycle: RecurringCycle;
  monthlyEquiv?: number | null;
  category: string;
  account: string;
  paymentAccount?: string;
  billingDay?: number | null;
  active: boolean;
  lastPaid?: string;
  nextDue?: string;
  note?: string;
}

export type SnapshotSource = 'manual_check' | 'statement' | 'import_derived';

export interface BalanceSnapshot {
  id: string;
  account: string;
  date: string;
  balance: number;
  source: SnapshotSource;
  note?: string;
}

export interface InvestmentSnapshot {
  id: string;
  date: string;
  account: string; // spec: 證券庫存
  costBasis: number;
  marketValue: number;
  dividendTotal?: number;
  source: 'manual_check' | 'statement';
  note?: string;
}

export interface LiabilitySnapshot {
  id: string;
  name: string;
  account?: string;
  date: string;
  remainingBalance: number;
  monthlyPayment?: number;
  nextDueDate?: string;
  source: 'manual_check' | 'statement';
  note?: string;
}
