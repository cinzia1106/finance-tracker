import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAdapter } from '../../data/AdapterContext';
import { tagsForCategory } from '../../data/categoryDefinitions';
import { useAppOutletContext } from '../../layout/AppLayout';
import { formatCurrency, formatPlain } from '../../lib/format';
import type { RecurringExpense, Transaction } from '../../types/models';
import {
  CURRENCY_OPTIONS,
  CYCLE_OPTIONS,
  FIXED_CATEGORY_OPTIONS,
  type FixedItemForm,
  autoNextDue,
  cycleLabel,
  cycleRank,
  emptyFixedItemForm,
  fixedDueText,
  fixedItemToForm,
  installmentRemaining,
  installmentTotal,
  isInstallment,
  isMissingThisMonth,
  isPaidThisMonth,
  itemAmount,
  itemChargeAmount,
  monthlyEquivalent,
  noteWithAddedPayment,
  noteWithRecurringMeta,
  noteWithSkip,
  recurringCurrency,
  recurringPaymentDates,
  recurringPlainNote,
  recurringPlanChanges,
  recurringTags,
} from './recurringShared';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function monthDay(date: string | null) {
  if (!date) return '—';
  const match = date.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[1])}/${Number(match[2])}` : date;
}

export default function FixedCostsPage() {
  const adapter = useAdapter();
  const { dataVersion } = useAppOutletContext();
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [monthTransactions, setMonthTransactions] = useState<Transaction[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<FixedItemForm>(emptyFixedItemForm);
  const [editForm, setEditForm] = useState<FixedItemForm>(emptyFixedItemForm);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [newPayDate, setNewPayDate] = useState(today());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adapter
      .listRecurringItems?.()
      .then((rows) => {
        if (!cancelled) setRecurring(rows);
      })
      .catch(() => undefined);
    adapter
      .listTransactions?.(now.getFullYear(), now.getMonth() + 1)
      .then((rows) => {
        if (!cancelled) setMonthTransactions(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, dataVersion]);

  const rows = useMemo(() => {
    const list = recurring
      .filter((item) => item.active !== false)
      .map((item) => ({ item, paid: isPaidThisMonth(item, monthKey, monthTransactions) }));
    list.sort(
      (a, b) =>
        cycleRank(a.item.cycle) - cycleRank(b.item.cycle) ||
        Number(a.paid) - Number(b.paid) ||
        itemAmount(b.item) - itemAmount(a.item),
    );
    return list;
  }, [recurring, monthKey, monthTransactions]);

  const twdMonthlyEquiv = (list: typeof rows) =>
    list.reduce(
      (sum, row) => sum + (recurringCurrency(row.item) === 'TWD' ? itemAmount(row.item) : 0),
      0,
    );

  const monthlyTotal = twdMonthlyEquiv(rows);
  /** Monthly-equivalent contributed by non-monthly (yearly/semiannual)
      commitments, shown as the "含年繳月當量" note on the total. */
  const nonMonthlyEquiv = rows.reduce(
    (sum, row) =>
      row.item.cycle !== 'monthly' && recurringCurrency(row.item) === 'TWD'
        ? sum + itemAmount(row.item)
        : sum,
    0,
  );

  /** Four semantic sections. Subscriptions = work software + entertainment
      media (categories 工作 / 娛樂); installments carry an [installment:N]
      marker; health = 健康; everything else falls into 其他固定承諾. */
  const SUB_CATEGORIES = ['工作', '娛樂'];
  const installmentRows = rows.filter((row) => isInstallment(row.item));
  const rest = rows.filter((row) => !isInstallment(row.item));
  const healthRows = rest.filter((row) => row.item.category === '健康');
  const subRows = rest.filter((row) => SUB_CATEGORIES.includes(row.item.category));
  const otherRows = rest.filter(
    (row) => row.item.category !== '健康' && !SUB_CATEGORIES.includes(row.item.category),
  );

  const subsTotal = twdMonthlyEquiv(subRows);
  const installmentTotalMonthly = installmentRows.reduce(
    (sum, row) => sum + (recurringCurrency(row.item) === 'TWD' ? itemChargeAmount(row.item) : 0),
    0,
  );
  const subDays = new Set(
    subRows.map((row) => row.item.billingDay).filter((day): day is number => Boolean(day)),
  );
  const subDay = subDays.size === 1 ? [...subDays][0] : null;

  /** Missing-this-month monthly commitments. */
  const missing = rows.filter((row) =>
    isMissingThisMonth(row.item, monthKey, monthTransactions),
  );

  async function skipThisMonth(item: RecurringExpense) {
    if (!adapter.updateRecurringItem || !item.id) return;
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await adapter.updateRecurringItem(item.id, {
        note: noteWithSkip(item, monthKey),
      });
      setRecurring((previous) => previous.map((row) => (row.id === item.id ? updated : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗，請稍後再試。');
    } finally {
      setBusyId(null);
    }
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adapter.createRecurringItem) return;
    const amount = Math.round(Number(addForm.amount));
    if (!addForm.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('請填寫名稱與有效金額。');
      return;
    }
    const billingDay = addForm.billingDay ? Number(addForm.billingDay) : null;
    setBusyId('new');
    setError(null);
    try {
      const validBillingDay =
        billingDay && billingDay >= 1 && billingDay <= 31 ? billingDay : null;
      const created = await adapter.createRecurringItem({
        name: addForm.name.trim(),
        amount,
        cycle: addForm.cycle,
        monthlyEquiv: monthlyEquivalent(amount, addForm.cycle),
        category: addForm.category,
        billingDay: validBillingDay,
        active: true,
        nextDue: autoNextDue(addForm.cycle, validBillingDay, null),
        note: noteWithRecurringMeta(
          addForm.note,
          addForm.tag,
          addForm.currency,
          [],
          [],
          addForm.installment ? Number(addForm.installment) : null,
        ),
      });
      setRecurring((previous) => [...previous, created]);
      setAddForm(emptyFixedItemForm());
      setShowAdd(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增失敗，請稍後再試。');
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(item: RecurringExpense) {
    if (!item.id) return;
    setEditId(item.id);
    setEditForm(fixedItemToForm(item));
    setError(null);
  }

  async function updateItem(event: FormEvent<HTMLFormElement>, item: RecurringExpense) {
    event.preventDefault();
    if (!adapter.updateRecurringItem || !item.id) return;
    const amount = Math.round(Number(editForm.amount));
    if (!editForm.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError('請填寫名稱與有效金額。');
      return;
    }
    const billingDay = editForm.billingDay ? Number(editForm.billingDay) : null;
    const oldAmount = itemChargeAmount(item);
    const planChanged = oldAmount !== amount || item.cycle !== editForm.cycle;
    const plans = recurringPlanChanges(item);
    const nextPlans = planChanged
      ? [`${today()}:${cycleLabel(item.cycle)}-${oldAmount}->${cycleLabel(editForm.cycle)}-${amount}`, ...plans]
      : plans;
    setBusyId(item.id);
    setError(null);
    try {
      const validBillingDay =
        billingDay && billingDay >= 1 && billingDay <= 31 ? billingDay : null;
      const updated = await adapter.updateRecurringItem(item.id, {
        name: editForm.name.trim(),
        amount,
        cycle: editForm.cycle,
        monthlyEquiv: monthlyEquivalent(amount, editForm.cycle),
        category: editForm.category,
        billingDay: validBillingDay,
        active: true,
        nextDue: autoNextDue(editForm.cycle, validBillingDay, item.lastPaid ?? null),
        note: noteWithRecurringMeta(
          editForm.note,
          editForm.tag,
          editForm.currency,
          recurringPaymentDates(item),
          nextPlans,
          editForm.installment ? Number(editForm.installment) : null,
        ),
      });
      setRecurring((previous) => previous.map((row) => (row.id === item.id ? updated : row)));
      setEditId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失敗，請稍後再試。');
    } finally {
      setBusyId(null);
    }
  }

  async function recordPayment(item: RecurringExpense, paidDate: string) {
    if (!adapter.updateRecurringItem || !item.id || !paidDate) return;
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await adapter.updateRecurringItem(item.id, {
        lastPaid: paidDate,
        nextDue: autoNextDue(item.cycle, item.billingDay, paidDate, paidDate),
        note: noteWithAddedPayment(item, paidDate),
      });
      setRecurring((previous) => previous.map((row) => (row.id === item.id ? updated : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '繳費紀錄更新失敗。');
    } finally {
      setBusyId(null);
    }
  }

  /** 覆寫整份繳費紀錄（編輯／刪除單筆時使用），lastPaid 跟著最新一筆。 */
  async function savePayments(item: RecurringExpense, payments: string[]) {
    if (!adapter.updateRecurringItem || !item.id) return;
    const cleaned = [...new Set(payments.filter(Boolean))].sort((a, b) => b.localeCompare(a));
    const latest = cleaned[0] ?? null;
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await adapter.updateRecurringItem(item.id, {
        lastPaid: latest,
        nextDue: latest
          ? autoNextDue(item.cycle, item.billingDay, latest, latest)
          : autoNextDue(item.cycle, item.billingDay, null),
        note: noteWithRecurringMeta(
          recurringPlainNote(item),
          recurringTags(item)[0] ?? '',
          recurringCurrency(item),
          cleaned,
          recurringPlanChanges(item),
          installmentTotal(item),
        ),
      });
      setRecurring((previous) => previous.map((row) => (row.id === item.id ? updated : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '繳費紀錄更新失敗。');
    } finally {
      setBusyId(null);
    }
  }

  async function clearCurrentPaid(item: RecurringExpense) {
    if (!adapter.updateRecurringItem || !item.id) return;
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await adapter.updateRecurringItem(item.id, { lastPaid: null });
      setRecurring((previous) => previous.map((row) => (row.id === item.id ? updated : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '狀態更新失敗。');
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(item: RecurringExpense) {
    if (!adapter.deleteRecurringItem || !item.id) return;
    setBusyId(item.id);
    setError(null);
    try {
      await adapter.deleteRecurringItem(item.id);
      setRecurring((previous) => previous.filter((row) => row.id !== item.id));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗，請稍後再試。');
    } finally {
      setBusyId(null);
    }
  }

  function renderForm(
    form: FixedItemForm,
    setForm: (form: FixedItemForm) => void,
    submitLabel: string,
    busy: boolean,
    onCancel?: () => void,
  ) {
    const tagOptions = tagsForCategory(form.category);
    return (
      <>
        <label className="form-field">
          <span className="micro">名稱</span>
          <input
            className="text-input"
            placeholder="Adobe / 健身房 / 分期項目"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span className="micro">應繳金額</span>
          <input
            className="text-input mono"
            type="number"
            placeholder="0"
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
            onChange={(event) =>
              setForm({ ...form, cycle: event.target.value as FixedItemForm['cycle'] })
            }
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
          <select
            className="text-input"
            value={form.tag}
            onChange={(event) => setForm({ ...form, tag: event.target.value })}
          >
            <option value="">不指定</option>
            {tagOptions.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span className="micro">月繳扣款日</span>
          <input
            className="text-input mono"
            type="number"
            min="1"
            max="31"
            placeholder="20"
            value={form.billingDay}
            onChange={(event) => setForm({ ...form, billingDay: event.target.value })}
          />
        </label>
        <label className="form-field">
          <span className="micro">分期期數（選填）</span>
          <input
            className="text-input mono"
            type="number"
            min="1"
            placeholder="例：12"
            value={form.installment}
            onChange={(event) => setForm({ ...form, installment: event.target.value })}
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
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={busy}
              onClick={onCancel}
            >
              取消
            </button>
          )}
        </div>
      </>
    );
  }

  /** Expandable panel under a row — payment history, plan changes, and all
      row actions (mark paid / edit / delete) live here so the row itself
      stays button-free and clean, matching the reference design. Clicking a
      row toggles this open. */
  function renderPanel(item: RecurringExpense, paid: boolean) {
    const payments = recurringPaymentDates(item);
    const planHistory = recurringPlanChanges(item);
    return (
      <div className="fc-panel" onClick={(event) => event.stopPropagation()}>
        <div className="fc-panel__actions">
          {paid ? (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={busyId === item.id}
              onClick={() => void clearCurrentPaid(item)}
            >
              改為待繳
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={busyId === item.id}
              onClick={() => void recordPayment(item, today())}
            >
              標記今日已繳
            </button>
          )}
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => startEdit(item)}
          >
            編輯
          </button>
          {deleteConfirmId === item.id ? (
            <>
              <button
                type="button"
                className="btn btn--secondary btn--sm dashboard__fixed-danger"
                disabled={busyId === item.id}
                onClick={() => void removeItem(item)}
              >
                確認刪除
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setDeleteConfirmId(null)}
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--secondary btn--sm dashboard__fixed-danger"
              onClick={() => setDeleteConfirmId(item.id ?? null)}
            >
              刪除
            </button>
          )}
        </div>

        <div className="fc-history__head">
          <span className="micro">繳費紀錄</span>
          <span className="fc-history__add">
            <input
              className="text-input mono fc-history__date"
              type="date"
              value={newPayDate}
              onChange={(event) => setNewPayDate(event.target.value)}
            />
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busyId === item.id || !newPayDate}
              onClick={() => void recordPayment(item, newPayDate)}
            >
              新增紀錄
            </button>
          </span>
        </div>
        {payments.length === 0 ? (
          <span className="caption">尚無繳費紀錄。</span>
        ) : (
          payments.map((date, index) => (
            <div key={`${date}-${index}`} className="fc-history__row">
              <input
                className="text-input mono fc-history__date"
                type="date"
                value={date}
                disabled={busyId === item.id}
                onChange={(event) => {
                  const next = [...payments];
                  next[index] = event.target.value;
                  void savePayments(item, next);
                }}
              />
              {index === 0 && <span className="micro fc-history__latest">最新</span>}
              <button
                type="button"
                className="dashboard__fixed-delete"
                aria-label={`刪除繳費紀錄 ${date}`}
                title="刪除此筆紀錄"
                disabled={busyId === item.id}
                onClick={() =>
                  void savePayments(
                    item,
                    payments.filter((_, i) => i !== index),
                  )
                }
              >
                ✕
              </button>
            </div>
          ))
        )}
        {planHistory.length > 0 && (
          <div className="fc-history__plans caption">方案調整：{planHistory.join('、')}</div>
        )}

        {editId === item.id && (
          <form
            onSubmit={(event) => void updateItem(event, item)}
            className="form-grid dashboard__fixed-edit-form"
          >
            {renderForm(editForm, setEditForm, '儲存', busyId === item.id, () =>
              setEditId(null),
            )}
          </form>
        )}
      </div>
    );
  }

  function statusCell(item: RecurringExpense, paid: boolean) {
    if (paid) {
      const last = recurringPaymentDates(item)[0] ?? item.lastPaid ?? null;
      return <span className="fc-c-status fc-status--paid">已扣款 {monthDay(last)}</span>;
    }
    if (isMissingThisMonth(item, monthKey, monthTransactions)) {
      return <span className="fc-c-status fc-status--miss">缺漏</span>;
    }
    return <span className="fc-c-status fc-status--due">待繳</span>;
  }

  /** A clickable row (summary grid) plus its expandable panel. std/sub/other
      variants differ only in which cells the summary shows. */
  function renderItem(row: { item: RecurringExpense; paid: boolean }, variant: 'std' | 'sub') {
    const { item, paid } = row;
    const itemId = item.id ?? item.name;
    const open = historyOpenId === itemId;
    const currency = recurringCurrency(item) !== 'TWD' ? `${recurringCurrency(item)} ` : '';
    const lastPaid = recurringPaymentDates(item)[0] ?? item.lastPaid ?? null;
    const toggle = () => {
      setHistoryOpenId(open ? null : itemId);
      setNewPayDate(today());
    };
    return (
      <div key={itemId} className="fc-item">
        <div
          className={`fc-row fc-row--${variant}${open ? ' fc-row--open' : ''}`}
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggle();
            }
          }}
        >
          <span className="fc-c-name cell-ellipsis" title={item.name}>
            {item.name}
            <span className="micro dashboard__fixed-meta">
              {' '}
              {item.category}
              {recurringTags(item)[0] ? ` · ${recurringTags(item)[0]}` : ''}
              {fixedDueText(item) ? ` · ${fixedDueText(item)}` : ''}
            </span>
          </span>
          {variant === 'std' && (
            <span className="fc-c-cycle micro tx-muted">
              <span className="fc-c-lbl">週期 </span>
              {cycleLabel(item.cycle)}
            </span>
          )}
          <span className="fc-c-amount amount-s">
            <span className="fc-c-lbl">金額 </span>
            {currency}
            {formatPlain(itemChargeAmount(item))}
          </span>
          {variant === 'std' && statusCell(item, paid)}
          {variant === 'sub' && (
            <span className="fc-c-last micro tx-muted">
              <span className="fc-c-lbl">上次扣款 </span>
              {monthDay(lastPaid)}
            </span>
          )}
        </div>
        {open && renderPanel(item, paid)}
      </div>
    );
  }

  /** Installment row: 項目 / 剩餘 / 月付 / 下次扣款. */
  function renderInstallmentRow(row: { item: RecurringExpense; paid: boolean }) {
    const { item, paid } = row;
    const itemId = item.id ?? item.name;
    const open = historyOpenId === itemId;
    const currency = recurringCurrency(item) !== 'TWD' ? `${recurringCurrency(item)} ` : '';
    const total = installmentTotal(item);
    const remaining = installmentRemaining(item);
    const toggle = () => {
      setHistoryOpenId(open ? null : itemId);
      setNewPayDate(today());
    };
    return (
      <div key={itemId} className="fc-item">
        <div
          className={`fc-row fc-row--inst${open ? ' fc-row--open' : ''}`}
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggle();
            }
          }}
        >
          <span className="fc-c-name cell-ellipsis" title={item.name}>
            {item.name}
            <span className="micro dashboard__fixed-meta">
              {' '}
              {item.category}
              {recurringTags(item)[0] ? ` · ${recurringTags(item)[0]}` : ''}
            </span>
          </span>
          <span className="fc-c-remain">
            <span className="fc-c-lbl">剩餘 </span>
            {remaining != null ? remaining : '—'}
            <span className="tx-muted"> / {total} 期</span>
          </span>
          <span className="fc-c-monthly amount-s">
            <span className="fc-c-lbl">月付 </span>
            {currency}
            {formatPlain(itemChargeAmount(item))}
          </span>
          <span className="fc-c-next micro tx-muted">
            <span className="fc-c-lbl">下次扣款 </span>
            {monthDay(item.nextDue ?? null)}
          </span>
        </div>
        {open && renderPanel(item, paid)}
      </div>
    );
  }

  function renderSectionHead(variant: 'std' | 'sub' | 'inst') {
    if (variant === 'inst') {
      return (
        <div className="fc-row fc-row--inst fc-row--head">
          <span className="fc-c-name">項目</span>
          <span className="fc-c-remain">剩餘</span>
          <span className="fc-c-monthly">月付</span>
          <span className="fc-c-next">下次扣款</span>
        </div>
      );
    }
    if (variant === 'sub') {
      return (
        <div className="fc-row fc-row--sub fc-row--head">
          <span className="fc-c-name">服務</span>
          <span className="fc-c-amount">金額</span>
          <span className="fc-c-last">上次扣款</span>
        </div>
      );
    }
    return (
      <div className="fc-row fc-row--std fc-row--head">
        <span className="fc-c-name">項目</span>
        <span className="fc-c-cycle">週期</span>
        <span className="fc-c-amount">金額</span>
        <span className="fc-c-status">狀態</span>
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <Link to="/" className="back-header__btn mobile-only" aria-label="返回總覽">
            ‹
          </Link>
          <h1 className="h1">固定支出</h1>
          <span className="caption fc-subtitle desktop-only">
            年繳／半年繳以月當量計入承諾 · {now.getFullYear()}年{now.getMonth() + 1}月
          </span>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setShowAdd((value) => !value)}
        >
          {showAdd ? '收起' : '＋ 新增固定支出'}
        </button>
      </header>

      {error && <div className="caption dashboard__fixed-error">{error}</div>}

      <div className="grid-12">
        {/* Stat cards */}
        <section className="card span-4">
          <div className="stat__label">每月承諾合計</div>
          <div className="stat__value fc-stat">{formatCurrency(monthlyTotal)}</div>
          {nonMonthlyEquiv > 0 && (
            <div className="caption">含年繳／半年繳月當量 {formatPlain(nonMonthlyEquiv)}</div>
          )}
        </section>
        <section className="card span-4">
          <div className="stat__label">訂閱月當量</div>
          <div className="stat__value fc-stat">
            {formatPlain(subsTotal)} <span className="fc-stat-sub">· {subRows.length} 筆</span>
          </div>
          <div className="caption">
            {subDay ? `統一扣款日 每月 ${subDay} 日` : '工作軟體與影音訂閱'}
          </div>
        </section>
        <section
          className={`card span-4${missing.length > 0 ? ' fc-alert-card' : ''}`}
        >
          <div className="stat__label">偵測提醒</div>
          <div className={`stat__value fc-stat${missing.length > 0 ? ' liability' : ''}`}>
            {missing.length} 件
          </div>
          <div className="caption">
            {missing.length > 0 ? `${missing.length} 筆本月尚未扣款` : '本月固定支出無異常'}
          </div>
        </section>

        {/* 缺漏 alert banners */}
        {missing.map(({ item }) => (
          <div key={`miss-${item.id}`} className="card span-12 fc-banner">
            <span className="fc-banner__dot" />
            <span className="caption fc-banner__text">
              <strong>缺漏</strong> — {item.name} {formatPlain(itemChargeAmount(item))}
              {item.billingDay ? ` 通常於每月 ${item.billingDay} 日扣款，` : ' '}本月尚未出現對應交易。
            </span>
            <span className="fc-banner__actions">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={busyId === item.id}
                onClick={() => void recordPayment(item, today())}
              >
                已手動繳款，補記
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                disabled={busyId === item.id}
                onClick={() => void skipThisMonth(item)}
              >
                本月暫停
              </button>
            </span>
          </div>
        ))}

        {showAdd && (
          <section className="card span-12">
            <h2 className="h2">新增固定支出</h2>
            <form onSubmit={(event) => void addItem(event)} className="form-grid">
              {renderForm(addForm, setAddForm, '新增', busyId === 'new')}
            </form>
          </section>
        )}

        {rows.length === 0 && !showAdd ? (
          <section className="card span-12">
            <span className="caption dashboard__fixed-empty">
              尚未建立固定支出。可新增軟體方案、分期、年繳或其他固定繳費項目。
            </span>
          </section>
        ) : (
          <div className="span-12 fc-columns">
            {/* Left column: 健康 / 分期 / 其他固定承諾 */}
            <div className="fc-col">
              {healthRows.length > 0 && (
                <section className="card">
                  <div className="card__header">
                    <h2 className="h2">健康</h2>
                    <span className="micro fc-group-note">
                      月承諾 {formatPlain(twdMonthlyEquiv(healthRows))}
                    </span>
                  </div>
                  <div className="fc-sec">
                    {renderSectionHead('std')}
                    {healthRows.map((row) => renderItem(row, 'std'))}
                  </div>
                </section>
              )}

              {/* 分期 — always shown (機車 / 電腦 這類分期購買) */}
              <section className="card">
                <div className="card__header">
                  <h2 className="h2">分期</h2>
                  <span className="micro fc-group-note">
                    月付合計 {formatPlain(installmentTotalMonthly)}
                  </span>
                </div>
                {installmentRows.length > 0 ? (
                  <>
                    <div className="fc-sec">
                      {renderSectionHead('inst')}
                      {installmentRows.map((row) => renderInstallmentRow(row))}
                    </div>
                    <div className="micro fc-group-note" style={{ marginTop: 8 }}>
                      剩餘期數＝分期期數扣除已記錄繳費筆數；本金入資產頁負債，此處僅追蹤月付現金流。
                    </div>
                  </>
                ) : (
                  <span className="caption dashboard__fixed-empty">
                    尚無分期項目。編輯項目並填入「分期期數」即可加入（例：機車、筆電分期）。
                  </span>
                )}
              </section>

              {otherRows.length > 0 && (
                <section className="card">
                  <div className="card__header">
                    <h2 className="h2">其他固定承諾</h2>
                    <span className="micro fc-group-note">
                      月承諾 {formatPlain(twdMonthlyEquiv(otherRows))}
                    </span>
                  </div>
                  <div className="fc-sec">
                    {renderSectionHead('std')}
                    {otherRows.map((row) => renderItem(row, 'std'))}
                  </div>
                </section>
              )}
            </div>

            {/* Right column: 訂閱（工作軟體＋影音） */}
            <div className="fc-col">
              {subRows.length > 0 && (
                <section className="card">
                  <div className="card__header">
                    <h2 className="h2">訂閱</h2>
                    <span className="micro fc-group-note">
                      月當量 {formatPlain(subsTotal)} · 工作軟體與影音
                    </span>
                  </div>
                  <div className="fc-sec">
                    {renderSectionHead('sub')}
                    {subRows.map((row) => renderItem(row, 'sub'))}
                  </div>
                </section>
              )}
              <section className="card fc-rule-card">
                <div className="caption" style={{ lineHeight: 1.7 }}>
                  規則：工作與娛樂分類歸「訂閱」，帶分期期數的項目歸「分期」，
                  健康自成一區，其餘為「其他固定承諾」。點一列即可展開繳費紀錄與編輯。
                  缺漏＝月繳項目已過扣款日仍未出現對應交易。
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
