import type { DataAdapter } from '../../data/adapter';
import type { ImportBatch, Transaction } from '../../types/models';
import { buildImportPreview, type ImportPreview } from './csvImport';

export interface ConfirmedImportResult {
  batch: ImportBatch;
  imported: Transaction[];
  preview: ImportPreview;
}

function messageFromError(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  if (typeof err === 'string') return err;
  return 'Unknown error.';
}

export function getErrorMessage(err: unknown) {
  return messageFromError(err);
}

export async function previewCsvImport(adapter: DataAdapter, csvText: string) {
  let existing: Transaction[] = [];

  try {
    existing = (await adapter.listTransactions?.()) ?? [];
  } catch (err) {
    throw new Error(
      `Unable to load existing transactions for duplicate check: ${messageFromError(err)}`,
    );
  }

  try {
    return buildImportPreview(csvText, existing);
  } catch (err) {
    throw new Error(`Unable to parse CSV: ${messageFromError(err)}`);
  }
}

export async function confirmCsvImport(
  adapter: DataAdapter,
  preview: ImportPreview,
  fileName: string | null,
): Promise<ConfirmedImportResult> {
  if (!adapter.createImportBatch || !adapter.createTransaction) {
    throw new Error('Import adapter is not ready.');
  }

  const rowsToImport = preview.rows.filter((row) => row.transaction);
  const batch = await adapter.createImportBatch({
    source: 'csv',
    status: 'processing',
    fileName,
    rowCount: preview.summary.total,
    metadata: {
      summary: preview.summary,
    },
  });

  try {
    const imported: Transaction[] = [];
    for (const row of rowsToImport) {
      if (!row.transaction) continue;
      const transaction = await adapter.createTransaction({
        ...row.transaction,
        importBatchId: batch.id,
      });
      imported.push(transaction);
    }

    await adapter.cacheImportedTransactions?.(imported);
    const completedBatch =
      (await adapter.updateImportBatch?.(batch.id, {
        status: 'completed',
        rowCount: imported.length,
        metadata: {
          summary: preview.summary,
          importedCount: imported.length,
          fileName,
        },
      })) ?? batch;

    return {
      batch: completedBatch,
      imported,
      preview,
    };
  } catch (err) {
    await adapter.updateImportBatch?.(batch.id, {
      status: 'failed',
      metadata: {
        summary: preview.summary,
        error: messageFromError(err),
      },
    });
    throw err;
  }
}
