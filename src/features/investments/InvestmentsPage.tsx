/* 投資 Investments — visual layer. Reads the existing InvestmentSummary
   from adapter.getAssetOverview; no new data rules. */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdapter } from '../../data/AdapterContext';
import type { InvestmentSummary } from '../../data/adapter';
import { EmptyState } from '../../components/ui';
import { formatPlain, formatSigned } from '../../lib/format';
import './investments.css';

export default function InvestmentsPage() {
  const adapter = useAdapter();
  const [investment, setInvestment] = useState<InvestmentSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    adapter
      .getAssetOverview()
      .then((overview) => {
        if (!cancelled) setInvestment(overview.investment);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <Link to="/" className="back-header__btn mobile-only" aria-label="返回總覽">
            ‹
          </Link>
          <h1 className="h1">投資</h1>
          {investment && (
            <span className="caption">市值快照 {investment.snapshotDate} · 不做即時行情</span>
          )}
        </div>
      </header>

      <div className="grid-12">
        {failed ? (
          <EmptyState title="投資資料待補">
            尚無投資市值快照。更新證券庫存快照後，這裡會顯示累計淨投入、
            估計市值、未實現損益與股息紀錄。
          </EmptyState>
        ) : investment === null ? (
          <section className="card span-12">
            <span className="caption">載入中…</span>
          </section>
        ) : (
          <>
            <section className="card span-3">
              <div className="stat__label">累計淨投入</div>
              <div className="stat__value invest-stat">{formatPlain(investment.netInvested)}</div>
              <div className="caption">買入轉帳 − 賣出轉帳</div>
            </section>
            <section className="card span-3">
              <div className="stat__label">估計市值</div>
              <div className="stat__value invest-stat">{formatPlain(investment.marketValue)}</div>
              <div className="caption">快照日 {investment.snapshotDate}</div>
            </section>
            <section className="card span-3">
              <div className="stat__label">未實現損益</div>
              <div className="stat__value invest-stat income">
                {formatSigned(investment.unrealizedGain)}
              </div>
              <div className="caption">
                {investment.unrealizedGainPct > 0 ? '+' : ''}
                {investment.unrealizedGainPct}%
              </div>
            </section>
            <section className="card span-3">
              <div className="stat__label">累計股息</div>
              <div className="stat__value invest-stat">{formatPlain(investment.dividendTotal)}</div>
              <div className="caption">列為被動收入</div>
            </section>

            <section className="card span-12">
              <h2 className="h2">持有標的</h2>
              <div className="caption" style={{ lineHeight: 1.7 }}>
                持有標的快照（股數、成本、市值）由手動快照補充；快照過期時會標示「快照待補」。
              </div>
            </section>
          </>
        )}

        <section className="card span-12">
          <div className="caption">
            規則：股票買入與賣出以帳戶間轉帳記錄，不列入生活收入或支出；只有股息屬於收入（被動收入）。
          </div>
        </section>
      </div>
    </>
  );
}
