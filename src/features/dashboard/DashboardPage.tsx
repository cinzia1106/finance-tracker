import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { BudgetRow, CountBadge, ReviewBadge } from '../../components/ui';
import type { MonthOverview } from '../../data/adapter';
import { useAdapter } from '../../data/AdapterContext';
import { CATEGORY_DEFINITIONS, tagsForCategory } from '../../data/categoryDefinitions';
import { useAppOutletContext } from '../../layout/AppLayout';
import { formatCurrency, formatPlain, formatSigned } from '../../lib/format';
import type { RecurringCycle, RecurringExpense, Transaction } from '../../types/models';
import './dashboard.css';

const FIXED_CATEGORY_OPTIONS = CATEGORY_DEFINITIONS.filter((category) => category.kind === 'expense').map(
  (category) => category.name,
);
const DEFAULT_FIXED_CATEGORY = FIXED_CATEGORY_OPTIONS[0] ?? '';
const RECURRING_TAGS_RE = /\[tags:([^\]]*)\]/i;
const RECURRING_CURRENCY_RE = /\[currency:([A-Z]{3})\]/i;
const CURRENCY_OPTIONS = ['TWD', 'USD', 'JPY', 'EUR', 'CNY', 'HKD'];
const CYCLE_OPTIONS: { value: RecurringCycle; label: string }[] = [
  { value: 'monthly', label: '月繳' },
  { value: 'semiannual', label: '半年繳' },
  { value: 'yearly', label: '年繳' },
  { value: 'irregular', label: '不定期' },
];

