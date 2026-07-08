import type { Transaction } from '../types/models';

const DB_NAME = 'finance-tracker-cache';
const DB_VERSION = 1;
const TRANSACTION_STORE = 'transactions';

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
      if (!db.objectStoreNames.contains(TRANSACTION_STORE)) {
        const store = db.createObjectStore(TRANSACTION_STORE, { keyPath: 'id' });
        store.createIndex('date', 'date');
        store.createIndex('importBatchId', 'importBatchId');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheTransactions(transactions: Transaction[]) {
  if (transactions.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(TRANSACTION_STORE, 'readwrite');
  const store = tx.objectStore(TRANSACTION_STORE);
  transactions.forEach((transaction) => store.put(transaction));
  await txComplete(tx);
  db.close();
}

export async function listCachedTransactions(year?: number, month?: number) {
  const db = await openDb();
  const tx = db.transaction(TRANSACTION_STORE, 'readonly');
  const records = await requestToPromise(tx.objectStore(TRANSACTION_STORE).getAll());
  await txComplete(tx);
  db.close();

  const transactions = records as Transaction[];
  if (!year || !month) return transactions;

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
  return transactions.filter((transaction) => transaction.date.startsWith(monthPrefix));
}

export async function removeCachedTransactionsByImportBatch(importBatchId: string) {
  const db = await openDb();
  const readTx = db.transaction(TRANSACTION_STORE, 'readonly');
  const records = (await requestToPromise(
    readTx.objectStore(TRANSACTION_STORE).getAll(),
  )) as Transaction[];
  await txComplete(readTx);

  const writeTx = db.transaction(TRANSACTION_STORE, 'readwrite');
  const store = writeTx.objectStore(TRANSACTION_STORE);
  records
    .filter((transaction) => transaction.importBatchId === importBatchId)
    .forEach((transaction) => store.delete(transaction.id));
  await txComplete(writeTx);
  db.close();
}
