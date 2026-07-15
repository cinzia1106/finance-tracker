/* Shared fixed-cost helpers used by the management page and overview card. */

import { CATEGORY_DEFINITIONS } from '../../data/categoryDefinitions';
import type { RecurringCycle, RecurringExpense, Transaction } from '../../types/models';

export const FIXED_CATEGORY_OPTIONS = CATEGORY_DEFINITIONS.filter(
  (category) => category.kind === 'expense',
).map((category) => category.name);
export const DEFAULT_FIXED_CATEGORY = FIXED_CATEGORY_OPTIONS[0] ?? '';

const RECURRING_TAGS_RE = /\[tags:([^\]]*)\]/i;
const RECURRING_CURRENCY_RE = /\[currency:([A-Z]{3})\]/i;
const RECURRING_PAYMENTS_RE = /\[payments:([^\]]*)\]/i;
const RECURRING_PLANS_RE = /\[plans:([^\]]*)\]/i;

export const CURRENCY_OPTIONS = ['TWD', 'USD', 'JPY', 'EUR', 'CNY', 'HKD'];
export const CYCLE_OPTIONS: { value: RecurringCycle; label: string }[] = [
  { value: 'monthly', label: '月繳' },
  { value: 'semiannual', label: '半年繳' },
  { value: 'yearly', label: '年繳' },
  { value: 'irregular', label: '不定期' },
];

export interface FixedItemForm {
  name: string;
  amount: string;
  currency: string;
  cycle: RecurringCycle;
  category: string;
  tag: string;
  billingDay: string;
  nextDue: string;
  note: string;
}

export function emptyFixedItemForm(): FixedItemForm {
  return {
    name: '',
    amount: '',
    currency: 'TWD',
    cycle: 'monthly',
    category: DEFAULT_FIXED_CATEGORY,
    tag: '',
    billingDay: '',
    nextDue: '',
    note: '',
  };
}

export function itemAmount(item: RecurringExpense) {
  return item.monthlyEquiv ?? item.amount ?? 0;
}

export function itemChargeAmount(item: RecurringExpense) {
  return item.amount ?? item.monthlyEquiv ?? 0;
}

export function monthlyEquivalent(amount: number, cycle: RecurringCycle) {
  if (cycle === 'yearly') return Math.round(amount / 12);
  if (cycle === 'semiannual') return Math.round(amount / 6);
  return amount;
}

export function cycleLabel(cycle: RecurringCycle) {
  return CYCLE_OPTIONS.find((option) => option.value === cycle)?.label ?? cycle;
}

export function cycleRank(cycle: RecurringCycle) {
  return { monthly: 0, semiannual: 1, yearly: 2, irregular: 3 }[cycle] ?? 4;
}

