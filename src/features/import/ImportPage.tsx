import { useEffect, useMemo, useRef, useState } from 'react';
import { useAdapter } from '../../data/AdapterContext';
import type { ImportBatch } from '../../types/models';
import { formatPlain, formatSigned } from '../../lib/format';
import type { ImportPreview, ImportPreviewRow } from './csvImport';
import {
  confirmCsvImport,
  getErrorMessage,
  previewCsvImport,
  type ConfirmedImportResult,
} from './importWorkflow';
import './import.css';

declare global {
  interface Window {
    __financeTrackerImportForVerification?: {
      importCsvText: (csvText: string, fileName: string) => Promise<unknown>;
      previewCsvText: (csvText: string) => Promise<unknown>;
    };
  }
}

const STATUS_LABELS = {
  new: '新增',
  duplicate: '重複',
  needs_review: '待確認',
  error: '錯誤',
} as const;

function statusClass(status: ImportPreviewRow['status']) {
  return `import-status import-status--${status.replace('_', '-')}`;
}

function importableRows(preview: ImportPreview | null) {
  return preview?.rows.filter((row) => row.transaction) ?? [];
}

function resultSummary(result: ConfirmedImportResult) {
  return {
    batch: {
      id: result.batch.id,
      status: result.batch.status,
      rowCount: result.batch.rowCount,
      fileName: result.batch.fileName,
    },
    importedCount: result.imported.length,
    previewSummary: result.preview.summary,
    importedStatusCounts: result.imported.reduce<Record<string, number>>((counts, transaction) => {
      counts[transaction.status] = (counts[transaction.status] ?? 0) + 1;
      return counts;
    }, {}),
    importedTypeCounts: result.imported.reduce<Record<string, number>>((counts, transaction) => {
      counts[transaction.type] = (counts[transaction.type] ?? 0) + 1;
      return counts;
    }, {}),
  };
}

