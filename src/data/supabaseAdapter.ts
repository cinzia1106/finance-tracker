import type {
  AccountDraft,
  AssetSnapshotDraft,
  AssetOverview,
  DataAdapter,
  DebtSnapshotDraft,
  ImportBatchDraft,
  MonthOverview,
  RecurringItemDraft,
  TransactionDraft,
} from './adapter';
import { buildAssetOverview, buildMonthOverview } from './derivedValues';
import { DEFAULT_DASHBOARD_BUDGETS } from './categoryDefinitions';
import { requireSupabase } from '../lib/supabaseClient';
import type { Database, Json } from '../lib/supabaseTypes';
import type {
  Account,
  AssetSnapshot,
  ImportBatch,
  LiabilitySnapshot,
  RecurringExpense,
  Transaction,
  UserSettings,
} from '../types/models';

type AccountRow = Database['public']['Tables']['accounts']['Row'];
type AccountInsert = Database['public']['Tables']['accounts']['Insert'];
type AccountUpdate = Database['public']['Tables']['accounts']['Update'];
type TransactionDbRow = Database['public']['Tables']['transactions']['Row'];
type TransactionInsert = Database['public']['Tables']['transactions']['Insert'];
type TransactionUpdate = Database['public']['Tables']['transactions']['Update'];
type ImportBatchRow = Database['public']['Tables']['import_batches']['Row'];
type ImportBatchInsert = Database['public']['Tables']['import_batches']['Insert'];
type ImportBatchUpdate = Database['public']['Tables']['import_batches']['Update'];
type AssetSnapshotRow = Database['public']['Tables']['asset_snapshots']['Row'];
type AssetSnapshotInsert = Database['public']['Tables']['asset_snapshots']['Insert'];
type DebtSnapshotRow = Database['public']['Tables']['debt_snapshots']['Row'];
type DebtSnapshotInsert = Database['public']['Tables']['debt_snapshots']['Insert'];
type UserSettingsRow = Database['public']['Tables']['user_settings']['Row'];
type SyncEventInsert = Database['public']['Tables']['sync_events']['Insert'];
type RecurringRow = Database['public']['Tables']['recurring_items']['Row'];
type RecurringInsert = Database['public']['Tables']['recurring_items']['Insert'];
type RecurringUpdate = Database['public']['Tables']['recurring_items']['Update'];

const LOCAL_SETTINGS_KEY = 'finance-tracker:user-settings';

function monthDateRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, end };
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

function mapRecurringItem(row: RecurringRow): RecurringExpense {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount === null ? null : Number(row.amount),
    cycle: row.cycle,
    monthlyEquiv: row.monthly_equivalent === null ? null : Number(row.monthly_equivalent),
    category: row.category,
    account: row.account_id ?? '',
    billingDay: row.billing_day,
    active: row.active,
    lastPaid: row.last_paid ?? undefined,
    nextDue: row.next_due ?? undefined,
    note: row.note ?? undefined,
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

function mapAssetSnapshot(row: AssetSnapshotRow): AssetSnapshot {
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.date,
    balance: row.balance,
    costBasis: row.cost_basis,
    marketValue: row.market_value,
    dividendTotal: row.dividend_total,
    source: row.source,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDebtSnapshot(row: DebtSnapshotRow): LiabilitySnapshot {
  return {
    id: row.id,
    name: row.name,
    accountId: row.account_id,
    account: row.account_id ?? undefined,
    date: row.date,
    remainingBalance: row.remaining_balance,
    monthlyPayment: row.monthly_payment ?? undefined,
    nextDueDate: row.next_due_date ?? undefined,
    source: row.source,
    note: row.note ?? undefined,
  };
}

function parseBudgetSettings(value: Json | undefined): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_DASHBOARD_BUDGETS;
  const result: Record<string, number> = { ...DEFAULT_DASHBOARD_BUDGETS };
  for (const [category, raw] of Object.entries(value)) {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) continue;
    result[category] = Math.round(raw);
  }
  return result;
}

function localSettings(): Partial<UserSettings> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      emergencyFundMonths: parsed.emergencyFundMonths,
      dashboardBudgets: parsed.dashboardBudgets,
    };
  } catch {
    return {};
  }
}

