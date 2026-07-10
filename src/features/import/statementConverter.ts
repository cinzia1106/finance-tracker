import type { TransactionType } from '../../types/models';

const STANDARD_HEADERS = ['date', 'type', 'amount', 'category', 'account', 'to_account', 'note'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type StatementSource = 'post-office-csv' | 'ctbc-deposit-pdf';

export interface StandardCsvRow {
  date: string;
  type: TransactionType;
  amount: number;
  category: string;
  account: string;
  to_account: string;
  note: string;
}

export interface ConvertedStatementRow {
  row: StandardCsvRow;
  sourceLine: string;
  confidence: 'high' | 'review';
  reason: string;
}

export interface StatementConversionResult {
  rows: ConvertedStatementRow[];
  csvText: string;
  warnings: string[];
}

interface RawStatementRow {
  date: string;
  description: string;
  amount: number;
  account: string;
  direction?: 'in' | 'out';
  balance?: string;
  sourceLine: string;
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

function csvEscape(value: string | number) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function standardRowsToCsv(rows: StandardCsvRow[]) {
  return [
    STANDARD_HEADERS.join(','),
    ...rows.map((row) => STANDARD_HEADERS.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n');
}

function parseAmount(value: string) {
  const normalized = value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[,\s$NTDＴＷＤ台幣元]/gi, '')
    .replace(/[()]/g, '')
    .trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount);
}

function normalizeDate(value: string, fallbackYear?: number) {
  const cleaned = value.trim();
  if (DATE_RE.test(cleaned)) return cleaned;

  const roc = cleaned.match(/^(\d{2,3})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (roc) {
    return `${Number(roc[1]) + 1911}-${roc[2].padStart(2, '0')}-${roc[3].padStart(2, '0')}`;
  }

  const ymd = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  const md = cleaned.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (md && fallbackYear) {
    return `${fallbackYear}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`;
  }

  return '';
}

function normalizeHeader(value: string) {
  return value.replace(/\s+/g, '').replace(/[()（）:：]/g, '').toLowerCase();
}

function headerIndex(headers: string[], names: string[]) {
  const normalizedNames = names.map(normalizeHeader);
  return headers.findIndex((header) => {
    const normalizedHeader = normalizeHeader(header);
    return normalizedNames.some((name) => normalizedHeader.includes(name));
  });
}

function inferCurrentYear() {
  return new Date().getFullYear();
}

export function convertPostOfficeCsv(csvText: string, accountName = '郵局'): StatementConversionResult {
  const warnings: string[] = [];
  const normalized = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { rows: [], csvText: standardRowsToCsv([]), warnings: ['CSV is empty.'] };

  const headerRowIndex = lines.findIndex((line) => {
    const cells = splitCsvLine(line);
    return cells.some((cell) => /日期|交易日|date/i.test(cell)) && cells.some((cell) => /金額|提款|存款|amount/i.test(cell));
  });
  if (headerRowIndex < 0) {
    const rawFallbackRows = lines.flatMap((line) => parseGenericStatementLine(line, accountName, inferCurrentYear()));
    const rows = rawFallbackRows.map(classifyStatementRow);
    return {
      rows,
      csvText: standardRowsToCsv(rows.map((row) => row.row)),
      warnings: rows.length > 0
        ? ['Post Office CSV headers were not recognized; rows were parsed by fallback rules and should be reviewed.']
        : ['Unable to find Post Office CSV headers or recognizable transaction rows.'],
    };
  }

  const headers = splitCsvLine(lines[headerRowIndex]);
  const dateIndex = headerIndex(headers, ['日期', '交易日', '交易日期', '入帳日', 'date']);
  const noteIndex = headerIndex(headers, ['摘要', '交易說明', '交易內容', '備註', '說明', 'description', 'memo']);
  const withdrawIndex = headerIndex(headers, ['提款', '支出', '支取', '借方', 'withdraw', 'debit']);
  const depositIndex = headerIndex(headers, ['存款', '收入', '存入', '貸方', 'deposit', 'credit']);
  const amountIndex = headerIndex(headers, ['金額', '交易金額', 'amount']);
  const balanceIndex = headerIndex(headers, ['餘額', '結餘', 'balance']);

  if (dateIndex < 0 || noteIndex < 0 || (amountIndex < 0 && withdrawIndex < 0 && depositIndex < 0)) {
    const rawFallbackRows = lines.slice(headerRowIndex + 1)
      .flatMap((line) => parseGenericStatementLine(line, accountName, inferCurrentYear()));
    const rows = rawFallbackRows.map(classifyStatementRow);
    return {
      rows,
      csvText: standardRowsToCsv(rows.map((row) => row.row)),
      warnings: rows.length > 0
        ? [`Post Office CSV columns were not fully recognized: ${headers.join(' | ')}. Parsed by fallback rules.`]
        : [`Post Office CSV columns are not recognized: ${headers.join(' | ')}`],
    };
  }

  const rawRows = lines.slice(headerRowIndex + 1).flatMap<RawStatementRow>((line) => {
    const cells = splitCsvLine(line);
    const date = normalizeDate(cells[dateIndex] ?? '', inferCurrentYear());
    const description = cells[noteIndex] ?? '';
    const withdraw = withdrawIndex >= 0 ? parseAmount(cells[withdrawIndex] ?? '') : null;
    const deposit = depositIndex >= 0 ? parseAmount(cells[depositIndex] ?? '') : null;
    const directAmount = amountIndex >= 0 ? parseAmount(cells[amountIndex] ?? '') : null;

    let amount = 0;
    let direction: RawStatementRow['direction'];
    if (withdraw && withdraw > 0) {
      amount = withdraw;
      direction = 'out';
    } else if (deposit && deposit > 0) {
      amount = deposit;
      direction = 'in';
    } else if (directAmount) {
      amount = Math.abs(directAmount);
      direction = directAmount < 0 ? 'out' : 'in';
    }

    if (!date || !description || !amount) {
      return parseGenericStatementLine(line, accountName, inferCurrentYear());
    }
    return [{
      date,
      description,
      amount,
      account: accountName,
      direction,
      balance: balanceIndex >= 0 ? cells[balanceIndex] : undefined,
      sourceLine: line,
    }];
  });

  const rows = rawRows.map(classifyStatementRow);
  if (rows.length === 0) warnings.push('No transaction rows were recognized after the CSV header.');
  return { rows, csvText: standardRowsToCsv(rows.map((row) => row.row)), warnings };
}

function parseGenericStatementLine(line: string, accountName: string, fallbackYear: number): RawStatementRow[] {
  const cells = splitCsvLine(line).map((cell) => cell.trim()).filter(Boolean);
  const joined = cells.join(' ');
  const dateCell = cells.find((cell) => normalizeDate(cell, fallbackYear));
  const date = dateCell ? normalizeDate(dateCell, fallbackYear) : '';
  if (!date) return [];

  const amountCells = cells
    .map((cell, index) => ({ index, raw: cell, amount: parseAmount(cell) }))
    .filter((item): item is { index: number; raw: string; amount: number } =>
      item.amount !== null && item.amount !== 0 && /[\d０-９]/.test(item.raw),
    );
  if (amountCells.length === 0) return [];

  const amountCell = amountCells[0];
  const amount = Math.abs(amountCell.amount);
  const direction = /提款|支出|支取|轉出|扣款|借方|withdraw|debit/i.test(joined)
    ? 'out'
    : /存款|收入|存入|轉入|貸方|deposit|credit/i.test(joined)
      ? 'in'
      : amountCell.amount < 0
        ? 'out'
        : undefined;
  const description = cells
    .filter((cell, index) => cell !== dateCell && index !== amountCell.index && !normalizeDate(cell, fallbackYear))
    .join(' ')
    .trim();

  return [{
    date,
    description: description || joined,
    amount,
    account: accountName,
    direction,
    sourceLine: line,
  }];
}

function parseDelimitedPdfLine(line: string, defaultAccount: string, fallbackYear: number): RawStatementRow | null {
  const compact = line.replace(/\s+/g, ' ').trim();
  const dateMatch = compact.match(/(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{2,3}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2})/);
  if (!dateMatch) return null;

  const amounts = [...compact.matchAll(/(?:^|\s)(-?\(?\d{1,3}(?:,\d{3})+|-?\(?\d+)(?:\)?)(?=\s|$)/g)]
    .map((match) => ({ raw: match[1], amount: parseAmount(match[1]) }))
    .filter((item): item is { raw: string; amount: number } => item.amount !== null && item.amount !== 0);
  if (amounts.length === 0) return null;

  const date = normalizeDate(dateMatch[1], fallbackYear);
  const amountToken = amounts[0];
  const beforeAmount = compact.slice(dateMatch.index! + dateMatch[0].length, compact.indexOf(amountToken.raw)).trim();
  const direction = /支出|提款|轉出|扣款|借方|debit/i.test(compact)
    ? 'out'
    : /收入|存入|轉入|貸方|credit/i.test(compact)
      ? 'in'
      : amountToken.raw.includes('-') || amountToken.raw.includes('(')
        ? 'out'
        : undefined;

  return {
    date,
    description: beforeAmount || compact,
    amount: Math.abs(amountToken.amount),
    account: defaultAccount,
    direction,
    sourceLine: line,
  };
}

async function inflatePdfStream(bytes: Uint8Array) {
  if (!('DecompressionStream' in globalThis)) return null;
  try {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function latin1BytesToString(bytes: Uint8Array) {
  let result = '';
  for (const byte of bytes) result += String.fromCharCode(byte);
  return result;
}

function decodePdfEscapes(value: string) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, char: string) => {
      const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      return map[char] ?? char;
    })
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function decodeHexPdfString(value: string) {
  const hex = value.replace(/\s+/g, '');
  const bytes: number[] = [];
  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(parseInt(hex.slice(index, index + 2).padEnd(2, '0'), 16));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = '';
    for (let index = 2; index < bytes.length; index += 2) {
      text += String.fromCharCode((bytes[index] << 8) + (bytes[index + 1] ?? 0));
    }
    return text;
  }
  return latin1BytesToString(new Uint8Array(bytes));
}

function extractTextOperators(streamText: string) {
  const parts: string[] = [];
  const literalRe = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  const arrayRe = /\[((?:.|\n)*?)\]\s*TJ/g;
  const hexRe = /<([0-9A-Fa-f\s]+)>\s*Tj/g;

  for (const match of streamText.matchAll(literalRe)) {
    parts.push(decodePdfEscapes(match[0].replace(/\)\s*Tj$/, '').slice(1)));
  }
  for (const match of streamText.matchAll(arrayRe)) {
    const segment = match[1];
    for (const literal of segment.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      parts.push(decodePdfEscapes(literal[0].slice(1, -1)));
    }
    for (const hex of segment.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
      parts.push(decodeHexPdfString(hex[1]));
    }
    parts.push('\n');
  }
  for (const match of streamText.matchAll(hexRe)) {
    parts.push(decodeHexPdfString(match[1]));
  }

  return parts.join(' ');
}

export async function extractPdfText(file: File) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const raw = latin1BytesToString(buffer);
  const streams = [...raw.matchAll(/<<(.*?)>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g)];
  const textParts: string[] = [];

  for (const match of streams) {
    const dictionary = match[1];
    const body = match[2];
    const bodyBytes = Uint8Array.from(body, (char) => char.charCodeAt(0) & 0xff);
    const decoded = /FlateDecode/.test(dictionary) ? await inflatePdfStream(bodyBytes) : bodyBytes;
    if (!decoded) continue;
    const streamText = latin1BytesToString(decoded);
    const operatorText = extractTextOperators(streamText);
    if (operatorText.trim()) textParts.push(operatorText);
  }

  const fallbackText = raw
    .match(/\((?:\\.|[^\\)]){2,}\)/g)
    ?.map((text) => decodePdfEscapes(text.slice(1, -1)))
    .join('\n');

  return [...textParts, fallbackText ?? ''].join('\n').replace(/\s+\n/g, '\n').trim();
}

