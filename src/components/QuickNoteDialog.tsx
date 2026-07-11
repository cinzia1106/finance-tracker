/* Quick note dialog. Creates one manual transaction through the active adapter. */

import { useEffect, useState } from 'react';
import { useAdapter } from '../data/AdapterContext';
import { CATEGORY_DEFINITIONS, tagsForCategory } from '../data/categoryDefinitions';
import type { Account, TransactionType } from '../types/models';

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '轉帳' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function categoriesForType(type: TransactionType) {
  return CATEGORY_DEFINITIONS.filter((category) => category.kind === type);
}

function defaultCategoryForType(type: TransactionType) {
  return categoriesForType(type)[0]?.name ?? '';
}

export default function QuickNoteDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const adapter = useAdapter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [date, setDate] = useState(today());
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(defaultCategoryForType('expense'));
  const [tag, setTag] = useState('');
  const [account, setAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(today());
    setType('expense');
    setAmount('');
    setCategory(defaultCategoryForType('expense'));
    setTag('');
    setToAccount('');
    setNote('');
    setError(null);
    adapter
      .listAccounts?.()
      .then((rows) => setAccounts(rows.filter((a) => a.active !== false)))
      .catch(() => setAccounts([]));
  }, [open, adapter]);

  if (!open) return null;

  const categoryOptions = categoriesForType(type);
  const tagOptions = type === 'transfer' ? [] : tagsForCategory(category);

  function changeType(nextType: TransactionType) {
    setType(nextType);
    setCategory(defaultCategoryForType(nextType));
    setTag('');
  }

  async function save() {
    if (!adapter.createTransaction) return;
    const value = Math.round(Number(amount));
    const selectedCategory = category || defaultCategoryForType(type);
    if (!date) return setError('請選擇日期。');
    if (!Number.isFinite(value) || value === 0) return setError('金額需為非 0 整數。');
    if (!selectedCategory) return setError('請選擇分類。');
    if (!account.trim()) return setError('請填寫帳戶。');
    if (type === 'transfer') {
      if (!toAccount.trim()) return setError('轉帳需要填寫轉入帳戶。');
      if (toAccount.trim() === account.trim()) return setError('轉出與轉入帳戶不可相同。');
    }
    setBusy(true);
    setError(null);
    try {
      await adapter.createTransaction({
        date,
        type,
        amount: value,
        category: selectedCategory,
        account: account.trim(),
        toAccount: type === 'transfer' ? toAccount.trim() : undefined,
        note: note.trim(),
        tags: tag ? [tag] : [],
        status: 'confirmed',
        source: 'manual',
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗，請稍後再試。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qn-overlay" role="dialog" aria-modal="true" aria-label="快速手記">
      <div className="qn-dialog card">
        <div className="card__header">
          <h2 className="h2">快速手記</h2>
          <span className="micro qn-note">現金、代墊與帳單外交易</span>
        </div>

        <div className="qn-grid">
          <label className="qn-field">
            <span className="micro">日期</span>
            <input
              type="date"
              className="text-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="qn-field">
            <span className="micro">類型</span>
            <select
              className="text-input"
              value={type}
              onChange={(e) => changeType(e.target.value as TransactionType)}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="qn-field">
            <span className="micro">金額（TWD）</span>
            <input
              type="number"
              inputMode="numeric"
              className="text-input mono"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="qn-field">
            <span className="micro">分類</span>
            <select
              className="text-input"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setTag('');
              }}
            >
              {categoryOptions.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          {tagOptions.length > 0 && (
            <label className="qn-field">
              <span className="micro">標籤</span>
              <select className="text-input" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">不指定</option>
                {tagOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="qn-field">
            <span className="micro">{type === 'transfer' ? '轉出帳戶' : '帳戶'}</span>
            <input
              type="text"
              className="text-input"
              list="qn-accounts"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </label>
          {type === 'transfer' && (
            <label className="qn-field">
              <span className="micro">轉入帳戶</span>
              <input
                type="text"
                className="text-input"
                list="qn-accounts"
                value={toAccount}
                onChange={(e) => setToAccount(e.target.value)}
              />
            </label>
          )}
          <label className="qn-field qn-field--wide">
            <span className="micro">備註</span>
            <input
              type="text"
              className="text-input"
              placeholder="例如：臨時代墊、現金支出"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <datalist id="qn-accounts">
            {accounts.map((a) => (
              <option key={a.name} value={a.name} />
            ))}
          </datalist>
        </div>

        {error && <div className="qn-error caption">{error}</div>}

        <div className="qn-actions">
          <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={busy}>
            儲存
          </button>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={busy}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
