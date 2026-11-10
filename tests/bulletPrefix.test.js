import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bulletPrefix,
  formatTimeStamp,
  isTimestampBulletsEnabled,
  newBulletPrefix,
  setTimestampBulletsEnabled,
} from '../src/bulletPrefix.js';

const storage = new Map();

test.beforeEach(() => {
  storage.clear();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
});

test('formatTimeStamp uses 24-hour H:MM with padded minutes', () => {
  assert.equal(formatTimeStamp(new Date(2026, 10, 10, 9, 5)), '(9:05)');
  assert.equal(formatTimeStamp(new Date(2026, 10, 10, 14, 32)), '(14:32)');
  assert.equal(formatTimeStamp(new Date(2026, 10, 10, 0, 0)), '(0:00)');
});

test('bulletPrefix is a plain dash unless timestamps are on', () => {
  const now = new Date(2026, 10, 10, 14, 32);
  assert.equal(bulletPrefix({ now }), '- ');
  assert.equal(bulletPrefix({ timestamped: true, now }), '- (14:32) ');
});

test('the setting is off by default and persists once changed', () => {
  const now = new Date(2026, 10, 10, 7, 8);
  assert.equal(isTimestampBulletsEnabled(), false);
  assert.equal(newBulletPrefix(now), '- ');

  setTimestampBulletsEnabled(true);
  assert.equal(isTimestampBulletsEnabled(), true);
  assert.equal(newBulletPrefix(now), '- (7:08) ');

  setTimestampBulletsEnabled(false);
  assert.equal(newBulletPrefix(now), '- ');
});
