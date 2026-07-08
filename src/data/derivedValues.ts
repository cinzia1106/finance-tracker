import type {
  AccountBalanceRow,
  AssetOverview,
  CreditCardSummary,
  InvestmentSummary,
  LiabilityRow,
  MonthOverview,
  SafelineSummary,
  TransactionRow,
} from './adapter';
import { budgetedExpenseCategories, categoryGroupFor } from './categoryDefinitions';
import type {
  Account,
  AssetSnapshot,
  ImportBatch,
  LiabilitySnapshot,
  Transaction,
  UserSettings,
} from '../types/models';

const DEFAULT_SETTINGS: UserSettings = {
  emergencyFundMonths: 3,
};

const SOURCE_LABELS = {
  manual_check: 'manual',
  statement: 'statement',
  import_derived: 'import',
} as const;

function monthDateRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, end };
}

function endOfMonth(year: number, month: number) {
  return new Date(year, month, 0).toISOString().slice(0, 10);
}

function formatMonthDay(date: string | null | undefined) {
  if (!date) return '--';
  const [, month, day] = date.split('-');
  return month && day ? `${month}/${day}` : '--';
}

function formatYearMonth(date: string | null | undefined) {
  if (!date) return '--';
  const [year, month] = date.split('-');
  return year && month ? `${year}/${month}` : '--';
}

function daysBetween(a: string, b: string) {
  const aTime = new Date(`${a}T00:00:00Z`).valueOf();
  const bTime = new Date(`${b}T00:00:00Z`).valueOf();
  return Math.floor((bTime - aTime) / 86_400_000);
}

function latestByKey<T extends { date: string }>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T>();
  for (const row of [...rows].sort((a, b) => b.date.localeCompare(a.date))) {
    const k = key(row);
    if (!map.has(k)) map.set(k, row);
  }
  return [...map.values()];
}

function sum(rows: Transaction[]) {
  return rows.reduce((total, tx) => total + tx.amount, 0);
}

function groupTransactions(
  rows: Transaction[],
  key: (tx: Transaction) => string,
): Map<string, Transaction[]> {
  const map = new Map<string, Transaction[]>();
  for (const row of rows) {
    const k = key(row);
    map.set(k, [...(map.get(k) ?? []), row]);
  }
  return map;
}

function accountLabel(tx: Transaction) {
  if (tx.type === 'transfer') {
    return tx.toAccount ? `${tx.account} -> ${tx.toAccount}` : tx.account;
  }
  return tx.account;
}

function accountTypeFor(tx: Transaction, accountsById: Map<string, Account>, accountsByName: Map<string, Account>) {
  const account =
    (tx.accountId ? accountsById.get(tx.accountId) : undefined) ?? accountsByName.get(tx.account);
  return account?.type;
}

function isInvestmentAccount(account: Account | undefined) {
  return account?.type === 'virtual';
}