export async function convertCtbcDepositPdf(file: File, accountName = '中信 Deposit'): Promise<StatementConversionResult> {
  const warnings: string[] = [];
  const text = await extractPdfText(file);
  if (!text) {
    return {
      rows: [],
      csvText: standardRowsToCsv([]),
      warnings: ['Unable to extract text from PDF. This may be a scanned or protected statement.'],
    };
  }

  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const rawRows = lines.flatMap<RawStatementRow>((line) => {
    const parsed = parseDelimitedPdfLine(line, accountName, inferCurrentYear());
    return parsed ? [parsed] : [];
  });

  if (rawRows.length === 0) warnings.push('PDF text was extracted, but no transaction rows were recognized.');
  const rows = rawRows.map(classifyStatementRow);
  return { rows, csvText: standardRowsToCsv(rows.map((row) => row.row)), warnings };
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyStatementRow(input: RawStatementRow): ConvertedStatementRow {
  const text = input.description.toLowerCase();
  const rawNote = input.description.replace(/\s+/g, ' ').trim();
  const review = (row: StandardCsvRow, reason: string): ConvertedStatementRow => ({
    row: { ...row, note: `[needs_review] ${reason} | ${row.note || rawNote}`.trim() },
    sourceLine: input.sourceLine,
    confidence: 'review',
    reason,
  });
  const high = (row: StandardCsvRow, reason: string): ConvertedStatementRow => ({
    row,
    sourceLine: input.sourceLine,
    confidence: 'high',
    reason,
  });

  if (hasAny(text, [/股利|股息|dividend/])) {
    return high({
      date: input.date,
      type: 'income',
      amount: input.amount,
      category: '股利',
      account: input.account,
      to_account: '',
      note: rawNote,
    }, 'dividend keyword');
  }

  if (hasAny(text, [/提款|提領|atm.*領|現金/])) {
    return high({
      date: input.date,
      type: 'transfer',
      amount: input.amount,
      category: '',
      account: input.account,
      to_account: '現金',
      note: rawNote,
    }, 'cash withdrawal keyword');
  }

  if (hasAny(text, [/證券款|交割|券商|證券/])) {
    const outgoing = input.direction !== 'in';
    return review({
      date: input.date,
      type: 'transfer',
      amount: input.amount,
      category: '',
      account: outgoing ? input.account : '投資帳戶',
      to_account: outgoing ? '投資帳戶' : input.account,
      note: rawNote,
    }, 'securities settlement requires confirmation');
  }

  if (hasAny(text, [/轉帳|轉入|轉出|匯入|匯出|跨行|transfer/])) {
    const outgoing = input.direction !== 'in';
    return review({
      date: input.date,
      type: 'transfer',
      amount: input.amount,
      category: '',
      account: outgoing ? input.account : '待確認來源',
      to_account: outgoing ? '待確認去向' : input.account,
      note: rawNote,
    }, 'transfer counterparty requires confirmation');
  }

  if (input.direction === 'in') {
    return review({
      date: input.date,
      type: 'income',
      amount: input.amount,
      category: 'Needs review',
      account: input.account,
      to_account: '',
      note: rawNote,
    }, 'income category requires confirmation');
  }

  if (input.direction === 'out') {
    return review({
      date: input.date,
      type: 'expense',
      amount: input.amount,
      category: 'Needs review',
      account: input.account,
      to_account: '',
      note: rawNote,
    }, 'expense category requires confirmation');
  }

  return review({
    date: input.date,
    type: 'expense',
    amount: input.amount,
    category: 'Needs review',
    account: input.account,
    to_account: '',
    note: rawNote,
  }, 'direction could not be determined');
}
