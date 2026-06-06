import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isRemoteVersionNewer,
  shouldBlockSaveOverRemote,
  shouldQueueBackupConflict,
  shouldRestoreDraftBackup,
} from '../src/syncGuard.js';

test('isRemoteVersionNewer compares server timestamps', () => {
  assert.equal(isRemoteVersionNewer(100, 200), true);
  assert.equal(isRemoteVersionNewer(200, 200), false);
  assert.equal(isRemoteVersionNewer(300, 200), false);
});

test('shouldBlockSaveOverRemote blocks stale saves against newer server content', () => {
  assert.equal(
    shouldBlockSaveOverRemote({
      localUpdatedAt: 100,
      localContent: 'old',
      serverUpdatedAt: 200,
      serverContent: 'new',
    }),
    true
  );

  assert.equal(
    shouldBlockSaveOverRemote({
      localUpdatedAt: 100,
      localContent: 'same',
      serverUpdatedAt: 200,
      serverContent: 'same',
    }),
    false
  );

  assert.equal(
    shouldBlockSaveOverRemote({
      localUpdatedAt: 100,
      localContent: 'old',
      serverUpdatedAt: 200,
      serverContent: 'new',
      allowOverwrite: true,
    }),
    false
  );
});

test('shouldRestoreDraftBackup only restores unsaved crash recovery drafts', () => {
  assert.equal(
    shouldRestoreDraftBackup({
      backupContent: 'draft',
      backupTime: 150,
      serverContent: 'saved',
      serverUpdatedAt: 100,
      localUpdatedAt: 100,
    }),
    true
  );

  assert.equal(
    shouldRestoreDraftBackup({
      backupContent: 'draft',
      backupTime: 250,
      serverContent: 'saved',
      serverUpdatedAt: 200,
      localUpdatedAt: 100,
    }),
    false
  );
});

test('shouldQueueBackupConflict detects ambiguous backup timestamps', () => {
  assert.equal(
    shouldQueueBackupConflict({
      backupContent: 'local',
      backupTime: 300,
      serverContent: 'remote',
      serverUpdatedAt: 200,
    }),
    true
  );

  assert.equal(
    shouldQueueBackupConflict({
      backupContent: 'same',
      backupTime: 300,
      serverContent: 'same',
      serverUpdatedAt: 200,
    }),
    false
  );
});
