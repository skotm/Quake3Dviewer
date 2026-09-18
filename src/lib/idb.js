const DB_NAME = 'quake3dviewer';
const DB_VERSION = 1;
export const STORE_MAP_DATA = 'mapData';
export const STORE_QUAKE_DAYS = 'quakeDays';

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_MAP_DATA)) {
        db.createObjectStore(STORE_MAP_DATA, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_QUAKE_DAYS)) {
        db.createObjectStore(STORE_QUAKE_DAYS, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function idbGet(storeName, key) {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('idbGet failed', storeName, key, err);
    return undefined;
  }
}

export async function idbSet(storeName, key, value) {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put({ key, value, savedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('idbSet failed', storeName, key, err);
    return false;
  }
}
