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
import {
  DEFAULT_DASHBOARD_BUDGETS,
  budgetedExpenseCategories,
  canonicalExpenseCategoryForTransaction,
  categoryGroupForTransaction,
} from './categoryDefinitions';
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
  dashboardBudgets: DEFAULT_DASHBOARD_BUDGETS,
};

const SOURCE_LABELS = {
  manual_check: 'manual',
  statement: 'statement',
  import_derived: 'import',
} as const;

const DEFAULT_CURRENCY = 'TWD';
const CURRENCY_NOTE_RE = /\[currency:([A-Z]{3})\]/i;

function accountCurrency(account: Account) {
  const match = account.note?.match(CURRENCY_NOTE_RE);
  return (match?.[1] ?? DEFAULT_CURRENCY).toUpperCase();
}

function accountDetail(account: Account) {
  const note = account.note?.replace(CURRENCY_NOTE_RE, '').trim();
  const currency = accountCurrency(account);
  if (currency === DEFAULT_CURRENCY) return note || undefined;
  return note ? `${note} · ${currency}` : currency;
}

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

function addMonths(date: string, months: number) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result.toISOString().slice(0, 10);
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

function normalizeAccountName(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[－–—→>]/g, '-')
    .trim();
}

function normalizeMatchText(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/\s+/g, '');
}

function accountAliases(account: Account) {
  const noteAliases =
    account.note
      ?.match(/\[aliases?:([^\]]+)\]/i)?.[1]
      ?.split(/[,\n，、]/)
      .map((alias) => alias.trim())
      .filter(Boolean) ?? [];
  return [account.name, ...(account.note ? [account.note] : []), ...noteAliases]
    .map(normalizeAccountName)
    .filter(Boolean);
}

function accountForTransaction(
  tx: Transaction,
  accountsById: Map<string, Account>,
  accountAliasesByName: Map<string, Account>,
) {
  if (tx.accountId && accountsById.has(tx.accountId)) return accountsById.get(tx.accountId);
  const txAccount = normalizeAccountName(tx.account);
  if (accountAliasesByName.has(txAccount)) return accountAliasesByName.get(txAccount);
  for (const [alias, account] of accountAliasesByName) {
    if (txAccount && (alias.includes(txAccount) || txAccount.includes(alias))) return account;
  }
  return undefined;
}

function isCreditCardExpense(
  tx: Transaction,
  accountsById: Map<string, Account>,
  accountAliasesByName: Map<string, Account>,
) {
  if (tx.type !== 'expense') return false;
  if (accountForTransaction(tx, accountsById, accountAliasesByName)?.type === 'credit_card') {
    return true;
  }
  return /信用卡|credit\s*card|card/i.test(`${tx.account} ${tx.note} ${tx.tags.join(' ')}`);
}

function isCreditCardDebtSnapshot(snapshot: LiabilitySnapshot, accounts: Account[]) {
  if (snapshot.accountId && accounts.some((account) => account.id === snapshot.accountId && account.type === 'credit_card')) {
    return true;
  }
  const text = `${snapshot.name} ${snapshot.account ?? ''} ${snapshot.note ?? ''}`;
  if (!/信用卡|card/i.test(text)) return false;
  return !/分期|除毛|電腦|筆電|機車/i.test(text);
}

function isInvestmentAccount(account: Account | undefined) {
  return account?.type === 'virtual';
}

