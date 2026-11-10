// Pure decision helpers for cross-device sync.
//
// Every document carries a server revision counter (`rev`). A device remembers
// the revision its editor text was derived from (the "base") and compares
// revisions, not wall-clock times, to decide whether the server has moved on.
// `updatedAt` is only a tie-breaker for documents written by older app
// versions that never bumped `rev`.

export function documentRev(doc) {
  return Number.isInteger(doc?.rev) ? doc.rev : 0;
}

export function versionOf(doc) {
  return { rev: documentRev(doc), updatedAt: doc?.updatedAt || 0 };
}

// Negative when `a` is older than `b`, positive when newer, 0 when the same.
export function compareVersions(a, b) {
  const revDiff = (a?.rev || 0) - (b?.rev || 0);
  if (revDiff !== 0) return revDiff;
  return (a?.updatedAt || 0) - (b?.updatedAt || 0);
}

// Small, fast, non-cryptographic fingerprint used to recognise our own writes
// when they come back from the server.
export function hashText(text) {
  const value = text ?? '';
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 + code, 0x85ebca6b) ^ (h2 >>> 13);
  }
  return `${value.length}:${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}`;
}

// True when `incoming` is a write this device sent that the server has not
// confirmed to us yet (an optimistic echo, or a queued write replayed after a
// reload). Such a copy must not be merged as if another device wrote it.
export function isOwnPendingWrite(incoming, base, sentWrites) {
  if (compareVersions(incoming, base) <= 0) return false;
  const candidates = (sentWrites || []).filter((write) => write.updatedAt === incoming.updatedAt);
  if (!candidates.length) return false;
  const hash = hashText(incoming.content);
  return candidates.some((write) => write.hash === hash);
}

// What to do with a copy of the open document that arrived from the server.
//   'ignore'  it is stale, already known, or our own unconfirmed write
//   'adopt'   it is newer and there is nothing local to protect
//   'merge'   it is newer and the editor has unsaved changes
export function decideIncoming({ base, incoming, editorContent, dirty, sentWrites }) {
  if (isOwnPendingWrite(incoming, base, sentWrites)) return 'ignore';
  if (compareVersions(incoming, base) <= 0) return 'ignore';
  if (!dirty || editorContent === incoming.content) return 'adopt';
  return 'merge';
}

// Keep the caret next to the text the user was editing when the document
// changes underneath them.
export function remapCursor(oldText, newText, position) {
  const before = oldText.slice(0, position);
  if (newText.startsWith(before)) return position;
  const after = oldText.slice(position);
  if (newText.endsWith(after)) return newText.length - after.length;
  return Math.min(position, newText.length);
}
