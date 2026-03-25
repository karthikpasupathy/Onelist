import assert from 'node:assert/strict';
import test from 'node:test';

import { createSaveCoordinator } from '../src/saveCoordinator.js';

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('queues exactly one trailing save for edits made during an in-flight save', async () => {
  const saveCalls = [];
  let releaseFirstSave;

  const coordinator = createSaveCoordinator({
    async saveContent({ content }) {
      saveCalls.push(content);
      if (saveCalls.length === 1) {
        await new Promise((resolve) => {
          releaseFirstSave = resolve;
        });
      }
    },
  });

  coordinator.markDirty('first draft');
  const flushPromise = coordinator.flush();
  await nextTick();

  coordinator.markDirty('final draft');
  releaseFirstSave();

  await flushPromise;

  assert.deepEqual(saveCalls, ['first draft', 'final draft']);
  assert.equal(coordinator.getState().lastSavedRevision, coordinator.getState().editorRevision);
});

test('forced flush waits for the latest content when a save is already running', async () => {
  const saveCalls = [];
  let releaseFirstSave;

  const coordinator = createSaveCoordinator({
    async saveContent({ content }) {
      saveCalls.push(content);
      if (saveCalls.length === 1) {
        await new Promise((resolve) => {
          releaseFirstSave = resolve;
        });
      }
    },
  });

  coordinator.markDirty('alpha');
  const backgroundFlush = coordinator.flush();
  await nextTick();

  coordinator.markDirty('beta');
  const forcedFlush = coordinator.flush({ forced: true });
  releaseFirstSave();

  await Promise.all([backgroundFlush, forcedFlush]);

  assert.deepEqual(saveCalls, ['alpha', 'beta']);
  assert.equal(coordinator.getState().lastSavedRevision, coordinator.getState().editorRevision);
});

test('skipped saves stay dirty and report the skipped status', async () => {
  const states = [];

  const coordinator = createSaveCoordinator({
    onStateChange(status) {
      states.push(status);
    },
    async saveContent() {
      return { skipped: true, status: 'offline' };
    },
  });

  coordinator.markDirty('draft');
  const didSave = await coordinator.flush();

  assert.equal(didSave, false);
  assert.equal(coordinator.getState().hasPendingChanges, true);
  assert.equal(coordinator.getState().pendingSave, true);
  assert.deepEqual(states, ['saving', 'saving', 'offline']);
});

test('failed saves surface error state and remain dirty for retry', async () => {
  const states = [];

  const coordinator = createSaveCoordinator({
    onStateChange(status) {
      states.push(status);
    },
    async saveContent() {
      throw new Error('boom');
    },
  });

  coordinator.markDirty('draft');

  await assert.rejects(() => coordinator.flush(), /boom/);

  assert.equal(coordinator.getState().hasPendingChanges, true);
  assert.equal(coordinator.getState().lastSavedRevision, 0);
  assert.deepEqual(states, ['saving', 'saving', 'error']);
});
