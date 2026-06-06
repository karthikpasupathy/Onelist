import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearDocumentCache,
  __resetDocumentCacheForTests,
  readDocumentCache,
  writeDocumentCache,
} from '../src/documentCache.js';

const storage = new Map();

test.beforeEach(() => {
  storage.clear();
  __resetDocumentCacheForTests();
  delete globalThis.indexedDB;
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
});

test('writeDocumentCache persists content for a user/year', async () => {
  await writeDocumentCache('user-1', 2026, {
    docId: 'doc-1',
    content: '- two\n- three',
    updatedAt: 100,
  });

  assert.deepEqual(await readDocumentCache('user-1', 2026), {
    key: 'user-1:2026',
    userId: 'user-1',
    year: 2026,
    docId: 'doc-1',
    content: '- two\n- three',
    updatedAt: 100,
    baseUpdatedAt: 100,
    baseContent: '- two\n- three',
    localEditAt: 0,
    dirty: false,
  });
});

test('writeDocumentCache stores a distinct merge base alongside the draft', async () => {
  await writeDocumentCache('user-1', 2026, {
    docId: 'doc-1',
    content: 'draft text',
    baseUpdatedAt: 100,
    baseContent: 'saved text',
    localEditAt: 150,
    dirty: true,
  });

  assert.deepEqual(await readDocumentCache('user-1', 2026), {
    key: 'user-1:2026',
    userId: 'user-1',
    year: 2026,
    docId: 'doc-1',
    content: 'draft text',
    updatedAt: 100,
    baseUpdatedAt: 100,
    baseContent: 'saved text',
    localEditAt: 150,
    dirty: true,
  });
});

test('readDocumentCache migrates legacy localStorage caches without a base', async () => {
  storage.set(
    'onelist_doc_cache_user-1_2026',
    JSON.stringify({ docId: 'doc-1', content: 'legacy', updatedAt: 5 })
  );

  assert.deepEqual(await readDocumentCache('user-1', 2026), {
    key: 'user-1:2026',
    userId: 'user-1',
    year: 2026,
    docId: 'doc-1',
    content: 'legacy',
    updatedAt: 5,
    baseUpdatedAt: 5,
    baseContent: 'legacy',
    localEditAt: 0,
    dirty: false,
  });
  assert.equal(storage.get('onelist_doc_cache_user-1_2026'), undefined);
});

test('clearDocumentCache removes cached document', async () => {
  await writeDocumentCache('user-1', 2026, {
    docId: 'doc-1',
    content: 'hello',
    updatedAt: 1,
  });

  await clearDocumentCache('user-1', 2026);
  assert.equal(await readDocumentCache('user-1', 2026), null);
});
