/* Investment page view-model builder — display-layer derivation over the
   existing adapter data. Mirrors the data-layer rules: an investment
   account is `type === 'virtual'`; buys are transfers into it, sells out
   of it; dividends are income tagged/categorised as investment income.
   Per-ticker holdings are NOT in the data model, so holdings here are the
   investment account-level snapshots. */

import type { InvestmentSummary } from '../../data/adapter';
import type { Account, AssetSnapshot, Transaction } from '../../types/models';

export interface InvestHistoryPoint {
  label: string; // e.g. 7月
  netInvested: number;
  marketValue: number;
}

export interface InvestActivityRow {
  date: string; // MM/DD
  label: string; // account / note
  amount: number;
}

export interface InvestHoldingRow {
  name: string;
  shares: number | null;
  cost: number;
  marketValue: number;
  snapshotDate: string; // MM/DD
  stale: boolean;
}

export interface InvestDividendRow {
  date: string; // MM/DD
  name: string;
  detail: string; // account / passive income note
  amount: number;
}

export interface InvestmentDetail {
  summary: InvestmentSummary;
  history: InvestHistoryPoint[];
  monthLabel: string;
  buys: InvestActivityRow[];
  sells: InvestActivityRow[];
  buyTotal: number;
  sellTotal: number;
  settlementBalance: number | null;
  settlementName: string;
  settlementDate: string;
  holdings: InvestHoldingRow[];
  dividends: InvestDividendRow[];
  dividendTotal: number;
}

const DIVIDEND_RE = /股利|股息|配息|利息|dividend/i;

function monthDay(date: string) {
  const match = date.match(/^\d{4}-(\d{2})-(\d{2})/);
  return match ? `${match[1]}/${match[2]}` : date;
}

function daysBetween(a: string, b: string) {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.abs(ms) / 86_400_000;
}

function isInvestmentAccount(account: Account | undefined) {
  return account?.type === 'virtual';
}

function isDividend(tx: Transaction) {
  return (
    tx.type === 'income' &&
    (tx.category === '投資收益' || DIVIDEND_RE.test(`${tx.tags.join(' ')} ${tx.note}`))
  );
}

