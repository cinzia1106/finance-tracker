/* 總覽 Dashboard — static UI per the 1a design (mobile + desktop). */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MonthOverview } from '../../data/adapter';
import { useAdapter } from '../../data/AdapterContext';
import { categoryGroupFor } from '../../data/categoryDefinitions';
import type { Transaction } from '../../types/models';
import { useAppOutletContext } from '../../layout/AppLayout';
import { BudgetBar, BudgetRow, ReviewBadge, CountBadge } from '../../components/ui';
import { formatCurrency, formatPlain, formatSigned } from '../../lib/format';
import './dashboard.css';

const GROUP_TONES = { fixed: 'apricot', variable: 'mocha', growth: 'mint' } as const;

export default function DashboardPage() {
  const adapter = useAdapter();
  const { openQuickNote, dataVersion } = useAppOutletContext();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthOverview | null>(null);
  const [monthTransactions, setMonthTransactions] = useState<Transaction[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adapter.getMonthOverview(year, month).then((d) => {
      if (!cancelled) setData(d);
    });
    adapter
      .listTransactions?.(year, month)
      .then((rows) => {
        if (!cancelled) setMonthTransactions(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [adapter, year, month, dataVersion]);

  /** Display-only aggregation: expense categories per group, so the
      three-group card can expand into its own breakdown (the former
      fixed-costs page folded in here). */
  const groupBreakdown = useMemo(() => {
    const byGroup = new Map<string, Map<string, number>>();
    for (const tx of monthTransactions) {
      if (tx.type !== 'expense') continue;
      const group = categoryGroupFor(tx.category);
      const categories = byGroup.get(group) ?? new Map<string, number>();
      categories.set(tx.category, (categories.get(tx.category) ?? 0) + tx.amount);
      byGroup.set(group, categories);
    }
    const result = new Map<string, [string, number][]>();
    for (const [group, categories] of byGroup) {
      result.set(
        group,
        [...categories.entries()].sort((a, b) => b[1] - a[1]),
      );
    }
    return result;
  }, [monthTransactions]);

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

        {/* 支出三組 */}
        <section className="card span-4">
          <div className="card__header">
            <h2 className="h2">本月支出三組</h2>
            <span className="micro dashboard__group-note">
              <span className="desktop-only">合計 {formatPlain(data.expense)}</span>
              <span className="mobile-only">不含轉帳</span>
            </span>
          </div>
          {data.expenseGroups.map((g) => {
            const breakdown = groupBreakdown.get(g.key) ?? [];
            const open = openGroup === g.key;
            return (
              <div key={g.key} className="dashboard__bar-row">
                <button
                  type="button"
                  className="dashboard__bar-label dashboard__bar-toggle"
                  onClick={() => setOpenGroup(open ? null : g.key)}
                  aria-expanded={open}
                >
                  <span>
                    {g.label}
                    {breakdown.length > 0 && (
                      <span className="dashboard__bar-caret">{open ? '▾' : '▸'}</span>
                    )}
                  </span>
                  <span className="amount-s">{formatPlain(g.amount)}</span>
                </button>
                <BudgetBar
                  ratio={data.expense > 0 ? g.amount / data.expense : 0}
                  tone={GROUP_TONES[g.key]}
                />
                {open && breakdown.length > 0 && (
                  <div className="dashboard__group-detail">
                    {breakdown.map(([category, amount]) => (
                      <div key={category} className="dashboard__group-detail-row">
                        <span className="caption">{category}</span>
                        <span className="mono caption">{formatPlain(amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        {/* 收件匣摘要 — desktop only */}
        <section className="card span-3 desktop-only">
          <div className="card__header">
            <h2 className="h2">待確認</h2>
            <CountBadge count={data.needsReviewCount} />
          </div>
          {data.inboxPreview.map((item) => (
            <div key={item.note} className="dashboard__inbox-row">
              <span className="caption">{item.note}</span>
              <span className="mono">
                {item.type === 'transfer'
                  ? formatPlain(item.amount)
                  : formatSigned(item.type === 'expense' ? -item.amount : item.amount)}
              </span>
            </div>
          ))}
          <Link to="/inbox" className="caption dashboard__inbox-link">
            前往收件匣批次處理 →
          </Link>
        </section>

        {/* 變動預算 */}
        <section className="card span-6">
          <h2 className="h2">變動預算</h2>
          {data.budgets.map((b) => (
            <BudgetRow key={b.category} {...b} />
          ))}
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

        {/* 資產與投資分析移至「資產」頁；總覽聚焦本月現金流 */}

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
