// What a new bullet line starts with. With the "timestamped entries" setting
// on, every new bullet opens with the current time for interstitial journaling.
const STORAGE_KEY = 'onelist_timestamp_bullets';

export function formatTimeStamp(date = new Date()) {
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `(${date.getHours()}:${minutes})`;
}

export function bulletPrefix({ timestamped = false, now = new Date() } = {}) {
  return timestamped ? `- ${formatTimeStamp(now)} ` : '- ';
}

export function isTimestampBulletsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setTimestampBulletsEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('[Settings] Could not store the timestamped bullets setting:', err);
  }
}

// Prefix for a bullet created right now, honouring the user's setting.
export function newBulletPrefix(now = new Date()) {
  return bulletPrefix({ timestamped: isTimestampBulletsEnabled(), now });
}
