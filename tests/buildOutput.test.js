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

test('pwa build uses manual update wiring instead of the injected register stub', () => {
  const distDir = path.join(process.cwd(), 'dist');
  const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const sourceMain = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');

  assert.ok(fs.existsSync(path.join(distDir, 'sw.js')), 'expected generated service worker');
  assert.ok(fs.existsSync(path.join(distDir, 'manifest.webmanifest')), 'expected generated web manifest');
  assert.ok(!fs.existsSync(path.join(distDir, 'registerSW.js')), 'did not expect injected register stub');
  assert.doesNotMatch(indexHtml, /registerSW\.js/i);
  assert.match(sourceMain, /virtual:pwa-register/);
});