export default function ImportPage() {
  const adapter = useAdapter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [batches, setBatches] = useState<ImportBatch[]>([]);

  const rowsToImport = useMemo(() => importableRows(preview), [preview]);

  useEffect(() => {
    adapter.listImportBatches?.().then(setBatches).catch(() => undefined);
  }, [adapter]);

  useEffect(() => {
    if (!['localhost', '127.0.0.1'].includes(window.location.hostname)) return undefined;

    window.__financeTrackerImportForVerification = {
      importCsvText: async (csvText: string, nextFileName: string) => {
        const nextPreview = await previewCsvImport(adapter, csvText);
        return confirmCsvImport(adapter, nextPreview, nextFileName);
      },
      previewCsvText: async (csvText: string) => previewCsvImport(adapter, csvText),
    };

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 'finance-tracker:import-csv') return;
      try {
        const nextPreview = await previewCsvImport(adapter, event.data.csvText);
        const result = await confirmCsvImport(adapter, nextPreview, event.data.fileName ?? null);
        document.documentElement.dataset.financeTrackerImportResult = JSON.stringify({
          ok: true,
          requestId: event.data.requestId,
          result: resultSummary(result),
        });
      } catch (err) {
        document.documentElement.dataset.financeTrackerImportResult = JSON.stringify({
          ok: false,
          requestId: event.data.requestId,
          message: getErrorMessage(err),
        });
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      delete window.__financeTrackerImportForVerification;
    };
  }, [adapter]);

  async function loadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      setPreview(await previewCsvImport(adapter, text));
      setFileName(file.name);
    } catch (err) {
      setPreview(null);
      setFileName(null);
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview || rowsToImport.length === 0 || !adapter.createImportBatch) return;

    setBusy(true);
    setError(null);

    try {
      await confirmCsvImport(adapter, preview, fileName);

      setPreview(null);
      setFileName(null);
      setBatches((await adapter.listImportBatches?.()) ?? []);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function rollback(batchId: string) {
    if (!adapter.rollbackImportBatch) return;
    setBusy(true);
    setError(null);
    try {
      await adapter.rollbackImportBatch(batchId);
      setBatches((await adapter.listImportBatches?.()) ?? []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header__lead">
          <h1 className="h1">匯入</h1>
          {fileName && <span className="caption mono">{fileName}</span>}
        </div>
        <button
          type="button"
          className="btn btn--secondary desktop-only"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          選擇 CSV
        </button>
      </header>

      <div className="grid-12">
        <section className="card span-5">
          <div className="card__header">
            <h2 className="h2">上傳 CSV</h2>
            <span className="micro import-card-note">清理後的標準格式</span>
          </div>
          <button
            type="button"
            className="import-dropzone"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) void loadFile(file);
            }}
            disabled={busy}
          >
            <span className="mono import-schema">date,type,amount,category,account,to_account,note</span>
            <span className="caption">拖放 CSV 到這裡，或點擊選擇檔案</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="import-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void loadFile(file);
            }}
          />
          {error && <div className="import-error">{error}</div>}
          <div className="caption import-rules-note">
            重複列以去重鍵自動略過；欄位錯誤列不會入帳；不明轉入轉出與高額「其他」列會標記為待確認。
          </div>
        </section>

        <section className="card span-7">
          <div className="card__header">
            <h2 className="h2">驗證預覽</h2>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void confirmImport()}
              disabled={busy || rowsToImport.length === 0}
            >
              確認匯入
            </button>
          </div>
          {preview ? <PreviewSummary preview={preview} /> : <EmptyPreview />}
        </section>

        {preview && (
          <>
            <section className="card span-6">
              <h2 className="h2">每月摘要</h2>
              <div className="row-list">
                {preview.summary.monthly.map((month) => (
                  <div key={month.month} className="list-row import-summary-row">
                    <span className="mono">{month.month}</span>
                    <span>支出 {formatPlain(month.expense)}</span>
                    <span>收入 {formatPlain(month.income)}</span>
                    <span>轉帳 {formatPlain(month.transfer)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card span-6">
              <h2 className="h2">分類摘要</h2>
              <div className="row-list">
                {preview.summary.categories.map((category) => (
                  <div key={category.category} className="list-row">
                    <span>{category.category}</span>
                    <span className="mono">{formatPlain(category.amount)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="card span-12">
              <h2 className="h2">逐列結果</h2>
              <div className="import-table">
                <div className="data-table__head import-table__grid">
                  <span>列</span>
                  <span>日期</span>
                  <span>類型</span>
                  <span>分類</span>
                  <span>帳戶</span>
                  <span className="cell-right">金額</span>
                  <span>狀態</span>
                </div>
                {preview.rows.map((row) => (
                  <div key={`${row.rowNumber}-${row.dedupeKey}`} className="data-table__row import-table__grid">
                    <span className="mono caption">{row.rowNumber}</span>
                    <span className="mono">{row.record.date}</span>
                    <span>{row.record.type}</span>
                    <span className="cell-ellipsis">{row.record.category || '-'}</span>
                    <span className="cell-ellipsis">
                      {row.record.to_account
                        ? `${row.record.account} -> ${row.record.to_account}`
                        : row.record.account || '-'}
                    </span>
                    <span className="mono cell-right">{formatSigned(Number(row.record.amount) || 0)}</span>
                    <span>
                      <span className={statusClass(row.status)}>{STATUS_LABELS[row.status]}</span>
                      {(row.errors.length > 0 || row.warnings.length > 0) && (
                        <span className="caption import-row-note">
                          {[...row.errors, ...row.warnings].join(' ')}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <section className="card span-12">
          <div className="card__header">
            <h2 className="h2">匯入紀錄</h2>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                adapter.listImportBatches?.().then(setBatches).catch(() => undefined);
              }}
              disabled={busy}
            >
              重新整理
            </button>
          </div>
          <div className="row-list">
            {batches.length === 0 && <div className="caption import-empty">尚無匯入紀錄</div>}
            {batches.map((batch) => (
              <div key={batch.id} className="list-row import-batch-row">
                <span>
                  <span className="mono">{batch.createdAt.slice(0, 10)}</span>{' '}
                  {batch.fileName ?? batch.source}
                  <span className="caption"> {batch.status} / {batch.rowCount}</span>
                </span>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => void rollback(batch.id)}
                  disabled={busy}
                >
                  回復此批次
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function PreviewSummary({ preview }: { preview: ImportPreview }) {
  const stats = [
    ['讀取', preview.summary.total],
    ['新增', preview.summary.newCount],
    ['重複略過', preview.summary.duplicateCount],
    ['待確認', preview.summary.needsReviewCount],
    ['欄位錯誤', preview.summary.errorCount],
  ];

  return (
    <div className="row-list import-stats">
      {stats.map(([label, value]) => (
        <div key={label} className="list-row import-stat">
          <span className="micro">{label}</span>
          <span className="mono import-stat__value">{value}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyPreview() {
  return (
    <div className="import-empty">
      <span className="caption">尚未選擇檔案。上傳後這裡會顯示讀取、新增、重複、待確認與錯誤筆數。</span>
    </div>
  );
}
