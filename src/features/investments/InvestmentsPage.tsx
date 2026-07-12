/* 投資 Investments — visual layer. Stats from InvestmentSummary; the
   chart, monthly activity, holdings and dividend timeline are derived
   from existing transactions + snapshots (see investmentDetail.ts).
   Per-ticker holdings are not in the data model, so the holdings table
   shows investment account-level snapshots. */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdapter } from '../../data/AdapterContext';
import { EmptyState } from '../../components/ui';
import { formatCurrency, formatPlain, formatSigned } from '../../lib/format';
import type { Account, AssetSnapshot, Transaction } from '../../types/models';
import type { InvestmentSummary } from '../../data/adapter';
import { buildInvestmentDetail, type InvestmentDetail } from './investmentDetail';
import './investments.css';

/** Two-line chart (net invested = mocha, market value = mint-deep + fill),
    shared 0..max scale. */
function InvestChart({ detail }: { detail: InvestmentDetail }) {
  const W = 460;
  const H = 150;
  const padX = 8;
  const padTop = 12;
  const padBottom = 24;
  const points = detail.history;
  const max = Math.max(...points.flatMap((p) => [p.netInvested, p.marketValue]), 1) * 1.08;
  const x = (i: number) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const y = (v: number) => padTop + (1 - v / max) * (H - padTop - padBottom);
  const line = (key: 'netInvested' | 'marketValue') =>
    points.map((p, i) => `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const area = `${line('marketValue')} ${x(points.length - 1).toFixed(1)},${(H - padBottom).toFixed(1)} ${padX},${(H - padBottom).toFixed(1)}`;
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" role="img">
      {[0.5].map((f) => (
        <line
          key={f}
          x1={padX}
          y1={padTop + (H - padTop - padBottom) * f}
          x2={W - padX}
          y2={padTop + (H - padTop - padBottom) * f}
          stroke="var(--color-bar-track)"
          strokeWidth="1"
        />
      ))}
      <polygon points={area} fill="var(--color-mint)" opacity="0.14" />
      <polyline points={line('netInvested')} fill="none" stroke="var(--color-mocha)" strokeWidth="1.5" />
      <polyline points={line('marketValue')} fill="none" stroke="var(--color-mint-deep)" strokeWidth="1.5" />
      <circle cx={x(last)} cy={y(points[last].netInvested)} r="3" fill="var(--color-mocha)" />
      <circle cx={x(last)} cy={y(points[last].marketValue)} r="3" fill="var(--color-mint-deep)" />
      {points.map((p, i) => (
        <text
          key={p.label}
          x={x(i)}
          y={H - 6}
          textAnchor="middle"
          fill="var(--color-ink-40)"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}

export default function InvestmentsPage() {
  const adapter = useAdapter();
  const now = new Date();
  const [summary, setSummary] = useState<InvestmentSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [snapshots, setSnapshots] = useState<AssetSnapshot[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      adapter.getAssetOverview(),
      adapter.listTransactions?.() ?? Promise.resolve([]),
      adapter.listAssetSnapshots?.() ?? Promise.resolve([]),
      adapter.listAccounts?.() ?? Promise.resolve([]),
    ])
      .then(([overview, txs, snaps, accs]) => {
        if (cancelled) return;
        setSummary(overview.investment);
        setTransactions(txs);
        setSnapshots(snaps);
        setAccounts(accs);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const detail = useMemo(() => {
    if (!summary) return null;
    return buildInvestmentDetail({
      summary,
      transactions,
      snapshots,
      accounts,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, transactions, snapshots, accounts]);

  const hasData =
    detail !== null &&
    (detail.summary.marketValue > 0 ||
      detail.summary.netInvested > 0 ||
      detail.dividends.length > 0);

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <Link to="/" className="back-header__btn mobile-only" aria-label="返回總覽">
            ‹
          </Link>
          <h1 className="h1">投資</h1>
          <span className="caption invest-subtitle desktop-only">
            市值為手動快照，不做即時行情 · 買賣以 transfer 記錄，不列入生活收支
          </span>
          <span className="caption invest-subtitle mobile-only">
            市值為手動快照 · 不做即時行情
          </span>
        </div>
        <Link to="/assets" className="btn btn--secondary desktop-only">
          更新市值快照
        </Link>
      </header>

      <div className="grid-12">
        {loading ? (
          <section className="card span-12">
            <span className="caption">載入中…</span>
          </section>
        ) : failed || !detail ? (
          <EmptyState title="投資資料待補">
            尚無投資市值快照。到「資產」頁更新證券帳戶的市值快照後，
            這裡會顯示累計淨投入、估計市值、未實現損益與股息紀錄。
          </EmptyState>
        ) : !hasData ? (
          <EmptyState
            title="尚無投資紀錄"
            actions={
              <Link to="/assets" className="btn btn--primary">
                前往資產頁更新快照
              </Link>
            }
          >
            以帳戶間轉帳記錄買入賣出、在資產頁更新證券帳戶市值快照後，投資摘要會顯示在這裡。
          </EmptyState>
        ) : (
          <>
            {/* Row 1 — four stat cards (desktop) */}
            <section className="card span-3 desktop-only">
              <div className="stat__label">累計淨投入</div>
              <div className="stat__value invest-stat">{formatPlain(detail.summary.netInvested)}</div>
              <div className="caption">買入 − 賣出 transfer 合計</div>
            </section>
            <section className="card span-3 desktop-only">
              <div className="stat__label">估計市值</div>
              <div className="stat__value invest-stat">{formatPlain(detail.summary.marketValue)}</div>
              <div className="caption">快照 {detail.summary.snapshotDate}</div>
            </section>
            <section className="card span-3 desktop-only">
              <div className="stat__label">未實現損益</div>
              <div
                className={`stat__value invest-stat ${
                  detail.summary.unrealizedGain < 0 ? 'liability' : 'income'
                }`}
              >
                {formatSigned(detail.summary.unrealizedGain)}
              </div>
              <div className="caption">
                {detail.summary.unrealizedGainPct >= 0 ? '+' : ''}
                {detail.summary.unrealizedGainPct}% · 相對淨投入
              </div>
            </section>
            <section className="card span-3 desktop-only">
              <div className="stat__label">累計股息</div>
              <div className="stat__value invest-stat">{formatPlain(detail.dividendTotal)}</div>
              <div className="caption">列為被動收入</div>
            </section>

            {/* Hero card (mobile) — net invested big + 2x2 secondary */}
            <section className="card mobile-only invest-hero">
              <div className="card__header">
                <div className="micro">累計淨投入</div>
                <span className="micro invest-note">快照 {detail.summary.snapshotDate}</span>
              </div>
              <div className="amount-xl">{formatCurrency(detail.summary.netInvested)}</div>
              <div className="invest-hero__grid">
                <div>
                  <div className="micro invest-note">估計市值</div>
                  <div className="invest-hero__num">{formatPlain(detail.summary.marketValue)}</div>
                </div>
                <div>
                  <div className="micro invest-note">未實現損益</div>
                  <div
                    className={`invest-hero__num ${
                      detail.summary.unrealizedGain < 0 ? 'liability' : 'income'
                    }`}
                  >
                    {formatSigned(detail.summary.unrealizedGain)}
                  </div>
                </div>
                <div>
                  <div className="micro invest-note">本月買入</div>
                  <div className="invest-hero__num">{formatPlain(detail.summary.monthlyBuy)}</div>
                </div>
                <div>
                  <div className="micro invest-note">累計股息</div>
                  <div className="invest-hero__num">{formatPlain(detail.dividendTotal)}</div>
                </div>
              </div>
            </section>

            {/* Stale warning banner (mobile) */}
            {detail.holdings.some((h) => h.stale) && (
              <div className="card mobile-only invest-warning">
                <span className="badge__dot invest-warning__dot" />
                <span className="caption">
                  部分標的市值快照已過期，總市值可能失真。
                  <strong>請於電腦版更新快照。</strong>
                </span>
              </div>
            )}

            {/* Row 2 — chart + monthly activity (desktop) */}
            <section className="card span-7 desktop-only">
              <div className="card__header">
                <h2 className="h2">淨投入 vs 市值</h2>
                <span className="invest-legend">
                  <span className="invest-legend__item">
                    <span className="invest-legend__line invest-legend__line--net" /> 淨投入
                  </span>
                  <span className="invest-legend__item">
                    <span className="invest-legend__line invest-legend__line--mv" /> 市值快照
                  </span>
                </span>
              </div>
              <InvestChart detail={detail} />
            </section>

            <section className="card span-5 desktop-only">
              <div className="card__header">
                <h2 className="h2">本月動態</h2>
                <span className="micro invest-note">{detail.monthLabel}</span>
              </div>
              <div className="row-list">
                <div className="list-row">
                  <span>
                    買入
                    {detail.buys.length > 0 && (
                      <span className="micro invest-note">
                        {' '}
                        {detail.buys[0].date} · {detail.buys[0].label}
                        {detail.buys.length > 1 ? ` 等 ${detail.buys.length} 筆` : ''}
                      </span>
                    )}
                  </span>
                  <span className="mono">{formatPlain(detail.buyTotal)}</span>
                </div>
                <div className="list-row">
                  <span>
                    賣出
                    {detail.sells.length > 0 && (
                      <span className="micro invest-note">
                        {' '}
                        {detail.sells[0].date} · {detail.sells[0].label}
                        {detail.sells.length > 1 ? ` 等 ${detail.sells.length} 筆` : ''}
                      </span>
                    )}
                  </span>
                  <span className="mono">{formatPlain(detail.sellTotal)}</span>
                </div>
                {detail.settlementBalance !== null && (
                  <div className="list-row">
                    <span>
                      交割帳戶餘額
                      <span className="micro invest-note"> {detail.settlementDate}</span>
                    </span>
                    <span className="mono">{formatPlain(detail.settlementBalance)}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Row 3 — holdings + dividend timeline */}
            <section className="card span-7">
              <div className="card__header">
                <h2 className="h2">持有標的 · 手動快照</h2>
                <span className="micro invest-note">股數與市值由對帳單補充</span>
              </div>
              {detail.holdings.length === 0 ? (
                <span className="caption invest-holdings-empty">
                  尚無投資帳戶快照。到「資產」頁更新證券帳戶市值後顯示。
                </span>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="desktop-only">
                    <div className="data-table__head invest-holdings-grid">
                      <span>標的</span>
                      <span className="cell-right">股數</span>
                      <span className="cell-right">投入成本</span>
                      <span className="cell-right">市值快照</span>
                      <span className="cell-right">快照日</span>
                    </div>
                    {detail.holdings.map((h) => (
                      <div
                        key={h.name}
                        className={`data-table__row invest-holdings-grid${h.stale ? ' data-table__row--review' : ''}`}
                      >
                        <span>
                          {h.name}
                          {h.stale && <span className="badge badge--review invest-stale-badge">快照待補</span>}
                        </span>
                        <span className="mono cell-right">
                          {h.shares === null ? '—' : formatPlain(h.shares)}
                        </span>
                        <span className="mono cell-right">{formatPlain(h.cost)}</span>
                        <span className="mono cell-right">{formatPlain(h.marketValue)}</span>
                        <span className="mono caption cell-right">{h.snapshotDate}</span>
                      </div>
                    ))}
                  </div>
                  {/* Mobile card list */}
                  <div className="mobile-only invest-holding-cards">
                    {detail.holdings.map((h) => (
                      <div
                        key={h.name}
                        className={`invest-holding-card${h.stale ? ' invest-holding-card--stale' : ''}`}
                      >
                        <span className="invest-holding-card__main">
                          <span className="invest-holding-card__name">
                            {h.name}
                            {h.stale && (
                              <span className="badge badge--review invest-stale-badge">待補</span>
                            )}
                          </span>
                          <span className="micro invest-note">
                            {h.shares !== null ? `${formatPlain(h.shares)} 股 · ` : ''}
                            成本 {formatPlain(h.cost)}
                          </span>
                        </span>
                        <span className="invest-holding-card__right">
                          <span className="amount-s">{formatPlain(h.marketValue)}</span>{' '}
                          <span className="micro invest-note">{h.snapshotDate}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {detail.holdings.some((h) => h.stale) && (
                <div className="micro invest-note invest-holdings-note desktop-only">
                  部分標的已超過 30 天未更新，總市值可能失真；更新後將重算未實現損益。
                </div>
              )}
            </section>

            <section className="card span-5">
              <div className="card__header">
                <h2 className="h2">股息時間軸</h2>
                <span className="micro invest-note">累計 {formatPlain(detail.dividendTotal)}</span>
              </div>
              {detail.dividends.length === 0 ? (
                <span className="caption">尚無股息入帳紀錄。</span>
              ) : (
                <div className="invest-timeline">
                  {detail.dividends.map((d, i) => (
                    <div key={`${d.date}-${i}`} className="invest-timeline__row">
                      <span className="invest-timeline__dot" />
                      <span className="invest-timeline__body">
                        <span className="invest-timeline__name">{d.name}</span>
                        <span className="micro invest-note">
                          {d.date} · {d.detail}
                        </span>
                      </span>
                      <span className="mono income invest-timeline__amount">
                        {formatSigned(d.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <section className="card span-12">
          <div className="caption invest-rule">
            股息記為「被動收入」；股票買入與賣出以帳戶間轉帳記錄，不列入生活收支，也不出現在月報分類占比。
          </div>
        </section>
      </div>
    </>
  );
}
