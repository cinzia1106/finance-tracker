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

  const monthlyTotal = rows.reduce(
    (sum, row) => sum + (recurringCurrency(row.item) === 'TWD' ? itemAmount(row.item) : 0),
    0,
  );
  /** Monthly-equivalent contributed by non-monthly (yearly/semiannual)
      commitments, shown as the "含年繳月當量" note on the total. */
  const nonMonthlyEquiv = rows.reduce(
    (sum, row) =>
      row.item.cycle !== 'monthly' && recurringCurrency(row.item) === 'TWD'
        ? sum + itemAmount(row.item)
        : sum,
    0,
  );

  /** 20-day digital-subscription group. */
  const sub20 = rows.filter((row) => row.item.billingDay === 20);
  const sub20Total = sub20.reduce((sum, row) => sum + itemChargeAmount(row.item), 0);

  /** Missing-this-month monthly commitments. */
  const missing = rows.filter((row) =>
    isMissingThisMonth(row.item, monthKey, monthTransactions),
  );

  /** Everything except the 20-day group, grouped by category with a
      monthly-equivalent subtotal (matches the design's section tables). */
  const categoryGroups = useMemo(() => {
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      if (row.item.billingDay === 20) continue;
      const key = row.item.category || '其他固定承諾';
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()].map(([category, list]) => ({
      category,
      list,
      subtotal: list.reduce(
        (sum, row) => sum + (recurringCurrency(row.item) === 'TWD' ? itemAmount(row.item) : 0),
        0,
      ),
    }));
  }, [rows, monthKey]);

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

  function renderRow(row: { item: RecurringExpense; paid: boolean }) {
    const { item, paid } = row;
    const itemId = item.id ?? item.name;
    const payments = recurringPaymentDates(item);
    const planHistory = recurringPlanChanges(item);
    const historyOpen = historyOpenId === itemId;
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
                        title="點擊以今天記錄繳費"
                        onClick={() => void recordPayment(item, today())}
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
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => {
                            setHistoryOpenId(historyOpen ? null : itemId);
                            setNewPayDate(today());
                          }}
                          aria-expanded={historyOpen}
                        >
                          紀錄{payments.length > 0 ? ` ${payments.length}` : ''}
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
                          ✕
                        </button>
                      </span>
                    )}

                    {/* 繳費紀錄 — 點「紀錄」展開，可新增／修改／刪除單筆 */}
                    {historyOpen && (
                      <div className="fc-history">
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
                              {index === 0 && (
                                <span className="micro fc-history__latest">最新</span>
                              )}
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
                          <div className="fc-history__plans caption">
                            方案調整：{planHistory.join('、')}
                          </div>
                        )}
                      </div>
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
          <div className="stat__label">20 日訂閱群組</div>
          <div className="stat__value fc-stat">
            {formatPlain(sub20Total)} <span className="fc-stat-sub">· {sub20.length} 筆</span>
          </div>
          <div className="caption">統一扣款日 每月 20 日</div>
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
          <>
            {/* 數位訂閱 · 20日群組 */}
            {sub20.length > 0 && (
              <section className="card span-12">
                <div className="card__header">
                  <h2 className="h2">數位訂閱 · 20 日群組</h2>
                  <span className="micro fc-group-note">
                    合計 {formatPlain(sub20Total)} · 每月 20 日扣款
                  </span>
                </div>
                <div className="dashboard__fixed-list">{sub20.map(renderRow)}</div>
              </section>
            )}

            {/* Category groups */}
            {categoryGroups.map((group) => (
              <section key={group.category} className="card span-12">
                <div className="card__header">
                  <h2 className="h2">{group.category}</h2>
                  <span className="micro fc-group-note">
                    月承諾 {formatPlain(group.subtotal)}
                  </span>
                </div>
                <div className="dashboard__fixed-list">{group.list.map(renderRow)}</div>
              </section>
            ))}
          </>
        )}

        <section className="card span-12">
          <div className="caption" style={{ lineHeight: 1.7 }}>
            規則：年繳／半年繳以月當量計入每月承諾；billingDay 為 20 的項目歸「數位訂閱」群組。
            下次扣款日自動推算——月繳依扣款日、年繳／半年繳依最後繳費日加一個週期。
            缺漏＝月繳項目已過扣款日仍未出現對應交易；「補記」記錄一筆繳費、「本月暫停」略過本月偵測。
          </div>
        </section>
      </div>
    </>
  );
}