function buildInvestmentSummary(
  transactions: Transaction[],
  assetSnapshots: AssetSnapshot[],
  accounts: Account[],
  monthStart: string,
  monthEnd: string,
): InvestmentSummary {
  const accountsById = new Map(
    accounts.flatMap((account) => (account.id ? [[account.id, account] as const] : [])),
  );
  const accountsByName = new Map(accounts.map((account) => [account.name, account]));
  const investmentTransfers = transactions.filter((tx) => {
    if (tx.type !== 'transfer') return false;
    const from = tx.accountId ? accountsById.get(tx.accountId) : accountsByName.get(tx.account);
    const to = tx.toAccountId ? accountsById.get(tx.toAccountId) : accountsByName.get(tx.toAccount ?? '');
    return isInvestmentAccount(from) || isInvestmentAccount(to);
  });
  const inbound = investmentTransfers.filter((tx) => {
    const to = tx.toAccountId ? accountsById.get(tx.toAccountId) : accountsByName.get(tx.toAccount ?? '');
    return isInvestmentAccount(to);
  });
  const outbound = investmentTransfers.filter((tx) => {
    const from = tx.accountId ? accountsById.get(tx.accountId) : accountsByName.get(tx.account);
    return isInvestmentAccount(from);
  });
  const latestInvestments = latestByKey(
    assetSnapshots.filter((snapshot) => snapshot.marketValue != null || snapshot.costBasis != null),
    (snapshot) => snapshot.accountId ?? snapshot.account ?? snapshot.id,
  );
  const marketValue = latestInvestments.reduce(
    (total, snapshot) => total + (snapshot.marketValue ?? snapshot.balance),
    0,
  );
  const costBasisFromSnapshots = latestInvestments.reduce(
    (total, snapshot) => total + (snapshot.costBasis ?? 0),
    0,
  );
  const netInvested =
    inbound.reduce((total, tx) => total + Math.abs(tx.amount), 0) -
    outbound.reduce((total, tx) => total + Math.abs(tx.amount), 0);
  const monthlyBuy = inbound
    .filter((tx) => tx.date >= monthStart && tx.date < monthEnd)
    .reduce((total, tx) => total + Math.abs(tx.amount), 0);
  const dividendTotal = transactions
    .filter((tx) => tx.type === 'income' && /股息|dividend/i.test(`${tx.category} ${tx.note}`))
    .reduce((total, tx) => total + tx.amount, 0);
  const costBasis = costBasisFromSnapshots || netInvested;
  const unrealizedGain = marketValue - costBasis;

  return {
    netInvested,
    marketValue,
    snapshotDate: formatMonthDay(latestInvestments[0]?.date),
    unrealizedGain,
    unrealizedGainPct: costBasis ? Math.round((unrealizedGain / costBasis) * 1000) / 10 : 0,
    monthlyBuy,
    dividendTotal,
  };
}

function buildSafeline(
  cashAndBank: number,
  monthlyEssentialExpense: number,
  settings: UserSettings,
  confirmedAt: string,
): SafelineSummary {
  const months = settings.emergencyFundMonths || DEFAULT_SETTINGS.emergencyFundMonths;
  return {
    balance: cashAndBank,
    confirmedAt,
    firstLine: monthlyEssentialExpense * months,
    comfortLine: monthlyEssentialExpense * Math.max(months + 2, 5),
  };
}

function buildCreditCardSummary(
  transactions: Transaction[],
  accounts: Account[],
  debtSnapshots: LiabilitySnapshot[],
): CreditCardSummary {
  const accountsById = new Map(
    accounts.flatMap((account) => (account.id ? [[account.id, account] as const] : [])),
  );
  const accountsByName = new Map(accounts.map((account) => [account.name, account]));
  const charged = transactions
    .filter((tx) => tx.type === 'expense' && accountTypeFor(tx, accountsById, accountsByName) === 'credit_card')
    .reduce((total, tx) => total + tx.amount, 0);
  const latestDebt = latestByKey(debtSnapshots, (snapshot) => snapshot.account ?? snapshot.name)[0];
  const subscriptionRows = transactions.filter(
    (tx) => tx.type === 'expense' && tx.category === '訂閱',
  );

  return {
    charged,
    due: latestDebt?.remainingBalance ?? 0,
    dueDate: formatMonthDay(latestDebt?.nextDueDate),
    dueNote: latestDebt ? 'scheduled' : '',
    subscriptionCount: subscriptionRows.length,
    subscriptionTotal: subscriptionRows.reduce((total, tx) => total + tx.amount, 0),
  };
}

