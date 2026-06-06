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
