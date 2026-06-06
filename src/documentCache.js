const CACHE_PREFIX = 'onelist_doc_cache';

function cacheKey(userId, year) {
  return `${CACHE_PREFIX}_${userId}_${year}`;
}

export function readDocumentCache(userId, year) {
  if (!userId || !Number.isInteger(year)) return null;

  try {
    const raw = localStorage.getItem(cacheKey(userId, year));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.docId) return null;

    const content = typeof parsed.content === 'string' ? parsed.content : '';

    return {
      docId: parsed.docId,
      content,
      updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
      // Last server-confirmed content (merge ancestor). Falls back to `content`
      // for caches written before base tracking existed.
      baseContent: typeof parsed.baseContent === 'string' ? parsed.baseContent : content,
    };
  } catch {
    return null;
  }
}

export function writeDocumentCache(userId, year, { docId, content, updatedAt, baseContent }) {
  if (!userId || !docId || !Number.isInteger(year)) return;

  try {
    localStorage.setItem(
      cacheKey(userId, year),
      JSON.stringify({
        docId,
        content: content ?? '',
        updatedAt: updatedAt || Date.now(),
        baseContent: typeof baseContent === 'string' ? baseContent : (content ?? ''),
      })
    );
  } catch (err) {
    console.warn('[Cache] Failed to write document cache:', err);
  }
}

export function clearDocumentCache(userId, year) {
  if (!userId || !Number.isInteger(year)) return;
  localStorage.removeItem(cacheKey(userId, year));
}
