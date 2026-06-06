import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAllYearsExport,
  getAllYearsExportFilename,
} from '../src/exportUtils.js';

test('buildAllYearsExport concatenates years with headers', () => {
  const text = buildAllYearsExport([2024, 2026], (year) => {
    if (year === 2026) return '- task one';
    return '- older task';
  });

  assert.match(text, /^=== OneList 2026 ===\n\n- task one/);
  assert.match(text, /=== OneList 2024 ===\n\n- older task$/);
});

test('getAllYearsExportFilename uses dd-mm-yyyy format', () => {
  assert.equal(
    getAllYearsExportFilename(new Date(2026, 5, 6)),
    'OneList all years (06-06-2026).txt'
  );
});
