/* 固定支出 Fixed Costs — visual layer. Candidate detection and the
   automation summary come from data/transactionAutomation (engineering
   baseline); this file only arranges and labels the results. */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AutomationStrip, EmptyState } from '../../components/ui';
import { useAdapter } from '../../data/AdapterContext';
import {
  detectRecurringCandidates,
  summarizeAutomation,
  type RecurringCandidate,
} from '../../data/transactionAutomation';
import type { Transaction } from '../../types/models';
import { formatPlain } from '../../lib/format';
import './recurring.css';

const CONFIDENCE_LABELS: Record<RecurringCandidate['confidence'], string> = {
  high: '高',
  medium: '中',
};

export default function FixedCostsPage() {
  const adapter = useAdapter();
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    adapter
      .listTransactions?.()
      .then((rows) => {
        if (!cancelled) setTransactions(rows);
      })
      .catch(() => {
        if (!cancelled) setTransactions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const candidates = useMemo(
    () =>
      detectRecurringCandidates(transactions ?? []).filter(
        (candidate) => !hidden.has(candidate.key),
      ),
    [transactions, hidden],
  );
  const summary = useMemo(() => summarizeAutomation(transactions ?? []), [transactions]);

  function hideCandidate(candidate: RecurringCandidate) {
    setHidden((current) => new Set(current).add(candidate.key));
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <Link to="/" className="back-header__btn mobile-only" aria-label="返回總覽">
            ‹
          </Link>
          <h1 className="h1">固定支出</h1>
          {transactions && (
            <span className="caption">從交易偵測出 {candidates.length} 個週期性候選</span>
          )}
        </div>
      </header>

      {transactions && transactions.length > 0 && <AutomationStrip summary={summary} />}

      <div className="grid-12">
        {transactions === null ? (
          <section className="card span-12">
            <span className="caption">載入中…</span>
          </section>
        ) : candidates.length === 0 ? (
          <EmptyState title="尚未偵測到週期性支出">
            匯入更多月份的交易後，重複出現的支出（訂閱、月費、分期）會自動出現在這裡。
          </EmptyState>
        ) : (
          <section className="card span-12">
            <div className="card__header">
              <h2 className="h2">偵測到的週期性候選</h2>
              <span className="micro fc-note">僅供參考；隱藏不會改動交易</span>
            </div>
            <div className="fc-table">
              <div className="data-table__head fc-grid">
                <span>名稱</span>
                <span>分類</span>
                <span>帳戶</span>
                <span className="cell-right">平均金額</span>
                <span className="cell-right">月數/次數</span>
                <span>信心</span>
                <span />
              </div>
              {candidates.map((candidate) => (
                <div key={candidate.key} className="data-table__row fc-grid">
                  <span className="cell-ellipsis" title={candidate.label}>
                    {candidate.label}
                  </span>
                  <span>{candidate.category}</span>
                  <span className="cell-ellipsis">{candidate.account}</span>
                  <span className="mono cell-right">{formatPlain(candidate.averageAmount)}</span>
                  <span className="mono caption cell-right">
                    {candidate.monthCount} / {candidate.occurrenceCount}
                  </span>
                  <span>
                    <span
                      className={`fc-confidence fc-confidence--${candidate.confidence}`}
                    >
                      {CONFIDENCE_LABELS[candidate.confidence]}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => hideCandidate(candidate)}
                  >
                    隱藏
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card span-12">
          <div className="caption fc-rules">
            規則：偵測依「分類＋帳戶＋備註＋金額級距」跨月比對；出現 2 個月以上列為候選，
            3 個月且 3 次以上信心為「高」。20 日訂閱統一扣款等固定承諾建立後會列入月承諾計算。
          </div>
        </section>
      </div>
    </>
  );
}
