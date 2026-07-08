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

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <h1 className="h1">Assets</h1>
          <span className="caption assets__header-note">Snapshot-derived asset overview</span>
        </div>
      </header>

      <div className="grid-12">
        <section className="card span-6">
          <h2 className="h2">Snapshot input</h2>
          <form onSubmit={saveAssetSnapshot} className="row-list">
            <label className="list-row">
              <span>Account</span>
              <select
                className="text-input"
                value={assetForm.accountId}
                onChange={(event) => setAssetForm({ ...assetForm, accountId: event.target.value })}
              >
                <option value="">Select account</option>
                {accounts
                  .filter((account) => account.type !== 'credit_card')
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="list-row">
              <span>Date</span>
              <input
                className="text-input"
                type="date"
                value={assetForm.date}
                onChange={(event) => setAssetForm({ ...assetForm, date: event.target.value })}
              />
            </label>
            <label className="list-row">
              <span>Balance</span>
              <input
                className="text-input"
                type="number"
                value={assetForm.balance}
                onChange={(event) => setAssetForm({ ...assetForm, balance: event.target.value })}
              />
            </label>
            <label className="list-row">
              <span>Market value</span>
              <input
                className="text-input"
                type="number"
                value={assetForm.marketValue}
                onChange={(event) => setAssetForm({ ...assetForm, marketValue: event.target.value })}
              />
            </label>
            <label className="list-row">
              <span>Cost basis</span>
              <input
                className="text-input"
                type="number"
                value={assetForm.costBasis}
                onChange={(event) => setAssetForm({ ...assetForm, costBasis: event.target.value })}
              />
            </label>
            <button type="submit" className="btn btn--secondary" disabled={saving}>
              Save snapshot
            </button>
          </form>
        </section>

        <section className="card span-6">
          <h2 className="h2">Debt snapshot</h2>
          <form onSubmit={saveDebtSnapshot} className="row-list">
            <label className="list-row">
              <span>Account</span>
              <select
                className="text-input"
                value={debtForm.accountId}
                onChange={(event) => setDebtForm({ ...debtForm, accountId: event.target.value })}
              >
                <option value="">No account link</option>
                {accounts
                  .filter((account) => account.type === 'credit_card')
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="list-row">
              <span>Name</span>
              <input
                className="text-input"
                value={debtForm.name}
                onChange={(event) => setDebtForm({ ...debtForm, name: event.target.value })}
              />
            </label>
            <label className="list-row">
              <span>Date</span>
              <input
                className="text-input"
                type="date"
                value={debtForm.date}
                onChange={(event) => setDebtForm({ ...debtForm, date: event.target.value })}
              />
            </label>
            <label className="list-row">
              <span>Remaining</span>
              <input
                className="text-input"
                type="number"
                value={debtForm.remainingBalance}
                onChange={(event) => setDebtForm({ ...debtForm, remainingBalance: event.target.value })}
              />
            </label>
            <label className="list-row">
              <span>Next due</span>
              <input
                className="text-input"
                type="date"
                value={debtForm.nextDueDate}
                onChange={(event) => setDebtForm({ ...debtForm, nextDueDate: event.target.value })}
              />
            </label>
            <button type="submit" className="btn btn--secondary" disabled={saving}>
              Save debt
            </button>
          </form>
        </section>

        <section className="card span-4">
          <div className="card__header">
            <div className="micro">Net worth</div>
            <span className="micro assets__note">
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
              <span>Cash and bank</span>
              <span className="amount-s">{formatPlain(data.cashAndBank)}</span>
            </div>
            <div className="assets__breakdown-row">
              <span>
                Investments <span className="micro assets__date-note">{data.investmentSnapshotDate}</span>
              </span>
              <span className="amount-s">{formatPlain(data.investmentValue)}</span>
            </div>
            <div className="assets__breakdown-row">
              <span>Liabilities</span>
              <span className="amount-s liability">{formatLiability(data.liabilityTotal)}</span>
            </div>
            <div className="assets__breakdown-row assets__breakdown-row--total">
              <span>Disposable cash</span>
              <span className="mono" style={{ fontWeight: 600 }}>
                {formatPlain(data.disposableCash)}
              </span>
            </div>
          </div>
        </section>

        <section className="card row-list mobile-only">
          <div className="list-row">
            <span className="assets__quick-label">Disposable cash</span>
            <span className="mono assets__quick-num">{formatPlain(data.disposableCash)}</span>
          </div>
          <div className="list-row">
            <span className="assets__quick-label">
              Investments <span className="micro assets__date-note">{data.investmentSnapshotDate}</span>
            </span>
            <span className="mono assets__quick-num">{formatPlain(data.investmentValue)}</span>
          </div>
          <div className="list-row">
            <span className="assets__quick-label">Liabilities</span>
            <span className="mono assets__quick-num liability">{formatLiability(data.liabilityTotal)}</span>
          </div>
        </section>

        <section className="card span-5 desktop-only">
          <div className="card__header">
            <h2 className="h2">Net worth trend</h2>
            <span className="micro assets__note">Last 6 months</span>
          </div>
          <TrendLine values={data.netWorthHistory.map((p) => p.value)} width={440} height={150} filled gridLines={3} />
          <div className="assets__trend-labels mono">
            {data.netWorthHistory.map((p) => (
              <span key={p.label}>{p.label}</span>
            ))}
          </div>
        </section>

        <section className="card span-3 desktop-only">
          <h2 className="h2">Asset mix</h2>
          <div className="assets__stack-bar">
            <div style={{ width: `${cashPct}%`, background: 'var(--color-mint)' }} />
            <div style={{ width: `${investPct}%`, background: 'var(--color-mocha)' }} />
          </div>
          <div className="assets__legend">
            <div className="assets__legend-row">
              <span>Cash</span>
              <span className="mono">{cashPct}%</span>
            </div>
            <div className="assets__legend-row">
              <span>Investments</span>
              <span className="mono">{investPct}%</span>
            </div>
          </div>
          <div className="assets__liability-ratio">
            <div className="assets__legend-row">
              <span style={{ color: 'var(--color-ink-70)' }}>Debt ratio</span>
              <span className="mono liability">{liabilityPct.toFixed(1)}%</span>
            </div>
            <div className="budget-bar">
              <div
                className="budget-bar__fill"
                style={{ width: `${Math.min(liabilityPct, 100).toFixed(0)}%`, background: 'var(--color-apricot)' }}
              />
            </div>
          </div>
        </section>

        <section className="card mobile-only">
          <div className="card__header">
            <h2 className="h2">Emergency fund</h2>
            <span className="micro assets__note">{data.safeline.confirmedAt}</span>
          </div>
          <WaterlineBar safeline={data.safeline} />
          <div className="assets__safeline-rows">
            <div className="assets__safeline-row">
              <span>First line</span>
              <span style={{ color: 'var(--color-mint-deep)', fontWeight: 500 }}>
                {formatPlain(data.safeline.firstLine)} {safeGeo.firstLineMet ? 'OK' : ''}
              </span>
            </div>
            <div className="assets__safeline-row">
              <span>Comfort line</span>
              <span className="liability" style={{ fontWeight: 500 }}>
                {safeGeo.comfortPct}% / gap {formatPlain(safeGeo.comfortGap)}
              </span>
            </div>
          </div>
        </section>

        <section className="card span-6">
          <div className="card__header">
            <h2 className="h2 desktop-only">Account balances</h2>
            <span className="micro desktop-only assets__note">Latest verified snapshots</span>
            <span className="micro mobile-only">Accounts</span>
          </div>
          <div className="desktop-only">
            <div className="data-table__head assets__account-grid">
              <span>Account</span>
              <span>Type</span>
              <span className="cell-right">Balance</span>
              <span className="cell-right">Verified</span>
            </div>
            {data.accounts.map((account) => (
              <div key={account.name} className="data-table__row assets__account-grid">
                <span style={{ color: account.stale ? 'var(--color-ink-60)' : undefined }}>
                  {account.name}
                  {account.detail && <span className="micro assets__date-note"> {account.detail}</span>}
                  {account.stale && <span className="badge--stale badge assets__stale-badge">stale</span>}
                </span>
                <span style={{ color: 'var(--color-ink-70)' }}>{account.typeLabel}</span>
                <span className={`mono cell-right${account.isLiability ? ' liability' : ''}`} style={{ fontWeight: 500 }}>
                  {account.balance === null
                    ? '--'
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
                    {account.detail && <span className="micro assets__date-note"> {account.detail}</span>}
                    {account.stale && <span className="badge--stale badge assets__stale-badge">stale</span>}
                  </span>
                  <span className="cell-right">
                    {account.balance === null ? (
                      <span className="mono" style={{ color: 'var(--color-ink-40)' }}>--</span>
                    ) : (
                      <>
                        <span className="amount-s">{formatPlain(account.balance)}</span>{' '}
                        <span className="micro" style={{ color: 'var(--color-ink-40)', letterSpacing: 0 }}>
                          {account.confirmedAt}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              ))}
          </div>
        </section>

        <div className="span-6 assets__right-col">
          <section className="card">
            <div className="card__header">
              <h2 className="h2 desktop-only">Liabilities</h2>
              <span className="micro mobile-only">Liabilities</span>
              <span className="desktop-only" style={{ fontSize: 13 }}>
                Total <span className="mono liability" style={{ fontWeight: 600 }}>{formatLiability(data.liabilityTotal)}</span>
              </span>
            </div>
            <div className="row-list">
              {data.liabilities.map((liability) => (
                <div key={liability.name} className="list-row">
                  <span>
                    {liability.name}
                    {liability.detail && <span className="micro assets__date-note"> {liability.detail}</span>}
                  </span>
                  <span className="amount-s liability">{formatLiability(liability.remaining)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card desktop-only">
            <div className="card__header">
              <h2 className="h2">Emergency fund</h2>
              <span className="micro assets__note">{data.safeline.confirmedAt}</span>
            </div>
            <WaterlineBar safeline={data.safeline} />
            <div className="assets__safeline-inline">
              <span>
                First line {formatPlain(data.safeline.firstLine)}{' '}
                <span style={{ color: 'var(--color-mint-deep)', fontWeight: 500 }}>
                  {safeGeo.firstLineMet ? 'OK' : ''}
                </span>
              </span>
              <span>
                Comfort line {formatPlain(data.safeline.comfortLine)}{' '}
                <span className="liability" style={{ fontWeight: 500 }}>
                  {safeGeo.comfortPct}% / gap {formatPlain(safeGeo.comfortGap)}
                </span>
              </span>
            </div>
          </section>

          <section className="card desktop-only">
            <div className="card__header">
              <h2 className="h2">Investments</h2>
              <span className="micro assets__note">{data.investment.snapshotDate}</span>
            </div>
            <div className="assets__invest-grid">
              <div>
                <div className="micro assets__metric-label">Net invested</div>
                <div className="mono assets__metric-num">{formatPlain(data.investment.netInvested)}</div>
              </div>
              <div>
                <div className="micro assets__metric-label">Market value</div>
                <div className="mono assets__metric-num">{formatPlain(data.investment.marketValue)}</div>
              </div>
              <div>
                <div className="micro assets__metric-label">Unrealized gain</div>
                <div className="mono assets__metric-num income">{formatSigned(data.investment.unrealizedGain)}</div>
              </div>
              <div>
                <div className="micro assets__metric-label">Dividends</div>
                <div className="mono assets__metric-num">{formatPlain(data.investment.dividendTotal)}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
