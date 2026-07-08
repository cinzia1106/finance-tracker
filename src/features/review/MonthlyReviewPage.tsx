/* 月報 Monthly Review — visual layer. Aggregation here is display-only
   arithmetic over adapter.listTransactions and follows the existing rule
   set (transfers excluded); it introduces no new classification logic. */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdapter } from '../../data/AdapterContext';
import type { Transaction } from '../../types/models';
import { BudgetBar, EmptyState } from '../../components/ui';
import { formatCurrency, formatPlain } from '../../lib/format';
import './review.css';

function sumBy(rows: Transaction[], key: (tx: Transaction) => string) {
  const map = new Map<string, number>();
  for (const tx of rows) {
    const k = key(tx);
    map.set(k, (map.get(k) ?? 0) + tx.amount);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export default function MonthlyReviewPage() {
  const adapter = useAdapter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTransactions(null);
    adapter
      .listTransactions?.(year, month)
      .then((rows) => {
        if (!cancelled) setTransactions(rows);
      })
      .catch(() => {
        if (!cancelled) setTransactions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, year, month]);

  const summary = useMemo(() => {
    const rows = transactions ?? [];
    const incomeRows = rows.filter((tx) => tx.type === 'income');
    const expenseRows = rows.filter((tx) => tx.type === 'expense');
    const income = incomeRows.reduce((sum, tx) => sum + tx.amount, 0);
    const expense = expenseRows.reduce((sum, tx) => sum + tx.amount, 0);
    return {
      income,
      expense,
      net: income - expense,
      needsReview: rows.filter((tx) => tx.status === 'needs_review').length,
      total: rows.length,
      incomeBySource: sumBy(incomeRows, (tx) => tx.category || '其他'),
      expenseByCategory: sumBy(expenseRows, (tx) => tx.category || '其他'),
    };
  }, [transactions]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  const maxIncome = summary.incomeBySource[0]?.[1] ?? 0;
  const maxExpense = summary.expenseByCategory[0]?.[1] ?? 0;

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
        {transactions === null ? (
          <section className="card span-12">
            <span className="caption">載入中…</span>
          </section>
        ) : summary.total === 0 ? (
          <EmptyState title="本月尚無資料">
            匯入本月的月結 CSV 後，這裡會顯示收入組成、支出分類與資料品質提醒。
          </EmptyState>
        ) : (
          <>
            {summary.needsReview > 0 && (
              <section className="card span-12 review-quality">
                <span className="caption review-quality__text">
                  本月有 <span className="mono">{summary.needsReview}</span>{' '}
                  筆交易待確認，月報數字可能失真。
                </span>
                <Link to="/inbox" className="btn btn--secondary review-quality__btn">
                  前往待確認
                </Link>
              </section>
            )}

            <section className="card span-4">
              <div className="micro">本月淨現金流</div>
              <div className="amount-xl">{formatCurrency(summary.net, true)}</div>
              <div className="caption">
                收入 <span className="mono">{formatPlain(summary.income)}</span> · 支出{' '}
                <span className="mono">{formatPlain(summary.expense)}</span> · 轉帳不計入
              </div>
            </section>

            <section className="card span-4">
              <h2 className="h2">收入來源組成</h2>
              {summary.incomeBySource.length === 0 && (
                <span className="caption">本月無收入紀錄</span>
              )}
              {summary.incomeBySource.map(([source, amount]) => (
                <div key={source} className="review-bar-row">
                  <div className="review-bar-label">
                    <span>{source}</span>
                    <span className="amount-s">{formatPlain(amount)}</span>
                  </div>
                  <BudgetBar ratio={maxIncome ? amount / maxIncome : 0} tone="mint" />
                </div>
              ))}
            </section>

            <section className="card span-4">
              <h2 className="h2">支出分類</h2>
              {summary.expenseByCategory.length === 0 && (
                <span className="caption">本月無支出紀錄</span>
              )}
              {summary.expenseByCategory.map(([category, amount]) => (
                <div key={category} className="review-bar-row">
                  <div className="review-bar-label">
                    <span>{category}</span>
                    <span className="amount-s">{formatPlain(amount)}</span>
                  </div>
                  <BudgetBar ratio={maxExpense ? amount / maxExpense : 0} tone="mocha" />
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </>
  );
}
