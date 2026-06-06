import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addSnapshot,
  createLocalId,
  deleteSnippet,
  getDocuments,
  getSnippets,
  getSnapshots,
  updateDocumentContent,
  upsertDocument,
  upsertSnippet,
} from '../src/localDevStore.js';

const storage = new Map();

test.beforeEach(() => {
  storage.clear();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
});

test('upsertDocument persists and updates documents', () => {
  upsertDocument({
    id: 'doc-1',
    userId: 'local-dev-user',
    year: 2026,
    content: 'hello',
    createdAt: 1,
    updatedAt: 1,
  });

  updateDocumentContent('doc-1', 'updated', 2);

  assert.deepEqual(getDocuments(), [
    {
      id: 'doc-1',
      userId: 'local-dev-user',
      year: 2026,
      content: 'updated',
      createdAt: 1,
      updatedAt: 2,
    },
  ]);
});

test('addSnapshot keeps only 20 unpinned snapshots per year', () => {
  for (let i = 0; i < 22; i += 1) {
    addSnapshot({
      id: `snap-${i}`,
      userId: 'local-dev-user',
      year: 2026,
      content: `v${i}`,
      createdAt: i,
      pinned: false,
    });
  }

  const snapshots = getSnapshots('local-dev-user');
  assert.equal(snapshots.length, 20);
  assert.equal(snapshots[0].content, 'v2');
});

test('snippet helpers round-trip data', () => {
  upsertSnippet({
    id: 'snippet-1',
    userId: 'local-dev-user',
    name: 'daily',
    content: '- standup',
    createdAt: 1,
    updatedAt: 1,
  });

  assert.equal(getSnippets('local-dev-user').length, 1);

  upsertSnippet({
    id: 'snippet-1',
    userId: 'local-dev-user',
    name: 'daily',
    content: '- standup\n- review',
    createdAt: 1,
    updatedAt: 2,
  });

  assert.equal(getSnippets('local-dev-user')[0].content, '- standup\n- review');

  deleteSnippet('snippet-1');
  assert.equal(getSnippets('local-dev-user').length, 0);
});

test('createLocalId returns unique values', () => {
  const first = createLocalId();
  const second = createLocalId();
  assert.notEqual(first, second);
});
