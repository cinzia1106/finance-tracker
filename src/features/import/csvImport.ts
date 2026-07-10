import type { TransactionDraft } from '../../data/adapter';
import type { Transaction, TransactionType } from '../../types/models';

const REQUIRED_HEADERS = ['date', 'type', 'amount', 'category', 'account', 'to_account', 'note'] as const;
const TYPE_SET = new Set<TransactionType>(['expense', 'income', 'transfer']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER_PATTERN = /^-?\d+$/;

export type ImportRowStatus = 'new' | 'duplicate' | 'needs_review' | 'error';

export interface CsvRecord {
  date: string;
  type: string;
  amount: string;
  category: string;
  account: string;
  to_account: string;
  note: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  record: CsvRecord;
  dedupeKey: string;
  status: ImportRowStatus;
  errors: string[];
  warnings: string[];
  transaction?: TransactionDraft;
}

export interface ImportSummary {
  total: number;
  newCount: number;
  duplicateCount: number;
  needsReviewCount: number;
  errorCount: number;
  monthly: Array<{
    month: string;
    expense: number;
    income: number;
    transfer: number;
  }>;
  categories: Array<{
    category: string;
    amount: number;
  }>;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  summary: ImportSummary;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += char;
    }
  }

  cells.push(cell.trim());
  return cells;
}

function parseCsv(text: string) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error('CSV file is empty.');
  }

  const headers = splitCsvLine(lines[0]);
  const headerErrors = REQUIRED_HEADERS.filter((header, index) => headers[index] !== header);
  if (headers.length !== REQUIRED_HEADERS.length || headerErrors.length > 0) {
    throw new Error(`CSV headers must be exactly: ${REQUIRED_HEADERS.join(',')}`);
  }

  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const record = REQUIRED_HEADERS.reduce<CsvRecord>((result, header, cellIndex) => {
      result[header] = cells[cellIndex] ?? '';
      return result;
    }, {} as CsvRecord);

    return {
      rowNumber: index + 2,
      record,
      columnCount: cells.length,
    };
  });
}

function isRealDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function createDedupeKey(input: {
  date: string;
  type: string;
  amount: string | number;
  account: string;
  to_account?: string | null;
  note: string;
}) {
  return [
    input.date.trim(),
    input.type.trim(),
    String(input.amount).trim(),
    input.account.trim(),
    (input.to_account ?? '').trim(),
    input.note.trim(),
  ].join('|');
}

function existingDedupeKeys(existingTransactions: Transaction[]) {
  return new Set(
    existingTransactions.map((transaction) =>
      createDedupeKey({
        date: transaction.date,
        type: transaction.type,
        amount: transaction.amount,
        account: transaction.account,
        to_account: transaction.toAccount,
        note: transaction.note,
      }),
    ),
  );
}

function validateRecord(record: CsvRecord, columnCount: number) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const type = record.type as TransactionType;

  if (columnCount !== REQUIRED_HEADERS.length) {
    errors.push('Column count does not match the required schema.');
  }
  if (!isRealDate(record.date)) {
    errors.push('date must use YYYY-MM-DD.');
  }
  if (!TYPE_SET.has(type)) {
    errors.push('type must be expense, income, or transfer.');
  }
  if (!INTEGER_PATTERN.test(record.amount)) {
    errors.push('amount must be an integer TWD value.');
  } else if (Number(record.amount) === 0) {
    errors.push('amount cannot be zero.');
  }
  if ((type === 'expense' || type === 'income') && !record.category) {
    errors.push('expense and income rows require category.');
  }
  if (type === 'transfer') {
    if (!record.account || !record.to_account) {
      errors.push('transfer rows require account and to_account.');
    }
    if (record.account && record.to_account && record.account === record.to_account) {
      errors.push('transfer account and to_account cannot be the same.');
    }
  }
  if ((type === 'expense' || type === 'income') && !record.account) {
    warnings.push('account is blank.');
  }
  if (!record.note) {
    warnings.push('note is blank.');
  }
  if (/needs[_\s-]?review/i.test(`${record.category} ${record.note}`)) {
    warnings.push('row is marked as needs_review.');
  }

  return { errors, warnings };
}

export function buildImportPreview(csvText: string, existingTransactions: Transaction[]): ImportPreview {
  const existingKeys = existingDedupeKeys(existingTransactions);
  const seenKeys = new Set<string>();
  const parsed = parseCsv(csvText);

  const rows = parsed.map<ImportPreviewRow>(({ rowNumber, record, columnCount }) => {
    const { errors, warnings } = validateRecord(record, columnCount);
    const dedupeKey = createDedupeKey(record);
    const duplicate = existingKeys.has(dedupeKey) || seenKeys.has(dedupeKey);
    seenKeys.add(dedupeKey);

    let status: ImportRowStatus = 'new';
    if (errors.length > 0) {
      status = 'error';
    } else if (duplicate) {
      status = 'duplicate';
    } else if (warnings.length > 0) {
      status = 'needs_review';
    }

    const type = record.type as TransactionType;
    const amount = INTEGER_PATTERN.test(record.amount) ? Number(record.amount) : 0;
    const transaction: TransactionDraft | undefined =
      status === 'new' || status === 'needs_review'
        ? {
            date: record.date,
            type,
            amount,
            category: record.category,
            account: record.account,
            toAccount: record.to_account || undefined,
            note: record.note,
            tags: [],
            status: status === 'needs_review' ? 'needs_review' : 'confirmed',
            source: 'import',
            rawPayload: { ...record },
          }
        : undefined;

    return {
      rowNumber,
      record,
      dedupeKey,
      status,
      errors,
      warnings,
      transaction,
    };
  });

  return {
    rows,
    summary: summarizeImportRows(rows),
  };
}

export function summarizeImportRows(rows: ImportPreviewRow[]): ImportSummary {
  const monthly = new Map<string, { month: string; expense: number; income: number; transfer: number }>();
  const categories = new Map<string, number>();

  rows
    .filter((row) => row.transaction)
    .forEach((row) => {
      const transaction = row.transaction!;
      const month = transaction.date.slice(0, 7);
      const existingMonth = monthly.get(month) ?? { month, expense: 0, income: 0, transfer: 0 };

      if (transaction.type === 'expense') {
        existingMonth.expense += Math.abs(transaction.amount);
        if (transaction.category) {
          categories.set(
            transaction.category,
            (categories.get(transaction.category) ?? 0) + Math.abs(transaction.amount),
          );
        }
      } else if (transaction.type === 'income') {
        existingMonth.income += Math.abs(transaction.amount);
      } else {
        existingMonth.transfer += Math.abs(transaction.amount);
      }

      monthly.set(month, existingMonth);
    });

  return {
    total: rows.length,
    newCount: rows.filter((row) => row.status === 'new').length,
    duplicateCount: rows.filter((row) => row.status === 'duplicate').length,
    needsReviewCount: rows.filter((row) => row.status === 'needs_review').length,
    errorCount: rows.filter((row) => row.status === 'error').length,
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    categories: [...categories.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}