interface FixedItemForm {
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

function emptyFixedItemForm(): FixedItemForm {
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

function itemAmount(item: RecurringExpense) {
  return item.monthlyEquiv ?? item.amount ?? 0;
}

function itemChargeAmount(item: RecurringExpense) {
  return item.amount ?? item.monthlyEquiv ?? 0;
}

function monthlyEquivalent(amount: number, cycle: RecurringCycle) {
  if (cycle === 'yearly') return Math.round(amount / 12);
  if (cycle === 'semiannual') return Math.round(amount / 6);
  return amount;
}

function cycleLabel(cycle: RecurringCycle) {
  return CYCLE_OPTIONS.find((option) => option.value === cycle)?.label ?? cycle;
}

function cycleRank(cycle: RecurringCycle) {
  return { monthly: 0, semiannual: 1, yearly: 2, irregular: 3 }[cycle] ?? 4;
}

function formatMonthDay(date: string) {
  const match = date.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${Number(match[1])}/${Number(match[2])}`;
}

function addMonths(date: string, months: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  return parsed.toISOString().slice(0, 10);
}

function fixedDueText(item: RecurringExpense) {
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

function recurringTags(item: RecurringExpense) {
  return (
    item.note
      ?.match(RECURRING_TAGS_RE)?.[1]
      ?.split(/[,\n，、]/)
      .map((tag) => tag.trim())
      .filter(Boolean) ?? []
  );
}

function recurringPlainNote(item: RecurringExpense) {
  return item.note?.replace(RECURRING_TAGS_RE, '').replace(RECURRING_CURRENCY_RE, '').trim() ?? '';
}

function recurringCurrency(item: RecurringExpense) {
  return item.note?.match(RECURRING_CURRENCY_RE)?.[1] ?? 'TWD';
}

function noteWithRecurringMeta(note: string, tag: string, currency: string) {
  const cleanNote = note.replace(RECURRING_TAGS_RE, '').replace(RECURRING_CURRENCY_RE, '').trim();
  const tagMarker = tag ? `[tags:${tag}]` : '';
  const currencyMarker = currency && currency !== 'TWD' ? `[currency:${currency}]` : '';
  return [cleanNote, tagMarker, currencyMarker].filter(Boolean).join(' ');
}

function fixedItemToForm(item: RecurringExpense): FixedItemForm {
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

function recurringPaidByTransaction(item: RecurringExpense, transactions: Transaction[]) {
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

export default function DashboardPage() {
  const adapter = useAdapter();
  const { openQuickNote, dataVersion } = useAppOutletContext();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthOverview | null>(null);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [monthTransactions, setMonthTransactions] = useState<Transaction[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<FixedItemForm>(emptyFixedItemForm);
  const [editForm, setEditForm] = useState<FixedItemForm>(emptyFixedItemForm);
  const [fixedError, setFixedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adapter.getMonthOverview(year, month).then((overview) => {
      if (!cancelled) setData(overview);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter, year, month, dataVersion]);

  useEffect(() => {
    let cancelled = false;
    adapter
      .listTransactions?.(year, month)
      .then((rows) => {
        if (!cancelled) setMonthTransactions(rows);
      })
      .catch(() => {
        if (!cancelled) setMonthTransactions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, year, month, dataVersion]);

  useEffect(() => {
    let cancelled = false;
    adapter
      .listRecurringItems?.()
      .then((rows) => {
        if (!cancelled) setRecurring(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [adapter, dataVersion]);

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const fixedCosts = useMemo(() => {
    const rows = recurring
      .filter((item) => item.active !== false)
      .map((item) => ({
        item,
        paid: (item.lastPaid ?? '').startsWith(monthKey) || recurringPaidByTransaction(item, monthTransactions),
      }));
    rows.sort(
      (a, b) =>
        cycleRank(a.item.cycle) - cycleRank(b.item.cycle) ||
        Number(a.paid) - Number(b.paid) ||
        itemAmount(b.item) - itemAmount(a.item),
    );
    return {
      rows,
      total: rows.reduce((sum, row) => sum + (recurringCurrency(row.item) === 'TWD' ? itemAmount(row.item) : 0), 0),
      paidCount: rows.filter((row) => row.paid).length,
    };
  }, [recurring, monthKey, monthTransactions]);

  function shiftMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
  }

  async function addFixedItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adapter.createRecurringItem) return;
    const amount = Math.round(Number(addForm.amount));
    if (!addForm.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFixedError('請填寫名稱與有效金額。');
      return;
    }
    const billingDay = addForm.billingDay ? Number(addForm.billingDay) : null;
    setBusyId('new');
    setFixedError(null);
    try {
      const created = await adapter.createRecurringItem({
        name: addForm.name.trim(),
        amount,
        cycle: addForm.cycle,
        monthlyEquiv: monthlyEquivalent(amount, addForm.cycle),
        category: addForm.category,
        billingDay: billingDay && billingDay >= 1 && billingDay <= 31 ? billingDay : null,
        active: true,
        nextDue: addForm.nextDue || undefined,
        note: noteWithRecurringMeta(addForm.note, addForm.tag, addForm.currency),
      });
      setRecurring((previous) => [...previous, created]);
      setAddForm(emptyFixedItemForm());
      setShowAdd(false);
    } catch (err) {
      setFixedError(err instanceof Error ? err.message : '新增失敗，請稍後再試。');
    } finally {
      setBusyId(null);
    }
  }

  function startEditFixedItem(item: RecurringExpense) {
    if (!item.id) return;
    setEditId(item.id);
    setEditForm(fixedItemToForm(item));
    setFixedError(null);
  }

  async function updateFixedItem(event: FormEvent<HTMLFormElement>, item: RecurringExpense) {
    event.preventDefault();
    if (!adapter.updateRecurringItem || !item.id) return;
    const amount = Math.round(Number(editForm.amount));
    if (!editForm.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFixedError('請填寫名稱與有效金額。');
      return;
    }
    const billingDay = editForm.billingDay ? Number(editForm.billingDay) : null;
    setBusyId(item.id);
    setFixedError(null);
    try {
      const updated = await adapter.updateRecurringItem(item.id, {
        name: editForm.name.trim(),
        amount,
        cycle: editForm.cycle,
        monthlyEquiv: monthlyEquivalent(amount, editForm.cycle),
        category: editForm.category,
        billingDay: billingDay && billingDay >= 1 && billingDay <= 31 ? billingDay : null,
        active: true,
        nextDue: editForm.nextDue || undefined,
        note: noteWithRecurringMeta(editForm.note, editForm.tag, editForm.currency),
      });
      setRecurring((previous) => previous.map((row) => (row.id === item.id ? updated : row)));
      setEditId(null);
    } catch (err) {
      setFixedError(err instanceof Error ? err.message : '更新失敗，請稍後再試。');
    } finally {
      setBusyId(null);
    }
  }

  async function setPaid(item: RecurringExpense, paid: boolean) {
    if (!adapter.updateRecurringItem || !item.id) return;
    const lastPaid = paid ? (isCurrentMonth ? new Date().toISOString().slice(0, 10) : `${monthKey}-01`) : null;
    setBusyId(item.id);
    setFixedError(null);
    try {
      await adapter.updateRecurringItem(item.id, { lastPaid });
      setRecurring((previous) =>
        previous.map((row) => (row.id === item.id ? { ...row, lastPaid: lastPaid ?? undefined } : row)),
      );
    } catch (err) {
      setFixedError(err instanceof Error ? err.message : '更新失敗，請稍後再試。');
    } finally {
      setBusyId(null);
    }
  }

  async function removeFixedItem(item: RecurringExpense) {
    if (!adapter.deleteRecurringItem || !item.id) return;
    setBusyId(item.id);
    setFixedError(null);
    try {
      await adapter.deleteRecurringItem(item.id);
      setRecurring((previous) => previous.filter((row) => row.id !== item.id));
      setDeleteConfirmId(null);
    } catch (err) {
      setFixedError(err instanceof Error ? err.message : '刪除失敗，請稍後再試。');
    } finally {
      setBusyId(null);
    }
  }

  function renderFixedForm(
    form: FixedItemForm,
    setForm: (form: FixedItemForm) => void,
    submitLabel: string,
    busy: boolean,
    onCancel?: () => void,
  ) {
    return (
      <>
        <label className="form-field">
          <span className="micro">名稱</span>
          <input
            className="text-input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span className="micro">金額</span>
          <input
            className="text-input mono"
            type="number"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span className="micro">幣別</span>
          <select
            className="text-input"
            value={form.currency}
            onChange={(event) => setForm({ ...form, currency: event.target.value })}
          >
            {CURRENCY_OPTIONS.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="micro">週期</span>
          <select
            className="text-input"
            value={form.cycle}
            onChange={(event) => setForm({ ...form, cycle: event.target.value as RecurringCycle })}
          >
            {CYCLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="micro">分類</span>
          <select
            className="text-input"
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value, tag: '' })}
          >
            {FIXED_CATEGORY_OPTIONS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="micro">標籤</span>
          <select className="text-input" value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })}>
            <option value="">不指定</option>
            {tagsForCategory(form.category).map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="micro">扣款日（月繳）</span>
          <input
            className="text-input mono"
            type="number"
            min="1"
            max="31"
            value={form.billingDay}
            onChange={(event) => setForm({ ...form, billingDay: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span className="micro">下次扣款（選填）</span>
          <input
            className="text-input"
            type="date"
            value={form.nextDue}
            onChange={(event) => setForm({ ...form, nextDue: event.target.value })}
          />
        </label>
        <label className="form-field form-field--wide">
          <span className="micro">備註</span>
          <input
            className="text-input"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
            {submitLabel}
          </button>
          {onCancel && (
            <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={onCancel}>
              取消
            </button>
          )}
        </div>
      </>
    );
  }

  if (!data) return null;

  const netCashflow = data.income - data.expense;

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <h1 className="h1">
            <span className="desktop-only">
              {year} 年 {month} 月
            </span>
            <span className="mobile-only">{month} 月</span>
          </h1>
          <div className="month-switch">
            <button
              type="button"
              className="month-switch__btn"
              aria-label="上個月"
              onClick={() => shiftMonth(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="month-switch__btn"
              aria-label="下個月"
              onClick={() => shiftMonth(1)}
            >
              ›
            </button>
          </div>
          <span className="caption desktop-only">
            {data.lastImportNote ? `最近匯入 ${data.lastImportNote}` : ''}
          </span>
          <span className="caption mobile-only">{year}</span>
        </div>
        <button type="button" className="btn btn--primary desktop-only" onClick={openQuickNote}>
          ＋ 快速手記
        </button>
        <span className="mobile-only">
          <ReviewBadge count={data.needsReviewCount} />
        </span>
      </header>

      <div className="grid-12">
        <section className="card span-5">
          <div className="micro">本月淨現金流</div>
          <div
            className="amount-xl"
            style={netCashflow < 0 ? { color: 'var(--color-apricot-deep)' } : undefined}
          >
            {formatCurrency(netCashflow, true)}
          </div>
          <div className="dashboard__flow-legend">
            <span>
              <span className="dashboard__dot" style={{ background: 'var(--color-mint)' }} />
              收入 <span className="mono dashboard__flow-num">{formatPlain(data.income)}</span>
            </span>
            <span>
              <span className="dashboard__dot" style={{ background: 'var(--color-mocha)' }} />
              支出 <span className="mono dashboard__flow-num">{formatPlain(data.expense)}</span>
            </span>
            <span className="dashboard__transfer-note desktop-only">轉帳 {data.transferCount} 筆，不列入收支</span>
          </div>
          {data.incomeBySource.length > 0 && (
            <div className="dashboard__income-sources desktop-only">
              {data.incomeBySource.map((source) => (
                <span key={source.source}>
                  {source.source} <span className="mono">{formatPlain(source.amount)}</span>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="card span-7">
          <div className="card__header">
            <h2 className="h2">固定支出</h2>
            <span className="dashboard__fixed-header-side">
              {fixedCosts.rows.length > 0 && (
                <span className="micro dashboard__group-note">
                  已繳 {fixedCosts.paidCount}/{fixedCosts.rows.length} · 月承諾{' '}
                  {formatPlain(fixedCosts.total)}
                </span>
              )}
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setShowAdd((value) => !value)}>
                {showAdd ? '收起' : '＋ 新增'}
              </button>
            </span>
          </div>

          {fixedError && <div className="caption dashboard__fixed-error">{fixedError}</div>}

          {showAdd && (
            <form onSubmit={(event) => void addFixedItem(event)} className="form-grid dashboard__fixed-form">
              {renderFixedForm(addForm, setAddForm, '新增', busyId === 'new')}
            </form>
          )}

          {fixedCosts.rows.length === 0 && !showAdd ? (
            <span className="caption dashboard__fixed-empty">尚未建立固定支出。可新增分期、年繳或固定繳費項目。</span>
          ) : (
            <div className="dashboard__fixed-list">
              {fixedCosts.rows.map(({ item, paid }) => (
                <div key={item.id} className="dashboard__fixed-row">
                  <span className="dashboard__fixed-name cell-ellipsis" title={item.name}>
                    {item.name}
                    <span className="micro dashboard__fixed-meta">
                      {' '}
                      {item.category}
                      {recurringTags(item)[0] ? ` · ${recurringTags(item)[0]}` : ''}
                      {` · ${recurringCurrency(item)} ${cycleLabel(item.cycle)}`}
                      {item.cycle !== 'monthly' ? ` ${formatPlain(itemChargeAmount(item))}` : ''}
                      {fixedDueText(item) ? ` · ${fixedDueText(item)}` : ''}
                    </span>
                  </span>
                  <span className="amount-s dashboard__fixed-amount">
                    {recurringCurrency(item) !== 'TWD' ? `${recurringCurrency(item)} ` : ''}
                    {formatPlain(itemChargeAmount(item))}
                  </span>
                  {paid ? (
                    <button
                      type="button"
                      className="badge badge--confirmed dashboard__fixed-badge"
                      disabled={busyId === item.id}
                      title="點擊改為待繳"
                      onClick={() => void setPaid(item, false)}
                    >
                      <span className="badge__dot" />
                      已繳費
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="badge badge--review dashboard__fixed-badge"
                      disabled={busyId === item.id}
                      title="點擊標記為已繳"
                      onClick={() => void setPaid(item, true)}
                    >
                      <span className="badge__dot" />
                      待繳
                    </button>
                  )}
                  {deleteConfirmId === item.id ? (
                    <span className="dashboard__fixed-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm dashboard__fixed-danger"
                        disabled={busyId === item.id}
                        onClick={() => void removeFixedItem(item)}
                      >
                        確認刪除
                      </button>
                      <button type="button" className="btn btn--secondary btn--sm" onClick={() => setDeleteConfirmId(null)}>
                        取消
                      </button>
                    </span>
                  ) : (
                    <span className="dashboard__fixed-actions">
                      <button type="button" className="btn btn--secondary btn--sm" onClick={() => startEditFixedItem(item)}>
                        編輯
                      </button>
                      <button
                        type="button"
                        className="dashboard__fixed-delete"
                        aria-label={`刪除 ${item.name}`}
                        title="刪除"
                        onClick={() => setDeleteConfirmId(item.id ?? null)}
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {editId === item.id && (
                    <form
                      onSubmit={(event) => void updateFixedItem(event, item)}
                      className="form-grid dashboard__fixed-edit-form"
                    >
                      {renderFixedForm(editForm, setEditForm, '儲存', busyId === item.id, () => setEditId(null))}
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card span-6">
          <div className="card__header">
            <h2 className="h2">分類預算</h2>
            <span className="micro dashboard__group-note">本月支出 vs 預算</span>
          </div>
          {data.budgets.length === 0 ? (
            <span className="caption">尚未設定預算。可於設定頁配置各分類預算。</span>
          ) : (
            data.budgets.map((budget) => <BudgetRow key={budget.category} {...budget} />)
          )}
        </section>

        <section className="card span-6">
          <div className="card__header">
            <h2 className="h2">信用卡</h2>
            <span className="micro dashboard__group-note">
              訂閱 {data.creditCard.subscriptionCount} 筆
              <span className="desktop-only"> · {formatPlain(data.creditCard.subscriptionTotal)}</span>
            </span>
          </div>
          <div className="dashboard__cc-figures">
            <div>
              <div className="micro dashboard__cc-label">本月已刷</div>
              <div className="amount-l">{formatPlain(data.creditCard.charged)}</div>
            </div>
            <div>
              <div className="micro dashboard__cc-label">
                待繳 · {data.creditCard.dueDate} {data.creditCard.dueNote}
              </div>
              <div className="amount-l liability">{formatPlain(data.creditCard.due)}</div>
            </div>
          </div>
          <div className="caption dashboard__cc-note desktop-only">信用卡繳款與轉帳不列入生活支出。</div>
        </section>

        <section className="card row-list mobile-only">
          <div className="micro dashboard__mgmt-label">管理</div>
          {[
            { to: '/inbox', label: '待確認', withBadge: true },
            { to: '/investments', label: '投資' },
            { to: '/monthly-review', label: '月報' },
            { to: '/settings', label: '設定' },
          ].map((item) => (
            <Link key={item.to} to={item.to} className="list-row dashboard__mgmt-row">
              <span>{item.label}</span>
              <span className="dashboard__mgmt-meta">
                {item.withBadge && <CountBadge count={data.needsReviewCount} />}
                <span className="dashboard__mgmt-chevron">›</span>
              </span>
            </Link>
          ))}
        </section>

        <section className="card span-12 desktop-only">
          <div className="card__header">
            <h2 className="h2">最近交易</h2>
            <Link to="/transactions" className="caption dashboard__card-link">
              查看明細 →
            </Link>
          </div>
          <div>
            <div className="data-table__head dashboard__tx-grid">
              <span>日期</span>
              <span>分類</span>
              <span>備註</span>
              <span>帳戶</span>
              <span className="cell-right">金額</span>
              <span>狀態</span>
            </div>
            {data.recentTransactions.map((tx) => {
              const rowClass =
                tx.status === 'needs_review'
                  ? ' data-table__row--review'
                  : tx.type === 'transfer'
                    ? ' data-table__row--muted'
                    : tx.type === 'income'
                      ? ' data-table__row--income'
                      : '';
              return (
                <div key={tx.id} className={`data-table__row dashboard__tx-grid${rowClass}`}>
                  <span className="mono caption">{tx.date}</span>
                  <span>{tx.category}</span>
                  <span className="cell-ellipsis">
                    {tx.note}
                    {tx.tag && (
                      <span className="micro" style={{ color: 'var(--color-ink-40)', letterSpacing: 0 }}>
                        {' '}
                        #{tx.tag}
                      </span>
                    )}
                  </span>
                  <span
                    className="dashboard__tx-account"
                    style={{ color: tx.type === 'transfer' ? undefined : 'var(--color-ink-70)' }}
                    title={tx.account.replaceAll('->', '→')}
                  >
                    {tx.account.replaceAll('->', '→')}
                  </span>
                  <span className="mono cell-right">
                    {tx.type === 'transfer' ? formatPlain(tx.amount) : formatSigned(tx.amount)}
                  </span>
                  {tx.type === 'transfer' ? (
                    <span className="status-text--excluded">不列入</span>
                  ) : tx.status === 'needs_review' ? (
                    <span className="status-text--review">待確認</span>
                  ) : (
                    <span className="status-text--confirmed">已確認</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
