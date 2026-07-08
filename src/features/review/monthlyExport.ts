import type { Transaction } from '../../types/models';
import type { MonthlyReviewData } from './monthlyReview';

export interface ExportFile {
  fileName: string;
  mimeType: string;
  content: string | Uint8Array;
}

function csvEscape(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ].join('\r\n');
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeAccountName(value: string | undefined) {
  if (!value) return '';
  return value.replace(/\d{4,}/g, '[redacted]');
}

function transactionRows(transactions: Transaction[]) {
  return transactions.map((tx) => [
    tx.date,
    tx.type,
    tx.amount,
    tx.category,
    sanitizeAccountName(tx.account),
    sanitizeAccountName(tx.toAccount),
    tx.note,
    tx.status,
    tx.source,
    tx.importBatchId ?? '',
  ]);
}

export function buildMonthlySummaryCsv(data: MonthlyReviewData) {
  return toCsv(
    ['month', 'metric', 'value'],
    [
      [data.monthKey, 'income', data.income],
      [data.monthKey, 'expense', data.expense],
      [data.monthKey, 'net_cash_flow', data.netCashFlow],
      [data.monthKey, 'previous_income', data.previousIncome],
      [data.monthKey, 'previous_expense', data.previousExpense],
      [data.monthKey, 'previous_net_cash_flow', data.previousNetCashFlow],
      [data.monthKey, 'transfer_count', data.transferCount],
      [data.monthKey, 'transfer_amount', data.transferAmount],
      [data.monthKey, 'refund_count', data.refundCount],
      [data.monthKey, 'refund_amount', data.refundAmount],
      [data.monthKey, 'needs_review_count', data.needsReviewCount],
      [data.monthKey, 'cash_balance', data.assetSummary.cashBalance],
      [data.monthKey, 'asset_value', data.assetSummary.assetValue],
      [data.monthKey, 'debt_balance', data.assetSummary.debtBalance],
      [data.monthKey, 'net_worth_estimate', data.assetSummary.netWorthEstimate],
      [data.monthKey, 'emergency_fund_target', data.assetSummary.emergencyFundTarget],
      [
        data.monthKey,
        'emergency_fund_progress',
        Number(data.assetSummary.emergencyFundProgress.toFixed(4)),
      ],
      [data.monthKey, 'last_verified_date', data.assetSummary.lastVerifiedDate ?? ''],
    ],
  );
}

export function buildMonthlyTransactionsCsv(data: MonthlyReviewData) {
  return toCsv(
    [
      'date',
      'type',
      'amount',
      'category',
      'account',
      'to_account',
      'note',
      'status',
      'source',
      'import_batch_id',
    ],
    transactionRows(data.transactions),
  );
}

export function buildMonthlyCategoryBreakdownCsv(data: MonthlyReviewData) {
  return toCsv(
    ['month', 'category', 'amount', 'group'],
    data.expenseByCategory.map((row) => [data.monthKey, row.category, row.amount, row.group ?? '']),
  );
}

export function buildMonthlyIncomeBreakdownCsv(data: MonthlyReviewData) {
  return toCsv(
    ['month', 'category', 'amount'],
    data.incomeByCategory.map((row) => [data.monthKey, row.category, row.amount]),
  );
}

export function buildMonthlyReviewCsv(data: MonthlyReviewData): ExportFile {
  return {
    fileName: `finance-tracker-monthly-review-${data.monthKey}.csv`,
    mimeType: 'text/csv;charset=utf-8',
    content: buildMonthlySummaryCsv(data),
  };
}

function crc32(bytes: Uint8Array) {
  let table = crc32Table;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    crc32Table = table;
  }

  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let crc32Table: Uint32Array | null = null;

function writeUint16(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function dosDateTime(date = new Date()) {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, date: dosDate };
}

export function buildZip(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const now = dosDateTime();
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const crc = crc32(contentBytes);

    writeUint32(local, 0x04034b50);
    writeUint16(local, 20);
    writeUint16(local, 0x0800);
    writeUint16(local, 0);
    writeUint16(local, now.time);
    writeUint16(local, now.date);
    writeUint32(local, crc);
    writeUint32(local, contentBytes.length);
    writeUint32(local, contentBytes.length);
    writeUint16(local, nameBytes.length);
    writeUint16(local, 0);
    local.push(...nameBytes, ...contentBytes);

    writeUint32(central, 0x02014b50);
    writeUint16(central, 20);
    writeUint16(central, 20);
    writeUint16(central, 0x0800);
    writeUint16(central, 0);
    writeUint16(central, now.time);
    writeUint16(central, now.date);
    writeUint32(central, crc);
    writeUint32(central, contentBytes.length);
    writeUint32(central, contentBytes.length);
    writeUint16(central, nameBytes.length);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint32(central, 0);
    writeUint32(central, offset);
    central.push(...nameBytes);

    offset = local.length;
  }

  const end: number[] = [];
  writeUint32(end, 0x06054b50);
  writeUint16(end, 0);
  writeUint16(end, 0);
  writeUint16(end, files.length);
  writeUint16(end, files.length);
  writeUint32(end, central.length);
  writeUint32(end, local.length);
  writeUint16(end, 0);

  return new Uint8Array([...local, ...central, ...end]);
}

export function buildMonthlyBackupZip(data: MonthlyReviewData): ExportFile {
  const files = [
    { name: 'monthly-summary.csv', content: buildMonthlySummaryCsv(data) },
    { name: 'monthly-transactions.csv', content: buildMonthlyTransactionsCsv(data) },
    { name: 'monthly-category-breakdown.csv', content: buildMonthlyCategoryBreakdownCsv(data) },
    { name: 'monthly-income-breakdown.csv', content: buildMonthlyIncomeBreakdownCsv(data) },
  ];

  return {
    fileName: `finance-tracker-backup-${isoDate()}.zip`,
    mimeType: 'application/zip',
    content: buildZip(files),
  };
}

export function downloadExport(file: ExportFile) {
  let content: BlobPart;
  if (file.content instanceof Uint8Array) {
    const buffer = new ArrayBuffer(file.content.byteLength);
    new Uint8Array(buffer).set(file.content);
    content = buffer;
  } else {
    content = file.content;
  }
  const blob = new Blob([content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
