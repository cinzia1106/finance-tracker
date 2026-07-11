/* 總覽 Dashboard — 本月現金流、固定支出繳費狀態、預算與信用卡。
   固定支出是使用者自建清單（recurring_items），已繳 = lastPaid 落在
   檢視月份；標記/新增/刪除走 adapter 的 recurring CRUD。 */

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { MonthOverview } from '../../data/adapter';
import { useAdapter } from '../../data/AdapterContext';
import { CATEGORY_DEFINITIONS } from '../../data/categoryDefinitions';
import type { RecurringExpense } from '../../types/models';
import { useAppOutletContext } from '../../layout/AppLayout';
import { BudgetRow, ReviewBadge, CountBadge } from '../../components/ui';
import { formatCurrency, formatPlain, formatSigned } from '../../lib/format';
import './dashboard.css';

const FIXED_CATEGORY_OPTIONS = CATEGORY_DEFINITIONS.filter((c) => c.kind === 'expense').map(
  (c) => c.name,
);

function itemAmount(item: RecurringExpense) {
  return item.amount ?? item.monthlyEquiv ?? 0;
}

export default function DashboardPage() {
  const adapter = useAdapter();
  const { openQuickNote, dataVersion } = useAppOutletContext();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthOverview | null>(null);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', amount: '', category: '訂閱', billingDay: '' });
  const [fixedError, setFixedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adapter.getMonthOverview(year, month).then((d) => {
      if (!cancelled) setData(d);
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

  /** 每月固定支出：自建清單＋本月繳費狀態。 */
  const fixedCosts = useMemo(() => {
    const rows = recurring
      .filter((item) => item.active !== false)
      .map((item) => ({ item, paid: (item.lastPaid ?? '').startsWith(monthKey) }));
    rows.sort(
      (a, b) => Number(a.paid) - Number(b.paid) || itemAmount(b.item) - itemAmount(a.item),
    );
    return {
      rows,
      total: rows.reduce((sum, row) => sum + itemAmount(row.item), 0),
      paidCount: rows.filter((row) => row.paid).length,
    };
  }, [recurring, monthKey]);

  async function addFixedItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adapter.createRecurringItem) return;
    const amount = Math.round(Number(addForm.amount));
    if (!addForm.name.trim() || !Number.isFinite(amount) || amount <= 0) {
      setFixedError('請填寫名稱與正確金額。');
      return;
    }
    const billingDay = addForm.billingDay ? Number(addForm.billingDay) : null;
    setBusyId('new');
    setFixedError(null);
    try {
      const created = await adapter.createRecurringItem({
        name: addForm.name.trim(),
        amount,
        cycle: 'monthly',
        monthlyEquiv: null,
        category: addForm.category,
        billingDay: billingDay && billingDay >= 1 && billingDay <= 31 ? billingDay : null,
        active: true,
      });
      setRecurring((prev) => [...prev, created]);
      setAddForm({ name: '', amount: '', category: '訂閱', billingDay: '' });
      setShowAdd(false);
    } catch (err) {
      setFixedError(err instanceof Error ? err.message : '新增失敗，請稍後再試。');
    } finally {
      setBusyId(null);
    }
  }

  async function setPaid(item: RecurringExpense, paid: boolean) {
    if (!adapter.updateRecurringItem || !item.id) return;
    const lastPaid = paid
      ? isCurrentMonth
        ? new Date().toISOString().slice(0, 10)
        : `${monthKey}-01`
      : null;
    setBusyId(item.id);
    setFixedError(null);
    try {
      await adapter.updateRecurringItem(item.id, { lastPaid });
      setRecurring((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, lastPaid: lastPaid ?? undefined } : row,
        ),
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
      setRecurring((prev) => prev.filter((row) => row.id !== item.id));
      setDeleteConfirmId(null);
    } catch (err) {
      setFixedError(err instanceof Error ? err.message : '刪除失敗，請稍後再試。');
    } finally {
      setBusyId(null);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  if (!data) return null;

  const netCashflow = data.income - data.expense;

  return (
    <>
      {/* Page header — desktop: month switch + import note + CTA; mobile: month + badge */}
      <header className="page-header">
        <div className="page-header__lead">
          <h1 className="h1">
            <span className="desktop-only">
              {year}年{month}月
            </span>
            <span className="mobile-only">{month}月</span>
          </h1>
          <div className="month-switch">
            <button type="button" className="month-switch__btn" onClick={() => shiftMonth(-1)}>
              ‹
            </button>
            <button type="button" className="month-switch__btn" onClick={() => shiftMonth(1)}>
              ›
            </button>
          </div>
          <span className="caption desktop-only">
            {data.lastImportNote ? `上次匯入 ${data.lastImportNote}` : ''}
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
        {/* 淨現金流 */}
        <section className="card span-5">
          <div className="micro">本月淨現金流</div>
          <div className="amount-xl">{formatCurrency(netCashflow, true)}</div>
          <div className="dashboard__flow-legend">
            <span>
              <span className="dashboard__dot" style={{ background: 'var(--color-mint)' }} />
              收入 <span className="mono dashboard__flow-num">{formatPlain(data.income)}</span>
            </span>
            <span>
              <span className="dashboard__dot" style={{ background: 'var(--color-mocha)' }} />
              支出 <span className="mono dashboard__flow-num">{formatPlain(data.expense)}</span>
            </span>
            <span className="dashboard__transfer-note desktop-only">
              轉帳 {data.transferCount} 筆不計入
            </span>
          </div>
          <div className="dashboard__income-sources desktop-only">
            {data.incomeBySource.map((s) => (
              <span key={s.source}>
                {s.source} <span className="mono">{formatPlain(s.amount)}</span>
              </span>
            ))}
          </div>
        </section>

        {/* 每月固定支出 — 自建清單＋本月繳費狀態 */}
        <section className="card span-7">
          <div className="card__header">
            <h2 className="h2">每月固定支出</h2>
            <span className="dashboard__fixed-header-side">
              {fixedCosts.rows.length > 0 && (
                <span className="micro dashboard__group-note">
                  已繳 {fixedCosts.paidCount}/{fixedCosts.rows.length} · 月承諾{' '}
                  {formatPlain(fixedCosts.total)}
                </span>
              )}
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setShowAdd((v) => !v)}
              >
                {showAdd ? '收合' : '＋ 新增'}
              </button>
            </span>
          </div>

          {fixedError && <div className="caption dashboard__fixed-error">{fixedError}</div>}

          {showAdd && (
            <form onSubmit={(e) => void addFixedItem(e)} className="form-grid dashboard__fixed-form">
              <label className="form-field">
                <span className="micro">名稱</span>
                <input
                  className="text-input"
                  placeholder="Adobe / 健身房 / 筆電分期…"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                />
              </label>
              <label className="form-field">
                <span className="micro">每月金額</span>
                <input
                  className="text-input mono"
                  type="number"
                  placeholder="0"
                  value={addForm.amount}
                  onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                />
              </label>
              <label className="form-field">
                <span className="micro">分類</span>
                <select
                  className="text-input"
                  value={addForm.category}
                  onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                >
                  {FIXED_CATEGORY_OPTIONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span className="micro">每月扣款日（選填）</span>
                <input
                  className="text-input mono"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="20"
                  value={addForm.billingDay}
                  onChange={(e) => setAddForm({ ...addForm, billingDay: e.target.value })}
                />
              </label>
              <div className="form-actions">
                <button type="submit" className="btn btn--primary btn--sm" disabled={busyId === 'new'}>
                  新增項目
                </button>
              </div>
            </form>
          )}

          {fixedCosts.rows.length === 0 && !showAdd ? (
            <span className="caption dashboard__fixed-empty">
              尚未建立固定支出。按「＋ 新增」把訂閱軟體、分期、健身等每月固定項目列進來，
              就能追蹤本月是否已繳費。
            </span>
          ) : (
            <div className="dashboard__fixed-list">
              {fixedCosts.rows.map(({ item, paid }) => (
                <div key={item.id} className="dashboard__fixed-row">
                  <span className="dashboard__fixed-name cell-ellipsis" title={item.name}>
                    {item.name}
                    <span className="micro dashboard__fixed-meta">
                      {' '}
                      {item.category}
                      {item.billingDay ? ` · 每月${item.billingDay}日` : ''}
                    </span>
                  </span>
                  <span className="amount-s dashboard__fixed-amount">
                    {formatPlain(itemAmount(item))}
                  </span>
                  {paid ? (
                    <button
                      type="button"
                      className="badge badge--confirmed dashboard__fixed-badge"
                      disabled={busyId === item.id}
                      title="點擊改為未繳"
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
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => setDeleteConfirmId(null)}
                      >
                        取消
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="dashboard__fixed-delete"
                      aria-label={`刪除 ${item.name}`}
                      title="刪除"
                      onClick={() => setDeleteConfirmId(item.id ?? null)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 變動預算 — 支出與預算對照 */}
        <section className="card span-6">
          <div className="card__header">
            <h2 className="h2">變動預算</h2>
            <span className="micro dashboard__group-note">本月支出 vs 預算</span>
          </div>
          {data.budgets.length === 0 ? (
            <span className="caption">尚未設定預算。可於設定頁配置各分類預算。</span>
          ) : (
            data.budgets.map((b) => <BudgetRow key={b.category} {...b} />)
          )}
        </section>

        {/* 信用卡 */}
        <section className="card span-6">
          <div className="card__header">
            <h2 className="h2">信用卡</h2>
            <span className="micro dashboard__group-note">
              20日訂閱 {data.creditCard.subscriptionCount} 筆
              <span className="desktop-only"> · {formatPlain(data.creditCard.subscriptionTotal)}</span>
            </span>
          </div>
          <div className="dashboard__cc-figures">
            <div>
              <div className="micro dashboard__cc-label">本期已刷</div>
              <div className="amount-l">{formatPlain(data.creditCard.charged)}</div>
            </div>
            <div>
              <div className="micro dashboard__cc-label">
                待繳 · {data.creditCard.dueDate} {data.creditCard.dueNote}
              </div>
              <div className="amount-l liability">{formatPlain(data.creditCard.due)}</div>
            </div>
          </div>
          <div className="caption dashboard__cc-note desktop-only">
            繳卡費以轉帳記錄，不重複列為支出
          </div>
        </section>

        {/* 管理入口 — mobile only（設計：管理頁從總覽進入，底部導航固定 4 分頁） */}
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

        {/* 最近交易 — desktop only */}
        <section className="card span-12 desktop-only">
          <div className="card__header">
            <h2 className="h2">最近交易</h2>
            <Link to="/transactions" className="caption dashboard__card-link">
              前往明細 →
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
                    <span className="status-text--excluded">不計入</span>
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
