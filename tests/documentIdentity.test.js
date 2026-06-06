import assert from 'node:assert/strict';
import test from 'node:test';

import { createDocumentIdentity } from '../src/documentIdentity.js';
import { getDocuments, upsertDocument } from '../src/localDevStore.js';

const storage = new Map();

test.beforeEach(() => {
  storage.clear();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
});

test('createDocumentIdentity is stable for the same user/year', () => {
  assert.deepEqual(
    createDocumentIdentity('user-1', 2026),
    createDocumentIdentity('user-1', 2026)
  );
});

test('createDocumentIdentity changes across users and years', () => {
  const first = createDocumentIdentity('user-1', 2026);
  const nextYear = createDocumentIdentity('user-1', 2027);
  const otherUser = createDocumentIdentity('user-2', 2026);

  assert.notEqual(first.docId, nextYear.docId);
  assert.notEqual(first.docId, otherUser.docId);
  assert.equal(first.docKey, 'user-1:2026');
});

test('createDocumentIdentity returns an Instant-compatible uuid', () => {
  assert.match(
    createDocumentIdentity('local-dev-user', 2026).docId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});

test('deterministic identity prevents duplicate user-year documents', () => {
  const identity = createDocumentIdentity('user-1', 2026);

  upsertDocument({
    id: identity.docId,
    docKey: identity.docKey,
    userId: 'user-1',
    year: 2026,
    content: 'first tab',
    createdAt: 1,
    updatedAt: 1,
  });
  upsertDocument({
    id: identity.docId,
    docKey: identity.docKey,
    userId: 'user-1',
    year: 2026,
    content: 'second tab',
    createdAt: 2,
    updatedAt: 2,
  });

  const docs = getDocuments();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].content, 'second tab');
});
