import assert from 'node:assert/strict';
import test from 'node:test';

import { lineMatchesQuery, parseSearchQuery, searchLines } from '../src/searchUtils.js';

test('parseSearchQuery detects tag queries', () => {
  assert.deepEqual(parseSearchQuery('#work'), {
    type: 'tag',
    value: 'work',
    raw: '#work',
  });
  assert.deepEqual(parseSearchQuery('  hello  '), {
    type: 'text',
    value: 'hello',
    raw: 'hello',
  });
});

test('lineMatchesQuery matches tag tokens without partial overlap', () => {
  const tagQuery = parseSearchQuery('#work');

  assert.equal(lineMatchesQuery('- finish report #work', tagQuery), true);
  assert.equal(lineMatchesQuery('notes #work, done', tagQuery), true);
  assert.equal(lineMatchesQuery('- finish report #workshop', tagQuery), false);
  assert.equal(lineMatchesQuery('- finish report', tagQuery), false);
});

test('lineMatchesQuery matches plain text queries case-insensitively', () => {
  const textQuery = parseSearchQuery('Report');

  assert.equal(lineMatchesQuery('- finish REPORT today', textQuery), true);
  assert.equal(lineMatchesQuery('- other task', textQuery), false);
});

test('searchLines returns matching line indexes', () => {
  const lines = ['- alpha', '- beta #work', '- gamma #workshop'];
  const results = searchLines(lines, '#work');

  assert.deepEqual(results, [{ i: 1, line: '- beta #work' }]);
});
