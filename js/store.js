import { APP_CONFIG } from './config.js';

const SNAPSHOT_STORE_NAME = 'snapshots';
const ACCESS_STORE_NAME = 'accesses';
const ACCESS_FALLBACK_KEY = 'local-accesses';
const DATABASE_VERSION = 2;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB indisponível.'));
      return;
    }
    const request = indexedDB.open(APP_CONFIG.DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) database.createObjectStore(SNAPSHOT_STORE_NAME);
      if (!database.objectStoreNames.contains(ACCESS_STORE_NAME)) database.createObjectStore(ACCESS_STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(storeName, mode, callback) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = callback(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onabort = () => reject(transaction.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function saveSnapshot(payload, key = APP_CONFIG.DATA_KEY) {
  const snapshot = { payload, savedAt: new Date().toISOString() };
  try {
    await transact(SNAPSHOT_STORE_NAME, 'readwrite', store => store.put(snapshot, key));
  } catch {
    // Navegadores sem IndexedDB tentam o fallback; se o armazenamento estiver
    // indisponível ou cheio, o painel ainda pode continuar com os dados em memória.
    try {
      localStorage.setItem(key, JSON.stringify(snapshot));
    } catch {
      // Não há espaço ou permissão para persistir neste navegador.
    }
  }
  return snapshot;
}

export async function loadSnapshot(key = APP_CONFIG.DATA_KEY) {
  try {
    const snapshot = await transact(SNAPSHOT_STORE_NAME, 'readonly', store => store.get(key));
    if (snapshot) return snapshot;
  } catch {
    // O fallback abaixo atende navegadores com IndexedDB bloqueado.
  }
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

// Limpa somente cópias de indicadores. O histórico local de acessos usa outra
// store e permanece preservado para não perder a contagem de cliques.
export async function clearDashboardSnapshots() {
  const keys = [APP_CONFIG.DATA_KEY, APP_CONFIG.ALL_DATA_KEY];
  try {
    await Promise.all(keys.map(key => transact(SNAPSHOT_STORE_NAME, 'readwrite', store => store.delete(key))));
  } catch {
    // O fallback de localStorage é limpo abaixo mesmo quando o IndexedDB falha.
  }
  try {
    keys.forEach(key => localStorage.removeItem(key));
  } catch {
    // O cache em memória e as cópias do IndexedDB já foram tratados acima.
  }
}

export async function recordAccess() {
  const access = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    accessedAt: new Date().toISOString()
  };

  try {
    await transact(ACCESS_STORE_NAME, 'readwrite', store => store.put(access));
  } catch {
    const accesses = readFallbackAccesses();
    accesses.push(access);
    localStorage.setItem(ACCESS_FALLBACK_KEY, JSON.stringify(accesses));
  }
  return access;
}

// Exportada para permitir uma futura sincronização explícita, sem transmitir
// dados automaticamente quando alguém abre o painel.
export async function loadAccesses() {
  try {
    const accesses = await transact(ACCESS_STORE_NAME, 'readonly', store => store.getAll());
    return accesses.sort((first, second) => first.accessedAt.localeCompare(second.accessedAt));
  } catch {
    return readFallbackAccesses();
  }
}

function readFallbackAccesses() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCESS_FALLBACK_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
