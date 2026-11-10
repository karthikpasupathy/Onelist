import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addSnapshot,
  createLocalId,
  deleteSnippet,
  getDocuments,
  getSnippets,
  getSnapshots,
  saveDocumentContent,
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
      rev: 1,
    },
  ]);
});

test('saveDocumentContent only writes on top of the revision it was based on', () => {
  upsertDocument({
    id: 'doc-1',
    userId: 'local-dev-user',
    year: 2026,
    content: 'hello',
    createdAt: 1,
    updatedAt: 1,
  });

  assert.deepEqual(
    saveDocumentContent({ docId: 'doc-1', content: 'first', updatedAt: 2, baseRev: 0 }),
    { status: 'saved', rev: 1 }
  );

  // A second writer still on revision 0 is refused and handed the current copy.
  const stale = saveDocumentContent({ docId: 'doc-1', content: 'stale', updatedAt: 3, baseRev: 0 });
  assert.equal(stale.status, 'conflict');
  assert.equal(stale.doc.content, 'first');
  assert.equal(getDocuments()[0].content, 'first');

  assert.deepEqual(
    saveDocumentContent({ docId: 'doc-1', content: 'second', updatedAt: 4, baseRev: 1 }),
    { status: 'saved', rev: 2 }
  );
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
