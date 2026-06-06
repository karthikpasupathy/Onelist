import assert from 'node:assert/strict';
import test from 'node:test';

import { isHistoryInput, isUndoShortcut } from '../src/editorShortcuts.js';

function keyEvent({ key, metaKey = false, ctrlKey = false, shiftKey = false }) {
  return { key, metaKey, ctrlKey, shiftKey };
}

test('isUndoShortcut matches Cmd/Ctrl+Z without shift', () => {
  assert.equal(isUndoShortcut(keyEvent({ key: 'z', metaKey: true })), true);
  assert.equal(isUndoShortcut(keyEvent({ key: 'z', ctrlKey: true })), true);
  assert.equal(isUndoShortcut(keyEvent({ key: 'z', metaKey: true, shiftKey: true })), false);
  assert.equal(isUndoShortcut(keyEvent({ key: 'Z', metaKey: true })), false);
});

test('isHistoryInput detects native undo/redo beforeinput events', () => {
  assert.equal(isHistoryInput({ inputType: 'historyUndo' }), true);
  assert.equal(isHistoryInput({ inputType: 'historyRedo' }), true);
  assert.equal(isHistoryInput({ inputType: 'insertText' }), false);
});
