/* 待確認 Inbox — visual layer. Lists needs_review transactions from the
   existing adapter; confirm (single or batch) reuses the existing
   updateTransaction path (status only), no new data rules. */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdapter } from '../../data/AdapterContext';
import { CATEGORY_DEFINITIONS, tagsForCategory } from '../../data/categoryDefinitions';
import type { Account, Transaction, TransactionType } from '../../types/models';
import { EmptyState } from '../../components/ui';
import { formatPlain, formatSigned } from '../../lib/format';
import './inbox.css';

export default function InboxPage() {
  const adapter = useAdapter();
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      adapter.listTransactions?.() ?? Promise.resolve([]),
      adapter.listAccounts?.() ?? Promise.resolve([]),
    ])
      .then(([rows, accountRows]) => {
        if (!cancelled) {
          setItems(rows.filter((tx) => tx.status === 'needs_review'));
          setAccounts(accountRows.filter((account) => account.active !== false));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setAccounts([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const queue = useMemo(
    () => (items ?? []).filter((tx) => !skipped.has(tx.id)),
    [items, skipped],
  );

  const accountNames = useMemo(
    () => accounts.map((account) => account.name),
    [accounts],
  );

  function defaultCategoryForType(type: TransactionType) {
    if (type === 'transfer') return '轉帳';
    return CATEGORY_DEFINITIONS.find((category) => category.kind === type)?.name ?? '其他';
  }

  async function confirmMany(ids: string[]) {
    if (!adapter.updateTransaction || ids.length === 0) return;
    setBusy(true);
    setError(null);
    const done: string[] = [];
    try {
      for (const id of ids) {
        const tx = items?.find((item) => item.id === id);
        if (tx?.type === 'transfer') {
          if (!tx.account || !tx.toAccount) {
            throw new Error('轉帳交易需選擇轉出與轉入帳戶。');
          }
          if (tx.account === tx.toAccount) {
            throw new Error('轉帳交易的轉出與轉入帳戶不可相同。');
          }
        }
        await adapter.updateTransaction(id, { status: 'confirmed' });
        done.push(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '確認失敗，請稍後再試。');
    } finally {
      setItems((prev) => (prev ?? []).filter((item) => !done.includes(item.id)));
      setSelected((prev) => {
        const next = new Set(prev);
        done.forEach((id) => next.delete(id));
        return next;
      });
      setBusy(false);
    }
  }

  function patchLocal(id: string, patch: Partial<Transaction>) {
    setItems((prev) =>
      (prev ?? []).map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function categoryOptions(tx: Transaction) {
    const names = CATEGORY_DEFINITIONS.filter((category) => category.kind === tx.type).map(
      (category) => category.name,
    );
    if (tx.category && !names.includes(tx.category)) names.unshift(tx.category);
    return names;
  }

  async function changeType(tx: Transaction, type: TransactionType) {
    if (!adapter.updateTransaction || type === tx.type) return;
    const category = defaultCategoryForType(type);
    const patch: Partial<Transaction> = {
      type,
      category,
      tags: [],
      toAccount: type === 'transfer' ? tx.toAccount : undefined,
      toAccountId: type === 'transfer' ? tx.toAccountId : null,
    };
    setSavingId(tx.id);
    setError(null);
    try {
      await adapter.updateTransaction(tx.id, patch);
      patchLocal(tx.id, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : '類型更新失敗。');
    } finally {
      setSavingId(null);
    }
  }

  async function changeAccount(tx: Transaction, field: 'account' | 'toAccount', value: string) {
    if (!adapter.updateTransaction) return;
    const patch: Partial<Transaction> =
      field === 'account'
        ? { account: value, accountId: accounts.find((account) => account.name === value)?.id }
        : { toAccount: value || undefined, toAccountId: accounts.find((account) => account.name === value)?.id ?? null };
    setSavingId(tx.id);
    setError(null);
    try {
      await adapter.updateTransaction(tx.id, patch);
      patchLocal(tx.id, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : '帳戶更新失敗。');
    } finally {
      setSavingId(null);
    }
  }

  function tagOptions(tx: Transaction) {
    const current = tagsForCategory(tx.category);
    if (current.length > 0) return current;
    return [
      ...new Set(
        CATEGORY_DEFINITIONS.filter((category) => category.kind === tx.type).flatMap((category) =>
          tagsForCategory(category.name),
        ),
      ),
    ];
  }

  function categoryForTag(tx: Transaction, tag: string) {
    if (tagsForCategory(tx.category).includes(tag)) return tx.category;
    return (
      CATEGORY_DEFINITIONS.find(
        (category) => category.kind === tx.type && tagsForCategory(category.name).includes(tag),
      )?.name ?? tx.category
    );
  }

  async function changeCategory(tx: Transaction, category: string) {
    if (!adapter.updateTransaction || category === tx.category) return;
    setSavingId(tx.id);
    setError(null);
    try {
      const validTags = new Set(tagsForCategory(category));
      const nextTags = tx.tags.filter((tag) => validTags.has(tag));
      await adapter.updateTransaction(tx.id, { category, tags: nextTags });
      patchLocal(tx.id, { category, tags: nextTags });
    } catch (err) {
      setError(err instanceof Error ? err.message : '分類更新失敗。');
    } finally {
      setSavingId(null);
    }
  }

  async function toggleTag(tx: Transaction, tag: string) {
    if (!adapter.updateTransaction) return;
    const category = categoryForTag(tx, tag);
    const tags = tx.tags.includes(tag) ? [] : [tag];
    setSavingId(tx.id);
    setError(null);
    try {
      await adapter.updateTransaction(tx.id, { category, tags });
      patchLocal(tx.id, { category, tags });
    } catch (err) {
      setError(err instanceof Error ? err.message : '標籤更新失敗。');
    } finally {
      setSavingId(null);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === queue.length ? new Set() : new Set(queue.map((tx) => tx.id)),
    );
  }

  function skip(tx: Transaction) {
    setSkipped((prev) => new Set(prev).add(tx.id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(tx.id);
      return next;
    });
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

      {selected.size > 0 && (
        <div className="inbox-toolbar">
          <span className="caption inbox-toolbar__count">已選 {selected.size} 筆</span>
          <span className="inbox-toolbar__actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => void confirmMany([...selected])}
              disabled={busy}
            >
              標記為已確認
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => setSelected(new Set())}
              disabled={busy}
            >
              取消選取
            </button>
          </span>
        </div>
      )}

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
          <section className="card span-12 inbox-list">
            <div className="inbox-head caption">
              <label className="inbox-check">
                <input
                  type="checkbox"
                  checked={selected.size === queue.length && queue.length > 0}
                  onChange={toggleAll}
                />
              </label>
              <span>全選</span>
            </div>
            {queue.map((tx) => (
              <div
                key={tx.id}
                className={`inbox-row${selected.has(tx.id) ? ' inbox-row--selected' : ''}`}
              >
                <label className="inbox-check">
                  <input
                    type="checkbox"
                    checked={selected.has(tx.id)}
                    onChange={() => toggle(tx.id)}
                  />
                </label>
                <span className="mono caption inbox-row__date">{tx.date}</span>
                <span className="inbox-row__main">
                  <span className="mono inbox-row__note">{tx.note || '（無備註）'}</span>
                  <span className="caption">
                    {tx.toAccount ? `${tx.account} → ${tx.toAccount}` : tx.account}
                    {tx.tags.length > 0 && ` · ${tx.tags.map((t) => `#${t}`).join(' ')}`}
                  </span>
                </span>
                <span className="inbox-row__badges">
                  <select
                    className="text-input inbox-row__type"
                    value={tx.type}
                    disabled={busy || savingId === tx.id}
                    onChange={(event) => void changeType(tx, event.target.value as TransactionType)}
                    aria-label="類型"
                  >
                    <option value="expense">支出</option>
                    <option value="income">收入</option>
                    <option value="transfer">轉帳</option>
                  </select>
                  <select
                    className="text-input inbox-row__category"
                    value={tx.category}
                    disabled={busy || savingId === tx.id}
                    onChange={(event) => void changeCategory(tx, event.target.value)}
                    aria-label="分類"
                  >
                    {categoryOptions(tx).map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  {tx.type === 'transfer' && (
                    <span className="inbox-row__transfer">
                      <select
                        className="text-input inbox-row__account"
                        value={tx.account}
                        disabled={busy || savingId === tx.id}
                        onChange={(event) => void changeAccount(tx, 'account', event.target.value)}
                        aria-label="轉出帳戶"
                      >
                        <option value="">轉出帳戶</option>
                        {accountNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <span className="caption">→</span>
                      <select
                        className="text-input inbox-row__account"
                        value={tx.toAccount ?? ''}
                        disabled={busy || savingId === tx.id}
                        onChange={(event) => void changeAccount(tx, 'toAccount', event.target.value)}
                        aria-label="轉入帳戶"
                      >
                        <option value="">轉入帳戶</option>
                        {accountNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </span>
                  )}
                  {tagOptions(tx).length > 0 && (
                    <span className="inbox-row__tags">
                      {tagOptions(tx).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={`inbox-tag${tx.tags.includes(tag) ? ' inbox-tag--on' : ''}`}
                          disabled={busy || savingId === tx.id}
                          onClick={() => void toggleTag(tx, tag)}
                        >
                          {tag}
                        </button>
                      ))}
                    </span>
                  )}
                  <span className="badge badge--review inbox-row__status">
                    <span className="badge__dot" />
                    待確認
                  </span>
                </span>
                <span className="amount-s inbox-row__amount">
                  {tx.type === 'transfer'
                    ? formatPlain(tx.amount)
                    : formatSigned(tx.type === 'expense' ? -tx.amount : tx.amount)}
                </span>
                <span className="inbox-row__actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => void confirmMany([tx.id])}
                    disabled={busy || savingId === tx.id}
                  >
                    確認
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => skip(tx)}
                    disabled={busy || savingId === tx.id}
                  >
                    跳過
                  </button>
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
