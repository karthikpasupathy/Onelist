import assert from 'node:assert/strict';
import test from 'node:test';

import { readDocumentCache, writeDocumentCache } from '../src/documentCache.js';
import {
  shouldBlockSaveOverRemote,
  shouldQueueBackupConflict,
  shouldRestoreDraftBackup,
} from '../src/syncGuard.js';
import { getDocuments, updateDocumentContent, upsertDocument } from '../src/localDevStore.js';

const storage = new Map();
const USER_ID = 'local-dev-user';
const DOC_ID = 'doc-2026';
const YEAR = 2026;

test.beforeEach(() => {
  storage.clear();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
});

function seedLaptopSave(content, updatedAt) {
  upsertDocument({
    id: DOC_ID,
    userId: USER_ID,
    year: YEAR,
    content,
    createdAt: updatedAt,
    updatedAt,
  });
  writeDocumentCache(USER_ID, YEAR, {
    docId: DOC_ID,
    content,
    updatedAt,
  });
}

function simulatePhoneSave(content, updatedAt) {
  updateDocumentContent(DOC_ID, content, updatedAt);
}

function laptopStateAfterCacheLoad() {
  const cached = readDocumentCache(USER_ID, YEAR);
  return {
    editorContent: cached.content,
    localUpdatedAt: cached.updatedAt,
  };
}

test('scenario: phone saves newer content while laptop tab is stale', () => {
  const laptopSaveTime = 1_000;
  const phoneSaveTime = 2_000;

  seedLaptopSave('laptop draft', laptopSaveTime);

  simulatePhoneSave('phone finished text', phoneSaveTime);

  const laptop = laptopStateAfterCacheLoad();
  const server = getDocuments()[0];

  assert.equal(laptop.editorContent, 'laptop draft');
  assert.equal(laptop.localUpdatedAt, laptopSaveTime);
  assert.equal(server.content, 'phone finished text');
  assert.equal(server.updatedAt, phoneSaveTime);

  assert.equal(
    shouldBlockSaveOverRemote({
      localUpdatedAt: laptop.localUpdatedAt,
      localContent: laptop.editorContent,
      serverUpdatedAt: server.updatedAt,
      serverContent: server.content,
    }),
    true,
    'stale laptop save must be blocked'
  );

  assert.equal(
    shouldRestoreDraftBackup({
      backupContent: laptop.editorContent,
      backupTime: 1_500,
      serverContent: server.content,
      serverUpdatedAt: server.updatedAt,
      localUpdatedAt: laptop.localUpdatedAt,
    }),
    false,
    'stale backup must not auto-restore over phone save'
  );
});

test('scenario: laptop reopens after phone sync and should accept remote version', () => {
  seedLaptopSave('laptop old', 1_000);
  simulatePhoneSave('phone newer', 2_000);

  const laptop = laptopStateAfterCacheLoad();
  const server = getDocuments()[0];
  const hasUnsavedEditorChanges = false;

  const blockSave = shouldBlockSaveOverRemote({
    localUpdatedAt: laptop.localUpdatedAt,
    localContent: laptop.editorContent,
    serverUpdatedAt: server.updatedAt,
    serverContent: server.content,
  });

  assert.equal(blockSave, true);
  assert.equal(hasUnsavedEditorChanges, false);
  assert.notEqual(laptop.editorContent, server.content);
});

test('scenario: both devices edited — laptop has unsaved changes when phone saved', () => {
  seedLaptopSave('shared base', 1_000);
  simulatePhoneSave('shared base\nphone line', 2_000);

  const laptopEditor = 'shared base\nlaptop line';
  const server = getDocuments()[0];
  const localUpdatedAt = 1_000;
  const hasUnsavedEditorChanges = true;

  assert.equal(
    shouldBlockSaveOverRemote({
      localUpdatedAt,
      localContent: laptopEditor,
      serverUpdatedAt: server.updatedAt,
      serverContent: server.content,
    }),
    true
  );
  assert.equal(hasUnsavedEditorChanges, true);
});

test('scenario: crash recovery restores draft only for same server version', () => {
  seedLaptopSave('saved version', 1_000);

  const server = getDocuments()[0];
  const backupContent = 'saved version\nunsaved crash draft';
  const backupTime = 1_100;

  assert.equal(
    shouldRestoreDraftBackup({
      backupContent,
      backupTime,
      serverContent: server.content,
      serverUpdatedAt: server.updatedAt,
      localUpdatedAt: server.updatedAt,
    }),
    true
  );

  simulatePhoneSave('saved version\nphone line', 2_000);
  const phoneServer = getDocuments()[0];

  assert.equal(
    shouldRestoreDraftBackup({
      backupContent,
      backupTime,
      serverContent: phoneServer.content,
      serverUpdatedAt: phoneServer.updatedAt,
      localUpdatedAt: 1_000,
    }),
    false
  );

  assert.equal(
    shouldQueueBackupConflict({
      backupContent,
      backupTime: 1_500,
      serverContent: phoneServer.content,
      serverUpdatedAt: phoneServer.updatedAt,
    }),
    false,
    'when server moved forward, ambiguous backup should not auto-win'
  );
});

test('scenario: inflated draft cache timestamp must not beat server save time', () => {
  seedLaptopSave('laptop text', 1_000);

  writeDocumentCache(USER_ID, YEAR, {
    docId: DOC_ID,
    content: 'laptop text extra typing',
    updatedAt: 1_000,
  });

  simulatePhoneSave('phone text', 2_000);

  const cached = readDocumentCache(USER_ID, YEAR);
  const server = getDocuments()[0];

  assert.equal(cached.updatedAt, 1_000, 'cache must keep server-confirmed timestamp');
  assert.ok(server.updatedAt > cached.updatedAt);

  assert.equal(
    shouldBlockSaveOverRemote({
      localUpdatedAt: cached.updatedAt,
      localContent: cached.content,
      serverUpdatedAt: server.updatedAt,
      serverContent: server.content,
    }),
    true
  );
});

test('scenario: keep-mine overwrite explicitly bypasses remote guard', () => {
  assert.equal(
    shouldBlockSaveOverRemote({
      localUpdatedAt: 1_000,
      localContent: 'laptop',
      serverUpdatedAt: 2_000,
      serverContent: 'phone',
      allowOverwrite: true,
    }),
    false
  );
});