function saveLocalSettings(settings: Partial<UserSettings>) {
  if (typeof window === 'undefined') return;
  const current = localSettings();
  window.localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
}

function mapUserSettings(row: UserSettingsRow): UserSettings {
  return {
    emergencyFundMonths: row.emergency_fund_months,
    dashboardBudgets: parseBudgetSettings(row.dashboard_budgets),
  };
}

function isMissingUserSettings(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  return code === '42P01' || /user_settings|schema cache|does not exist/i.test(message);
}

function isMissingSettingsColumn(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
  const code = 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  return code === '42703' || code === 'PGRST204' || /dashboard_budgets|schema cache|column/i.test(message);
}

export async function requireUserId() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in is required before reading user data.');
  return userId;
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

  async listAssetSnapshots(throughDate?: string): Promise<AssetSnapshot[]> {
    await requireUserId();
    const client = requireSupabase();
    let query = client.from('asset_snapshots').select('*').order('date', { ascending: false });

    if (throughDate) {
      query = query.lte('date', throughDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data.map(mapAssetSnapshot);
  }

  async listDebtSnapshots(throughDate?: string): Promise<LiabilitySnapshot[]> {
    await requireUserId();
    const client = requireSupabase();
    let query = client.from('debt_snapshots').select('*').order('date', { ascending: false });

    if (throughDate) {
      query = query.lte('date', throughDate);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data.map(mapDebtSnapshot);
  }

  async createAssetSnapshot(input: AssetSnapshotDraft): Promise<AssetSnapshot> {
    const userId = await requireUserId();
    const client = requireSupabase();
    const insert: AssetSnapshotInsert = {
      id: input.id,
      user_id: userId,
      account_id: input.accountId ?? null,
      date: input.date,
      balance: input.balance,
      cost_basis: input.costBasis ?? null,
      market_value: input.marketValue ?? null,
      dividend_total: input.dividendTotal ?? null,
      source: input.source,
      note: input.note ?? null,
    };
    const { data, error } = await client
      .from('asset_snapshots')
      .insert(insert)
      .select('*')
      .single();

    if (error) throw error;
    return mapAssetSnapshot(data);
  }

  async createDebtSnapshot(input: DebtSnapshotDraft): Promise<LiabilitySnapshot> {
    const userId = await requireUserId();
    const client = requireSupabase();
    const insert: DebtSnapshotInsert = {
      id: input.id,
      user_id: userId,
      account_id: input.accountId ?? input.account ?? null,
      name: input.name,
      date: input.date,
      remaining_balance: input.remainingBalance,
      monthly_payment: input.monthlyPayment ?? null,
      next_due_date: input.nextDueDate ?? null,
      source: input.source,
      note: input.note ?? null,
    };
    const { data, error } = await client
      .from('debt_snapshots')
      .insert(insert)
      .select('*')
      .single();

    if (error) throw error;
    return mapDebtSnapshot(data);
  }

  async listRecurringItems(): Promise<RecurringExpense[]> {
    await requireUserId();
    const client = requireSupabase();
    const { data, error } = await client
      .from('recurring_items')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data.map(mapRecurringItem);
  }

  async createRecurringItem(input: RecurringItemDraft): Promise<RecurringExpense> {
    const userId = await requireUserId();
    const client = requireSupabase();
    const insert: RecurringInsert = {
      id: input.id,
      user_id: userId,
      name: input.name,
      amount: input.amount,
      cycle: input.cycle,
      monthly_equivalent: input.monthlyEquiv ?? null,
      category: input.category,
      billing_day: input.billingDay ?? null,
      active: input.active,
      last_paid: input.lastPaid ?? null,
      next_due: input.nextDue ?? null,
      note: input.note ?? null,
    };
    const { data, error } = await client
      .from('recurring_items')
      .insert(insert)
      .select('*')
      .single();

    if (error) throw error;
    return mapRecurringItem(data);
  }

  async updateRecurringItem(
    id: string,
    input: Partial<Omit<RecurringExpense, 'id' | 'account' | 'lastPaid'>> & {
      lastPaid?: string | null;
    },
  ): Promise<RecurringExpense> {
    await requireUserId();
    const client = requireSupabase();
    const update: RecurringUpdate = {
      name: input.name,
      amount: input.amount,
      cycle: input.cycle,
      monthly_equivalent: input.monthlyEquiv,
      category: input.category,
      billing_day: input.billingDay,
      active: input.active,
      last_paid: input.lastPaid,
      next_due: input.nextDue,
      note: input.note,
    };
    const { data, error } = await client
      .from('recurring_items')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return mapRecurringItem(data);
  }

  async deleteRecurringItem(id: string): Promise<void> {
    await requireUserId();
    const client = requireSupabase();
    const { error } = await client.from('recurring_items').delete().eq('id', id);
    if (error) throw error;
  }

  async getUserSettings(): Promise<UserSettings> {
    const userId = await requireUserId();
    const client = requireSupabase();
    const local = localSettings();
    const { data, error } = await client
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isMissingUserSettings(error)) {
        return {
          emergencyFundMonths: local.emergencyFundMonths ?? 3,
          dashboardBudgets: { ...DEFAULT_DASHBOARD_BUDGETS, ...(local.dashboardBudgets ?? {}) },
        };
      }
      throw error;
    }
    if (data) {
      const remote = mapUserSettings(data);
      return {
        ...remote,
        ...local,
        dashboardBudgets: {
          ...remote.dashboardBudgets,
          ...(local.dashboardBudgets ?? {}),
        },
      };
    }

    const created = await client
      .from('user_settings')
      .insert({ user_id: userId })
      .select('*')
      .single();
    if (created.error) throw created.error;
    const remote = mapUserSettings(created.data);
    return {
      ...remote,
      ...local,
      dashboardBudgets: {
        ...remote.dashboardBudgets,
        ...(local.dashboardBudgets ?? {}),
      },
    };
  }

  async updateUserSettings(input: Partial<UserSettings>): Promise<UserSettings> {
    const userId = await requireUserId();
    const client = requireSupabase();
    if (input.dashboardBudgets) saveLocalSettings({ dashboardBudgets: input.dashboardBudgets });
    if (input.emergencyFundMonths) saveLocalSettings({ emergencyFundMonths: input.emergencyFundMonths });
    const current = await this.getUserSettings();
    const nextSettings: UserSettings = {
      emergencyFundMonths: input.emergencyFundMonths ?? current.emergencyFundMonths,
      dashboardBudgets: {
        ...(current.dashboardBudgets ?? DEFAULT_DASHBOARD_BUDGETS),
        ...(input.dashboardBudgets ?? {}),
      },
    };
    const { data, error } = await client
      .from('user_settings')
      .upsert({
        user_id: userId,
        emergency_fund_months: nextSettings.emergencyFundMonths,
        dashboard_budgets: nextSettings.dashboardBudgets as Json,
      })
      .select('*')
      .single();

    if (error) {
      if (isMissingSettingsColumn(error) || isMissingUserSettings(error)) return nextSettings;
      throw error;
    }
    return mapUserSettings(data);
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
    const monthEnd = new Date(year, month, 0).toISOString().slice(0, 10);
    const [transactions, allTransactions, accounts, assetSnapshots, debtSnapshots, importBatches, settings] =
      await Promise.all([
        this.listTransactions(year, month),
        this.listTransactions(),
        this.listAccounts(),
        this.listAssetSnapshots(monthEnd),
        this.listDebtSnapshots(monthEnd),
        this.listImportBatches(),
        this.getUserSettings(),
      ]);

    return buildMonthOverview({
      year,
      month,
      transactions,
      allTransactions,
      accounts,
      assetSnapshots,
      debtSnapshots,
      importBatches,
      settings,
    });
  }

  async getAssetOverview(): Promise<AssetOverview> {
    const [accounts, allTransactions, assetSnapshots, debtSnapshots, settings] = await Promise.all([
      this.listAccounts(),
      this.listTransactions(),
      this.listAssetSnapshots(),
      this.listDebtSnapshots(),
      this.getUserSettings(),
    ]);

    return buildAssetOverview({
      accounts,
      allTransactions,
      assetSnapshots,
      debtSnapshots,
      settings,
    });
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