export function buildInvestmentDetail(input: {
  summary: InvestmentSummary;
  transactions: Transaction[];
  snapshots: AssetSnapshot[];
  accounts: Account[];
  year: number;
  month: number;
}): InvestmentDetail {
  const { summary, transactions, snapshots, accounts, year, month } = input;
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const accountsByName = new Map(accounts.map((a) => [a.name, a]));
  const from = (tx: Transaction) =>
    tx.accountId ? accountsById.get(tx.accountId) : accountsByName.get(tx.account);
  const to = (tx: Transaction) =>
    tx.toAccountId ? accountsById.get(tx.toAccountId) : accountsByName.get(tx.toAccount ?? '');

  const investTransfers = transactions.filter(
    (tx) => tx.type === 'transfer' && (isInvestmentAccount(from(tx)) || isInvestmentAccount(to(tx))),
  );
  const inbound = investTransfers.filter((tx) => isInvestmentAccount(to(tx)));
  const outbound = investTransfers.filter((tx) => isInvestmentAccount(from(tx)));

  const today = new Date().toISOString().slice(0, 10);
  const investSnapshots = snapshots.filter((s) => {
    const account = s.accountId ? accountsById.get(s.accountId) : accountsByName.get(s.account ?? '');
    return isInvestmentAccount(account);
  });

  // --- 6-month history: cumulative net invested + market value per month end
  const history: InvestHistoryPoint[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (5 - i) + 1, 1)); // first day of NEXT month
    const monthEnd = d.toISOString().slice(0, 10); // exclusive upper bound
    const labelMonth = ((month - 1 - (5 - i) + 12) % 12) + 1;
    const cumIn = inbound
      .filter((tx) => tx.date < monthEnd)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const cumOut = outbound
      .filter((tx) => tx.date < monthEnd)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    // latest investment snapshot on or before month end
    const upTo = investSnapshots
      .filter((s) => s.date < monthEnd)
      .sort((a, b) => b.date.localeCompare(a.date));
    const byAccount = new Map<string, AssetSnapshot>();
    for (const s of upTo) {
      const key = s.accountId ?? s.account ?? s.id;
      if (!byAccount.has(key)) byAccount.set(key, s);
    }
    const marketValue = [...byAccount.values()].reduce(
      (sum, s) => sum + (s.marketValue ?? s.balance),
      0,
    );
    return { label: `${labelMonth}月`, netInvested: cumIn - cumOut, marketValue };
  });

  // --- this month's activity
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEndExcl = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const inThisMonth = (tx: Transaction) => tx.date >= monthStart && tx.date < monthEndExcl;
  const buys = inbound.filter(inThisMonth).map<InvestActivityRow>((tx) => ({
    date: monthDay(tx.date),
    label: to(tx)?.name ?? tx.toAccount ?? tx.note,
    amount: Math.abs(tx.amount),
  }));
  const sells = outbound.filter(inThisMonth).map<InvestActivityRow>((tx) => ({
    date: monthDay(tx.date),
    label: from(tx)?.name ?? tx.account,
    amount: Math.abs(tx.amount),
  }));

  // settlement account = the non-virtual side that most often faces investment transfers
  const settlementCounts = new Map<string, number>();
  for (const tx of investTransfers) {
    const other = isInvestmentAccount(from(tx)) ? to(tx) : from(tx);
    if (other && !isInvestmentAccount(other)) {
      settlementCounts.set(other.name, (settlementCounts.get(other.name) ?? 0) + 1);
    }
  }
  const settlementName =
    [...settlementCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  let settlementBalance: number | null = null;
  let settlementDate = '';
  if (settlementName) {
    const latest = snapshots
      .filter((s) => (s.account ?? accountsById.get(s.accountId ?? '')?.name) === settlementName)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latest) {
      settlementBalance = latest.balance;
      settlementDate = monthDay(latest.date);
    }
  }

  // --- holdings: latest snapshot per investment account (per-ticker not modelled)
  const latestByAccount = new Map<string, AssetSnapshot>();
  for (const s of [...investSnapshots].sort((a, b) => b.date.localeCompare(a.date))) {
    const key = s.accountId ?? s.account ?? s.id;
    if (!latestByAccount.has(key)) latestByAccount.set(key, s);
  }
  const holdings = [...latestByAccount.values()].map<InvestHoldingRow>((s) => {
    const account = s.accountId ? accountsById.get(s.accountId) : accountsByName.get(s.account ?? '');
    return {
      name: account?.name ?? s.account ?? '投資標的',
      shares: null,
      cost: s.costBasis ?? 0,
      marketValue: s.marketValue ?? s.balance,
      snapshotDate: monthDay(s.date),
      stale: daysBetween(s.date, today) > 30,
    };
  });

  // --- dividend timeline (all time, newest first)
  const dividendTx = transactions.filter(isDividend).sort((a, b) => b.date.localeCompare(a.date));
  const dividends = dividendTx.map<InvestDividendRow>((tx) => ({
    date: monthDay(tx.date),
    name: tx.note || tx.category,
    detail: `${tx.account}${tx.tags.length ? ` · ${tx.tags[0]}` : ''}`,
    amount: tx.amount,
  }));

  return {
    summary,
    history,
    monthLabel: `${year}年${month}月`,
    buys,
    sells,
    buyTotal: buys.reduce((sum, r) => sum + r.amount, 0),
    sellTotal: sells.reduce((sum, r) => sum + r.amount, 0),
    settlementBalance,
    settlementName,
    settlementDate,
    holdings,
    dividends,
    dividendTotal: summary.dividendTotal,
  };
}
