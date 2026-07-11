import type {
  AccountDraft,
  DataAdapter,
  ImportBatchDraft,
  TransactionDraft,
} from './adapter';
import { SupabaseDataAdapter, requireUserId } from './supabaseAdapter';
import type { Account, ImportBatch, Transaction } from '../types/models';
import {
  createMutationId,
  enqueueMutation,
  getSyncQueueStats,
  listPendingMutations,
  removeMutation,
  updateMutation,
  type PendingMutation,
  type SyncQueueStats,
} from '../sync/syncQueue';
import {
  cacheTransactions,
  listCachedTransactions,
  removeCachedTransactionsByImportBatch,
} from '../sync/transactionCache';

type AccountUpdate = Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>>;
type TransactionUpdate = Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>;

function isNetworkUnavailable(error: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!(error instanceof Error)) return false;
  return /fetch|network|failed to fetch|load failed/i.test(error.message);
}

function timestamp() {
  return new Date().toISOString();
}

function optimisticAccount(input: AccountDraft): Account & { id: string } {
  const now = timestamp();
  return {
    id: input.id ?? createMutationId(),
    name: input.name,
    type: input.type,
    note: input.note,
    active: input.active ?? true,
    createdAt: now,
    updatedAt: now,
  };
}

function optimisticTransaction(input: TransactionDraft): Transaction & { id: string } {
  const now = timestamp();
  return {
    id: input.id ?? createMutationId(),
    accountId: input.accountId,
    toAccountId: input.toAccountId,
    date: input.date,
    type: input.type,
    amount: input.amount,
    category: input.category,
    account: input.account,
    toAccount: input.toAccount,
    note: input.note,
    tags: input.tags,
    status: input.status,
    source: input.source,
    createdAt: now,
    updatedAt: now,
  };
}

