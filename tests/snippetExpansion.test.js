import assert from 'node:assert/strict';
import test from 'node:test';

import { expandSnippetCommand } from '../src/snippetExpansion.js';

test('replaces a bullet-only snippet command with snippet content', () => {
  const expanded = expandSnippetCommand({
    after: '',
    before: '- /daily',
    snippetContent: '- standup\n- priorities',
    snippetName: 'daily',
    start: 2,
  });

  assert.deepEqual(expanded, {
    selectionEnd: 22,
    selectionStart: 22,
    value: '- standup\n- priorities',
  });
});

test('inserts snippet content on a new line for inline usage', () => {
  const expanded = expandSnippetCommand({
    after: ' tomorrow',
    before: 'Plan /daily',
    snippetContent: '- standup\n- priorities',
    snippetName: 'daily',
    start: 5,
  });

  assert.deepEqual(expanded, {
    selectionEnd: 28,
    selectionStart: 28,
    value: 'Plan \n- standup\n- priorities tomorrow',
  });
});
