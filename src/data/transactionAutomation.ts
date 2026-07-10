import type { Transaction } from '../types/models';

export type AutomationSignal =
  | 'refund'
  | 'transfer'
  | 'credit_card_payment'
  | 'investment_settlement'
  | 'cash_withdrawal'
  | 'large_other'
  | 'needs_review';

export interface TransactionAutomationResult {
  signals: AutomationSignal[];
  reviewReason: string | null;
}

export interface RecurringCandidate {
  key: string;
  label: string;
  category: string;
  account: string;
  averageAmount: number;
  occurrenceCount: number;
  monthCount: number;
  firstDate: string;
  lastDate: string;
  confidence: 'high' | 'medium';
  transactionIds: string[];
}

function textOf(tx: Transaction) {
  return `${tx.category} ${tx.account} ${tx.toAccount ?? ''} ${tx.note}`.toLowerCase();
}

function monthOf(date: string) {
  return date.slice(0, 7);
}

function normalizeNote(note: string) {
  return note
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

export function analyzeTransactionAutomation(tx: Transaction): TransactionAutomationResult {
  const signals: AutomationSignal[] = [];
  const text = textOf(tx);

  if (tx.status === 'needs_review') signals.push('needs_review');
  if (tx.type === 'transfer') signals.push('transfer');
  if (tx.type === 'expense' && tx.amount < 0) signals.push('refund');
  if (includesAny(text, ['信用卡', '卡費', '繳卡', 'card payment', 'credit card'])) {
    signals.push('credit_card_payment');
  }
  if (includesAny(text, ['股票', '交割', '證券', 'broker', 'settlement'])) {
    signals.push('investment_settlement');
  }
  if (includesAny(text, ['提款', 'atm', 'withdrawal'])) {
    signals.push('cash_withdrawal');
  }
  if (tx.category === '其他' && Math.abs(tx.amount) >= 10_000) {
    signals.push('large_other');
  }

  const reviewReason =
    signals.includes('large_other') ? 'Large uncategorized amount.' :
    signals.includes('investment_settlement') && tx.type === 'expense' ? 'Investment settlement should not be living expense.' :
    signals.includes('credit_card_payment') && tx.type === 'expense' ? 'Credit card payment should usually be transfer.' :
    null;

  return { signals, reviewReason };
}

export function detectRecurringCandidates(transactions: Transaction[]): RecurringCandidate[] {
  const groups = new Map<string, Transaction[]>();
  const expenseRows = transactions.filter((tx) => tx.type === 'expense' && tx.amount > 0);

  for (const tx of expenseRows) {
    const noteKey = normalizeNote(tx.note || tx.category);
    if (!noteKey) continue;
    const roundedAmount = Math.round(tx.amount / 100) * 100;
    const key = `${tx.category}|${tx.account}|${noteKey}|${roundedAmount}`;
    groups.set(key, [...(groups.get(key) ?? []), tx]);
  }

  return [...groups.entries()]
    .map(([key, rows]) => {
      const months = new Set(rows.map((tx) => monthOf(tx.date)));
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const amount = rows.reduce((total, tx) => total + tx.amount, 0) / rows.length;
      const confidence = rows.length >= 3 && months.size >= 3 ? 'high' : 'medium';

      return {
        key,
        label: rows[0].note || rows[0].category,
        category: rows[0].category,
        account: rows[0].account,
        averageAmount: Math.round(amount),
        occurrenceCount: rows.length,
        monthCount: months.size,
        firstDate: sorted[0].date,
        lastDate: sorted[sorted.length - 1].date,
        confidence,
        transactionIds: rows.map((tx) => tx.id),
      } satisfies RecurringCandidate;
    })
    .filter((candidate) => candidate.occurrenceCount >= 2 && candidate.monthCount >= 2)
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1;
      return b.monthCount - a.monthCount || b.averageAmount - a.averageAmount;
    });
}

export function summarizeAutomation(transactions: Transaction[]) {
  const results = transactions.map(analyzeTransactionAutomation);
  return {
    refunds: results.filter((result) => result.signals.includes('refund')).length,
    transfers: results.filter((result) => result.signals.includes('transfer')).length,
    creditCardPayments: results.filter((result) => result.signals.includes('credit_card_payment')).length,
    investmentSettlements: results.filter((result) => result.signals.includes('investment_settlement')).length,
    cashWithdrawals: results.filter((result) => result.signals.includes('cash_withdrawal')).length,
    reviewHints: results.filter((result) => result.reviewReason).length,
  };
}
