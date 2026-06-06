import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditorHistory } from '../src/editorHistory.js';

function createEditor(initialValue = '') {
  return {
    value: initialValue,
    selectionStart: initialValue.length,
    selectionEnd: initialValue.length,
  };
}

const LINES = '- two\n- three';

test('undo restores state before a programmatic edit', () => {
  const editor = createEditor('hello');
  const history = createEditorHistory();

  history.beforeEdit(editor);
  editor.value = 'hello world';
  editor.selectionStart = editor.selectionEnd = editor.value.length;

  assert.equal(history.undo(editor), true);
  assert.equal(editor.value, 'hello');
});

test('undo returns false when the stack is empty', () => {
  const editor = createEditor('hello');
  const history = createEditorHistory();

  assert.equal(history.undo(editor), false);
  assert.equal(editor.value, 'hello');
});

test('debounced typing creates one undo step back to the burst start', () => {
  const editor = createEditor('');
  const history = createEditorHistory({ debounceMs: 20 });

  history.markBurstStart(editor);
  editor.value = 'ab';
  history.recordDebounced(editor);

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(history.undo(editor), true);
      assert.equal(editor.value, '');
      assert.equal(history.undo(editor), false);
      resolve();
    }, 40);
  });
});

test('undo steps back through typing and a programmatic edit', () => {
  const editor = createEditor('');
  const history = createEditorHistory({ debounceMs: 20 });

  history.markBurstStart(editor);
  editor.value = 'hello';
  history.recordDebounced(editor);

  return new Promise((resolve) => {
    setTimeout(() => {
      history.beforeEdit(editor);
      editor.value = 'hello\n- ';
      editor.selectionStart = editor.selectionEnd = editor.value.length;

      assert.equal(history.undo(editor), true);
      assert.equal(editor.value, 'hello');
      assert.equal(history.undo(editor), true);
      assert.equal(editor.value, '');
      resolve();
    }, 40);
  });
});

test('pending typing burst is flushed when undo is pressed', () => {
  const editor = createEditor('');
  const history = createEditorHistory({ debounceMs: 500 });

  history.markBurstStart(editor);
  editor.value = 'draft';
  history.recordDebounced(editor);

  assert.equal(history.undo(editor), true);
  assert.equal(editor.value, '');
});

test('delete burst restores full content after deleting multiple lines', () => {
  const editor = createEditor(LINES);
  const history = createEditorHistory({ debounceMs: 20 });

  history.prepareDeleteBurst(editor);
  editor.value = '';
  editor.selectionStart = editor.selectionEnd = 0;
  history.recordDebounced(editor);

  return new Promise((resolve) => {
    setTimeout(() => {
      assert.equal(history.undo(editor), true);
      assert.equal(editor.value, LINES);
      resolve();
    }, 40);
  });
});

test('delete after typing restores pre-delete content', () => {
  const editor = createEditor(LINES);
  const history = createEditorHistory({ debounceMs: 500 });

  history.markBurstStart(editor);
  editor.value = `${LINES}x`;
  history.recordDebounced(editor);

  history.prepareDeleteBurst(editor);
  editor.value = '';
  editor.selectionStart = editor.selectionEnd = 0;

  assert.equal(history.undo(editor), true);
  assert.equal(editor.value, `${LINES}x`);
});

test('clear removes undo history', () => {
  const editor = createEditor('hello');
  const history = createEditorHistory();

  history.beforeEdit(editor);
  editor.value = 'hello world';
  history.clear();

  assert.equal(history.undo(editor), false);
  assert.equal(editor.value, 'hello world');
});
