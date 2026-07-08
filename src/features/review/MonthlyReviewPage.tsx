import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BudgetBar, EmptyState } from '../../components/ui';
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
  if (group === 'fixed') return 'Fixed';
  if (group === 'self-investment') return 'Self-investment';
  return 'Variable';
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
          setError(err instanceof Error ? err.message : 'Unable to load monthly review.');
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

  const maxExpense = useMemo(
    () => Math.max(...(data?.expenseByCategory.map((row) => Math.abs(row.amount)) ?? [0])),
    [data],
  );
  const maxIncome = useMemo(
    () => Math.max(...(data?.incomeByCategory.map((row) => Math.abs(row.amount)) ?? [0])),
    [data],
  );

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <Link to="/" className="back-header__btn mobile-only" aria-label="Back">
            {'<'}
          </Link>
          <h1 className="h1">Monthly Review</h1>
          <div className="month-switch">
            <button type="button" className="month-switch__btn" onClick={() => shiftMonth(-1)}>
              {'<'}
            </button>
            <button type="button" className="month-switch__btn" onClick={() => shiftMonth(1)}>
              {'>'}
            </button>
          </div>
          <span className="caption">
            {year}-{String(month).padStart(2, '0')}
          </span>
        </div>
        {data && (
          <div className="review-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => downloadExport(buildMonthlyReviewCsv(data))}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => downloadExport(buildMonthlyBackupZip(data))}
            >
              Export Backup
            </button>
          </div>
        )}
      </header>

      <div className="grid-12">
        {error && (
          <section className="card span-12">
            <span className="caption">{error}</span>
          </section>
        )}

        {!error && !data && (
          <section className="card span-12">
            <span className="caption">Loading monthly review...</span>
          </section>
        )}

        {data && data.transactionCount === 0 && (
          <EmptyState title="No transactions for this month.">
            Import or add transactions before reviewing this month.
          </EmptyState>
        )}

        {data && data.transactionCount > 0 && (
          <>
            {data.needsReviewCount > 0 && (
              <section className="card span-12 review-quality">
                <span className="caption review-quality__text">
                  Needs review: <span className="mono">{data.needsReviewCount}</span>
                </span>
                <Link to="/inbox" className="btn btn--secondary review-quality__btn">
                  Open Inbox
                </Link>
              </section>
            )}

            <section className="card span-4">
              <div className="micro">Net cash flow</div>
              <div className="amount-xl">{formatCurrency(data.netCashFlow, true)}</div>
              <div className="caption">
                Income <span className="mono">{formatPlain(data.income)}</span> / Expense{' '}
                <span className="mono">{formatPlain(data.expense)}</span>
              </div>
              <div className="caption">
                vs {data.previousMonthKey}: {formatSigned(data.netCashFlowDelta)}
              </div>
            </section>

            <section className="card span-4">
              <h2 className="h2">Transfers and refunds</h2>
              <div className="row-list">
                <div className="list-row">
                  <span>Transfer count</span>
                  <span className="mono">{data.transferCount}</span>
                </div>
                <div className="list-row">
                  <span>Transfer amount</span>
                  <span className="mono">{formatPlain(data.transferAmount)}</span>
                </div>
                <div className="list-row">
                  <span>Refund count</span>
                  <span className="mono">{data.refundCount}</span>
                </div>
                <div className="list-row">
                  <span>Refund offset</span>
                  <span className="mono">{formatSigned(data.refundAmount)}</span>
                </div>
              </div>
            </section>

            <section className="card span-4">
              <h2 className="h2">Asset month-end</h2>
              <div className="row-list">
                <div className="list-row">
                  <span>Cash balance</span>
                  <span className="mono">{formatPlain(data.assetSummary.cashBalance)}</span>
                </div>
                <div className="list-row">
                  <span>Assets</span>
                  <span className="mono">{formatPlain(data.assetSummary.assetValue)}</span>
                </div>
                <div className="list-row">
                  <span>Debts</span>
                  <span className="mono">{formatPlain(data.assetSummary.debtBalance)}</span>
                </div>
                <div className="list-row">
                  <span>Net worth estimate</span>
                  <span className="mono">{formatPlain(data.assetSummary.netWorthEstimate)}</span>
                </div>
                <div className="list-row">
                  <span>Last verified</span>
                  <span className="mono">{data.assetSummary.lastVerifiedDate ?? '--'}</span>
                </div>
              </div>
            </section>

            <section className="card span-4">
              <h2 className="h2">Expense by category</h2>
              {data.expenseByCategory.map((row) => (
                <div key={row.category} className="review-bar-row">
                  <div className="review-bar-label">
                    <span>{row.category}</span>
                    <span className="amount-s">{formatPlain(row.amount)}</span>
                  </div>
                  <BudgetBar ratio={maxExpense ? Math.abs(row.amount) / maxExpense : 0} tone="mocha" />
                </div>
              ))}
            </section>

            <section className="card span-4">
              <h2 className="h2">Income by category</h2>
              {data.incomeByCategory.map((row) => (
                <div key={row.category} className="review-bar-row">
                  <div className="review-bar-label">
                    <span>{row.category}</span>
                    <span className="amount-s">{formatPlain(row.amount)}</span>
                  </div>
                  <BudgetBar ratio={maxIncome ? Math.abs(row.amount) / maxIncome : 0} tone="mint" />
                </div>
              ))}
            </section>

            <section className="card span-4">
              <h2 className="h2">Expense grouping</h2>
              <div className="row-list">
                {data.categoryGroups.map((row) => (
                  <div key={row.group} className="list-row">
                    <span>{groupLabel(row.group)}</span>
                    <span className="mono">{formatPlain(row.amount)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card span-12">
              <h2 className="h2">Next month allocation</h2>
              <span className="caption">{data.nextMonthAllocationPlaceholder}</span>
            </section>
          </>
        )}
      </div>
    </>
  );
}
