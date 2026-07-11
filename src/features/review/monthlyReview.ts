import type { DataAdapter } from '../../data/adapter';
import { categoryGroupForTransaction } from '../../data/categoryDefinitions';
import { reconcileDebtSnapshot } from '../../data/derivedValues';
import type { AssetSnapshot, LiabilitySnapshot, Transaction } from '../../types/models';

export interface CategoryAmount {
  category: string;
  amount: number;
  group?: CategoryGroupAmount['group'];
}

export interface CategoryGroupAmount {
  group: 'fixed' | 'variable' | 'self-investment';
  amount: number;
}

export interface MonthlyReviewData {
  year: number;
  month: number;
  monthKey: string;
  previousMonthKey: string;
  income: number;
  expense: number;
  netCashFlow: number;
  previousIncome: number;
  previousExpense: number;
  previousNetCashFlow: number;
  incomeDelta: number;
  expenseDelta: number;
  netCashFlowDelta: number;
  expenseByCategory: CategoryAmount[];
  incomeByCategory: CategoryAmount[];
  categoryGroups: CategoryGroupAmount[];
  transferCount: number;
  transferAmount: number;
  refundCount: number;
  refundAmount: number;
  needsReviewCount: number;
  needsReviewTransactions: Transaction[];
  transactionCount: number;
  transactions: Transaction[];
  assetSummary: AssetMonthSummary;
  nextMonthAllocationPlaceholder: string;
}

