import assert from 'node:assert/strict';
import test from 'node:test';

import { lcsPairs, mergeThreeWay, mergeWithoutBase } from '../src/textMerge.js';

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
    mergeThreeWay(base, mine, theirs),
    expected
  );
  assert.equal(
    mergeThreeWay(base, mine, theirs),
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

test('large files merge without building a quadratic table', () => {
  // 20,000 distinct lines: an exact LCS table would need 400M cells.
  const baseLines = Array.from({ length: 20_000 }, (_, i) => `- entry ${i}`);
  const mineLines = [...baseLines];
  const theirsLines = [...baseLines];

  // Edits at both ends of each side defeat the cheap prefix/suffix trim.
  mineLines[0] = '- entry 0 (laptop)';
  mineLines.push('- laptop tail');
  theirsLines[10_000] = '- entry 10000 (phone)';
  theirsLines.splice(5, 1);

  const merged = mergeThreeWay(baseLines.join('\n'), mineLines.join('\n'), theirsLines.join('\n')).split('\n');

  assert.equal(merged.length, 20_000);
  assert.equal(merged[0], '- entry 0 (laptop)');
  assert.equal(merged[merged.length - 1], '- laptop tail');
  assert.ok(merged.includes('- entry 10000 (phone)'));
  assert.ok(!merged.includes('- entry 5'));
  assert.ok(!merged.some((line) => line.includes('ONELIST')));
});

test('lcsPairs returns an ordered matching for large inputs with repeated lines', () => {
  const a = [];
  const b = [];
  for (let i = 0; i < 6_000; i++) {
    a.push(i % 3 === 0 ? '' : `line ${i}`);
    b.push(i % 3 === 0 ? '' : `line ${i}`);
  }
  a[100] = 'changed in a';
  b[5_000] = 'changed in b';

  const pairs = lcsPairs(a, b);
  for (let k = 0; k < pairs.length; k++) {
    assert.equal(a[pairs[k][0]], b[pairs[k][1]]);
    if (k > 0) {
      assert.ok(pairs[k][0] > pairs[k - 1][0]);
      assert.ok(pairs[k][1] > pairs[k - 1][1]);
    }
  }
  assert.ok(pairs.length >= 5_990);
});

test('mergeWithoutBase keeps every line from both sides', () => {
  const mine = 'a\nb\nmine only\nc';
  const theirs = 'a\nb\nc\ntheirs only';
  assert.equal(mergeWithoutBase(mine, theirs), 'a\nb\nmine only\nc\ntheirs only');
  assert.equal(mergeWithoutBase('same', 'same'), 'same');
});
