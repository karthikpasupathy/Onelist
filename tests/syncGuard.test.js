import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareVersions,
  decideIncoming,
  documentRev,
  hashText,
  isOwnPendingWrite,
  remapCursor,
  versionOf,
} from '../src/syncGuard.js';

test('documents without a revision count as revision 0', () => {
  assert.equal(documentRev({}), 0);
  assert.equal(documentRev({ rev: 4 }), 4);
  assert.deepEqual(versionOf({ updatedAt: 50 }), { rev: 0, updatedAt: 50 });
});

test('revision decides which version is newer, regardless of clocks', () => {
  // Rev 6 was written by a device whose clock is far behind.
  assert.ok(compareVersions({ rev: 6, updatedAt: 1_000 }, { rev: 5, updatedAt: 9_000 }) > 0);
  assert.ok(compareVersions({ rev: 5, updatedAt: 9_000 }, { rev: 6, updatedAt: 1_000 }) < 0);
  assert.equal(compareVersions({ rev: 5, updatedAt: 1_000 }, { rev: 5, updatedAt: 1_000 }), 0);
});

test('equal revisions fall back to time for writes from older app versions', () => {
  assert.ok(compareVersions({ rev: 0, updatedAt: 2_000 }, { rev: 0, updatedAt: 1_000 }) > 0);
});

test('hashText distinguishes content and is stable', () => {
  assert.equal(hashText('- a\n- b'), hashText('- a\n- b'));
  assert.notEqual(hashText('- a\n- b'), hashText('- b\n- a'));
  assert.notEqual(hashText(''), hashText(' '));
});

test('a stale server copy is ignored even if its timestamp looks newer', () => {
  assert.equal(
    decideIncoming({
      base: { rev: 5, updatedAt: 1_000, content: 'new' },
      incoming: { rev: 4, updatedAt: 99_000, content: 'old' },
      editorContent: 'new',
      dirty: false,
      sentWrites: [],
    }),
    'ignore'
  );
});

test('a newer server copy is adopted when there is nothing unsaved', () => {
  assert.equal(
    decideIncoming({
      base: { rev: 5, updatedAt: 1_000, content: 'a' },
      incoming: { rev: 6, updatedAt: 900, content: 'b' },
      editorContent: 'a',
      dirty: false,
      sentWrites: [],
    }),
    'adopt'
  );
});

test('a newer server copy is merged when the editor has unsaved changes', () => {
  assert.equal(
    decideIncoming({
      base: { rev: 5, updatedAt: 1_000, content: 'a' },
      incoming: { rev: 6, updatedAt: 2_000, content: 'b' },
      editorContent: 'a plus typing',
      dirty: true,
      sentWrites: [],
    }),
    'merge'
  );
});

test('a newer copy identical to the editor is adopted, not merged', () => {
  assert.equal(
    decideIncoming({
      base: { rev: 5, updatedAt: 1_000, content: 'a' },
      incoming: { rev: 6, updatedAt: 2_000, content: 'same' },
      editorContent: 'same',
      dirty: true,
      sentWrites: [],
    }),
    'adopt'
  );
});

test('our own unconfirmed write coming back is not treated as a remote edit', () => {
  const base = { rev: 5, updatedAt: 1_000, content: 'a' };
  const echo = { rev: 6, updatedAt: 2_000, content: 'ab' };
  const sentWrites = [{ updatedAt: 2_000, hash: hashText('ab') }];

  assert.equal(isOwnPendingWrite(echo, base, sentWrites), true);
  assert.equal(
    decideIncoming({ base, incoming: echo, editorContent: 'abc', dirty: true, sentWrites }),
    'ignore'
  );

  // Same timestamp but different text is somebody else's write.
  assert.equal(isOwnPendingWrite({ ...echo, content: 'xyz' }, base, sentWrites), false);
  // Once the base has caught up it is no longer pending.
  assert.equal(isOwnPendingWrite(echo, echo, sentWrites), false);
});

test('remapCursor keeps the caret beside the text being edited', () => {
  // Remote text appended below: caret stays put.
  assert.equal(remapCursor('one\ntwo', 'one\ntwo\nthree', 3), 3);
  // Remote text inserted above: caret moves down with its line.
  assert.equal(remapCursor('one\ntwo', 'zero\none\ntwo', 7), 12);
  // Unrelated rewrite: clamp into range.
  assert.equal(remapCursor('long text here', 'short', 12), 5);
});
