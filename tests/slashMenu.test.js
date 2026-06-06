import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSlashMenuItems,
  parseSlashContext,
} from '../src/slashMenu.js';

const formatDate = (date) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

test('parseSlashContext detects partial slash tokens', () => {
  assert.deepEqual(parseSlashContext('- /to', 5), {
    token: '/to',
    filter: 'to',
    start: 2,
    end: 5,
  });
  assert.equal(parseSlashContext('hello world', 11), null);
});

test('getSlashMenuItems filters built-ins and snippets', () => {
  const items = getSlashMenuItems('to', [
    { name: 'todayplan', content: 'plan' },
    { name: 'notes', content: 'note body' },
  ], formatDate);

  assert.deepEqual(
    items.map((item) => item.label),
    ['/today', '/tomorrow', '/todayplan']
  );
  assert.equal(items[0].type, 'builtin');
  assert.equal(items[2].type, 'snippet');
});
