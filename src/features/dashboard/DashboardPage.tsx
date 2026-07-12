/* 總覽 Dashboard — 本月現金流、待繳固定支出提醒、預算與信用卡。
   固定支出的完整管理在「固定支出」頁；這裡只列出檢視月份尚未繳費的
   項目，提供快速標記已繳。 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CountBadge, ReviewBadge } from '../../components/ui';
import type { MonthOverview } from '../../data/adapter';
import { useAdapter } from '../../data/AdapterContext';
import { useAppOutletContext } from '../../layout/AppLayout';
import { formatCurrency, formatPlain, formatSigned } from '../../lib/format';
import type { RecurringExpense, Transaction } from '../../types/models';
import {
  cycleRank,
  fixedDueText,
  isPaidThisMonth,
  itemAmount,
  itemChargeAmount,
  recurringCurrency,
} from '../recurring/recurringShared';
import './dashboard.css';

function addMonths(date: string, months: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  return parsed.toISOString().slice(0, 10);
}

function dateInMonth(date: string | undefined, year: number, month: number) {
  if (!date) return false;
  return date.startsWith(`${year}-${String(month).padStart(2, '0')}`);
}

function fixedItemOccursInMonth(item: RecurringExpense, year: number, month: number) {
  if (item.cycle === 'monthly') return true;
  if (item.cycle === 'yearly') return dateInMonth(item.nextDue, year, month);
  if (item.cycle === 'semiannual') {
    return (
      dateInMonth(item.nextDue, year, month) ||
      dateInMonth(item.nextDue ? addMonths(item.nextDue, 6) : undefined, year, month)
    );
  }
  return dateInMonth(item.nextDue, year, month);
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
  const [fixedError, setFixedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adapter.getMonthOverview(year, month).then((overview) => {
      if (!cancelled) setData(overview);
    });
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

  /** 檢視月份的固定支出繳費狀態；狀態改變後仍保留在本月列表。 */
  const fixedDue = useMemo(() => {
    const active = recurring.filter(
      (item) => item.active !== false && fixedItemOccursInMonth(item, year, month),
    );
    const rows = active.map((item) => ({
      item,
      paid: isPaidThisMonth(item, monthKey, monthTransactions),
    }));
    rows.sort(
      (a, b) =>
        cycleRank(a.item.cycle) - cycleRank(b.item.cycle) ||
        Number(a.paid) - Number(b.paid) ||
        itemAmount(b.item) - itemAmount(a.item),
    );
    return {
      rows,
      totalCount: rows.length,
      paidCount: rows.filter((row) => row.paid).length,
      total: rows.reduce(
        (sum, row) => sum + (recurringCurrency(row.item) === 'TWD' ? itemChargeAmount(row.item) : 0),
        0,
      ),
    };
  }, [recurring, year, month, monthKey, monthTransactions]);

  async function markPaid(item: RecurringExpense) {
    if (!adapter.updateRecurringItem || !item.id) return;
    const lastPaid = isCurrentMonth ? new Date().toISOString().slice(0, 10) : `${monthKey}-01`;
    setBusyId(item.id);
    setFixedError(null);
    try {
      await adapter.updateRecurringItem(item.id, { lastPaid });
      setRecurring((previous) =>
        previous.map((row) => (row.id === item.id ? { ...row, lastPaid } : row)),
      );
    } catch (err) {
      setFixedError(err instanceof Error ? err.message : '更新失敗，請稍後再試。');
    } finally {
      setBusyId(null);
    }
  }

  function shiftMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
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
        {/* 淨現金流 */}
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
            <span className="dashboard__transfer-note desktop-only">
              轉帳 {data.transferCount} 筆，不列入收支
            </span>
          </div>
        </section>

        {/* 本月固定支出 — 列出檢視月份所有固定支出，狀態變更後仍保留 */}
        <section className="card span-7">
          <div className="card__header">
            <h2 className="h2">本月固定支出</h2>
            <span className="dashboard__fixed-header-side">
              {fixedDue.totalCount > 0 && (
                <span className="micro dashboard__group-note">
                  已繳 {fixedDue.paidCount}/{fixedDue.totalCount} · TWD {formatPlain(fixedDue.total)}
                </span>
              )}
              <Link to="/recurring" className="caption dashboard__card-link">
                管理固定支出 →
              </Link>
            </span>
          </div>

          {fixedError && <div className="caption dashboard__fixed-error">{fixedError}</div>}

          {fixedDue.totalCount === 0 ? (
            <span className="caption dashboard__fixed-empty">
              尚未建立固定支出。到「固定支出」頁把訂閱軟體、分期、健身等項目列進來，
              當月固定支出會自動出現在這裡。
            </span>
          ) : (
            <div className="dashboard__fixed-list">
              {fixedDue.rows.map(({ item, paid }) => (
                <div key={item.id} className="dashboard__fixed-row">
                  <span className="dashboard__fixed-name cell-ellipsis" title={item.name}>
                    {item.name}
                    <span className="micro dashboard__fixed-meta">
                      {' '}
                      {item.category}
                      {fixedDueText(item) ? ` · ${fixedDueText(item)}` : ''}
                    </span>
                  </span>
                  <span className="amount-s dashboard__fixed-amount">
                    {recurringCurrency(item) !== 'TWD' ? `${recurringCurrency(item)} ` : ''}
                    {formatPlain(itemChargeAmount(item))}
                  </span>
                  {paid ? (
                    <span className="badge badge--confirmed dashboard__fixed-badge">
                      <span className="badge__dot" />
                      已繳費
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="badge badge--review dashboard__fixed-badge"
                      disabled={busyId === item.id}
                      title="點擊標記為已繳"
                      onClick={() => void markPaid(item)}
                    >
                      <span className="badge__dot" />
                      待繳
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 分類支出 — 各分類支出總額＋預算截止線 */}
        <section className="card span-4">
          <div className="card__header">
            <h2 className="h2">分類支出</h2>
            <span className="micro dashboard__group-note">刻度＝預算截止線</span>
          </div>
          {data.budgets.length === 0 ? (
            <span className="caption">本月尚無支出資料。</span>
          ) : (
            (() => {
              const scale =
                Math.max(...data.budgets.map((row) => Math.max(row.spent, row.budget)), 1) * 1.08;
              return data.budgets.map((row) => {
                const over = row.budget > 0 && row.spent > row.budget;
                const near =
                  !over && row.budget > 0 && row.spent >= row.budget * 0.9;
                return (
                  <div key={row.category} className="dashboard__spend-row">
                    <div className="dashboard__spend-label">
                      <span>
                        {row.category}
                        {over && (
                          <span className="micro dashboard__spend-warn"> · 超出預算</span>
                        )}
                        {near && (
                          <span className="micro dashboard__spend-warn"> · 接近上限</span>
                        )}
                      </span>
                      <span className="mono dashboard__spend-num">
                        {formatPlain(row.spent)}
                        {row.budget > 0 ? (
                          <span className="dashboard__spend-budget"> / {formatPlain(row.budget)}</span>
                        ) : (
                          <span className="micro dashboard__spend-nobudget"> 未設預算</span>
                        )}
                      </span>
                    </div>
                    <div className="dashboard__spend-track">
                      <div
                        className={`dashboard__spend-fill${over ? ' dashboard__spend-fill--over' : ''}`}
                        style={{ width: `${Math.min((row.spent / scale) * 100, 100).toFixed(1)}%` }}
                      />
                      {row.budget > 0 && (
                        <div
                          className="dashboard__spend-tick"
                          style={{ left: `${Math.min((row.budget / scale) * 100, 100).toFixed(1)}%` }}
                          title={`預算 ${formatPlain(row.budget)}`}
                        />
                      )}
                    </div>
                  </div>
                );
              });
            })()
          )}
        </section>

        {/* 分類收入 */}
        <section className="card span-4">
          <div className="card__header">
            <h2 className="h2">分類收入</h2>
            <span className="micro dashboard__group-note">本月各來源</span>
          </div>
          {data.incomeBySource.length === 0 ? (
            <span className="caption">本月尚無收入紀錄。</span>
          ) : (
            (() => {
              const maxIncome = Math.max(...data.incomeBySource.map((row) => row.amount), 1);
              return data.incomeBySource.map((row) => (
                <div key={row.source} className="dashboard__spend-row">
                  <div className="dashboard__spend-label">
                    <span>{row.source}</span>
                    <span className="mono dashboard__spend-num income">
                      +{formatPlain(row.amount)}
                    </span>
                  </div>
                  <div className="dashboard__spend-track">
                    <div
                      className="dashboard__spend-fill dashboard__spend-fill--income"
                      style={{ width: `${Math.min((row.amount / maxIncome) * 100, 100).toFixed(1)}%` }}
                    />
                  </div>
                </div>
              ));
            })()
          )}
        </section>

        {/* 信用卡 */}
        <section className="card span-4">
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
          <div className="caption dashboard__cc-note desktop-only">
            信用卡繳款與轉帳不列入生活支出。
          </div>
        </section>

        {/* 管理入口 — mobile only */}
        <section className="card row-list mobile-only">
          <div className="micro dashboard__mgmt-label">管理</div>
          {[
            { to: '/inbox', label: '待確認', withBadge: true },
            { to: '/recurring', label: '固定支出' },
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
                      <span
                        className="micro"
                        style={{ color: 'var(--color-ink-40)', letterSpacing: 0 }}
                      >
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
