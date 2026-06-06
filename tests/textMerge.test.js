import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeByRecency, mergeThreeWay } from '../src/textMerge.js';

test('identical sides return that content', () => {
  assert.equal(mergeThreeWay('a\nb', 'a\nb\nc', 'a\nb\nc'), 'a\nb\nc');
});

test('only one side changed takes that side', () => {
  assert.equal(mergeThreeWay('a\nb\nc', 'a\nb\nc', 'a\nB\nc'), 'a\nB\nc');
  assert.equal(mergeThreeWay('a\nb\nc', 'a\nB\nc', 'a\nb\nc'), 'a\nB\nc');
});

test('disjoint edits on different lines merge losslessly', () => {
  const base = 'one\ntwo\nthree\nfour';
  const mine = 'ONE\ntwo\nthree\nfour';
  const theirs = 'one\ntwo\nthree\nFOUR';
  assert.equal(mergeThreeWay(base, mine, theirs), 'ONE\ntwo\nthree\nFOUR');
});

test('additions at opposite ends both survive', () => {
  const base = 'b\nc';
  const mine = 'a\nb\nc';
  const theirs = 'b\nc\nd';
  assert.equal(mergeThreeWay(base, mine, theirs), 'a\nb\nc\nd');
});

test('both append different blocks at the end', () => {
  const base = 'task1';
  const mine = 'task1\nfrom-laptop';
  const theirs = 'task1\nfrom-phone';
  assert.equal(
    mergeThreeWay(base, mine, theirs),
    [
      'task1',
      '<<<<<<< ONELIST LOCAL',
      'from-laptop',
      '||||||| ONELIST REMOTE',
      'from-phone',
      '>>>>>>> ONELIST MERGE CONFLICT',
    ].join('\n')
  );
});

test('one side deletes a line, other side untouched', () => {
  const base = 'a\nb\nc';
  const mine = 'a\nc';
  const theirs = 'a\nb\nc';
  assert.equal(mergeThreeWay(base, mine, theirs), 'a\nc');
});

test('divergent same-line edit preserves both sides despite recency', () => {
  const base = 'shared\nline\nend';
  const mine = 'shared\nLAPTOP\nend';
  const theirs = 'shared\nPHONE\nend';
  const expected = [
    'shared',
    '<<<<<<< ONELIST LOCAL',
    'LAPTOP',
    '||||||| ONELIST REMOTE',
    'PHONE',
    '>>>>>>> ONELIST MERGE CONFLICT',
    'end',
  ].join('\n');

  assert.equal(
    mergeByRecency(base, mine, theirs, { mineUpdatedAt: 200, theirsUpdatedAt: 100 }),
    expected
  );
  assert.equal(
    mergeByRecency(base, mine, theirs, { mineUpdatedAt: 100, theirsUpdatedAt: 200 }),
    expected
  );
});

test('empty base preserves independent first edits', () => {
  assert.equal(mergeThreeWay('', 'mine', 'mine'), 'mine');
  assert.equal(
    mergeThreeWay('', 'mine', 'theirs'),
    [
      '<<<<<<< ONELIST LOCAL',
      'mine',
      '||||||| ONELIST REMOTE',
      'theirs',
      '>>>>>>> ONELIST MERGE CONFLICT',
    ].join('\n')
  );
});

test('empty sides and base produce empty', () => {
  assert.equal(mergeThreeWay('', '', ''), '');
});

test('interleaved edits separated by an anchor merge cleanly', () => {
  // Each side edits a different chunk, with an unchanged "- b" anchor between
  // them, plus a trailing-only append on mine.
  const base = 'h1\n- a\n- b\n- c\nfooter';
  const mine = 'h1\n- a2\n- b\n- c\nfooter\nmine-note';
  const theirs = 'h1\n- a\n- b\n- c2\nfooter';
  assert.equal(
    mergeThreeWay(base, mine, theirs),
    'h1\n- a2\n- b\n- c2\nfooter\nmine-note'
  );
});

test('adjacent edits with no anchor between them preserve both sides', () => {
  // Real diff3 behavior: both sides change lines inside the same unstable
  // chunk, so the whole chunk is a conflict resolved by the winner.
  const base = 'h1\n- a\n- b\n- c\nfooter';
  const mine = 'h1\n- a\n- b2\n- c\nfooter';
  const theirs = 'h1\n- a0\n- b\n- c\nfooter';
  assert.equal(
    mergeThreeWay(base, mine, theirs),
    [
      'h1',
      '<<<<<<< ONELIST LOCAL',
      '- a',
      '- b2',
      '||||||| ONELIST REMOTE',
      '- a0',
      '- b',
      '>>>>>>> ONELIST MERGE CONFLICT',
      '- c',
      'footer',
    ].join('\n')
  );
});

test('merge converges: after saving the merged result, re-sync is stable', () => {
  const base = 'a\nb';
  const merged = mergeThreeWay(base, 'a\nb\nmine', 'a\nb\ntheirs');
  assert.equal(
    merged,
    [
      'a',
      'b',
      '<<<<<<< ONELIST LOCAL',
      'mine',
      '||||||| ONELIST REMOTE',
      'theirs',
      '>>>>>>> ONELIST MERGE CONFLICT',
    ].join('\n')
  );

  // After the merge we persist `merged` to the server, so the next sync sees
  // base === theirs === merged. A fresh local edit must not duplicate content.
  const nextLocal = `${merged}\nmore`;
  assert.equal(mergeThreeWay(merged, nextLocal, merged), nextLocal);
  assert.equal(mergeThreeWay(merged, merged, merged), merged);
});