export function buildMonthOverview(input: {
  year: number;
  month: number;
  transactions: Transaction[];
  allTransactions: Transaction[];
  accounts: Account[];
  assetSnapshots: AssetSnapshot[];
  debtSnapshots: LiabilitySnapshot[];
  importBatches: ImportBatch[];
  settings?: UserSettings;
}): MonthOverview {
  const { start, end } = monthDateRange(input.year, input.month);
  const settings = input.settings ?? DEFAULT_SETTINGS;
  const incomeRows = input.transactions.filter((tx) => tx.type === 'income');
  const expenseRows = input.transactions.filter((tx) => tx.type === 'expense');
  const transferRows = input.transactions.filter((tx) => tx.type === 'transfer');
  const expense = sum(expenseRows);
  const income = sum(incomeRows);
  const incomeBySource = [...groupTransactions(incomeRows, (tx) => tx.category || 'Uncategorized').entries()]
    .map(([source, rows]) => ({ source, amount: sum(rows) }))
    .sort((a, b) => b.amount - a.amount);
  const groupedExpense = groupTransactions(expenseRows, (tx) => categoryGroupFor(tx.category));
  const expenseGroups = [
    { key: 'fixed' as const, label: 'Fixed', amount: sum(groupedExpense.get('fixed') ?? []) },
    { key: 'variable' as const, label: 'Variable', amount: sum(groupedExpense.get('variable') ?? []) },
    { key: 'growth' as const, label: 'Growth', amount: sum(groupedExpense.get('growth') ?? []) },
  ];
  const budgets = budgetedExpenseCategories().map((category) => ({
    category: category.name,
    spent: expenseRows
      .filter((tx) => tx.category === category.name)
      .reduce((total, tx) => total + tx.amount, 0),
    budget: category.budget ?? 0,
  }));
  const accountSnapshots = buildAccountRows({
    accounts: input.accounts,
    assetSnapshots: input.assetSnapshots,
    debtSnapshots: input.debtSnapshots,
    throughDate: endOfMonth(input.year, input.month),
  });
  const cashAndBank = accountSnapshots.cashAndBank;
  const essentialExpense = expenseGroups.find((group) => group.key === 'fixed')?.amount ?? 0;
  const safeline = buildSafeline(cashAndBank, essentialExpense, settings, accountSnapshots.confirmedAt);
  const latestImport = [...input.importBatches].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  const recentTransactions: TransactionRow[] = input.transactions.slice(0, 5).map((tx) => ({
    id: tx.id,
    date: formatMonthDay(tx.date),
    category: tx.category || 'Uncategorized',
    note: tx.note,
    tag: tx.tags[0],
    account: accountLabel(tx),
    amount: tx.type === 'expense' ? -Math.abs(tx.amount) : Math.abs(tx.amount),
    type: tx.type,
    status: tx.status,
  }));

  return {
    year: input.year,
    month: input.month,
    phaseNote: 'Derived values active',
    lastImportNote: latestImport ? `${formatMonthDay(latestImport.createdAt.slice(0, 10))} CSV` : null,
    needsReviewCount: input.transactions.filter((tx) => tx.status === 'needs_review').length,
    income,
    expense,
    transferCount: transferRows.length,
    incomeBySource,
    expenseGroups,
    budgets,
    creditCard: buildCreditCardSummary(input.transactions, input.accounts, input.debtSnapshots),
    safeline,
    investment: buildInvestmentSummary(
      input.allTransactions,
      input.assetSnapshots,
      input.accounts,
      start,
      end,
    ),
    inboxPreview: input.transactions
      .filter(
        (tx): tx is Transaction & { type: 'expense' | 'income' } =>
          tx.status === 'needs_review' && (tx.type === 'expense' || tx.type === 'income'),
      )
      .slice(0, 2)
      .map((tx) => ({
        note: tx.note,
        amount: Math.abs(tx.amount),
        type: tx.type,
      })),
    recentTransactions,
  };
}

function buildAccountRows(input: {
  accounts: Account[];
  assetSnapshots: AssetSnapshot[];
  debtSnapshots: LiabilitySnapshot[];
  throughDate: string;
}) {
  const latestAssets = latestByKey(
    input.assetSnapshots,
    (snapshot) => snapshot.accountId ?? snapshot.account ?? snapshot.id,
  );
  const latestDebts = latestByKey(input.debtSnapshots, (snapshot) => snapshot.account ?? snapshot.name);
  const snapshotsByAccountId = new Map(latestAssets.map((snapshot) => [snapshot.accountId, snapshot]));
  const debtByAccountId = new Map(latestDebts.map((snapshot) => [snapshot.account, snapshot]));
  let cashAndBank = 0;
  let confirmedAt = '--';

  const accounts: AccountBalanceRow[] = input.accounts.map((account) => {
    const assetSnapshot = account.id ? snapshotsByAccountId.get(account.id) : undefined;
    const debtSnapshot = account.id ? debtByAccountId.get(account.id) : undefined;
    const snapshot = assetSnapshot ?? undefined;
    const isLiability = account.type === 'credit_card';
    const stale = snapshot ? daysBetween(snapshot.date, input.throughDate) > 90 : true;
    const balance = isLiability
      ? debtSnapshot?.remainingBalance ?? null
      : stale
        ? null
        : snapshot?.balance ?? null;
    if ((account.type === 'cash' || account.type === 'bank') && typeof balance === 'number') {
      cashAndBank += balance;
    }
    if (snapshot?.date && (confirmedAt === '--' || snapshot.date > confirmedAt)) {
      confirmedAt = snapshot.date;
    }

    return {
      name: account.name,
      detail: account.note,
      accountType: account.type,
      typeLabel: account.type,
      balance,
      isLiability,
      confirmedAt: stale ? formatYearMonth(snapshot?.date) : formatMonthDay(snapshot?.date),
      sourceLabel: snapshot ? SOURCE_LABELS[snapshot.source] : '',
      stale,
    };
  });

  return {
    accounts,
    latestAssets,
    latestDebts,
    cashAndBank,
    confirmedAt: formatMonthDay(confirmedAt),
  };
}

