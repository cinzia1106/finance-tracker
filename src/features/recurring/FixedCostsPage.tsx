import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAdapter } from '../../data/AdapterContext';
import { tagsForCategory } from '../../data/categoryDefinitions';
import { useAppOutletContext } from '../../layout/AppLayout';
import { formatPlain } from '../../lib/format';
import type { RecurringExpense, Transaction } from '../../types/models';
import {
  CURRENCY_OPTIONS,
  CYCLE_OPTIONS,
  FIXED_CATEGORY_OPTIONS,
  type FixedItemForm,
  cycleLabel,
  cycleRank,
  emptyFixedItemForm,
  fixedDueText,
  fixedItemToForm,
  isPaidThisMonth,
  itemAmount,
  itemChargeAmount,
  monthlyEquivalent,
  noteWithAddedPayment,
  noteWithRecurringMeta,
  recurringCurrency,
  recurringPaymentDates,
  recurringPlanChanges,
  recurringTags,
} from './recurringShared';

function today() {
  return new Date().toISOString().slice(0, 10);
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
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({});
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

  const monthlyTotal = rows.reduce(
    (sum, row) => sum + (recurringCurrency(row.item) === 'TWD' ? itemAmount(row.item) : 0),
    0,
  );
  const paidCount = rows.filter((row) => row.paid).length;

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
      const updated = await adapter.updateRecurringItem(item.id, {
        name: editForm.name.trim(),
        amount,
        cycle: editForm.cycle,
        monthlyEquiv: monthlyEquivalent(amount, editForm.cycle),
        category: editForm.category,
        billingDay: billingDay && billingDay >= 1 && billingDay <= 31 ? billingDay : null,
        active: true,
        nextDue: editForm.nextDue || undefined,
        note: noteWithRecurringMeta(
          editForm.note,
          editForm.tag,
          editForm.currency,
          recurringPaymentDates(item),
          nextPlans,
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
        note: noteWithAddedPayment(item, paidDate),
      });
      setRecurring((previous) => previous.map((row) => (row.id === item.id ? updated : row)));
      setPaymentDates((previous) => ({ ...previous, [item.id ?? '']: paidDate }));
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
          <span className="micro">下次扣款</span>
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

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <Link to="/" className="back-header__btn mobile-only" aria-label="回總覽">
            ←
          </Link>
          <h1 className="h1">固定支出</h1>
          {rows.length > 0 && (
            <span className="caption">
              已支出 {paidCount}/{rows.length} · TWD 月均 {formatPlain(monthlyTotal)}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setShowAdd((value) => !value)}
        >
          {showAdd ? '收起' : '＋ 新增項目'}
        </button>
      </header>

      {error && <div className="caption dashboard__fixed-error">{error}</div>}

      <div className="grid-12">
        {showAdd && (
          <section className="card span-12">
            <h2 className="h2">新增固定支出</h2>
            <form onSubmit={(event) => void addItem(event)} className="form-grid">
              {renderForm(addForm, setAddForm, '新增', busyId === 'new')}
            </form>
          </section>
        )}

        <section className="card span-12">
          {rows.length === 0 && !showAdd ? (
            <span className="caption dashboard__fixed-empty">
              尚未建立固定支出。可新增軟體方案、分期、年繳或其他固定繳費項目。
            </span>
          ) : (
            <div className="dashboard__fixed-list">
              {rows.map(({ item, paid }) => {
                const itemId = item.id ?? item.name;
                const paymentDate = paymentDates[itemId] ?? today();
                const paymentHistory = recurringPaymentDates(item).slice(0, 3);
                const planHistory = recurringPlanChanges(item).slice(0, 2);
                return (
                  <div key={itemId} className="dashboard__fixed-row">
                    <span className="dashboard__fixed-name cell-ellipsis" title={item.name}>
                      {item.name}
                      <span className="micro dashboard__fixed-meta">
                        {' '}
                        {item.category}
                        {recurringTags(item)[0] ? ` · ${recurringTags(item)[0]}` : ''}
                        {` · ${cycleLabel(item.cycle)}`}
                        {fixedDueText(item) ? ` · ${fixedDueText(item)}` : ''}
                        {paymentHistory.length > 0 ? ` · 繳費 ${paymentHistory.join('、')}` : ''}
                        {planHistory.length > 0 ? ` · 方案 ${planHistory.join('、')}` : ''}
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
                        onClick={() => void clearCurrentPaid(item)}
                      >
                        <span className="badge__dot" />
                        已繳費
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="badge badge--review dashboard__fixed-badge"
                        disabled={busyId === item.id}
                        onClick={() => void recordPayment(item, paymentDate)}
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
                      </span>
                    ) : (
                      <span className="dashboard__fixed-actions">
                        <input
                          className="text-input mono dashboard__fixed-paid-date"
                          type="date"
                          value={paymentDate}
                          onChange={(event) =>
                            setPaymentDates((previous) => ({
                              ...previous,
                              [itemId]: event.target.value,
                            }))
                          }
                          title="繳費日期"
                        />
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          disabled={busyId === item.id}
                          onClick={() => void recordPayment(item, paymentDate)}
                        >
                          記錄繳費
                        </button>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => startEdit(item)}
                        >
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
              })}
            </div>
          )}
        </section>

        <section className="card span-12">
          <div className="caption" style={{ lineHeight: 1.7 }}>
            提醒：固定支出的繳費日期與方案變更紀錄會保存在項目備註的內部標記中；不會新增資料表。
            若方案金額或週期改變，按「編輯」儲存後會留下方案變更紀錄。
          </div>
        </section>
      </div>
    </>
  );
}