function parseDebtSchedule(note: string | undefined) {
  if (!note) return null;
  const total = Number(note.match(/total=(\d+)/)?.[1] ?? 0);
  const installments = Number(note.match(/installments=(\d+)/)?.[1] ?? 0);
  const remainingInstallments = note.match(/remaining_installments=(\d+)/)?.[1];
  const start = note.match(/start=(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!total || !installments || !start) return null;
  return {
    total,
    installments,
    start,
    remainingInstallments:
      remainingInstallments == null
        ? undefined
        : Math.max(0, Math.min(Number(remainingInstallments), installments)),
  };
}

function currentRemainingInstallmentOverride(snapshot: LiabilitySnapshot) {
  if (/除毛/.test(snapshot.name)) return 0;
  if (/電腦|筆電/.test(snapshot.name)) return 3;
  if (/機車/.test(snapshot.name)) return 12;
  return undefined;
}

function debtMatchTerms(snapshot: LiabilitySnapshot) {
  const normalizedName = normalizeMatchText(snapshot.name);
  const terms = new Set<string>();
  if (normalizedName) terms.add(normalizedName);
  for (const token of snapshot.name.split(/[\s/／｜|,，、()（）-]+/)) {
    const normalized = normalizeMatchText(token);
    if (normalized.length >= 2) terms.add(normalized);
  }
  if (/電腦|筆電/i.test(snapshot.name)) terms.add('設備');
  if (/機車/i.test(snapshot.name)) terms.add('機車');
  return [...terms];
}

function transactionMatchesDebt(tx: Transaction, snapshot: LiabilitySnapshot) {
  if (tx.type !== 'expense') return false;
  const haystack = normalizeMatchText(`${tx.note} ${tx.category} ${tx.tags.join(' ')}`);
  if (!haystack) return false;
  if (debtMatchTerms(snapshot).some((term) => haystack.includes(term))) return true;
  return /分期/.test(haystack) && /分期|電腦|筆電|機車/.test(snapshot.name);
}

export function reconcileDebtSnapshot(
  snapshot: LiabilitySnapshot,
  transactions: Transaction[],
  throughDate: string,
): LiabilitySnapshot {
  const schedule = parseDebtSchedule(snapshot.note);
  if (!schedule) return snapshot;
  const monthlyPayment = snapshot.monthlyPayment ?? Math.ceil(schedule.total / schedule.installments);
  const remainingInstallmentsOverride =
    schedule.remainingInstallments ?? currentRemainingInstallmentOverride(snapshot);
  if (remainingInstallmentsOverride != null) {
    const remainingBalance =
      remainingInstallmentsOverride === 0
        ? 0
        : Math.min(monthlyPayment * remainingInstallmentsOverride, schedule.total);
    const paidInstallments = Math.max(schedule.installments - remainingInstallmentsOverride, 0);
    return {
      ...snapshot,
      remainingBalance,
      monthlyPayment,
      nextDueDate:
        remainingInstallmentsOverride > 0 ? addMonths(schedule.start, paidInstallments) : undefined,
      note: `${snapshot.note}; remaining_installments=${remainingInstallmentsOverride}`,
    };
  }
  const paidRows = transactions.filter(
    (tx) =>
      tx.date >= schedule.start &&
      tx.date <= throughDate &&
      transactionMatchesDebt(tx, snapshot),
  );
  const paidAmountFromTransactions = paidRows.reduce((total, tx) => total + Math.abs(tx.amount), 0);
  if (paidAmountFromTransactions <= 0) return snapshot;

  const remainingBalance = Math.max(schedule.total - paidAmountFromTransactions, 0);
  const paidInstallments = Math.min(
    schedule.installments,
    Math.floor(paidAmountFromTransactions / Math.max(monthlyPayment, 1)),
  );

  return {
    ...snapshot,
    remainingBalance,
    monthlyPayment,
    nextDueDate:
      remainingBalance > 0 ? addMonths(schedule.start, paidInstallments) : undefined,
    note: `${snapshot.note}; reconciled_paid=${paidAmountFromTransactions}`,
  };
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
    .filter(
      (tx) =>
        tx.type === 'income' &&
        (tx.category === '投資收益' || /股利|股息|配息|利息|dividend/i.test(`${tx.tags.join(' ')} ${tx.note}`)),
    )
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
  monthStart: string,
  monthEnd: string,
): CreditCardSummary {
  const accountsById = new Map(
    accounts.flatMap((account) => (account.id ? [[account.id, account] as const] : [])),
  );
  const accountAliasesByName = new Map(
    accounts.flatMap((account) => accountAliases(account).map((alias) => [alias, account] as const)),
  );
  const charged = transactions
    .filter((tx) => isCreditCardExpense(tx, accountsById, accountAliasesByName))
    .reduce((total, tx) => total + tx.amount, 0);
  const creditCardDebts = latestByKey(
    debtSnapshots.filter((snapshot) => isCreditCardDebtSnapshot(snapshot, accounts)),
    (snapshot) => snapshot.accountId ?? snapshot.account ?? snapshot.name,
  );
  const currentPeriodDebt =
    creditCardDebts.find(
      (snapshot) =>
        snapshot.nextDueDate != null &&
        snapshot.nextDueDate >= monthStart &&
        snapshot.nextDueDate < monthEnd,
    ) ?? creditCardDebts.find((snapshot) => snapshot.date >= monthStart && snapshot.date < monthEnd);
  const subscriptionRows = transactions.filter(
    (tx) =>
      tx.type === 'expense' &&
      (tx.tags.some((tag) => tag.includes('訂閱')) || /訂閱|subscription/i.test(`${tx.category} ${tx.note}`)),
  );

  return {
    charged,
    due: currentPeriodDebt?.remainingBalance ?? 0,
    dueDate: formatMonthDay(currentPeriodDebt?.nextDueDate),
    dueNote: currentPeriodDebt ? '當期' : '',
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
  const settings = {
    ...DEFAULT_SETTINGS,
    ...input.settings,
    dashboardBudgets: {
      ...DEFAULT_DASHBOARD_BUDGETS,
      ...(input.settings?.dashboardBudgets ?? {}),
    },
  };
  const incomeRows = input.transactions.filter((tx) => tx.type === 'income');
  const expenseRows = input.transactions.filter((tx) => tx.type === 'expense');
  const transferRows = input.transactions.filter((tx) => tx.type === 'transfer');
  const expense = sum(expenseRows);
  const income = sum(incomeRows);
  const incomeBySource = [...groupTransactions(incomeRows, (tx) => tx.category || 'Uncategorized').entries()]
    .map(([source, rows]) => ({ source, amount: sum(rows) }))
    .sort((a, b) => b.amount - a.amount);
  const groupedExpense = groupTransactions(expenseRows, categoryGroupForTransaction);
  const expenseGroups = [
    { key: 'fixed' as const, label: '固定承諾', amount: sum(groupedExpense.get('fixed') ?? []) },
    { key: 'variable' as const, label: '日常變動', amount: sum(groupedExpense.get('variable') ?? []) },
    { key: 'growth' as const, label: '投資自己', amount: sum(groupedExpense.get('growth') ?? []) },
  ];
  const budgets = budgetedExpenseCategories(settings.dashboardBudgets).map((category) => ({
    category: category.name,
    spent: expenseRows
      .filter((tx) => canonicalExpenseCategoryForTransaction(tx) === category.name)
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
    amount:
      tx.type === 'transfer'
        ? Math.abs(tx.amount)
        : tx.type === 'expense'
          ? -tx.amount
          : tx.amount,
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
    creditCard: buildCreditCardSummary(input.transactions, input.accounts, input.debtSnapshots, start, end),
    safeline,
    investment: buildInvestmentSummary(
      input.allTransactions,
      input.assetSnapshots,
      input.accounts,
      start,
      end,
    ),
    inboxPreview: input.transactions
      .filter((tx) => tx.status === 'needs_review')
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
    const isLiability = account.type === 'credit_card';
    const effectiveDate = isLiability ? debtSnapshot?.date : assetSnapshot?.date;
    const effectiveSource = isLiability ? debtSnapshot?.source : assetSnapshot?.source;
    const stale = effectiveDate ? daysBetween(effectiveDate, input.throughDate) > 90 : true;
    const balance = isLiability
      ? debtSnapshot?.remainingBalance ?? null
      : stale
        ? null
        : assetSnapshot?.balance ?? null;
    if ((account.type === 'cash' || account.type === 'bank') && typeof balance === 'number') {
      cashAndBank += balance;
    }
    if (effectiveDate && (confirmedAt === '--' || effectiveDate > confirmedAt)) {
      confirmedAt = effectiveDate;
    }

    return {
      name: account.name,
      detail: accountDetail(account),
      accountType: account.type,
      currency: accountCurrency(account),
      typeLabel: account.type,
      balance,
      isLiability,
      confirmedAt: stale ? formatYearMonth(effectiveDate) : formatMonthDay(effectiveDate),
      sourceLabel: effectiveSource ? SOURCE_LABELS[effectiveSource] : '',
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
  const reconciledDebtSnapshots = input.debtSnapshots
    .filter((snapshot) => snapshot.date <= today)
    .map((snapshot) => reconcileDebtSnapshot(snapshot, input.allTransactions, today));
  const current = buildAccountRows({
    accounts: input.accounts,
    assetSnapshots: input.assetSnapshots.filter((snapshot) => snapshot.date <= today),
    debtSnapshots: reconciledDebtSnapshots,
    throughDate: today,
  });
  const latestInvestments = current.latestAssets.filter(
    (snapshot) =>
      (snapshot.marketValue != null || snapshot.costBasis != null) &&
      daysBetween(snapshot.date, today) <= 90,
  );
  const investmentValue = latestInvestments.reduce(
    (total, snapshot) => total + (snapshot.marketValue ?? snapshot.balance),
    0,
  );
  const investmentSnapshotDate = formatMonthDay(latestInvestments[0]?.date);
  const liabilities = current.latestDebts.map<LiabilityRow>((snapshot) => ({
    name: snapshot.name,
    detail: [
      snapshot.monthlyPayment ? `月付 ${snapshot.monthlyPayment.toLocaleString('en-US')}` : undefined,
      snapshot.nextDueDate ? `下期 ${formatMonthDay(snapshot.nextDueDate)}` : undefined,
    ]
      .filter(Boolean)
      .join(' · ') || undefined,
    remaining: snapshot.remainingBalance,
  }));
  const liabilityTotal = current.latestDebts.reduce((total, snapshot) => total + snapshot.remainingBalance, 0);
  const essentialMonthly = input.allTransactions
    .filter((tx) => tx.type === 'expense' && categoryGroupForTransaction(tx) === 'fixed')
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
    const monthDebtSnapshots = input.debtSnapshots
      .filter((snapshot) => snapshot.date <= throughDate)
      .map((snapshot) => reconcileDebtSnapshot(snapshot, input.allTransactions, throughDate));
    const rows = buildAccountRows({
      accounts: input.accounts,
      assetSnapshots: input.assetSnapshots.filter((snapshot) => snapshot.date <= throughDate),
      debtSnapshots: monthDebtSnapshots,
      throughDate,
    });
    const monthInvestment = rows.latestAssets
      .filter(
        (snapshot) =>
          (snapshot.marketValue != null || snapshot.costBasis != null) &&
          daysBetween(snapshot.date, throughDate) <= 90,
      )
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
