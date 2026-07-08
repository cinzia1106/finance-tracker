import type {
  AccountBalanceRow,
  AccountDraft,
  AssetOverview,
  DataAdapter,
  ImportBatchDraft,
  MonthOverview,
  TransactionDraft,
  TransactionRow,
} from './adapter';
import { requireSupabase } from '../lib/supabaseClient';
import type { Database, Json } from '../lib/supabaseTypes';
import type { Account, ImportBatch, Transaction } from '../types/models';

type AccountRow = Database['public']['Tables']['accounts']['Row'];
type AccountInsert = Database['public']['Tables']['accounts']['Insert'];
type AccountUpdate = Database['public']['Tables']['accounts']['Update'];
type TransactionDbRow = Database['public']['Tables']['transactions']['Row'];
type TransactionInsert = Database['public']['Tables']['transactions']['Insert'];
type TransactionUpdate = Database['public']['Tables']['transactions']['Update'];
type ImportBatchRow = Database['public']['Tables']['import_batches']['Row'];
type ImportBatchInsert = Database['public']['Tables']['import_batches']['Insert'];
type ImportBatchUpdate = Database['public']['Tables']['import_batches']['Update'];
type SyncEventInsert = Database['public']['Tables']['sync_events']['Insert'];
type InboxTransaction = Transaction & { type: 'expense' | 'income' };

function monthDateRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, end };
}