export interface AssetMonthSummary {
  cashBalance: number;
  assetValue: number;
  debtBalance: number;
  netWorthEstimate: number;
  emergencyFundProgress: number;
  emergencyFundTarget: number;
  lastVerifiedDate: string | null;
  cashSnapshots: AssetSnapshot[];
  assetSnapshots: AssetSnapshot[];
  debtSnapshots: LiabilitySnapshot[];
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function previousMonth(year: number, month: number) {
  const date = new Date(year, month - 2, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function endOfMonth(year: number, month: number) {
  return new Date(year, month, 0).toISOString().slice(0, 10);
}

function groupByCategory(rows: Transaction[], includeGroup = false) {
  const map = new Map<string, number>();
  const groupByCategoryName = new Map<string, CategoryGroupAmount['group']>();
  for (const tx of rows) {
    const category = tx.category || 'Uncategorized';
    map.set(category, (map.get(category) ?? 0) + tx.amount);
    if (includeGroup && !groupByCategoryName.has(category)) {
      groupByCategoryName.set(category, classifyCategoryGroup(tx));
    }
  }
  return [...map.entries()]
    .map(([category, amount]) => ({
      category,
      amount,
      group: includeGroup ? groupByCategoryName.get(category) : undefined,
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

function classifyCategoryGroup(tx: Transaction): CategoryGroupAmount['group'] {
  const group = categoryGroupForTransaction(tx);
  if (group === 'fixed') return 'fixed';
  if (group === 'growth') return 'self-investment';
  return 'variable';
}

function categoryGroups(expenseRows: Transaction[]) {
  const groups: CategoryGroupAmount[] = [
    { group: 'fixed', amount: 0 },
    { group: 'variable', amount: 0 },
    { group: 'self-investment', amount: 0 },
  ];

  for (const tx of expenseRows) {
    const group = classifyCategoryGroup(tx);
    const row = groups.find((item) => item.group === group);
    if (row) row.amount += tx.amount;
  }

  return groups;
}

function latestByKey<T extends { date: string }>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T>();
  for (const row of [...rows].sort((a, b) => b.date.localeCompare(a.date))) {
    const k = key(row);
    if (!map.has(k)) map.set(k, row);
  }
  return [...map.values()];
}

function latestDate(rows: Array<{ date: string }>) {
  return rows.reduce<string | null>((latest, row) => {
    if (!latest || row.date > latest) return row.date;
    return latest;
  }, null);
}

function isCashLikeSnapshot(snapshot: AssetSnapshot) {
  return snapshot.marketValue == null && snapshot.costBasis == null;
}

function buildAssetSummary(
  snapshots: AssetSnapshot[],
  debtSnapshots: LiabilitySnapshot[],
  monthlyExpense: number,
): AssetMonthSummary {
  const latestAssets = latestByKey(snapshots, (snapshot) => snapshot.accountId ?? snapshot.account ?? snapshot.id);
  const latestDebts = latestByKey(debtSnapshots, (snapshot) => snapshot.account ?? snapshot.name);
  const cashSnapshots = latestAssets.filter(isCashLikeSnapshot);
  const investmentSnapshots = latestAssets.filter((snapshot) => !isCashLikeSnapshot(snapshot));
  const cashBalance = cashSnapshots.reduce((sum, snapshot) => sum + snapshot.balance, 0);
  const assetValue = investmentSnapshots.reduce(
    (sum, snapshot) => sum + (snapshot.marketValue ?? snapshot.balance),
    0,
  );
  const debtBalance = latestDebts.reduce((sum, snapshot) => sum + snapshot.remainingBalance, 0);
  const emergencyFundTarget = Math.max(monthlyExpense * 3, 0);

  return {
    cashBalance,
    assetValue,
    debtBalance,
    netWorthEstimate: cashBalance + assetValue - debtBalance,
    emergencyFundProgress:
      emergencyFundTarget > 0 ? Math.min(cashBalance / emergencyFundTarget, 1) : 0,
    emergencyFundTarget,
    lastVerifiedDate: latestDate([...latestAssets, ...latestDebts]),
    cashSnapshots,
    assetSnapshots: investmentSnapshots,
    debtSnapshots: latestDebts,
  };
}

function summarizeTransactions(rows: Transaction[]) {
  const incomeRows = rows.filter((tx) => tx.type === 'income');
  const expenseRows = rows.filter((tx) => tx.type === 'expense');
  const transferRows = rows.filter((tx) => tx.type === 'transfer');
  const needsReviewTransactions = rows.filter((tx) => tx.status === 'needs_review');
  const refundRows = expenseRows.filter((tx) => tx.amount < 0);
  const income = incomeRows.reduce((sum, tx) => sum + tx.amount, 0);
  const expense = expenseRows.reduce((sum, tx) => sum + tx.amount, 0);

  return {
    incomeRows,
    expenseRows,
    transferRows,
    needsReviewTransactions,
    refundRows,
    income,
    expense,
    netCashFlow: income - expense,
  };
}

export async function buildMonthlyReviewData(
  adapter: DataAdapter,
  year: number,
  month: number,
): Promise<MonthlyReviewData> {
  if (!adapter.listTransactions) {
    throw new Error('Transaction data source is not ready.');
  }

  const prev = previousMonth(year, month);
  const monthEnd = endOfMonth(year, month);
  const [transactions, previousTransactions, allTransactions, assetSnapshots, debtSnapshots] = await Promise.all([
    adapter.listTransactions(year, month),
    adapter.listTransactions(prev.year, prev.month),
    adapter.listTransactions(),
    adapter.listAssetSnapshots?.(monthEnd) ?? Promise.resolve([]),
    adapter.listDebtSnapshots?.(monthEnd) ?? Promise.resolve([]),
  ]);

  const current = summarizeTransactions(transactions);
  const previous = summarizeTransactions(previousTransactions);
  const reconciledDebtSnapshots = debtSnapshots.map((snapshot) =>
    reconcileDebtSnapshot(snapshot, allTransactions, monthEnd),
  );
  const assetSummary = buildAssetSummary(assetSnapshots, reconciledDebtSnapshots, current.expense);

  return {
    year,
    month,
    monthKey: monthKey(year, month),
    previousMonthKey: monthKey(prev.year, prev.month),
    income: current.income,
    expense: current.expense,
    netCashFlow: current.netCashFlow,
    previousIncome: previous.income,
    previousExpense: previous.expense,
    previousNetCashFlow: previous.netCashFlow,
    incomeDelta: current.income - previous.income,
    expenseDelta: current.expense - previous.expense,
    netCashFlowDelta: current.netCashFlow - previous.netCashFlow,
    expenseByCategory: groupByCategory(current.expenseRows, true),
    incomeByCategory: groupByCategory(current.incomeRows),
    categoryGroups: categoryGroups(current.expenseRows),
    transferCount: current.transferRows.length,
    transferAmount: current.transferRows.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
    refundCount: current.refundRows.length,
    refundAmount: current.refundRows.reduce((sum, tx) => sum + tx.amount, 0),
    needsReviewCount: current.needsReviewTransactions.length,
    needsReviewTransactions: current.needsReviewTransactions,
    transactionCount: transactions.length,
    transactions,
    assetSummary,
    nextMonthAllocationPlaceholder: 'Pending review.',
  };
}