export class SyncedDataAdapter implements DataAdapter {
  private readonly remote = new SupabaseDataAdapter();
  private syncInFlight: Promise<void> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.flushPendingMutations();
      });
    }
  }

  getMonthOverview = this.remote.getMonthOverview.bind(this.remote);
  getAssetOverview = this.remote.getAssetOverview.bind(this.remote);
  getNeedsReviewCount = this.remote.getNeedsReviewCount.bind(this.remote);
  listAccounts = this.remote.listAccounts.bind(this.remote);
  listAssetSnapshots = this.remote.listAssetSnapshots.bind(this.remote);
  listDebtSnapshots = this.remote.listDebtSnapshots.bind(this.remote);
  createAssetSnapshot = this.remote.createAssetSnapshot.bind(this.remote);
  createDebtSnapshot = this.remote.createDebtSnapshot.bind(this.remote);
  getUserSettings = this.remote.getUserSettings.bind(this.remote);
  updateUserSettings = this.remote.updateUserSettings.bind(this.remote);
  listRecurringItems = this.remote.listRecurringItems.bind(this.remote);
  createRecurringItem = this.remote.createRecurringItem.bind(this.remote);
  updateRecurringItem = this.remote.updateRecurringItem.bind(this.remote);
  deleteRecurringItem = this.remote.deleteRecurringItem.bind(this.remote);

  async listTransactions(year?: number, month?: number): Promise<Transaction[]> {
    const [remoteTransactions, cachedTransactions] = await Promise.all([
      this.remote.listTransactions(year, month),
      listCachedTransactions(year, month),
    ]);
    const byId = new Map<string, Transaction>();
    cachedTransactions.forEach((transaction) => byId.set(transaction.id, transaction));
    remoteTransactions.forEach((transaction) => byId.set(transaction.id, transaction));
    const merged = [...byId.values()];
    return merged.sort((a, b) => b.date.localeCompare(a.date));
  }

  async createAccount(input: AccountDraft): Promise<Account> {
    const local = optimisticAccount(input);
    try {
      const saved = await this.remote.createAccount({ ...input, id: local.id });
      await this.recordSuccess('create', 'accounts', saved.id ?? local.id, { queued: false });
      return saved;
    } catch (error) {
      if (!isNetworkUnavailable(error)) throw error;
      const userId = await requireUserId();
      await enqueueMutation({
        userId,
        entity: 'accounts',
        operation: 'create',
        entityId: local.id,
        payload: { ...input, id: local.id },
      });
      return local;
    }
  }

  async updateAccount(id: string, input: AccountUpdate): Promise<Account> {
    try {
      const saved = await this.remote.updateAccount(id, input);
      await this.recordSuccess('update', 'accounts', id, { queued: false });
      return saved;
    } catch (error) {
      if (!isNetworkUnavailable(error)) throw error;
      const userId = await requireUserId();
      await enqueueMutation({
        userId,
        entity: 'accounts',
        operation: 'update',
        entityId: id,
        payload: input,
      });
      return {
        id,
        name: input.name ?? '',
        type: input.type ?? 'bank',
        note: input.note,
        active: input.active ?? true,
        updatedAt: timestamp(),
      };
    }
  }

  async deleteAccount(id: string): Promise<void> {
    try {
      await this.remote.deleteAccount(id);
      await this.recordSuccess('delete', 'accounts', id, { queued: false });
    } catch (error) {
      if (!isNetworkUnavailable(error)) throw error;
      const userId = await requireUserId();
      await enqueueMutation({
        userId,
        entity: 'accounts',
        operation: 'delete',
        entityId: id,
        payload: null,
      });
    }
  }

  async createTransaction(input: TransactionDraft): Promise<Transaction> {
    const local = optimisticTransaction(input);
    try {
      const saved = await this.remote.createTransaction({ ...input, id: local.id });
      await cacheTransactions([saved]);
      await this.recordSuccess('create', 'transactions', saved.id, { queued: false });
      return saved;
    } catch (error) {
      if (!isNetworkUnavailable(error)) throw error;
      const userId = await requireUserId();
      await enqueueMutation({
        userId,
        entity: 'transactions',
        operation: 'create',
        entityId: local.id,
        payload: { ...input, id: local.id },
      });
      await cacheTransactions([local]);
      return local;
    }
  }

  async updateTransaction(id: string, input: TransactionUpdate): Promise<Transaction> {
    try {
      const saved = await this.remote.updateTransaction(id, input);
      await cacheTransactions([saved]);
      await this.recordSuccess('update', 'transactions', id, { queued: false });
      return saved;
    } catch (error) {
      if (!isNetworkUnavailable(error)) throw error;
      const userId = await requireUserId();
      await enqueueMutation({
        userId,
        entity: 'transactions',
        operation: 'update',
        entityId: id,
        payload: input,
      });
      return {
        id,
        accountId: input.accountId,
        toAccountId: input.toAccountId,
        date: input.date ?? new Date().toISOString().slice(0, 10),
        type: input.type ?? 'expense',
        amount: input.amount ?? 0,
        category: input.category ?? '',
        account: input.account ?? '',
        toAccount: input.toAccount,
        note: input.note ?? '',
        tags: input.tags ?? [],
        status: input.status ?? 'needs_review',
        source: input.source ?? 'manual',
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
    }
  }

  async deleteTransaction(id: string): Promise<void> {
    try {
      await this.remote.deleteTransaction(id);
      await this.recordSuccess('delete', 'transactions', id, { queued: false });
    } catch (error) {
      if (!isNetworkUnavailable(error)) throw error;
      const userId = await requireUserId();
      await enqueueMutation({
        userId,
        entity: 'transactions',
        operation: 'delete',
        entityId: id,
        payload: null,
      });
    }
  }

  async flushPendingMutations(): Promise<void> {
    if (this.syncInFlight) return this.syncInFlight;

    this.syncInFlight = this.flushPendingMutationsInner().finally(() => {
      this.syncInFlight = null;
    });

    return this.syncInFlight;
  }

  async getSyncQueueStats(): Promise<SyncQueueStats> {
    const userId = await requireUserId();
    return getSyncQueueStats(userId);
  }

  async createImportBatch(input: ImportBatchDraft): Promise<ImportBatch> {
    return this.remote.createImportBatch(input);
  }

  async updateImportBatch(
    id: string,
    input: Partial<Omit<ImportBatch, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<ImportBatch> {
    return this.remote.updateImportBatch(id, input);
  }

  async listImportBatches(): Promise<ImportBatch[]> {
    return this.remote.listImportBatches();
  }

  async rollbackImportBatch(id: string): Promise<void> {
    await this.remote.rollbackImportBatch(id);
    await removeCachedTransactionsByImportBatch(id);
  }

  async cacheImportedTransactions(transactions: Transaction[]): Promise<void> {
    await cacheTransactions(transactions);
  }

  private async flushPendingMutationsInner() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const userId = await requireUserId();
    const mutations = await listPendingMutations(userId);

    for (const mutation of mutations) {
      await this.replayMutation(mutation);
    }
  }

  private async replayMutation(mutation: PendingMutation) {
    await updateMutation({
      ...mutation,
      status: 'syncing',
      attempts: mutation.attempts + 1,
      lastError: undefined,
    });

    try {
      if (mutation.entity === 'accounts') {
        await this.replayAccountMutation(mutation);
      } else {
        await this.replayTransactionMutation(mutation);
      }

      await this.recordSuccess(mutation.operation, mutation.entity, mutation.entityId, {
        queued: true,
        attempts: mutation.attempts + 1,
        mutationId: mutation.id,
      });
      await removeMutation(mutation.id);
    } catch (error) {
      await updateMutation({
        ...mutation,
        status: 'failed',
        attempts: mutation.attempts + 1,
        lastError: error instanceof Error ? error.message : 'Unknown sync error.',
      });
    }
  }

  private async replayAccountMutation(mutation: PendingMutation) {
    if (mutation.operation === 'create') {
      await this.remote.createAccount(mutation.payload as AccountDraft);
      return;
    }
    if (mutation.operation === 'update') {
      await this.remote.updateAccount(mutation.entityId, mutation.payload as AccountUpdate);
      return;
    }
    await this.remote.deleteAccount(mutation.entityId);
  }

  private async replayTransactionMutation(mutation: PendingMutation) {
    if (mutation.operation === 'create') {
      await this.remote.createTransaction(mutation.payload as TransactionDraft);
      return;
    }
    if (mutation.operation === 'update') {
      await this.remote.updateTransaction(mutation.entityId, mutation.payload as TransactionUpdate);
      return;
    }
    await this.remote.deleteTransaction(mutation.entityId);
  }

  private async recordSuccess(
    operation: string,
    entity: string,
    entityId: string,
    payload: Record<string, string | number | boolean>,
  ) {
    await this.remote.recordSyncEvent({
      event_type: `${entity}.${operation}`,
      entity_table: entity,
      entity_id: entityId,
      payload,
    });
  }
}
