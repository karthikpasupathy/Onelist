import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('production bundle does not depend on the InstantDB CDN import', () => {
  const assetsDir = path.join(process.cwd(), 'dist', 'assets');
  assert.ok(fs.existsSync(assetsDir), 'dist/assets must exist before running this test');

  const assetFiles = fs.readdirSync(assetsDir).filter((file) => file.endsWith('.js'));
  assert.ok(assetFiles.length > 0, 'expected at least one built JS asset');

  const bundleContents = assetFiles
    .map((file) => fs.readFileSync(path.join(assetsDir, file), 'utf8'))
    .join('\n');

  assert.doesNotMatch(bundleContents, /cdn\.jsdelivr\.net\/npm\/@instantdb\/core/i);
});
