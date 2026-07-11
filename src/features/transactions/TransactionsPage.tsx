/* 明細 Transactions — visual layer only. Reads via adapter.listTransactions;
   filtering/search here is presentational and never mutates data. */

import { useEffect, useMemo, useState } from 'react';
import { useAdapter } from '../../data/AdapterContext';
import { CATEGORY_DEFINITIONS, tagsForCategory } from '../../data/categoryDefinitions';
import { summarizeAutomation } from '../../data/transactionAutomation';
import type { Account, Transaction, TransactionType } from '../../types/models';
import { AutomationStrip, EmptyState } from '../../components/ui';
import { formatPlain, formatSigned } from '../../lib/format';
import './transactions.css';

type StatusFilter = 'all' | 'confirmed' | 'needs_review' | 'transfer';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'confirmed', label: '已確認' },
  { key: 'needs_review', label: '待確認' },
  { key: 'transfer', label: '轉帳' },
];

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '轉帳' },
];

/** Spec-compatible fallback category when the type changes. */
function fallbackCategory(type: TransactionType, current: string) {
  if (type === 'transfer') return '轉帳';
  const valid = CATEGORY_DEFINITIONS.some((c) => c.kind === type && c.name === current);
  if (valid) return current;
  return type === 'income' ? '其他收入' : '其他';
}

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
  if (tx.type === 'income') return ' data-table__row--income';
  return '';
}

function categoryTags(tx: Transaction) {
  return tagsForCategory(tx.category);
}

/** Category options for inline editing, keyed by transaction type;
    always includes the current value so the select never shows blank. */
function categoryOptions(tx: Transaction) {
  const names = CATEGORY_DEFINITIONS.filter((c) => c.kind === tx.type).map((c) => c.name);
  if (tx.category && !names.includes(tx.category)) names.unshift(tx.category);
  return names;
}