function formatMonthDay(date: string) {
  const match = date.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${Number(match[1])}/${Number(match[2])}`;
}

export function addMonths(date: string, months: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  return parsed.toISOString().slice(0, 10);
}

/** Auto-derived next due date — the form never asks for it.
    monthly: next occurrence of billingDay; yearly/semiannual: last paid
    plus one cycle; otherwise unknown. */
export function autoNextDue(
  cycle: RecurringCycle,
  billingDay: number | null | undefined,
  lastPaid: string | null | undefined,
  from: string = new Date().toISOString().slice(0, 10),
) {
  if (cycle === 'monthly' && billingDay) {
    const [y, m] = from.split('-').map(Number);
    const thisMonth = `${y}-${String(m).padStart(2, '0')}-${String(billingDay).padStart(2, '0')}`;
    if (thisMonth >= from) return thisMonth;
    return addMonths(thisMonth, 1);
  }
  if (cycle === 'yearly' && lastPaid) return addMonths(lastPaid, 12);
  if (cycle === 'semiannual' && lastPaid) return addMonths(lastPaid, 6);
  return undefined;
}

export function fixedDueText(item: RecurringExpense) {
  const dueMonthDay = item.nextDue ? formatMonthDay(item.nextDue) : '';
  if (item.cycle === 'monthly') {
    if (item.billingDay) return `每月 ${item.billingDay} 日繳`;
    return dueMonthDay ? `每月 ${dueMonthDay.split('/')[1]} 日繳` : '';
  }
  if (item.cycle === 'yearly') {
    return dueMonthDay ? `每年 ${dueMonthDay} 繳` : '';
  }
  if (item.cycle === 'semiannual') {
    if (!item.nextDue || !dueMonthDay) return '';
    const secondDue = formatMonthDay(addMonths(item.nextDue, 6));
    return secondDue ? `半年繳 ${dueMonthDay}、${secondDue}` : `半年繳 ${dueMonthDay}`;
  }
  return dueMonthDay ? `下次 ${dueMonthDay}` : '';
}

function splitMarker(value: string | undefined, pattern: RegExp) {
  return (
    value
      ?.match(pattern)?.[1]
      ?.split(/[,\n，、]/)
      .map((part) => part.trim())
      .filter(Boolean) ?? []
  );
}

export function recurringTags(item: RecurringExpense) {
  return splitMarker(item.note, RECURRING_TAGS_RE);
}

export function recurringPaymentDates(item: RecurringExpense) {
  return splitMarker(item.note, RECURRING_PAYMENTS_RE).sort((a, b) => b.localeCompare(a));
}

export function recurringPlanChanges(item: RecurringExpense) {
  return splitMarker(item.note, RECURRING_PLANS_RE).sort((a, b) => b.localeCompare(a));
}

function stripRecurringMarkers(note: string | undefined) {
  return (
    note
      ?.replace(RECURRING_TAGS_RE, '')
      .replace(RECURRING_CURRENCY_RE, '')
      .replace(RECURRING_PAYMENTS_RE, '')
      .replace(RECURRING_PLANS_RE, '')
      .replace(/\[skip:[^\]]*\]/gi, '')
      .trim() ?? ''
  );
}

export function recurringPlainNote(item: RecurringExpense) {
  return stripRecurringMarkers(item.note);
}

export function recurringCurrency(item: RecurringExpense) {
  return item.note?.match(RECURRING_CURRENCY_RE)?.[1] ?? 'TWD';
}

export function noteWithRecurringMeta(
  note: string,
  tag: string,
  currency: string,
  payments: string[] = [],
  plans: string[] = [],
) {
  const cleanNote = stripRecurringMarkers(note);
  const tagMarker = tag ? `[tags:${tag}]` : '';
  const currencyMarker = currency && currency !== 'TWD' ? `[currency:${currency}]` : '';
  const paymentMarker = payments.length > 0 ? `[payments:${[...new Set(payments)].join(',')}]` : '';
  const planMarker = plans.length > 0 ? `[plans:${[...new Set(plans)].join(',')}]` : '';
  return [cleanNote, tagMarker, currencyMarker, paymentMarker, planMarker].filter(Boolean).join(' ');
}

export function noteWithAddedPayment(item: RecurringExpense, paidDate: string) {
  return noteWithRecurringMeta(
    recurringPlainNote(item),
    recurringTags(item)[0] ?? '',
    recurringCurrency(item),
    [paidDate, ...recurringPaymentDates(item)],
    recurringPlanChanges(item),
  );
}

export function noteWithAddedPlanChange(
  item: RecurringExpense,
  changedAt: string,
  oldAmount: number,
  newAmount: number,
  oldCycle: RecurringCycle,
  newCycle: RecurringCycle,
) {
  const entry = `${changedAt}:${oldCycle}-${oldAmount}->${newCycle}-${newAmount}`;
  return noteWithRecurringMeta(
    recurringPlainNote(item),
    recurringTags(item)[0] ?? '',
    recurringCurrency(item),
    recurringPaymentDates(item),
    [entry, ...recurringPlanChanges(item)],
  );
}

export function fixedItemToForm(item: RecurringExpense): FixedItemForm {
  return {
    name: item.name,
    amount: String(itemChargeAmount(item) || ''),
    currency: recurringCurrency(item),
    cycle: item.cycle,
    category: item.category || DEFAULT_FIXED_CATEGORY,
    tag: recurringTags(item)[0] ?? '',
    billingDay: item.billingDay ? String(item.billingDay) : '',
    nextDue: item.nextDue ?? '',
    note: recurringPlainNote(item),
  };
}

function normalizeFixedText(value: string | undefined | null) {
  return (value ?? '').toLowerCase().replace(/\s+/g, '');
}

export function recurringPaidByTransaction(item: RecurringExpense, transactions: Transaction[]) {
  const itemName = normalizeFixedText(item.name);
  const amount = itemChargeAmount(item);
  const itemTag = recurringTags(item)[0];
  return transactions.some((tx) => {
    if (tx.type !== 'expense' || tx.amount <= 0) return false;
    const amountMatches = amount > 0 && Math.abs(tx.amount - amount) <= 1;
    const categoryMatches = Boolean(item.category) && tx.category === item.category;
    const tagMatches = itemTag ? tx.tags.includes(itemTag) : false;
    const haystack = normalizeFixedText(`${tx.note} ${tx.category} ${tx.account} ${tx.tags.join(' ')}`);
    const textMatches = itemName.length >= 2 && haystack.includes(itemName);
    return (
      (amountMatches && (categoryMatches || tagMatches || textMatches)) ||
      (textMatches && (categoryMatches || tagMatches))
    );
  });
}

export function isPaidThisMonth(
  item: RecurringExpense,
  monthKey: string,
  monthTransactions: Transaction[],
) {
  return (
    (item.lastPaid ?? '').startsWith(monthKey) ||
    recurringPaymentDates(item).some((date) => date.startsWith(monthKey)) ||
    recurringPaidByTransaction(item, monthTransactions)
  );
}

const RECURRING_SKIP_RE = /\[skip:([^\]]*)\]/i;

export function skippedMonths(item: RecurringExpense) {
  return splitMarker(item.note, RECURRING_SKIP_RE);
}

export function isSkippedThisMonth(item: RecurringExpense, monthKey: string) {
  return skippedMonths(item).includes(monthKey);
}

export function noteWithSkip(item: RecurringExpense, monthKey: string) {
  const cleaned = item.note?.replace(RECURRING_SKIP_RE, '').trim() ?? '';
  const months = [...new Set([...skippedMonths(item), monthKey])];
  const marker = months.length ? `[skip:${months.join(',')}]` : '';
  return [cleaned, marker].filter(Boolean).join(' ');
}

/** An active monthly commitment that this month is unpaid, not skipped,
    and already past its billing day → flagged as 缺漏 (missing). */
export function isMissingThisMonth(
  item: RecurringExpense,
  monthKey: string,
  monthTransactions: Transaction[],
  todayDate: string = new Date().toISOString().slice(0, 10),
) {
  if (item.active === false) return false;
  if (item.cycle !== 'monthly') return false;
  if (isSkippedThisMonth(item, monthKey)) return false;
  if (isPaidThisMonth(item, monthKey, monthTransactions)) return false;
  const dayOfMonth = Number(todayDate.slice(8, 10));
  if (item.billingDay && dayOfMonth < item.billingDay) return false;
  return true;
}
