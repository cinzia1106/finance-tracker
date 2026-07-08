/* 總覽 Dashboard — static UI per the 1a design (mobile + desktop). */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MonthOverview } from '../../data/adapter';
import { useAdapter } from '../../data/AdapterContext';
import {
  BudgetBar,
  BudgetRow,
  ReviewBadge,
  CountBadge,
  WaterlineBar,
} from '../../components/ui';
import {
  formatCurrency,
  formatPlain,
  formatSigned,
  waterlineGeometry,
} from '../../lib/format';
import './dashboard.css';

const GROUP_TONES = { fixed: 'apricot', variable: 'mocha', growth: 'mint' } as const;

export default function DashboardPage() {
  const adapter = useAdapter();
  const [data, setData] = useState<MonthOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    adapter.getMonthOverview(now.getFullYear(), now.getMonth() + 1).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  if (!data) return null;

  const netCashflow = data.income - data.expense;
  const safeGeo = waterlineGeometry(data.safeline);

  return (
    <>
      {/* Page header — desktop: month switch + import note + CTA; mobile: month + badge */}
      <header className="page-header">
        <div className="page-header__lead">
          <h1 className="h1">
            <span className="desktop-only">
              {data.year}年{data.month}月
            </span>
            <span className="mobile-only">{data.month}月</span>
          </h1>
          <div className="month-switch desktop-only">
            <button type="button" className="month-switch__btn">
              ‹
            </button>
            <button type="button" className="month-switch__btn" disabled>
              ›
            </button>
          </div>
          <span className="caption desktop-only">上次匯入 {data.lastImportNote}</span>
          <span className="caption mobile-only">
            {data.year} · {data.phaseNote}
          </span>
        </div>
        <button type="button" className="btn btn--primary desktop-only">
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
          {data.expenseGroups.map((g) => (
            <div key={g.key} className="dashboard__bar-row">
              <div className="dashboard__bar-label">
                <span>{g.label}</span>
                <span className="amount-s">{formatPlain(g.amount)}</span>
              </div>
              <BudgetBar ratio={g.amount / data.expense} tone={GROUP_TONES[g.key]} />
            </div>
          ))}
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
                {formatSigned(item.type === 'expense' ? -item.amount : item.amount)}
              </span>
            </div>
          ))}
          <Link to="/inbox" className="caption dashboard__inbox-link">
            前往收件匣批次處理 →
          </Link>
        </section>

        {/* 變動預算 */}
        <section className="card span-4">
          <h2 className="h2">變動預算</h2>
          {data.budgets.map((b) => (
            <BudgetRow key={b.category} {...b} />
          ))}
        </section>

        {/* 國泰信用卡 */}
        <section className="card span-4">
          <div className="card__header">
            <h2 className="h2">國泰信用卡</h2>
            <Link to="/recurring" className="caption dashboard__card-link">
              20日訂閱 {data.creditCard.subscriptionCount} 筆
              <span className="desktop-only"> · {formatPlain(data.creditCard.subscriptionTotal)}</span> →
            </Link>
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

        {/* 郵局安全線 */}
        <section className="card span-4">
          <div className="card__header">
            <h2 className="h2">郵局安全線</h2>
            <span className="micro dashboard__group-note">
              最後確認 {data.safeline.confirmedAt}
            </span>
          </div>
          <div className="amount-l">{formatCurrency(data.safeline.balance)}</div>
          <WaterlineBar safeline={data.safeline} />
          <div className="dashboard__safeline-notes">
            <span>
              第一線 {formatPlain(data.safeline.firstLine)}{' '}
              {safeGeo.firstLineMet && (
                <span className="dashboard__check">✓</span>
              )}
            </span>
            <span>
              安心線 {formatPlain(data.safeline.comfortLine)} ·{' '}
              <span className="liability" style={{ fontWeight: 500 }}>
                差 {formatPlain(safeGeo.comfortGap)}
              </span>
            </span>
          </div>
        </section>

        {/* 投資 — desktop: 4 metrics */}
        <section className="card span-4 desktop-only">
          <div className="card__header">
            <h2 className="h2">投資</h2>
            <span className="micro dashboard__group-note">
              市值快照 {data.investment.snapshotDate}
            </span>
          </div>
          <div className="dashboard__invest-grid">
            <div>
              <div className="micro dashboard__cc-label">累計淨投入</div>
              <div className="amount-l dashboard__invest-num">
                {formatPlain(data.investment.netInvested)}
              </div>
            </div>
            <div>
              <div className="micro dashboard__cc-label">估計市值</div>
              <div className="amount-l dashboard__invest-num">
                {formatPlain(data.investment.marketValue)}
              </div>
            </div>
            <div>
              <div className="micro dashboard__cc-label">未實現損益</div>
              <div className="amount-s income">
                {formatSigned(data.investment.unrealizedGain)} (+
                {data.investment.unrealizedGainPct}%)
              </div>
            </div>
            <div>
              <div className="micro dashboard__cc-label">本月買入</div>
              <div className="amount-s">{formatPlain(data.investment.monthlyBuy)}</div>
            </div>
          </div>
        </section>

        {/* 投資淨投入 — mobile: one-line card */}
        <section className="card mobile-only dashboard__invest-line">
          <div className="dashboard__invest-line-inner">
            <div>
              <div className="h2" style={{ fontSize: 13 }}>投資淨投入</div>
              <div className="micro dashboard__group-note">
                市值 {formatPlain(data.investment.marketValue)} ·{' '}
                {data.investment.snapshotDate} 快照
              </div>
            </div>
            <div className="mono dashboard__invest-line-num">
              {formatPlain(data.investment.netInvested)}
            </div>
          </div>
        </section>

        {/* 最近交易 — desktop only */}
        <section className="card span-8 desktop-only">
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
                  <span style={{ color: tx.type === 'transfer' ? undefined : 'var(--color-ink-70)' }}>
                    {tx.account}
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