export default function TransactionsPage() {
  const adapter = useAdapter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [tagEditorId, setTagEditorId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [noteEditId, setNoteEditId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transferEditId, setTransferEditId] = useState<string | null>(null);
  const [transferDraft, setTransferDraft] = useState({ from: '', to: '' });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adapter
      .listAccounts?.()
      .then((rows) => {
        if (!cancelled) setAccounts(rows.filter((a) => a.active !== false));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [adapter]);

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
      if (categoryFilter && tx.category !== categoryFilter) return false;
      if (!q) return true;
      return [tx.note, tx.category, tx.account, tx.toAccount ?? '', ...tx.tags]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [transactions, search, statusFilter, categoryFilter]);

  /** Rows sharing the spec dedupe key (date|type|amount|account|to|note)
      are flagged as likely duplicates — display only. */
  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of transactions ?? []) {
      const key = [tx.date, tx.type, tx.amount, tx.account, tx.toAccount ?? '', tx.note].join('|');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [transactions]);

  function isDuplicate(tx: Transaction) {
    const key = [tx.date, tx.type, tx.amount, tx.account, tx.toAccount ?? '', tx.note].join('|');
    return (duplicateKeys.get(key) ?? 0) > 1;
  }

  /** Categories present in the loaded month, for the filter dropdown. */
  const presentCategories = useMemo(() => {
    const names = new Set<string>();
    for (const tx of transactions ?? []) {
      if (tx.category) names.add(tx.category);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }, [transactions]);

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

  const automationSummary = useMemo(
    () => summarizeAutomation(transactions ?? []),
    [transactions],
  );

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  function patchLocal(id: string, patch: Partial<Transaction>) {
    setTransactions((prev) =>
      (prev ?? []).map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function changeCategory(tx: Transaction, category: string) {
    if (!adapter.updateTransaction || category === tx.category) return;
    setSavingId(tx.id);
    setEditError(null);
    try {
      await adapter.updateTransaction(tx.id, { category });
      patchLocal(tx.id, { category });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '分類更新失敗，請稍後再試。');
    } finally {
      setSavingId(null);
    }
  }

  async function toggleTag(tx: Transaction, tag: string) {
    if (!adapter.updateTransaction) return;
    // Read the freshest row from state: a second toggle fired before the
    // re-render must build on the first one, not overwrite it.
    const current = (transactions ?? []).find((row) => row.id === tx.id) ?? tx;
    const tags = current.tags.includes(tag)
      ? current.tags.filter((t) => t !== tag)
      : [...current.tags, tag];
    setSavingId(tx.id);
    setEditError(null);
    try {
      await adapter.updateTransaction(tx.id, { tags });
      patchLocal(tx.id, { tags });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '標籤更新失敗，請稍後再試。');
    } finally {
      setSavingId(null);
    }
  }

  /** Type change: expense↔income saves directly (category falls back per
      spec); switching to transfer opens the account editor first because
      a transfer must name its destination account. */
  function onTypeChange(tx: Transaction, nextType: TransactionType) {
    if (nextType === tx.type) return;
    if (nextType === 'transfer') {
      if (tx.amount < 0) {
        setEditError('負數金額（退款／沖回）不可改為轉帳。');
        return;
      }
      setTransferDraft({ from: tx.account, to: tx.toAccount ?? '' });
      setTransferEditId(tx.id);
      return;
    }
    void applyEdit(
      tx,
      {
        type: nextType,
        category: fallbackCategory(nextType, tx.category),
        toAccount: '',
        toAccountId: null,
      },
      '類型更新失敗，請稍後再試。',
    );
  }

  function openTransferEditor(tx: Transaction) {
    setTransferDraft({ from: tx.account, to: tx.toAccount ?? '' });
    setTransferEditId(tx.id);
  }

  async function saveTransfer(tx: Transaction) {
    const from = transferDraft.from.trim();
    const to = transferDraft.to.trim();
    if (!from || !to) {
      setEditError('轉帳需要轉出與轉入帳戶。');
      return;
    }
    if (from === to) {
      setEditError('轉出與轉入帳戶不可相同。');
      return;
    }
    const fromId = accounts.find((a) => a.name === from)?.id;
    const toId = accounts.find((a) => a.name === to)?.id;
    await applyEdit(
      tx,
      {
        type: 'transfer',
        category: '轉帳',
        account: from,
        accountId: fromId,
        toAccount: to,
        toAccountId: toId ?? null,
      },
      '轉帳更新失敗，請稍後再試。',
    );
    setTransferEditId(null);
  }

  async function applyEdit(tx: Transaction, patch: Partial<Transaction>, errorMessage: string) {
    if (!adapter.updateTransaction) return;
    setSavingId(tx.id);
    setEditError(null);
    try {
      await adapter.updateTransaction(tx.id, patch);
      patchLocal(tx.id, patch);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : errorMessage);
    } finally {
      setSavingId(null);
    }
  }

  async function deleteTx(tx: Transaction) {
    if (!adapter.deleteTransaction) return;
    setSavingId(tx.id);
    setEditError(null);
    try {
      await adapter.deleteTransaction(tx.id);
      setTransactions((prev) => (prev ?? []).filter((row) => row.id !== tx.id));
      setDeleteId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '刪除失敗，請稍後再試。');
    } finally {
      setSavingId(null);
    }
  }

  function startNoteEdit(tx: Transaction) {
    setNoteEditId(tx.id);
    setNoteDraft(tx.note);
  }

  async function saveNote(tx: Transaction) {
    const note = noteDraft.trim();
    setNoteEditId(null);
    if (!adapter.updateTransaction || note === tx.note) return;
    setSavingId(tx.id);
    setEditError(null);
    try {
      await adapter.updateTransaction(tx.id, { note });
      patchLocal(tx.id, { note });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '備註更新失敗，請稍後再試。');
    } finally {
      setSavingId(null);
    }
  }

  /** Inline note editor: click the note to edit, Enter/blur saves, Esc cancels. */
  function renderNote(tx: Transaction) {
    if (noteEditId === tx.id) {
      return (
        <input
          className="text-input tx-note-input"
          value={noteDraft}
          autoFocus
          onChange={(event) => setNoteDraft(event.target.value)}
          onBlur={() => void saveNote(tx)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            if (event.key === 'Escape') setNoteEditId(null);
          }}
        />
      );
    }
    return (
      <button
        type="button"
        className="tx-note-btn cell-ellipsis"
        title={tx.note ? `${tx.note}（點擊編輯）` : '點擊編輯備註'}
        disabled={savingId === tx.id}
        onClick={() => startNoteEdit(tx)}
      >
        {tx.note || '—'}
      </button>
    );
  }

  /** Tags cell: active tags as removable chips; ＋ expands the category's
      full tag options inline (row grows while editing, nothing clips). */
  function renderTags(tx: Transaction) {
    const options = categoryTags(tx);
    const editing = tagEditorId === tx.id;
    const shown = editing ? [...new Set([...options, ...tx.tags])] : tx.tags;
    if (shown.length === 0 && options.length === 0) return null;
    return (
      <span className="tx-tags">
        {shown.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`tx-subtag${tx.tags.includes(tag) ? ' tx-subtag--on' : ''}`}
            disabled={savingId === tx.id}
            onClick={() => void toggleTag(tx, tag)}
          >
            {tag}
          </button>
        ))}
        {options.length > 0 && (
          <button
            type="button"
            className="tx-subtag tx-subtag--edit"
            onClick={() => setTagEditorId(editing ? null : tx.id)}
            aria-label={editing ? '完成編輯標籤' : '編輯標籤'}
          >
            {editing ? '完成' : '＋'}
          </button>
        )}
      </span>
    );
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
        <select
          className={`text-input tx-cat-filter${categoryFilter ? ' tx-cat-filter--active' : ''}`}
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          aria-label="依分類篩選"
        >
          <option value="">全部分類</option>
          {presentCategories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {editError && <div className="tx-edit-error caption">{editError}</div>}

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
            <div className="span-12">
              <AutomationStrip summary={automationSummary} />
            </div>

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
                <span />
              </div>
              {filtered.map((tx, index) => {
                // Ledger style: print the date once per day group
                const dayStart = index === 0 || filtered[index - 1].date !== tx.date;
                return (
                <div key={tx.id} style={{ display: 'contents' }}>
                <div
                  className={`data-table__row tx-grid${rowStateClass(tx)}${
                    dayStart && index > 0 ? ' tx-row--day-start' : ''
                  }`}
                >
                  <span className="mono caption">{dayStart ? tx.date.slice(5) : ''}</span>
                  <span>
                    <select
                      className={`tx-cat-select tx-type-${tx.type}`}
                      value={tx.type}
                      disabled={savingId === tx.id}
                      onChange={(event) =>
                        onTypeChange(tx, event.target.value as TransactionType)
                      }
                      aria-label="編輯類型"
                    >
                      {TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </span>
                  <span>
                    {tx.type === 'transfer' ? (
                      tx.category || '—'
                    ) : (
                      <select
                        className="tx-cat-select"
                        value={tx.category}
                        disabled={savingId === tx.id}
                        onChange={(event) => void changeCategory(tx, event.target.value)}
                        aria-label="編輯分類"
                      >
                        {categoryOptions(tx).map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                  <span className="tx-note-cell">
                    {isDuplicate(tx) && <span className="tx-dup-chip">重複</span>}
                    {renderNote(tx)}
                  </span>
                  <span className="caption tx-col-tags tx-tags-cell">{renderTags(tx)}</span>
                  <span
                    className={tx.toAccount ? 'tx-account--wrap' : 'cell-ellipsis'}
                    title={tx.toAccount ? `${tx.account} → ${tx.toAccount}` : tx.account}
                  >
                    {tx.toAccount ? `${tx.account} → ${tx.toAccount}` : tx.account}
                    {tx.type === 'transfer' && (
                      <button
                        type="button"
                        className="tx-subtag tx-subtag--edit tx-account-edit"
                        disabled={savingId === tx.id}
                        onClick={() => openTransferEditor(tx)}
                      >
                        改帳戶
                      </button>
                    )}
                  </span>
                  <span className={`cell-right ${amountClass(tx)}`}>{displayAmount(tx)}</span>
                  {tx.type === 'transfer' ? (
                    <span className="status-text--excluded">不計入</span>
                  ) : tx.status === 'needs_review' ? (
                    <span className="status-text--review">待確認</span>
                  ) : (
                    <span className="status-text--confirmed">已確認</span>
                  )}
                  <button
                    type="button"
                    className="tx-delete-btn"
                    disabled={savingId === tx.id}
                    onClick={() => setDeleteId(deleteId === tx.id ? null : tx.id)}
                    aria-label="刪除這筆交易"
                    title="刪除"
                  >
                    ✕
                  </button>
                </div>
                {deleteId === tx.id && (
                  <div className="tx-delete-confirm">
                    <span className="caption tx-delete-confirm__text">
                      刪除這筆交易？（{tx.date.slice(5)} · {tx.note || tx.category} ·{' '}
                      <span className="mono">{displayAmount(tx)}</span>）此動作無法復原。
                    </span>
                    <span className="tx-delete-confirm__actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm tx-delete-confirm__danger"
                        disabled={savingId === tx.id}
                        onClick={() => void deleteTx(tx)}
                      >
                        確認刪除
                      </button>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => setDeleteId(null)}
                      >
                        取消
                      </button>
                    </span>
                  </div>
                )}
                {transferEditId === tx.id && (
                  <div className="tx-transfer-editor">
                    <span className="micro tx-transfer-editor__label">轉帳帳戶</span>
                    <select
                      className="text-input"
                      value={transferDraft.from}
                      onChange={(event) =>
                        setTransferDraft({ ...transferDraft, from: event.target.value })
                      }
                      aria-label="轉出帳戶"
                    >
                      {[transferDraft.from, ...accounts.map((a) => a.name)]
                        .filter((name, i, list) => name && list.indexOf(name) === i)
                        .map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                    </select>
                    <span className="caption">→</span>
                    <select
                      className="text-input"
                      value={transferDraft.to}
                      onChange={(event) =>
                        setTransferDraft({ ...transferDraft, to: event.target.value })
                      }
                      aria-label="轉入帳戶"
                    >
                      <option value="">選擇轉入帳戶</option>
                      {accounts
                        .filter((a) => a.name !== transferDraft.from)
                        .map((a) => (
                          <option key={a.name} value={a.name}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={savingId === tx.id || !transferDraft.to}
                      onClick={() => void saveTransfer(tx)}
                    >
                      確認
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setTransferEditId(null)}
                    >
                      取消
                    </button>
                  </div>
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
                        {noteEditId === tx.id ? (
                          renderNote(tx)
                        ) : (
                          <button
                            type="button"
                            className={`tx-note-btn${tx.type === 'transfer' ? ' tx-muted' : ''}`}
                            onClick={() => startNoteEdit(tx)}
                          >
                            {tx.note || tx.category || '—'}
                          </button>
                        )}
                        <span className="caption tx-mobile-meta">
                          {tx.type === 'transfer' ? (
                            tx.category
                          ) : (
                            <select
                              className="tx-cat-select tx-cat-select--sm"
                              value={tx.category}
                              disabled={savingId === tx.id}
                              onChange={(event) => void changeCategory(tx, event.target.value)}
                              aria-label="編輯分類"
                            >
                              {categoryOptions(tx).map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          )}
                          {' · '}
                          {tx.toAccount ? `${tx.account} → ${tx.toAccount}` : tx.account}
                          {tx.status === 'needs_review' && (
                            <span className="status-text--review"> · 待確認</span>
                          )}
                          {tx.type === 'transfer' && <span> · 不計入</span>}
                        </span>
                        {renderTags(tx)}
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
