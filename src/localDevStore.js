const STORAGE_KEYS = {
  documents: 'onelist_dev_documents',
  snapshots: 'onelist_dev_snapshots',
  snippets: 'onelist_dev_snippets',
};

export const DEV_BYPASS_AUTH =
  import.meta.env?.DEV === true && import.meta.env?.VITE_DEV_BYPASS_AUTH === 'true';

export const DEV_USER = Object.freeze({
  id: 'local-dev-user',
  email: 'dev@local.test',
});

function readCollection(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCollection(key, items) {
  localStorage.setItem(key, JSON.stringify(items));
}

export function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDocuments() {
  return readCollection(STORAGE_KEYS.documents);
}

export function upsertDocument(doc) {
  const documents = getDocuments();
  const index = documents.findIndex((entry) => entry.id === doc.id);

  if (index >= 0) {
    documents[index] = { ...documents[index], ...doc };
  } else {
    documents.push(doc);
  }

  writeCollection(STORAGE_KEYS.documents, documents);
  return documents[index >= 0 ? index : documents.length - 1];
}

export function updateDocumentContent(docId, content, updatedAt) {
  const documents = getDocuments();
  const doc = documents.find((entry) => entry.id === docId);
  if (!doc) return null;

  doc.content = content;
  doc.updatedAt = updatedAt;
  writeCollection(STORAGE_KEYS.documents, documents);
  return doc;
}

export function getSnapshots(userId) {
  return readCollection(STORAGE_KEYS.snapshots).filter((snapshot) => snapshot.userId === userId);
}

export function addSnapshot(snapshot) {
  const snapshots = readCollection(STORAGE_KEYS.snapshots);
  snapshots.push(snapshot);
  writeCollection(STORAGE_KEYS.snapshots, snapshots);
  cleanupUnpinnedSnapshots(snapshot.year);
  return snapshot;
}

export function updateSnapshot(snapshotId, updates) {
  const snapshots = readCollection(STORAGE_KEYS.snapshots);
  const index = snapshots.findIndex((snapshot) => snapshot.id === snapshotId);
  if (index < 0) return null;

  snapshots[index] = { ...snapshots[index], ...updates };
  writeCollection(STORAGE_KEYS.snapshots, snapshots);
  return snapshots[index];
}

export function deleteSnapshots(snapshotIds) {
  const ids = new Set(snapshotIds);
  const snapshots = readCollection(STORAGE_KEYS.snapshots).filter(
    (snapshot) => !ids.has(snapshot.id)
  );
  writeCollection(STORAGE_KEYS.snapshots, snapshots);
}

function cleanupUnpinnedSnapshots(year) {
  const snapshots = readCollection(STORAGE_KEYS.snapshots);
  const unpinned = snapshots.filter((snapshot) => !snapshot.pinned && snapshot.year === year);
  if (unpinned.length <= 20) return;

  const sorted = unpinned.sort((a, b) => a.createdAt - b.createdAt);
  const toDelete = new Set(sorted.slice(0, unpinned.length - 20).map((snapshot) => snapshot.id));
  writeCollection(
    STORAGE_KEYS.snapshots,
    snapshots.filter((snapshot) => !toDelete.has(snapshot.id))
  );
}

export function getSnippets(userId) {
  return readCollection(STORAGE_KEYS.snippets).filter((snippet) => snippet.userId === userId);
}

export function upsertSnippet(snippet) {
  const snippets = readCollection(STORAGE_KEYS.snippets);
  const index = snippets.findIndex((entry) => entry.id === snippet.id);

  if (index >= 0) {
    snippets[index] = { ...snippets[index], ...snippet };
  } else {
    snippets.push(snippet);
  }

  writeCollection(STORAGE_KEYS.snippets, snippets);
  return snippets[index >= 0 ? index : snippets.length - 1];
}

export function deleteSnippet(snippetId) {
  writeCollection(
    STORAGE_KEYS.snippets,
    readCollection(STORAGE_KEYS.snippets).filter((snippet) => snippet.id !== snippetId)
  );
}
