/* 月報 Monthly Review — visual layer only. All figures come from
   buildMonthlyReviewData; export handlers reuse monthlyExport as-is. */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CHART_PALETTE, DonutChart, EmptyState } from '../../components/ui';
import { useAdapter } from '../../data/AdapterContext';
import { formatCurrency, formatPlain, formatSigned } from '../../lib/format';
import {
  buildMonthlyBackupZip,
  buildMonthlyReviewCsv,
  downloadExport,
} from './monthlyExport';
import { buildMonthlyReviewData, type MonthlyReviewData } from './monthlyReview';
import './review.css';

function groupLabel(group: string) {
  if (group === 'fixed') return '固定承諾';
  if (group === 'self-investment') return '投資自己';
  return '日常變動';
}

/** Full-width donut with a floating hover tooltip (name / percent / amount)
    and a chip legend for identification. Display only. */
function CategoryDonut({ rows }: { rows: { category: string; amount: number }[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const positive = rows.filter((row) => row.amount > 0);
  const total = positive.reduce((sum, row) => sum + row.amount, 0);
  if (total <= 0) return <span className="caption">本月無資料</span>;

  const active = hovered !== null ? positive[hovered] : null;

  return (
    <div
      ref={wrapRef}
      className="review-donut"
      onMouseMove={(event) => {
        const rect = wrapRef.current?.getBoundingClientRect();
        if (rect) setPos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      }}
    >
      <DonutChart
        values={positive.map((row) => row.amount)}
        thickness={48}
        hoveredIndex={hovered}
        onHoverSegment={setHovered}
        segmentLabels={positive.map((row) => ({
          title: row.category,
          value: formatPlain(row.amount),
        }))}
      />
      {active && (
        <div
          className="review-tooltip"
          style={{ left: pos.x, top: pos.y }}
          role="status"
        >
          <span className="review-tooltip__name">{active.category}</span>
          <span className="mono review-tooltip__pct">
            {Math.round((active.amount / total) * 100)}%
          </span>
          <span className="amount-s">{formatPlain(active.amount)}</span>
        </div>
      )}
      <div className="review-chips">
        {positive.map((row, i) => (
          <button
            key={row.category}
            type="button"
            className={`review-chips__item${hovered === i ? ' review-chips__item--active' : ''}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
          >
            <span
              className="review-legend__chip"
              style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }}
            />
            {row.category}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MonthlyReviewPage() {
  const adapter = useAdapter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthlyReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    buildMonthlyReviewData(adapter, year, month)
      .then((review) => {
        if (!cancelled) setData(review);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '無法載入月報。');
          setData(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, year, month]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <Link to="/" className="back-header__btn mobile-only" aria-label="返回總覽">
            ‹
          </Link>
          <h1 className="h1">月報</h1>
          <div className="month-switch">
            <button type="button" className="month-switch__btn" onClick={() => shiftMonth(-1)}>
              ‹
            </button>
            <button type="button" className="month-switch__btn" onClick={() => shiftMonth(1)}>
              ›
            </button>
          </div>
          <span className="caption">
            {year}年{month}月 · 月結回顧，非即時數字
          </span>
        </div>
      </header>

      <div className="grid-12">
        {error && (
          <section className="card span-12">
            <span className="caption">{error}</span>
          </section>
        )}

        {!error && !data && (
          <section className="card span-12">
            <span className="caption">載入中…</span>
          </section>
        )}

        {data && data.transactionCount === 0 && (
          <EmptyState title="本月尚無交易">
            先在「匯入」頁匯入月結 CSV，或新增手記交易，再回來看月報。
          </EmptyState>
        )}

        {data && data.transactionCount > 0 && (
          <>
            {data.needsReviewCount > 0 && (
              <section className="card span-12 review-quality">
                <span className="caption review-quality__text">
                  本月有 <span className="mono">{data.needsReviewCount}</span>{' '}
                  筆交易待確認，月報數字可能失真。
                </span>
                <Link to="/inbox" className="btn btn--secondary btn--sm review-quality__btn">
                  前往待確認
                </Link>
              </section>
            )}

            {/* Row 1 — 月結結論：收入 / 支出 / 淨現金流三數字為第一層 */}
            <section className="card span-4">
              <div className="micro">本月結論</div>
              <div className="review-verdict">
                <div className="review-verdict__item">
                  <span className="micro review-verdict__label">收入</span>
                  <span className="mono review-verdict__num income">
                    +{formatPlain(data.income)}
                  </span>
                </div>
                <div className="review-verdict__item">
                  <span className="micro review-verdict__label">支出</span>
                  <span className="mono review-verdict__num">−{formatPlain(data.expense)}</span>
                </div>
                <div className="review-verdict__item review-verdict__item--net">
                  <span className="micro review-verdict__label">淨現金流</span>
                  <span
                    className="mono review-verdict__num review-verdict__num--net"
                    style={
                      data.netCashFlow < 0 ? { color: 'var(--color-apricot-deep)' } : undefined
                    }
                  >
                    {formatCurrency(data.netCashFlow, true)}
                  </span>
                </div>
              </div>
              <div className="caption">轉帳不計入</div>
              <div className="caption review-delta">
                較 {data.previousMonthKey}：
                <span
                  className={`mono ${data.netCashFlowDelta >= 0 ? 'income' : 'liability'}`}
                  style={{ fontWeight: 500 }}
                >
                  {formatSigned(data.netCashFlowDelta)}
                </span>
              </div>
              {/* Three-group proportional stacked bar (fixed / variable / growth) */}
              {(() => {
                const groups = data.categoryGroups.filter((row) => row.amount > 0);
                const groupTotal = groups.reduce((sum, row) => sum + row.amount, 0);
                if (groupTotal <= 0) return null;
                const tone = (group: string) =>
                  group === 'fixed'
                    ? 'var(--color-apricot)'
                    : group === 'self-investment'
                      ? 'var(--color-mint-bar)'
                      : 'var(--color-mocha)';
                return (
                  <div className="review-groupbar">
                    <div className="review-groupbar__track">
                      {groups.map((row) => (
                        <div
                          key={row.group}
                          style={{
                            width: `${((row.amount / groupTotal) * 100).toFixed(1)}%`,
                            background: tone(row.group),
                          }}
                        />
                      ))}
                    </div>
                    <div className="review-groupbar__legend">
                      {groups.map((row) => (
                        <span key={row.group} className="review-groupbar__item">
                          <span
                            className="review-legend__chip"
                            style={{ background: tone(row.group) }}
                          />
                          <span className="caption">{groupLabel(row.group)}</span>
                          <span className="amount-s">{formatPlain(row.amount)}</span>
                          <span className="mono caption">
                            {Math.round((row.amount / groupTotal) * 100)}%
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {/* Top expense categories keep the tall card informative */}
              {(() => {
                const top = data.expenseByCategory
                  .filter((row) => row.amount > 0)
                  .slice(0, 5);
                const expenseTotal = data.expenseByCategory
                  .filter((row) => row.amount > 0)
                  .reduce((sum, row) => sum + row.amount, 0);
                if (top.length === 0) return null;
                return (
                  <div className="review-top">
                    <div className="micro review-top__label">主要支出</div>
                    {top.map((row) => (
                      <div key={row.category} className="review-top__row">
                        <span>{row.category}</span>
                        <span className="mono caption review-top__pct">
                          {expenseTotal ? Math.round((row.amount / expenseTotal) * 100) : 0}%
                        </span>
                        <span className="amount-s">{formatPlain(row.amount)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </section>

            <section className="card span-4">
              <div className="card__header">
                <h2 className="h2">支出分類</h2>
                <span className="micro review-note-label">占比</span>
              </div>
              <CategoryDonut rows={data.expenseByCategory} />
            </section>

            <section className="card span-4">
              <div className="card__header">
                <h2 className="h2">收入來源</h2>
                <span className="micro review-note-label">占比</span>
              </div>
              <CategoryDonut rows={data.incomeByCategory} />
            </section>

            {/* Row 2 — secondary detail lists */}
            <section className="card span-4">
              <h2 className="h2">轉帳與退款</h2>
              <div className="row-list">
                <div className="list-row">
                  <span>轉帳筆數</span>
                  <span className="mono">{data.transferCount}</span>
                </div>
                <div className="list-row">
                  <span>轉帳金額</span>
                  <span className="mono">{formatPlain(data.transferAmount)}</span>
                </div>
                <div className="list-row">
                  <span>退款筆數</span>
                  <span className="mono">{data.refundCount}</span>
                </div>
                <div className="list-row">
                  <span>退款沖回</span>
                  <span className="mono">{formatSigned(data.refundAmount)}</span>
                </div>
              </div>
              <div className="caption review-note">轉帳與退款依既有規則排除於收支之外。</div>
            </section>

            <section className="card span-4">
              <h2 className="h2">月末資產</h2>
              <div className="row-list">
                <div className="list-row">
                  <span>現金餘額</span>
                  <span className="mono">{formatPlain(data.assetSummary.cashBalance)}</span>
                </div>
                <div className="list-row">
                  <span>資產</span>
                  <span className="mono">{formatPlain(data.assetSummary.assetValue)}</span>
                </div>
                <div className="list-row">
                  <span>負債</span>
                  <span className="mono liability">
                    {formatPlain(data.assetSummary.debtBalance)}
                  </span>
                </div>
                <div className="list-row">
                  <span>淨資產估計</span>
                  <span className="mono" style={{ fontWeight: 600 }}>
                    {formatPlain(data.assetSummary.netWorthEstimate)}
                  </span>
                </div>
                <div className="list-row">
                  <span>最後確認</span>
                  <span className="mono caption">
                    {data.assetSummary.lastVerifiedDate ?? '—'}
                  </span>
                </div>
              </div>
            </section>

            <section className="card span-4">
              <h2 className="h2">下月配置</h2>
              <span className="caption review-note">{data.nextMonthAllocationPlaceholder}</span>
            </section>

            {/* Row 3 — export */}
            <section className="card span-12 review-export">
              <div>
                <h2 className="h2">Export for Google Sheets</h2>
                <span className="caption">
                  月結時下載本月報表，直接匯入 Google Sheets 對帳與歸檔。
                </span>
                <span className="caption review-export__files">
                  月報 CSV：
                  <span className="mono">
                    finance-tracker-monthly-review-{data.monthKey}.csv
                  </span>
                  ；備份 ZIP 內含摘要、交易、支出與收入分類四份 CSV。
                </span>
              </div>
              <div className="review-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => downloadExport(buildMonthlyReviewCsv(data))}
                >
                  匯出月報 CSV
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => downloadExport(buildMonthlyBackupZip(data))}
                >
                  下載完整備份（ZIP）
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
