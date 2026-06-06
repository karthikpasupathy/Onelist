const DB_NAME = 'onelist_sync';
const DB_VERSION = 1;
const STORE_NAME = 'documentDrafts';
const LEGACY_CACHE_PREFIX = 'onelist_doc_cache';

const memoryDrafts = new Map();

function cacheKey(userId, year) {
  return `${userId}:${year}`;
}

function legacyCacheKey(userId, year) {
  return `${LEGACY_CACHE_PREFIX}_${userId}_${year}`;
}

function hasIndexedDB() {
  return typeof indexedDB !== 'undefined';
}

function normalizeDraft(userId, year, draft) {
  if (!draft || typeof draft !== 'object' || !draft.docId) return null;

  const content = typeof draft.content === 'string' ? draft.content : '';
  const baseContent = typeof draft.baseContent === 'string' ? draft.baseContent : content;
  const baseUpdatedAt = Number.isFinite(draft.baseUpdatedAt)
    ? draft.baseUpdatedAt
    : (Number.isFinite(draft.updatedAt) ? draft.updatedAt : 0);

  return {
    key: cacheKey(userId, year),
    userId,
    year,
    docId: draft.docId,
    content,
    baseContent,
    baseUpdatedAt,
    updatedAt: baseUpdatedAt,
    localEditAt: Number.isFinite(draft.localEditAt) ? draft.localEditAt : 0,
    dirty: Boolean(draft.dirty),
  };
}

function readLegacyDocumentCache(userId, year) {
  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem(legacyCacheKey(userId, year));
    if (!raw) return null;
    return normalizeDraft(userId, year, JSON.parse(raw));
  } catch {
    return null;
  }
}

function clearLegacyDocumentCache(userId, year) {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(legacyCacheKey(userId, year));
}

function openDatabase() {
  if (!hasIndexedDB()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

async function withStore(mode, callback) {
  const db = await openDatabase();
  if (!db) return callback(null);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);

    result = callback(store);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function readDocumentCache(userId, year) {
  if (!userId || !Number.isInteger(year)) return null;

  const key = cacheKey(userId, year);
  let draft = null;

  try {
    draft = await withStore('readonly', async (store) => {
      if (!store) return memoryDrafts.get(key) || null;
      return requestToPromise(store.get(key));
    });
  } catch (err) {
    console.warn('[Cache] Failed to read IndexedDB draft:', err);
  }

  const normalized = normalizeDraft(userId, year, draft);
  if (normalized) return normalized;

  const legacyDraft = readLegacyDocumentCache(userId, year);
  if (!legacyDraft) return null;

  await writeDocumentCache(userId, year, legacyDraft);
  clearLegacyDocumentCache(userId, year);
  return legacyDraft;
}

export async function writeDocumentCache(
  userId,
  year,
  { docId, content, updatedAt, baseContent, baseUpdatedAt, localEditAt, dirty } = {}
) {
  if (!userId || !docId || !Number.isInteger(year)) return null;

  const draft = normalizeDraft(userId, year, {
    docId,
    content: content ?? '',
    baseContent: typeof baseContent === 'string' ? baseContent : (content ?? ''),
    baseUpdatedAt: Number.isFinite(baseUpdatedAt) ? baseUpdatedAt : updatedAt,
    localEditAt,
    dirty,
  });
  if (!draft) return null;

  try {
    await withStore('readwrite', (store) => {
      if (!store) {
        memoryDrafts.set(draft.key, draft);
        return null;
      }
      return store.put(draft);
    });
    return draft;
  } catch (err) {
    console.warn('[Cache] Failed to write IndexedDB draft:', err);
    memoryDrafts.set(draft.key, draft);
    return draft;
  }
}

export async function clearDocumentCache(userId, year) {
  if (!userId || !Number.isInteger(year)) return;

  const key = cacheKey(userId, year);
  memoryDrafts.delete(key);
  clearLegacyDocumentCache(userId, year);

  try {
    await withStore('readwrite', (store) => {
      if (!store) return null;
      return store.delete(key);
    });
  } catch (err) {
    console.warn('[Cache] Failed to clear IndexedDB draft:', err);
  }
}

export function __resetDocumentCacheForTests() {
  memoryDrafts.clear();
}
