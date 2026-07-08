import type { AccountDraft, TransactionDraft } from '../data/adapter';
import type { Account, Transaction } from '../types/models';

const DB_NAME = 'finance-tracker-sync';
const DB_VERSION = 1;
const STORE_NAME = 'pending_mutations';

export type SyncEntity = 'accounts' | 'transactions';
export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncStatus = 'pending' | 'syncing' | 'failed';

export type SyncPayload =
  | AccountDraft
  | TransactionDraft
  | Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>>
  | Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>
  | null;

export interface PendingMutation {
  id: string;
  userId: string;
  entity: SyncEntity;
  operation: SyncOperation;
  entityId: string;
  payload: SyncPayload;
  status: SyncStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface SyncQueueStats {
  pending: number;
  failed: number;
  syncing: number;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('userId_createdAt', ['userId', 'createdAt']);
        store.createIndex('userId_status', ['userId', 'status']);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function nowIso() {
  return new Date().toISOString();
}

export function createMutationId() {
  return crypto.randomUUID();
}

export async function enqueueMutation(
  input: Omit<PendingMutation, 'id' | 'status' | 'attempts' | 'createdAt' | 'updatedAt'>,
) {
  const db = await openDb();
  const timestamp = nowIso();
  const mutation: PendingMutation = {
    ...input,
    id: createMutationId(),
    status: 'pending',
    attempts: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(mutation);
  await txComplete(tx);
  db.close();
  return mutation;
}

export async function listPendingMutations(userId: string) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const records = await requestToPromise(tx.objectStore(STORE_NAME).getAll());
  await txComplete(tx);
  db.close();

  return (records as PendingMutation[])
    .filter((item) => item.userId === userId && item.status !== 'syncing')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateMutation(mutation: PendingMutation) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put({ ...mutation, updatedAt: nowIso() });
  await txComplete(tx);
  db.close();
}

export async function removeMutation(id: string) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete(id);
  await txComplete(tx);
  db.close();
}

export async function getSyncQueueStats(userId: string): Promise<SyncQueueStats> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const records = await requestToPromise(tx.objectStore(STORE_NAME).getAll());
  await txComplete(tx);
  db.close();

  return (records as PendingMutation[])
    .filter((item) => item.userId === userId)
    .reduce<SyncQueueStats>(
      (stats, item) => ({
        ...stats,
        [item.status]: stats[item.status] + 1,
      }),
      { pending: 0, failed: 0, syncing: 0 },
    );
}
