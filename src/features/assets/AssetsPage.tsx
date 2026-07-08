/* 資產 Asset Overview — visual layer. Derived values and snapshot CRUD
   come from Phase G; this file only arranges and labels them. */

import { useEffect, useState, type FormEvent } from 'react';
import type { AssetOverview } from '../../data/adapter';
import { useAdapter } from '../../data/AdapterContext';
import type { Account } from '../../types/models';
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assetForm, setAssetForm] = useState({
    accountId: '',
    date: new Date().toISOString().slice(0, 10),
    balance: '',
    marketValue: '',
    costBasis: '',
  });
  const [debtForm, setDebtForm] = useState({
    accountId: '',
    name: '',
    date: new Date().toISOString().slice(0, 10),
    remainingBalance: '',
    nextDueDate: '',
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    const [overview, accountRows] = await Promise.all([
      adapter.getAssetOverview(),
      adapter.listAccounts?.() ?? Promise.resolve([]),
    ]);
    setData(overview);
    setAccounts(accountRows);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([adapter.getAssetOverview(), adapter.listAccounts?.() ?? Promise.resolve([])]).then(
      ([overview, accountRows]) => {
        if (!cancelled) {
          setData(overview);
          setAccounts(accountRows);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  async function saveAssetSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adapter.createAssetSnapshot || !assetForm.accountId || !assetForm.balance) return;
    setSaving(true);
    try {
      await adapter.createAssetSnapshot({
        accountId: assetForm.accountId,
        date: assetForm.date,
        balance: Number(assetForm.balance),
        marketValue: assetForm.marketValue ? Number(assetForm.marketValue) : null,
        costBasis: assetForm.costBasis ? Number(assetForm.costBasis) : null,
        source: 'manual_check',
      });
      setAssetForm((current) => ({ ...current, balance: '', marketValue: '', costBasis: '' }));
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveDebtSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adapter.createDebtSnapshot || !debtForm.name || !debtForm.remainingBalance) return;
    setSaving(true);
    try {
      await adapter.createDebtSnapshot({
        accountId: debtForm.accountId || null,
        name: debtForm.name,
        date: debtForm.date,
        remainingBalance: Number(debtForm.remainingBalance),
        nextDueDate: debtForm.nextDueDate || undefined,
        source: 'manual_check',
      });
      setDebtForm((current) => ({ ...current, remainingBalance: '', nextDueDate: '' }));
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!data) return null;

  const grossAssets = data.cashAndBank + data.investmentValue;
  const cashPct = grossAssets > 0 ? Math.round((data.cashAndBank / grossAssets) * 100) : 0;
  const investPct = grossAssets > 0 ? 100 - cashPct : 0;
  const liabilityPct = grossAssets > 0 ? (data.liabilityTotal / grossAssets) * 100 : 0;
  const safeGeo = waterlineGeometry(data.safeline);
  const gainNegative = data.investment.unrealizedGain < 0;

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <h1 className="h1">資產</h1>
          <span className="caption assets__header-note">
            以最後確認快照計算，非即時餘額
          </span>
        </div>
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
              <TrendLine values={data.netWorthHistory.map((p) => p.value)} width={84} height={30} />
            </span>
          </div>
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
        </section>

        {/* 三行速覽 — mobile first screen */}
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

        {/* 淨資產趨勢 — desktop */}
        <section className="card span-5 desktop-only">
          <div className="card__header">
            <h2 className="h2">淨資產趨勢</h2>
            <span className="micro assets__note">每月快照 · 近 6 個月</span>
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

        {/* 資產組成 — desktop */}
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
                style={{
                  width: `${Math.min(liabilityPct, 100).toFixed(0)}%`,
                  background: 'var(--color-apricot)',
                }}
              />
            </div>
          </div>
        </section>

        {/* 緊急預備金 — mobile */}
        <section className="card mobile-only">
          <div className="card__header">
            <h2 className="h2">緊急預備金</h2>
            <span className="micro assets__note">最後確認 {data.safeline.confirmedAt}</span>
          </div>
          <WaterlineBar safeline={data.safeline} />
          <div className="assets__safeline-rows">
            <div className="assets__safeline-row">
              <span>第一線</span>
              <span style={{ color: 'var(--color-mint-deep)', fontWeight: 500 }}>
                {formatPlain(data.safeline.firstLine)}
                {safeGeo.firstLineMet ? ' ✓ 已達成' : ''}
              </span>
            </div>
            <div className="assets__safeline-row">
              <span>安心線</span>
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
          <div className="desktop-only">
            <div className="data-table__head assets__account-grid">
              <span>帳戶</span>
              <span>類型</span>
              <span className="cell-right">餘額</span>
              <span className="cell-right">最後確認</span>
            </div>
            {data.accounts.map((account) => (
              <div key={account.name} className="data-table__row assets__account-grid">
                <span style={{ color: account.stale ? 'var(--color-ink-60)' : undefined }}>
                  {account.name}
                  {account.detail && (
                    <span className="micro assets__date-note"> {account.detail}</span>
                  )}
                  {account.stale && (
                    <span className="badge--stale badge assets__stale-badge">待更新</span>
                  )}
                </span>
                <span style={{ color: 'var(--color-ink-70)' }}>{account.typeLabel}</span>
                <span
                  className={`mono cell-right${account.isLiability ? ' liability' : ''}`}
                  style={{ fontWeight: 500 }}
                >
                  {account.balance === null
                    ? '—'
                    : account.isLiability
                      ? formatLiability(account.balance)
                      : formatPlain(account.balance)}
                </span>
                <span className="mono caption cell-right">
                  {account.confirmedAt}
                  {account.sourceLabel ? ` ${account.sourceLabel}` : ''}
                </span>
              </div>
            ))}
          </div>
          <div className="mobile-only">
            {data.accounts
              .filter((account) => account.accountType === 'bank' || account.accountType === 'cash')
              .map((account) => (
                <div key={account.name} className="list-row">
                  <span>
                    {account.name}
                    {account.detail && (
                      <span className="micro assets__date-note"> {account.detail}</span>
                    )}
                    {account.stale && (
                      <span className="badge--stale badge assets__stale-badge">待更新</span>
                    )}
                  </span>
                  <span className="cell-right">
                    {account.balance === null ? (
                      <span className="mono" style={{ color: 'var(--color-ink-40)' }}>
                        —
                      </span>
                    ) : (
                      <>
                        <span className="amount-s">{formatPlain(account.balance)}</span>{' '}
                        <span
                          className="micro"
                          style={{ color: 'var(--color-ink-40)', letterSpacing: 0 }}
                        >
                          {account.confirmedAt}
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
              {data.liabilities.length === 0 && (
                <div className="caption assets__empty-note">尚無負債快照。</div>
              )}
              {data.liabilities.map((liability) => (
                <div key={liability.name} className="list-row">
                  <span>
                    {liability.name}
                    {liability.detail && (
                      <span className="micro assets__date-note"> {liability.detail}</span>
                    )}
                  </span>
                  <span className="amount-s liability">{formatLiability(liability.remaining)}</span>
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
              <span className="micro assets__note">最後確認 {data.safeline.confirmedAt}</span>
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
                <div className={`mono assets__metric-num ${gainNegative ? 'liability' : 'income'}`}>
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

        {/* 月結更新 — snapshot input forms */}
        <section className="card span-6">
          <div className="card__header">
            <h2 className="h2">更新餘額快照</h2>
            <span className="micro assets__note">月結時手動確認</span>
          </div>
          <form onSubmit={saveAssetSnapshot} className="form-grid">
            <label className="form-field">
              <span className="micro">帳戶</span>
              <select
                className="text-input"
                value={assetForm.accountId}
                onChange={(event) => setAssetForm({ ...assetForm, accountId: event.target.value })}
              >
                <option value="">選擇帳戶</option>
                {accounts
                  .filter((account) => account.type !== 'credit_card')
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field">
              <span className="micro">日期</span>
              <input
                className="text-input"
                type="date"
                value={assetForm.date}
                onChange={(event) => setAssetForm({ ...assetForm, date: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span className="micro">餘額</span>
              <input
                className="text-input mono"
                type="number"
                placeholder="0"
                value={assetForm.balance}
                onChange={(event) => setAssetForm({ ...assetForm, balance: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span className="micro">市值（投資帳戶）</span>
              <input
                className="text-input mono"
                type="number"
                placeholder="選填"
                value={assetForm.marketValue}
                onChange={(event) => setAssetForm({ ...assetForm, marketValue: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span className="micro">成本（投資帳戶）</span>
              <input
                className="text-input mono"
                type="number"
                placeholder="選填"
                value={assetForm.costBasis}
                onChange={(event) => setAssetForm({ ...assetForm, costBasis: event.target.value })}
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                儲存快照
              </button>
            </div>
          </form>
        </section>

        <section className="card span-6">
          <div className="card__header">
            <h2 className="h2">更新負債快照</h2>
            <span className="micro assets__note">卡費、分期剩餘本金</span>
          </div>
          <form onSubmit={saveDebtSnapshot} className="form-grid">
            <label className="form-field">
              <span className="micro">連結帳戶（選填）</span>
              <select
                className="text-input"
                value={debtForm.accountId}
                onChange={(event) => setDebtForm({ ...debtForm, accountId: event.target.value })}
              >
                <option value="">不連結帳戶</option>
                {accounts
                  .filter((account) => account.type === 'credit_card')
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="form-field">
              <span className="micro">名稱</span>
              <input
                className="text-input"
                placeholder="卡費 / 分期名稱"
                value={debtForm.name}
                onChange={(event) => setDebtForm({ ...debtForm, name: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span className="micro">日期</span>
              <input
                className="text-input"
                type="date"
                value={debtForm.date}
                onChange={(event) => setDebtForm({ ...debtForm, date: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span className="micro">剩餘金額</span>
              <input
                className="text-input mono"
                type="number"
                placeholder="0"
                value={debtForm.remainingBalance}
                onChange={(event) =>
                  setDebtForm({ ...debtForm, remainingBalance: event.target.value })
                }
              />
            </label>
            <label className="form-field">
              <span className="micro">下次扣款（選填）</span>
              <input
                className="text-input"
                type="date"
                value={debtForm.nextDueDate}
                onChange={(event) => setDebtForm({ ...debtForm, nextDueDate: event.target.value })}
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                儲存負債
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
