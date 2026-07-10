/* 資產 Asset Overview — visual layer. Accounts / snapshots CRUD and all
   derived values are engineering baseline; this file only arranges,
   labels, and styles them. */

import { useEffect, useState, type FormEvent } from 'react';
import type { AssetOverview } from '../../data/adapter';
import { useAdapter } from '../../data/AdapterContext';
import type { Account, AccountType } from '../../types/models';
import { TrendLine, WaterlineBar } from '../../components/ui';
import {
  formatCurrency,
  formatLiability,
  formatPlain,
  formatSigned,
  waterlineGeometry,
} from '../../lib/format';
import './assets.css';

const ACCOUNT_TYPES: Array<{ value: AccountType; label: string }> = [
  { value: 'cash', label: '現金' },
  { value: 'bank', label: '銀行' },
  { value: 'credit_card', label: '信用卡' },
  { value: 'virtual', label: '投資／虛擬' },
];

export default function AssetsPage() {
  const adapter = useAdapter();
  const [data, setData] = useState<AssetOverview | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState({
    name: '',
    type: 'bank' as AccountType,
    note: '',
  });
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

  async function load() {
    setLoadError(null);
    try {
      const [overview, accountRows] = await Promise.all([
        adapter.getAssetOverview(),
        adapter.listAccounts?.() ?? Promise.resolve([]),
      ]);
      setData(overview);
      setAccounts(accountRows);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '無法載入資產資料。');
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([adapter.getAssetOverview(), adapter.listAccounts?.() ?? Promise.resolve([])])
      .then(([overview, accountRows]) => {
        if (!cancelled) {
          setData(overview);
          setAccounts(accountRows);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setData(null);
          setAccounts([]);
          setLoadError(error instanceof Error ? error.message : '無法載入資產資料。');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adapter.createAccount || !accountForm.name.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const account = await adapter.createAccount({
        name: accountForm.name.trim(),
        type: accountForm.type,
        note: accountForm.note.trim() || undefined,
        active: true,
      });
      setAccountForm({ name: '', type: 'bank', note: '' });
      if (account.type === 'credit_card') {
        setDebtForm((current) => ({
          ...current,
          accountId: account.id ?? '',
          name: account.name,
        }));
      } else {
        setAssetForm((current) => ({ ...current, accountId: account.id ?? '' }));
      }
      setMessage('帳戶已新增。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '無法新增帳戶。');
    } finally {
      setSaving(false);
    }
  }

  async function saveAssetSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adapter.createAssetSnapshot || !assetForm.accountId || !assetForm.balance) return;
    setSaving(true);
    setMessage(null);
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
      setMessage('快照已儲存。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '無法儲存快照。');
    } finally {
      setSaving(false);
    }
  }

  async function saveDebtSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adapter.createDebtSnapshot || !debtForm.name.trim() || !debtForm.remainingBalance) return;
    setSaving(true);
    setMessage(null);
    try {
      await adapter.createDebtSnapshot({
        accountId: debtForm.accountId || null,
        name: debtForm.name.trim(),
        date: debtForm.date,
        remainingBalance: Number(debtForm.remainingBalance),
        nextDueDate: debtForm.nextDueDate || undefined,
        source: 'manual_check',
      });
      setDebtForm((current) => ({ ...current, remainingBalance: '', nextDueDate: '' }));
      setMessage('負債快照已儲存。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '無法儲存負債快照。');
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    return (
      <section className="card">
        <span className="caption">{loadError ?? '載入中…'}</span>
      </section>
    );
  }

  const grossAssets = data.cashAndBank + data.investmentValue;
  const cashPct = grossAssets > 0 ? Math.round((data.cashAndBank / grossAssets) * 100) : 0;
  const investPct = grossAssets > 0 ? 100 - cashPct : 0;
  const liabilityPct = grossAssets > 0 ? (data.liabilityTotal / grossAssets) * 100 : 0;
  const safeGeo = waterlineGeometry(data.safeline);
  const assetAccounts = accounts.filter((account) => account.type !== 'credit_card');
  const creditAccounts = accounts.filter((account) => account.type === 'credit_card');
  const hasAccounts = accounts.length > 0;

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

      {message && <div className="caption assets__message">{message}</div>}

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
                values={data.netWorthHistory.map((point) => point.value)}
                width={84}
                height={30}
              />
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
            values={data.netWorthHistory.map((point) => point.value)}
            width={440}
            height={150}
            filled
            gridLines={3}
          />
          <div className="assets__trend-labels mono">
            {data.netWorthHistory.map((point) => (
              <span key={point.label}>{point.label}</span>
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

        {/* 帳戶餘額 */}
        <section className="card span-12">
          <div className="card__header">
            <h2 className="h2">帳戶餘額</h2>
            <span className="micro assets__note">{accounts.length} 個帳戶 · 餘額為最後確認值</span>
          </div>
          {!hasAccounts && (
            <div className="caption assets__empty-note">
              先在下方「月結更新」新增帳戶，再儲存餘額或負債快照開始追蹤。
            </div>
          )}
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
          <div className="mobile-only row-list">
            {data.accounts.map((account) => (
              <div key={account.name} className="list-row">
                <span>
                  {account.name}
                  <span className="micro assets__date-note"> {account.typeLabel}</span>
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
                    <span className={`amount-s${account.isLiability ? ' liability' : ''}`}>
                      {account.isLiability
                        ? formatLiability(account.balance)
                        : formatPlain(account.balance)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 負債 / 緊急預備金 */}
        <section className="card span-6">
          <div className="card__header">
            <h2 className="h2">負債</h2>
            <span style={{ fontSize: 13 }}>
              合計{' '}
              <span className="mono liability" style={{ fontWeight: 600 }}>
                {formatLiability(data.liabilityTotal)}
              </span>
            </span>
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
          <div className="micro" style={{ color: 'var(--color-ink-40)', letterSpacing: 0 }}>
            淨資產以剩餘本金計算，月付金額僅供現金流預估
          </div>
        </section>

        <section className="card span-6">
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

        {/* 投資摘要 */}
        <section className="card span-12">
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
              <div
                className={`mono assets__metric-num ${
                  data.investment.unrealizedGain < 0 ? 'liability' : 'income'
                }`}
              >
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

        {/* 月結更新 */}
        <div className="span-12 assets__section-label micro">月結更新</div>

        <section className="card span-4">
          <div className="card__header">
            <h2 className="h2">新增帳戶</h2>
          </div>
          <form onSubmit={createAccount} className="form-grid">
            <label className="form-field form-field--wide">
              <span className="micro">名稱</span>
              <input
                className="text-input"
                value={accountForm.name}
                onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })}
              />
            </label>
            <label className="form-field">
              <span className="micro">類型</span>
              <select
                className="text-input"
                value={accountForm.type}
                onChange={(event) =>
                  setAccountForm({ ...accountForm, type: event.target.value as AccountType })
                }
              >
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="micro">備註（選填）</span>
              <input
                className="text-input"
                value={accountForm.note}
                onChange={(event) => setAccountForm({ ...accountForm, note: event.target.value })}
              />
            </label>
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn--primary"
                disabled={saving || !accountForm.name.trim()}
              >
                新增帳戶
              </button>
            </div>
          </form>
        </section>

        <section className="card span-4">
          <div className="card__header">
            <h2 className="h2">更新餘額快照</h2>
          </div>
          <form onSubmit={saveAssetSnapshot} className="form-grid">
            {assetAccounts.length === 0 && (
              <div className="caption assets__empty-note form-field--wide">
                先新增現金／銀行／投資帳戶，才能儲存餘額快照。
              </div>
            )}
            <label className="form-field">
              <span className="micro">帳戶</span>
              <select
                className="text-input"
                value={assetForm.accountId}
                onChange={(event) => setAssetForm({ ...assetForm, accountId: event.target.value })}
              >
                <option value="">選擇帳戶</option>
                {assetAccounts.map((account) => (
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
              <button
                type="submit"
                className="btn btn--primary"
                disabled={saving || !assetForm.accountId || !assetForm.balance}
              >
                儲存快照
              </button>
            </div>
          </form>
        </section>

        <section className="card span-4">
          <div className="card__header">
            <h2 className="h2">更新負債快照</h2>
          </div>
          <form onSubmit={saveDebtSnapshot} className="form-grid">
            {creditAccounts.length === 0 && (
              <div className="caption assets__empty-note form-field--wide">
                新增信用卡帳戶可自動連結卡費；或直接填名稱記錄未連結的負債。
              </div>
            )}
            <label className="form-field">
              <span className="micro">連結帳戶（選填）</span>
              <select
                className="text-input"
                value={debtForm.accountId}
                onChange={(event) => setDebtForm({ ...debtForm, accountId: event.target.value })}
              >
                <option value="">不連結帳戶</option>
                {creditAccounts.map((account) => (
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
              <button
                type="submit"
                className="btn btn--primary"
                disabled={saving || !debtForm.name.trim() || !debtForm.remainingBalance}
              >
                儲存負債
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
