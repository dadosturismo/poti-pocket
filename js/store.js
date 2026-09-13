import { APP_CONFIG } from './config.js';

const STORE_NAME = 'snapshots';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB indisponível.'));
      return;
    }
    const request = indexedDB.open(APP_CONFIG.DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, callback) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = callback(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function saveSnapshot(payload) {
  const snapshot = { payload, savedAt: new Date().toISOString() };
  try {
    await transact('readwrite', store => store.put(snapshot, APP_CONFIG.DATA_KEY));
  } catch {
    localStorage.setItem(APP_CONFIG.DATA_KEY, JSON.stringify(snapshot));
  }
  return snapshot;
}

export async function loadSnapshot() {
  try {
    const snapshot = await transact('readonly', store => store.get(APP_CONFIG.DATA_KEY));
    if (snapshot) return snapshot;
  } catch {
    // O fallback abaixo atende navegadores com IndexedDB bloqueado.
  }
  try {
    return JSON.parse(localStorage.getItem(APP_CONFIG.DATA_KEY) || 'null');
  } catch {
    return null;
  }
}

