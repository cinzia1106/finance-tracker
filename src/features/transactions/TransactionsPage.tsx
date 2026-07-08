/* 明細 Transactions — visual layer only. Reads via adapter.listTransactions;
   filtering/search here is presentational and never mutates data. */

import { useEffect, useMemo, useState } from 'react';
import { useAdapter } from '../../data/AdapterContext';
import type { Transaction } from '../../types/models';
import { EmptyState } from '../../components/ui';
import { formatPlain, formatSigned } from '../../lib/format';
import './transactions.css';

type StatusFilter = 'all' | 'confirmed' | 'needs_review' | 'transfer';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'confirmed', label: '已確認' },
  { key: 'needs_review', label: '待確認' },
  { key: 'transfer', label: '轉帳' },
];

/** Display amount per spec: expense negative, income positive, transfer plain.
    Negative stored amounts (refunds/corrections) flip sign automatically. */
function displayAmount(tx: Transaction) {
  if (tx.type === 'transfer') return formatPlain(tx.amount);
  const signed = tx.type === 'expense' ? -tx.amount : tx.amount;
  return formatSigned(signed);
}

function amountClass(tx: Transaction) {
  if (tx.type === 'transfer') return 'mono';
  const signed = tx.type === 'expense' ? -tx.amount : tx.amount;
  return signed > 0 ? 'mono income' : 'mono';
}

function rowStateClass(tx: Transaction) {
  if (tx.status === 'needs_review') return ' data-table__row--review';
  if (tx.type === 'transfer') return ' data-table__row--muted';
  return '';
}

export default function TransactionsPage() {
  const adapter = useAdapter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

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

  const filtered = useMemo(() => {
    if (!transactions) return [];
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (statusFilter === 'confirmed' && (tx.status !== 'confirmed' || tx.type === 'transfer'))
        return false;
      if (statusFilter === 'needs_review' && tx.status !== 'needs_review') return false;
      if (statusFilter === 'transfer' && tx.type !== 'transfer') return false;
      if (!q) return true;
      return [tx.note, tx.category, tx.account, tx.toAccount ?? '', ...tx.tags]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [transactions, search, statusFilter]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filtered) {
      if (tx.type === 'income') income += tx.amount;
      else if (tx.type === 'expense') expense += tx.amount;
    }
    return { income, expense };
  }, [filtered]);

  const byDate = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const tx of filtered) {
      const list = groups.get(tx.date) ?? [];
      list.push(tx);
      groups.set(tx.date, list);
    }
    return [...groups.entries()];
  }, [filtered]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <h1 className="h1">明細</h1>
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
        <span className="caption tx-totals desktop-only">
          收入 <span className="mono income">+{formatPlain(totals.income)}</span> · 支出{' '}
          <span className="mono">−{formatPlain(totals.expense)}</span>
        </span>
      </header>

      <div className="tx-toolbar">
        <input
          type="search"
          className="text-input tx-search"
          placeholder="搜尋備註、分類、帳戶或標籤"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="chip-row">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`chip${statusFilter === f.key ? ' chip--active' : ''}`}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-12">
        {transactions === null ? (
          <section className="card span-12">
            <span className="caption">載入中…</span>
          </section>
        ) : filtered.length === 0 ? (
          <EmptyState title="本月沒有符合的交易">
            調整月份或篩選條件，或先在「匯入」頁匯入月結 CSV。
          </EmptyState>
        ) : (
          <>
            {/* Desktop: dense table */}
            <section className="card span-12 desktop-only">
              <div className="tx-table">
              <div className="data-table__head tx-grid">
                <span>日期</span>
                <span>類型</span>
                <span>分類</span>
                <span>備註</span>
                <span className="tx-col-tags">標籤</span>
                <span>帳戶</span>
                <span className="cell-right">金額</span>
                <span>狀態</span>
              </div>
              {filtered.map((tx, index) => {
                // Ledger style: print the date once per day group
                const dayStart = index === 0 || filtered[index - 1].date !== tx.date;
                return (
                <div
                  key={tx.id}
                  className={`data-table__row tx-grid${rowStateClass(tx)}${
                    dayStart && index > 0 ? ' tx-row--day-start' : ''
                  }`}
                >
                  <span className="mono caption">{dayStart ? tx.date.slice(5) : ''}</span>
                  <span>{tx.type === 'expense' ? '支出' : tx.type === 'income' ? '收入' : '轉帳'}</span>
                  <span>{tx.category || '—'}</span>
                  <span className="cell-ellipsis" title={tx.note || undefined}>
                    {tx.note || '—'}
                  </span>
                  <span className="cell-ellipsis caption tx-col-tags">
                    {tx.tags.length > 0 ? tx.tags.map((t) => `#${t}`).join(' ') : ''}
                  </span>
                  <span className="cell-ellipsis">
                    {tx.toAccount ? `${tx.account} → ${tx.toAccount}` : tx.account}
                  </span>
                  <span className={`cell-right ${amountClass(tx)}`}>{displayAmount(tx)}</span>
                  {tx.type === 'transfer' ? (
                    <span className="status-text--excluded">不計入</span>
                  ) : tx.status === 'needs_review' ? (
                    <span className="status-text--review">待確認</span>
                  ) : (
                    <span className="status-text--confirmed">已確認</span>
                  )}
                </div>
                );
              })}
              </div>
            </section>

            {/* Mobile: grouped by day */}
            <div className="mobile-only tx-day-list">
              {byDate.map(([date, rows]) => (
                <section key={date} className="card row-list">
                  <div className="tx-day-header micro">{date}</div>
                  {rows.map((tx) => (
                    <div key={tx.id} className={`list-row tx-mobile-row${rowStateClass(tx)}`}>
                      <span className="tx-mobile-main">
                        <span className={tx.type === 'transfer' ? 'tx-muted' : ''}>
                          {tx.note || tx.category || '—'}
                        </span>
                        <span className="caption">
                          {tx.category}
                          {' · '}
                          {tx.toAccount ? `${tx.account} → ${tx.toAccount}` : tx.account}
                          {tx.status === 'needs_review' && (
                            <span className="status-text--review"> · 待確認</span>
                          )}
                          {tx.type === 'transfer' && <span> · 不計入</span>}
                        </span>
                      </span>
                      <span className={`amount-s ${amountClass(tx)}`}>{displayAmount(tx)}</span>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
