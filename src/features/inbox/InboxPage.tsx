/* 待確認 Inbox — visual layer. Lists needs_review transactions from the
   existing adapter; "確認" uses the existing updateTransaction path
   (status only), no new data rules. */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdapter } from '../../data/AdapterContext';
import type { Transaction } from '../../types/models';
import { EmptyState } from '../../components/ui';
import { formatPlain, formatSigned } from '../../lib/format';
import './inbox.css';

export default function InboxPage() {
  const adapter = useAdapter();
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adapter
      .listTransactions?.()
      .then((rows) => {
        if (!cancelled) setItems(rows.filter((tx) => tx.status === 'needs_review'));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const queue = useMemo(
    () => (items ?? []).filter((tx) => !skipped.has(tx.id)),
    [items, skipped],
  );

  async function confirm(tx: Transaction) {
    if (!adapter.updateTransaction) return;
    setBusyId(tx.id);
    setError(null);
    try {
      await adapter.updateTransaction(tx.id, { status: 'confirmed' });
      setItems((prev) => (prev ?? []).filter((item) => item.id !== tx.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '確認失敗，請稍後再試。');
    } finally {
      setBusyId(null);
    }
  }

  function skip(tx: Transaction) {
    setSkipped((prev) => new Set(prev).add(tx.id));
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <Link to="/" className="back-header__btn mobile-only" aria-label="返回總覽">
            ‹
          </Link>
          <h1 className="h1">待確認</h1>
          {items && items.length > 0 && (
            <span className="caption">{queue.length} 筆待處理</span>
          )}
        </div>
      </header>

      {error && <div className="inbox-error caption">{error}</div>}

      <div className="grid-12">
        {items === null ? (
          <section className="card span-12">
            <span className="caption">載入中…</span>
          </section>
        ) : queue.length === 0 ? (
          <EmptyState icon="✓" title="收件匣已清空">
            所有交易都已確認。匯入新的月結 CSV 後，需要人工判斷的交易會出現在這裡。
          </EmptyState>
        ) : (
          queue.map((tx) => (
            <section key={tx.id} className="card span-6 inbox-card">
              <div className="inbox-card__meta caption">
                <span className="mono">{tx.date}</span>
                <span>{tx.toAccount ? `${tx.account} → ${tx.toAccount}` : tx.account}</span>
              </div>
              <div className="inbox-card__note mono">{tx.note || '（無備註）'}</div>
              <div className="inbox-card__amount amount-l">
                {tx.type === 'transfer'
                  ? formatPlain(tx.amount)
                  : formatSigned(tx.type === 'expense' ? -tx.amount : tx.amount)}
              </div>
              <div className="inbox-card__suggest">
                <span className="caption">建議分類</span>
                <span className="chip inbox-card__chip">{tx.category || '其他'}</span>
                {tx.tags.length > 0 && (
                  <span className="caption">{tx.tags.map((t) => `#${t}`).join(' ')}</span>
                )}
              </div>
              <div className="inbox-card__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void confirm(tx)}
                  disabled={busyId === tx.id}
                >
                  接受建議並確認
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => skip(tx)}
                  disabled={busyId === tx.id}
                >
                  跳過
                </button>
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