function formatMonthDay(date: string) {
  const [, month, day] = date.split('-');
  return `${month}/${day}`;
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    note: row.note ?? undefined,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransaction(row: TransactionDbRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id ?? undefined,
    toAccountId: row.to_account_id,
    importBatchId: row.import_batch_id,
    date: row.date,
    type: row.type,
    amount: row.amount,
    category: row.category,
    account: row.account_name || row.account_id || '',
    toAccount: row.to_account_name ?? row.to_account_id ?? undefined,
    note: row.note,
    tags: row.tags,
    status: row.status,
    source: row.source,
    rawPayload: typeof row.raw_payload === 'object' && row.raw_payload !== null && !Array.isArray(row.raw_payload)
      ? row.raw_payload as Record<string, unknown>
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapImportBatch(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    fileName: row.file_name,
    rowCount: row.row_count,
    metadata: typeof row.metadata === 'object' && row.metadata !== null && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isInboxTransaction(tx: Transaction): tx is InboxTransaction {
  return tx.status === 'needs_review' && (tx.type === 'expense' || tx.type === 'income');
}

export async function requireUserId() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in is required before reading user data.');
  return userId;
}

function emptySafeline() {
  return {
    balance: 0,
    confirmedAt: '--',
    firstLine: 0,
    comfortLine: 0,
  };
}

function emptyInvestment() {
  return {
    netInvested: 0,
    marketValue: 0,
    snapshotDate: '--',
    unrealizedGain: 0,
    unrealizedGainPct: 0,
    monthlyBuy: 0,
    dividendTotal: 0,
  };
}

export class SupabaseDataAdapter implements DataAdapter {
  async listAccounts(): Promise<Account[]> {
    await requireUserId();
    const client = requireSupabase();
    const { data, error } = await client
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data.map(mapAccount);
  }

  async createAccount(input: AccountDraft): Promise<Account> {
    const userId = await requireUserId();
    const client = requireSupabase();
    const insert: AccountInsert = {
      id: input.id,
      user_id: userId,
      name: input.name,
      type: input.type,
      note: input.note ?? null,
      active: input.active ?? true,
    };
    const { data, error } = await client.from('accounts').insert(insert).select('*').single();

    if (error) throw error;
    return mapAccount(data);
  }

  async updateAccount(
    id: string,
    input: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Account> {
    await requireUserId();
    const client = requireSupabase();
    const update: AccountUpdate = {
      name: input.name,
      type: input.type,
      note: input.note,
      active: input.active,
    };
    const { data, error } = await client
      .from('accounts')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return mapAccount(data);
  }

  async deleteAccount(id: string): Promise<void> {
    await requireUserId();
    const client = requireSupabase();
    const { error } = await client.from('accounts').delete().eq('id', id);
    if (error) throw error;
  }

  async listTransactions(year?: number, month?: number): Promise<Transaction[]> {
    await requireUserId();
    const client = requireSupabase();
    let query = client.from('transactions').select('*').order('date', { ascending: false });

    if (year && month) {
      const { start, end } = monthDateRange(year, month);
      query = query.gte('date', start).lt('date', end);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data.map(mapTransaction);
  }

  async createTransaction(
    input: TransactionDraft,
  ): Promise<Transaction> {
    const userId = await requireUserId();
    const client = requireSupabase();
    const insert: TransactionInsert = {
      id: input.id,
      user_id: userId,
      account_id: input.accountId ?? null,
      to_account_id: input.toAccountId ?? null,
      account_name: input.account,
      to_account_name: input.toAccount ?? null,
      import_batch_id: input.importBatchId ?? null,
      date: input.date,
      type: input.type,
      amount: input.amount,
      category: input.category,
      note: input.note,
      tags: input.tags,
      status: input.status,
      source: input.source,
      raw_payload: (input.rawPayload ?? {}) as Json,
    };
    const { data, error } = await client.from('transactions').insert(insert).select('*').single();

    if (error) throw error;
    return mapTransaction(data);
  }

  async updateTransaction(
    id: string,
    input: Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Transaction> {
    await requireUserId();
    const client = requireSupabase();
    const update: TransactionUpdate = {
      account_id: input.accountId,
      to_account_id: input.toAccountId,
      account_name: input.account,
      to_account_name: input.toAccount,
      import_batch_id: input.importBatchId,
      date: input.date,
      type: input.type,
      amount: input.amount,
      category: input.category,
      note: input.note,
      tags: input.tags,
      status: input.status,
      source: input.source,
      raw_payload: input.rawPayload as Json | undefined,
    };
    const { data, error } = await client
      .from('transactions')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return mapTransaction(data);
  }

  async deleteTransaction(id: string): Promise<void> {
    await requireUserId();
    const client = requireSupabase();
    const { error } = await client.from('transactions').delete().eq('id', id);
    if (error) throw error;
  }

  async getMonthOverview(year: number, month: number): Promise<MonthOverview> {
    const transactions = await this.listTransactions(year, month);
    const income = transactions
      .filter((tx) => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const expense = transactions
      .filter((tx) => tx.type === 'expense')
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const needsReviewCount = transactions.filter((tx) => tx.status === 'needs_review').length;

    const recentTransactions: TransactionRow[] = transactions.slice(0, 5).map((tx) => ({
      id: tx.id,
      date: formatMonthDay(tx.date),
      category: tx.category || 'Uncategorized',
      note: tx.note,
      tag: tx.tags[0],
      account: tx.accountId ?? '',
      amount: tx.type === 'expense' ? -Math.abs(tx.amount) : tx.amount,
      type: tx.type,
      status: tx.status,
    }));

    return {
      year,
      month,
      phaseNote: 'Supabase Foundation',
      lastImportNote: null,
      needsReviewCount,
      income,
      expense,
      transferCount: transactions.filter((tx) => tx.type === 'transfer').length,
      incomeBySource: [],
      expenseGroups: [],
      budgets: [],
      creditCard: {
        charged: 0,
        due: 0,
        dueDate: '--',
        dueNote: '',
        subscriptionCount: 0,
        subscriptionTotal: 0,
      },
      safeline: emptySafeline(),
      investment: emptyInvestment(),
      inboxPreview: transactions
        .filter(isInboxTransaction)
        .slice(0, 2)
        .map((tx) => ({
          note: tx.note,
          amount: Math.abs(tx.amount),
          type: tx.type,
        })),
      recentTransactions,
    };
  }

  async getAssetOverview(): Promise<AssetOverview> {
    const accounts = await this.listAccounts();
    const accountRows: AccountBalanceRow[] = accounts.map((account) => ({
      name: account.name,
      detail: account.note,
      accountType: account.type,
      typeLabel: account.type,
      balance: 0,
      isLiability: account.type === 'credit_card',
      confirmedAt: '--',
      sourceLabel: '',
      stale: !account.active,
    }));

    return {
      netWorth: 0,
      netWorthDeltaFromLastMonth: 0,
      cashAndBank: 0,
      investmentValue: 0,
      investmentSnapshotDate: '--',
      liabilityTotal: 0,
      disposableCash: 0,
      netWorthHistory: [],
      safeline: emptySafeline(),
      accounts: accountRows,
      liabilities: [],
      investment: emptyInvestment(),
    };
  }

  async getNeedsReviewCount(): Promise<number> {
    await requireUserId();
    const client = requireSupabase();
    const { count, error } = await client
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'needs_review');

    if (error) throw error;
    return count ?? 0;
  }

  async recordSyncEvent(input: Omit<SyncEventInsert, 'user_id'>): Promise<void> {
    const userId = await requireUserId();
    const client = requireSupabase();
    const { error } = await client.from('sync_events').insert({
      ...input,
      user_id: userId,
    });

    if (error) throw error;
  }

  async createImportBatch(input: ImportBatchDraft): Promise<ImportBatch> {
    const userId = await requireUserId();
    const client = requireSupabase();
    const insert: ImportBatchInsert = {
      id: input.id,
      user_id: userId,
      source: input.source,
      status: input.status,
      file_name: input.fileName ?? null,
      row_count: input.rowCount,
      metadata: input.metadata as Json,
    };
    const { data, error } = await client
      .from('import_batches')
      .insert(insert)
      .select('*')
      .single();

    if (error) throw error;
    return mapImportBatch(data);
  }

  async updateImportBatch(
    id: string,
    input: Partial<Omit<ImportBatch, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ImportBatch> {
    await requireUserId();
    const client = requireSupabase();
    const update: ImportBatchUpdate = {
      source: input.source,
      status: input.status,
      file_name: input.fileName,
      row_count: input.rowCount,
      metadata: input.metadata as Json | undefined,
    };
    const { data, error } = await client
      .from('import_batches')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return mapImportBatch(data);
  }

  async listImportBatches(): Promise<ImportBatch[]> {
    await requireUserId();
    const client = requireSupabase();
    const { data, error } = await client
      .from('import_batches')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data.map(mapImportBatch);
  }

  async rollbackImportBatch(id: string): Promise<void> {
    await requireUserId();
    const client = requireSupabase();
    const deleteTransactions = await client.from('transactions').delete().eq('import_batch_id', id);
    if (deleteTransactions.error) throw deleteTransactions.error;

    const deleteBatch = await client.from('import_batches').delete().eq('id', id);
    if (deleteBatch.error) throw deleteBatch.error;
  }
}
