/* 資產 Asset Overview — static UI per the 1a design (mobile + desktop). */

import { useEffect, useState } from 'react';
import type { AssetOverview } from '../../data/adapter';
import { useAdapter } from '../../data/AdapterContext';
import { TrendLine, WaterlineBar } from '../../components/ui';
import {
  formatCurrency,
  formatLiability,
  formatPlain,
  formatSigned,
  waterlineGeometry,
} from '../../lib/format';
import './assets.css';

export default function AssetsPage() {
  const adapter = useAdapter();
  const [data, setData] = useState<AssetOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    adapter.getAssetOverview().then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  if (!data) return null;

  const grossAssets = data.cashAndBank + data.investmentValue;
  const cashPct = Math.round((data.cashAndBank / grossAssets) * 100);
  const investPct = 100 - cashPct;
  const liabilityPct = (data.liabilityTotal / grossAssets) * 100;
  const safeGeo = waterlineGeometry(data.safeline);

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <h1 className="h1">資產</h1>
          <span className="caption assets__header-note">
            以最後確認快照計算，非即時餘額
          </span>
        </div>
        <button type="button" className="btn btn--secondary desktop-only">
          更新餘額快照
        </button>
      </header>

      <div className="grid-12">
        {/* 淨資產 */}
        <section className="card span-4">
          <div className="card__header">
            <div className="micro">淨資產</div>
            <span className="micro assets__note">
              較上月{' '}
              <span className="mono" style={{ color: 'var(--color-mint-deep)', fontWeight: 500 }}>
                {formatSigned(data.netWorthDeltaFromLastMonth)}
              </span>
            </span>
          </div>
          <div className="assets__networth-line">
            <div className="amount-xl">{formatCurrency(data.netWorth)}</div>
            <span className="mobile-only assets__sparkline">
              <TrendLine
                values={data.netWorthHistory.map((p) => p.value)}
                width={84}
                height={30}
              />
            </span>
          </div>
          {/* Desktop: breakdown list — Mobile: one-line formula */}
          <div className="assets__breakdown desktop-only">
            <div className="assets__breakdown-row">
              <span>現金與銀行</span>
              <span className="amount-s">{formatPlain(data.cashAndBank)}</span>
            </div>
            <div className="assets__breakdown-row">
              <span>
                投資市值{' '}
                <span className="micro assets__date-note">{data.investmentSnapshotDate}</span>
              </span>
              <span className="amount-s">{formatPlain(data.investmentValue)}</span>
            </div>
            <div className="assets__breakdown-row">
              <span>負債合計</span>
              <span className="amount-s liability">{formatLiability(data.liabilityTotal)}</span>
            </div>
            <div className="assets__breakdown-row assets__breakdown-row--total">
              <span>可動用現金</span>
              <span className="mono" style={{ fontWeight: 600 }}>
                {formatPlain(data.disposableCash)}
              </span>
            </div>
          </div>
          <div className="micro assets__formula mobile-only">
            ＝ 現金銀行 {formatPlain(data.cashAndBank)} ＋ 投資{' '}
            {formatPlain(data.investmentValue)} − 負債 {formatPlain(data.liabilityTotal)}
          </div>
        </section>

        {/* 三行速覽 — mobile only */}
        <section className="card row-list mobile-only">
          <div className="list-row">
            <span className="assets__quick-label">
              <span className="assets__sym assets__sym--solid" />
              可動用現金
            </span>
            <span className="mono assets__quick-num">{formatPlain(data.disposableCash)}</span>
          </div>
          <div className="list-row">
            <span className="assets__quick-label">
              <span className="assets__sym assets__sym--hollow" />
              投資資產{' '}
              <span className="micro assets__date-note">{data.investmentSnapshotDate}</span>
            </span>
            <span className="mono assets__quick-num">{formatPlain(data.investmentValue)}</span>
          </div>
          <div className="list-row">
            <span className="assets__quick-label">
              <span className="assets__sym assets__sym--dash" />
              待繳負債
            </span>
            <span className="mono assets__quick-num liability">
              {formatLiability(data.liabilityTotal)}
            </span>
          </div>
        </section>

        {/* 淨資產趨勢 — desktop only */}
        <section className="card span-5 desktop-only">
          <div className="card__header">
            <h2 className="h2">淨資產趨勢</h2>
            <span className="micro assets__note">每月手動快照 · 近 6 個月</span>
          </div>
          <TrendLine
            values={data.netWorthHistory.map((p) => p.value)}
            width={440}
            height={150}
            filled
            gridLines={3}
          />
          <div className="assets__trend-labels mono">
            {data.netWorthHistory.map((p) => (
              <span key={p.label}>{p.label}</span>
            ))}
          </div>
        </section>

        {/* 資產組成 — desktop only */}
        <section className="card span-3 desktop-only">
          <h2 className="h2">資產組成</h2>
          <div className="assets__stack-bar">
            <div style={{ width: `${cashPct}%`, background: 'var(--color-mint)' }} />
            <div style={{ width: `${investPct}%`, background: 'var(--color-mocha)' }} />
          </div>
          <div className="assets__legend">
            <div className="assets__legend-row">
              <span>
                <span className="assets__legend-chip" style={{ background: 'var(--color-mint)' }} />
                現金與銀行
              </span>
              <span className="mono">{cashPct}%</span>
            </div>
            <div className="assets__legend-row">
              <span>
                <span className="assets__legend-chip" style={{ background: 'var(--color-mocha)' }} />
                投資
              </span>
              <span className="mono">{investPct}%</span>
            </div>
          </div>
          <div className="assets__liability-ratio">
            <div className="assets__legend-row">
              <span style={{ color: 'var(--color-ink-70)' }}>負債占比</span>
              <span className="mono liability">{liabilityPct.toFixed(1)}%</span>
            </div>
            <div className="budget-bar">
              <div
                className="budget-bar__fill"
                style={{ width: `${liabilityPct.toFixed(0)}%`, background: 'var(--color-apricot)' }}
              />
            </div>
          </div>
        </section>

        {/* 緊急預備金 — mobile position: before account table */}
        <section className="card mobile-only">
          <div className="card__header">
            <h2 className="h2">緊急預備金</h2>
            <span className="micro assets__note">
              郵局 · {data.safeline.confirmedAt} 確認
            </span>
          </div>
          <WaterlineBar safeline={data.safeline} />
          <div className="assets__safeline-rows">
            <div className="assets__safeline-row">
              <span>第一線 · 3 個月必要支出</span>
              <span style={{ color: 'var(--color-mint-deep)', fontWeight: 500 }}>
                {formatPlain(data.safeline.firstLine)} {safeGeo.firstLineMet ? '✓ 已達成' : ''}
              </span>
            </div>
            <div className="assets__safeline-row">
              <span>安心線 · 5 個月必要支出</span>
              <span className="liability" style={{ fontWeight: 500 }}>
                {safeGeo.comfortPct}% · 差 {formatPlain(safeGeo.comfortGap)}
              </span>
            </div>
          </div>
        </section>

        {/* 帳戶餘額 */}
        <section className="card span-6">
          <div className="card__header">
            <h2 className="h2 desktop-only">帳戶餘額</h2>
            <span className="micro desktop-only assets__note">餘額為最後確認值</span>
            <span className="micro mobile-only">帳戶</span>
            <span className="micro mobile-only">餘額 · 最後確認</span>
          </div>
          {/* Desktop table */}
          <div className="desktop-only">
            <div className="data-table__head assets__account-grid">
              <span>帳戶</span>
              <span>類型</span>
              <span className="cell-right">餘額</span>
              <span className="cell-right">最後確認</span>
            </div>
            {data.accounts.map((a) => (
              <div key={a.name} className="data-table__row assets__account-grid">
                <span style={{ color: a.stale ? 'var(--color-ink-60)' : undefined }}>
                  {a.name}
                  {a.detail && <span className="micro assets__date-note"> {a.detail}</span>}
                  {a.stale && <span className="badge--stale badge assets__stale-badge">待更新</span>}
                </span>
                <span style={{ color: 'var(--color-ink-70)' }}>{a.typeLabel}</span>
                <span className={`mono cell-right${a.isLiability ? ' liability' : ''}`} style={{ fontWeight: 500 }}>
                  {a.balance === null
                    ? '—'
                    : a.isLiability
                      ? formatLiability(a.balance)
                      : formatPlain(a.balance)}
                </span>
                <span className="mono caption cell-right">
                  {a.confirmedAt}
                  {a.sourceLabel ? ` ${a.sourceLabel}` : ''}
                </span>
              </div>
            ))}
          </div>
          {/* Mobile list */}
          <div className="mobile-only">
            {data.accounts
              .filter((a) => a.accountType === 'bank' || a.accountType === 'cash')
              .map((a) => (
                <div key={a.name} className="list-row">
                  <span>
                    {a.name}
                    {a.detail && <span className="micro assets__date-note"> {a.detail}</span>}
                    {a.stale && <span className="badge--stale badge assets__stale-badge">待更新</span>}
                  </span>
                  <span className="cell-right">
                    {a.balance === null ? (
                      <span className="mono" style={{ color: 'var(--color-ink-40)' }}>—</span>
                    ) : (
                      <>
                        <span className="amount-s">{formatPlain(a.balance)}</span>{' '}
                        <span className="micro" style={{ color: 'var(--color-ink-40)', letterSpacing: 0 }}>
                          {a.confirmedAt}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              ))}
          </div>
        </section>

        {/* 右欄：負債 / 緊急預備金 / 投資摘要 */}
        <div className="span-6 assets__right-col">
          <section className="card">
            <div className="card__header">
              <h2 className="h2 desktop-only">負債</h2>
              <span className="micro mobile-only">負債</span>
              <span className="desktop-only" style={{ fontSize: 13 }}>
                合計{' '}
                <span className="mono liability" style={{ fontWeight: 600 }}>
                  {formatLiability(data.liabilityTotal)}
                </span>
              </span>
              <span className="micro mobile-only">剩餘</span>
            </div>
            <div className="row-list">
              {data.liabilities.map((l) => (
                <div key={l.name} className="list-row">
                  <span>
                    {l.name}
                    {l.detail && <span className="micro assets__date-note"> {l.detail}</span>}
                  </span>
                  <span className="amount-s liability">{formatLiability(l.remaining)}</span>
                </div>
              ))}
            </div>
            <div className="micro desktop-only" style={{ color: 'var(--color-ink-40)', letterSpacing: 0 }}>
              淨資產以剩餘本金計算，月付金額僅供現金流預估
            </div>
          </section>

          <section className="card desktop-only">
            <div className="card__header">
              <h2 className="h2">緊急預備金</h2>
              <span className="micro assets__note">
                郵局 · 最後確認 {data.safeline.confirmedAt}
              </span>
            </div>
            <WaterlineBar safeline={data.safeline} />
            <div className="assets__safeline-inline">
              <span>
                第一線 {formatPlain(data.safeline.firstLine)}{' '}
                <span style={{ color: 'var(--color-mint-deep)', fontWeight: 500 }}>
                  {safeGeo.firstLineMet ? '✓ 已達成' : ''}
                </span>
              </span>
              <span>
                安心線 {formatPlain(data.safeline.comfortLine)}{' '}
                <span className="liability" style={{ fontWeight: 500 }}>
                  {safeGeo.comfortPct}% · 差 {formatPlain(safeGeo.comfortGap)}
                </span>
              </span>
            </div>
          </section>

          <section className="card desktop-only">
            <div className="card__header">
              <h2 className="h2">投資</h2>
              <span className="micro assets__note">
                市值快照 {data.investment.snapshotDate} · 不做即時行情
              </span>
            </div>
            <div className="assets__invest-grid">
              <div>
                <div className="micro assets__metric-label">累計淨投入</div>
                <div className="mono assets__metric-num">
                  {formatPlain(data.investment.netInvested)}
                </div>
              </div>
              <div>
                <div className="micro assets__metric-label">估計市值</div>
                <div className="mono assets__metric-num">
                  {formatPlain(data.investment.marketValue)}
                </div>
              </div>
              <div>
                <div className="micro assets__metric-label">未實現損益</div>
                <div className="mono assets__metric-num income">
                  {formatSigned(data.investment.unrealizedGain)}
                </div>
              </div>
              <div>
                <div className="micro assets__metric-label">累計股息</div>
                <div className="mono assets__metric-num">
                  {formatPlain(data.investment.dividendTotal)}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