export function buildAssetOverview(input: {
  accounts: Account[];
  allTransactions: Transaction[];
  assetSnapshots: AssetSnapshot[];
  debtSnapshots: LiabilitySnapshot[];
  settings?: UserSettings;
  today?: string;
}): AssetOverview {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const current = buildAccountRows({
    accounts: input.accounts,
    assetSnapshots: input.assetSnapshots.filter((snapshot) => snapshot.date <= today),
    debtSnapshots: input.debtSnapshots.filter((snapshot) => snapshot.date <= today),
    throughDate: today,
  });
  const latestInvestments = current.latestAssets.filter(
    (snapshot) => snapshot.marketValue != null || snapshot.costBasis != null,
  );
  const investmentValue = latestInvestments.reduce(
    (total, snapshot) => total + (snapshot.marketValue ?? snapshot.balance),
    0,
  );
  const investmentSnapshotDate = formatMonthDay(latestInvestments[0]?.date);
  const liabilities = current.latestDebts.map<LiabilityRow>((snapshot) => ({
    name: snapshot.name,
    detail: snapshot.nextDueDate ? `due ${formatMonthDay(snapshot.nextDueDate)}` : undefined,
    remaining: snapshot.remainingBalance,
  }));
  const liabilityTotal = current.latestDebts.reduce((total, snapshot) => total + snapshot.remainingBalance, 0);
  const essentialMonthly = input.allTransactions
    .filter((tx) => tx.type === 'expense' && categoryGroupFor(tx.category) === 'fixed')
    .reduce((total, tx) => total + tx.amount, 0) / 12;
  const safeline = buildSafeline(
    current.cashAndBank,
    Math.max(Math.round(essentialMonthly), 0),
    input.settings ?? DEFAULT_SETTINGS,
    current.confirmedAt,
  );
  const disposableCash = Math.max(current.cashAndBank - Math.round(essentialMonthly), 0);
  const netWorth = current.cashAndBank + investmentValue - liabilityTotal;
  const history = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - (5 - index), 1);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const label = `${month}`;
    const throughDate = endOfMonth(year, month);
    const rows = buildAccountRows({
      accounts: input.accounts,
      assetSnapshots: input.assetSnapshots.filter((snapshot) => snapshot.date <= throughDate),
      debtSnapshots: input.debtSnapshots.filter((snapshot) => snapshot.date <= throughDate),
      throughDate,
    });
    const monthInvestment = rows.latestAssets
      .filter((snapshot) => snapshot.marketValue != null || snapshot.costBasis != null)
      .reduce((total, snapshot) => total + (snapshot.marketValue ?? snapshot.balance), 0);
    const monthDebt = rows.latestDebts.reduce((total, snapshot) => total + snapshot.remainingBalance, 0);
    return { label, value: rows.cashAndBank + monthInvestment - monthDebt };
  });
  const previous = history.at(-2)?.value ?? netWorth;

  return {
    netWorth,
    netWorthDeltaFromLastMonth: netWorth - previous,
    cashAndBank: current.cashAndBank,
    investmentValue,
    investmentSnapshotDate,
    liabilityTotal,
    disposableCash,
    netWorthHistory: history,
    safeline,
    accounts: current.accounts,
    liabilities,
    investment: buildInvestmentSummary(
      input.allTransactions,
      input.assetSnapshots,
      input.accounts,
      `${today.slice(0, 7)}-01`,
      today,
    ),
  };
}
