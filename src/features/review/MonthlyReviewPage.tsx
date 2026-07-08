/* 月報 Monthly Review — visual layer only. All figures come from
   buildMonthlyReviewData; export handlers reuse monthlyExport as-is. */

import { useEffect, useState } from 'react';
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

/** Donut + text legend for category proportions (display only). */
function CategoryDonut({ rows }: { rows: { category: string; amount: number }[] }) {
  const positive = rows.filter((row) => row.amount > 0);
  const total = positive.reduce((sum, row) => sum + row.amount, 0);
  if (total <= 0) return <span className="caption">本月無資料</span>;
  return (
    <div className="review-donut">
      <DonutChart values={positive.map((row) => row.amount)} />
      <div className="review-legend">
        {positive.map((row, i) => (
          <div key={row.category} className="review-legend__row">
            <span
              className="review-legend__chip"
              style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }}
            />
            <span className="review-legend__name">{row.category}</span>
            <span className="mono caption review-legend__pct">
              {Math.round((row.amount / total) * 100)}%
            </span>
            <span className="amount-s">{formatPlain(row.amount)}</span>
          </div>
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
            {year}年{month}月
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

            {/* Row 1 — hero + category breakdowns */}
            <section className="card span-5">
              <div className="micro">本月淨現金流</div>
              <div className="amount-xl">{formatCurrency(data.netCashFlow, true)}</div>
              {/* Income vs expense comparison bars — shared scale = the larger side */}
              <div className="review-compare">
                {(
                  [
                    ['收入', data.income, 'income'],
                    ['支出', data.expense, 'expense'],
                  ] as const
                ).map(([label, amount, tone]) => (
                  <div key={tone} className="review-compare__row">
                    <span className="review-compare__label">{label}</span>
                    <div className="review-compare__track">
                      <div
                        className={`review-compare__fill review-compare__fill--${tone}`}
                        style={{
                          width: `${(
                            (amount / Math.max(data.income, data.expense, 1)) * 100
                          ).toFixed(0)}%`,
                        }}
                      />
                    </div>
                    <span className="amount-s review-compare__amount">{formatPlain(amount)}</span>
                  </div>
                ))}
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
              <div className="review-groups">
                {data.categoryGroups.map((row) => (
                  <div key={row.group} className="review-groups__item">
                    <span className="micro review-groups__label">{groupLabel(row.group)}</span>
                    <span className="amount-s">{formatPlain(row.amount)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card span-4">
              <div className="card__header">
                <h2 className="h2">支出分類</h2>
                <span className="micro review-note-label">占比</span>
              </div>
              <CategoryDonut rows={data.expenseByCategory} />
            </section>

            <section className="card span-3">
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
                  月報 CSV 可直接匯入 Google Sheets；完整備份為所有可同步資料的 ZIP。
                  檔名使用中性格式，不含個人資訊。
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
