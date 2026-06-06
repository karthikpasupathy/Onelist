import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearDocumentCache,
  readDocumentCache,
  writeDocumentCache,
} from '../src/documentCache.js';

const storage = new Map();

test.beforeEach(() => {
  storage.clear();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
});

test('writeDocumentCache persists content for a user/year', () => {
  writeDocumentCache('user-1', 2026, {
    docId: 'doc-1',
    content: '- two\n- three',
    updatedAt: 100,
  });

  assert.deepEqual(readDocumentCache('user-1', 2026), {
    docId: 'doc-1',
    content: '- two\n- three',
    updatedAt: 100,
    baseContent: '- two\n- three',
  });
});

test('writeDocumentCache stores a distinct merge base alongside the draft', () => {
  writeDocumentCache('user-1', 2026, {
    docId: 'doc-1',
    content: 'draft text',
    updatedAt: 100,
    baseContent: 'saved text',
  });

  assert.deepEqual(readDocumentCache('user-1', 2026), {
    docId: 'doc-1',
    content: 'draft text',
    updatedAt: 100,
    baseContent: 'saved text',
  });
});

test('readDocumentCache falls back to content for legacy caches without a base', () => {
  storage.set(
    'onelist_doc_cache_user-1_2026',
    JSON.stringify({ docId: 'doc-1', content: 'legacy', updatedAt: 5 })
  );

  assert.deepEqual(readDocumentCache('user-1', 2026), {
    docId: 'doc-1',
    content: 'legacy',
    updatedAt: 5,
    baseContent: 'legacy',
  });
});

test('clearDocumentCache removes cached document', () => {
  writeDocumentCache('user-1', 2026, {
    docId: 'doc-1',
    content: 'hello',
    updatedAt: 1,
  });

  clearDocumentCache('user-1', 2026);
  assert.equal(readDocumentCache('user-1', 2026), null);
});
