// Document sync: keeps the editor, the local draft cache and the server copy
// of the open year's document in agreement.
//
// Model: `base` is the last server version the editor text is known to descend
// from. Saves are compare-and-swap against `base.rev`; when the server has
// moved on, the newer copy is three-way merged into the editor and the save is
// retried on top of it.
import { editorHistory, getStoredYear, state, storeActiveYear } from './appState.js';
import { readDocumentCache, writeDocumentCache } from './documentCache.js';
import { createDocumentIdentity } from './documentIdentity.js';
import { $editor, $editorLoading, $editorWrap } from './dom.js';
import { refreshSaveIndicator, updateLineCounter, updateSaveIndicator } from './editorStatus.js';
import { createSaveCoordinator } from './saveCoordinator.js';
import { resetSnapshotClock, saveSnapshot } from './snapshots.js';
import { store } from './store/index.js';
import {
  decideIncoming,
  hashText,
  isOwnPendingWrite,
  remapCursor,
  versionOf,
} from './syncGuard.js';
import { mergeThreeWay, mergeWithoutBase } from './textMerge.js';
import { showToast } from './toast.js';
import { getAvailableYears, renderYearOptions } from './yearSwitcher.js';

// Wait for a pause in typing before saving, but never let continuous typing
// hold a save back for longer than MAX_SAVE_WAIT_MS.
const SAVE_DEBOUNCE_MS = 1000;
const MAX_SAVE_WAIT_MS = 5000;
const DRAFT_DEBOUNCE_MS = 400;
const MAX_SAVE_RETRY_DELAY = 15 * 1000;
const MAX_CONFLICT_RETRIES = 3;
const MAX_SENT_WRITES = 8;
const NO_BASE = Object.freeze({ rev: -1, updatedAt: -1, content: '' });

let base = { ...NO_BASE };
// Writes sent but not yet confirmed: [{ updatedAt, hash }].
let sentWrites = [];
// Wall-clock time of the most recent local keystroke (this device's clock only).
let lastLocalEditAt = 0;
let saveTimer = null;
let draftTimer = null;
let firstUnsavedAt = 0;
let saveRetryDelay = 1000;
let activeFlushes = 0;
let hasMigratedLegacyDoc = false;
let hasCompletedInitialDocumentBootstrap = false;
let initialDocumentBootstrapPromise = null;
let unsubscribeDocuments = null;
const pendingDocumentYears = new Set();

const saveCoordinator = createSaveCoordinator({
  onStateChange: updateSaveIndicator,
  saveContent: saveToServer,
});

function isOffline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return !store.isConnected();
}

function toIncoming(doc) {
  return { ...versionOf(doc), content: doc.content || '' };
}

function setBase({ rev, updatedAt, content }) {
  base = { rev, updatedAt, content };
  sentWrites = sentWrites.filter((write) => write.updatedAt > updatedAt);
}

function rememberSentWrite(write) {
  sentWrites = [...sentWrites, write].slice(-MAX_SENT_WRITES);
}

// ---------------------------------------------------------------------------
// Local draft: IndexedDB cache (content + merge base) and a synchronous
// localStorage backup for page teardown, when async writes may not finish.
// ---------------------------------------------------------------------------

function writeDocumentDraft(content = $editor.value, { dirty = hasUnsavedEditorChanges() } = {}) {
  if (!state.currentUser || !state.currentDocId || !Number.isInteger(state.currentYear)) return;

  writeDocumentCache(state.currentUser.id, state.currentYear, {
    docId: state.currentDocId,
    content,
    baseRev: base.rev,
    baseUpdatedAt: base.updatedAt,
    baseContent: base.content,
    localEditAt: lastLocalEditAt,
    sentWrites,
    dirty,
  });
}

function readDraftBackup(docId) {
  const content = localStorage.getItem(`onelist_backup_${docId}`);
  const time = parseInt(localStorage.getItem(`onelist_backup_time_${docId}`) || '', 10);
  if (content === null || !Number.isFinite(time)) return null;
  return { content, time };
}

function clearBackupForDocument(docId) {
  localStorage.removeItem(`onelist_backup_${docId}`);
  localStorage.removeItem(`onelist_backup_time_${docId}`);
}

function clearDraftTimer() {
  if (draftTimer) {
    clearTimeout(draftTimer);
    draftTimer = null;
  }
}

// Persist the unsaved editor text locally right now. Safe to call from
// pagehide / beforeunload: the localStorage half is synchronous.
export function flushDraftNow() {
  clearDraftTimer();
  if (!state.currentDocId || !state.currentUser || !hasUnsavedEditorChanges()) return;

  const content = $editor.value;
  try {
    localStorage.setItem(`onelist_backup_${state.currentDocId}`, content);
    localStorage.setItem(`onelist_backup_time_${state.currentDocId}`, Date.now().toString());
  } catch (err) {
    console.error('[Backup] Failed to persist draft backup:', err);
  }
  writeDocumentDraft(content, { dirty: true });
}

function scheduleDraftWrite() {
  if (draftTimer) return;
  draftTimer = setTimeout(() => {
    draftTimer = null;
    flushDraftNow();
  }, DRAFT_DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Save tracking
// ---------------------------------------------------------------------------

export function noteLocalEdit() {
  lastLocalEditAt = Date.now();
}

export function clearSaveTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

export function handleSaveError(err) {
  console.error('Error saving document:', err);
}

export function syncSaveTracking() {
  saveCoordinator.reset($editor.value);
  refreshSaveIndicator();
}

export function hasUnsavedEditorChanges() {
  return saveCoordinator.getState().hasPendingChanges;
}

export function scheduleSave() {
  saveCoordinator.markDirty($editor.value);
  scheduleDraftWrite();

  const now = Date.now();
  if (!firstUnsavedAt) firstUnsavedAt = now;
  const wait = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, firstUnsavedAt + MAX_SAVE_WAIT_MS - now));

  clearSaveTimer();
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistContent().catch(handleSaveError);
  }, wait);
}

export async function persistContent(isForced = false) {
  firstUnsavedAt = 0;
  activeFlushes += 1;

  try {
    const didSave = await saveCoordinator.flush({ forced: isForced });
    if (didSave) {
      saveRetryDelay = 1000;
    } else if (!isForced) {
      queueAutosaveRetry();
    }
    return didSave;
  } catch (err) {
    handleSaveError(err);
    if (!isForced) {
      queueAutosaveRetry();
    }
    return false;
  } finally {
    activeFlushes -= 1;
  }
}

function queueAutosaveRetry() {
  if (!hasUnsavedEditorChanges()) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

  clearSaveTimer();
  const retryDelay = saveRetryDelay;
  saveRetryDelay = Math.min(saveRetryDelay * 2, MAX_SAVE_RETRY_DELAY);

  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistContent().catch(handleSaveError);
  }, retryDelay);
  return true;
}

export async function ensureCurrentDocumentIsSafe(nextActionLabel = 'continue') {
  clearSaveTimer();
  await persistContent(true);

  if (hasUnsavedEditorChanges()) {
    showToast(`We could not save your latest changes yet. Please try again before you ${nextActionLabel}.`, { type: 'error' });
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Saving to the server
// ---------------------------------------------------------------------------

async function saveToServer() {
  if (!state.currentDocId || !state.currentUser) {
    return { skipped: true };
  }

  if (isOffline()) {
    return { skipped: true, status: 'offline' };
  }

  const docId = state.currentDocId;
  const year = state.currentYear;
  const userId = state.currentUser.id;

  for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
    // Fold in any newer server copy we already hold before writing on top of it.
    const knownDoc = getKnownServerDocument(docId, year);
    if (knownDoc) reconcileServerDocument(knownDoc, { fromSave: true });

    const content = $editor.value;

    if (content === base.content) {
      // Nothing the server does not already have (e.g. typed, then undid).
      clearBackupForDocument(docId);
      writeDocumentDraft(content, { dirty: false });
      return { updatedAt: base.updatedAt };
    }

    // Monotonic so older app versions, which order by time, still see it as newer.
    const updatedAt = Math.max(Date.now(), base.updatedAt + 1);
    rememberSentWrite({ updatedAt, hash: hashText(content) });
    writeDocumentDraft(content, { dirty: true });

    const result = await store.saveDocumentContent({
      userId,
      docId,
      content,
      updatedAt,
      baseRev: Math.max(base.rev, 0),
    });

    if (state.currentDocId !== docId) {
      return { skipped: true };
    }

    if (result.status === 'saved') {
      setBase({ rev: result.rev, updatedAt, content });

      const currentDoc = state.documentsByYear.get(year);
      if (currentDoc?.id === docId) {
        state.documentsByYear.set(year, { ...currentDoc, content, updatedAt, rev: result.rev });
      }

      const editorMatches = $editor.value === content;
      writeDocumentDraft($editor.value, { dirty: !editorMatches });
      if (editorMatches) clearBackupForDocument(docId);
      console.log(`[Sync] Saved rev ${result.rev} to server (${new Date(updatedAt).toISOString()})`);
      await saveSnapshot(content, year);
      return { updatedAt };
    }

    if (result.status === 'queued') {
      // The link dropped mid-save. The text is safe in the local draft and the
      // save is retried once the connection is back.
      return { skipped: true, status: 'offline' };
    }

    // Conflict: the server is ahead of our base.
    state.documentsByYear.set(year, result.doc);
    const incoming = toIncoming(result.doc);
    if (isOwnPendingWrite(incoming, base, sentWrites)) {
      // It is one of our own earlier writes (e.g. replayed after a reload), so
      // the editor already descends from it. Advance the base and try again.
      setBase(incoming);
    } else {
      reconcileServerDocument(result.doc, { fromSave: true });
    }
    console.log(`[Sync] Server was ahead (rev ${incoming.rev}); retrying save on top of it`);
  }

  return { skipped: true, status: 'saving' };
}

// ---------------------------------------------------------------------------
// Applying server copies to the editor
// ---------------------------------------------------------------------------

export function setEditorBootstrapping(isBootstrapping) {
  if (!$editorLoading) return;
  $editorLoading.hidden = !isBootstrapping;
  $editorLoading.setAttribute('aria-hidden', isBootstrapping ? 'false' : 'true');
  $editorWrap?.classList.toggle('is-bootstrapping', isBootstrapping);
}

function getKnownServerDocument(docId, year = state.currentYear) {
  const doc = state.documentsByYear.get(year);
  if (doc?.id === docId) return doc;
  return null;
}

function setEditorContent(content) {
  if ($editor.value === content) return;

  const previous = $editor.value;
  const cursorPos = $editor.selectionStart;
  editorHistory.beforeEdit($editor);
  $editor.value = content;
  $editor.selectionStart = $editor.selectionEnd = remapCursor(previous, content, cursorPos);
  updateLineCounter();
}

// Take the server copy as-is: nothing local needs protecting.
function adoptServerVersion(incoming) {
  setEditorContent(incoming.content);
  setBase(incoming);
  resetSnapshotClock();
  syncSaveTracking();
  updateLineCounter();
  editorHistory.clear();
  clearBackupForDocument(state.currentDocId);
  writeDocumentDraft(incoming.content, { dirty: false });
}

// A copy of the currently open document arrived (subscription, refresh, or a
// rejected save). Decide whether to ignore it, take it, or merge it.
function reconcileServerDocument(doc, { fromSave = false } = {}) {
  if (!doc || doc.id !== state.currentDocId) return;

  const incoming = toIncoming(doc);
  const editorContent = $editor.value;
  const dirty = hasUnsavedEditorChanges();
  const action = decideIncoming({ base, incoming, editorContent, dirty, sentWrites });

  if (action === 'ignore') {
    // A restored draft may still be waiting for its first save.
    if (dirty && !fromSave && !saveTimer && activeFlushes === 0) scheduleSave();
    return;
  }

  if (action === 'adopt') {
    adoptServerVersion(incoming);
    console.log(`[Sync] Loaded rev ${incoming.rev} of year ${doc.year}`);
    return;
  }

  const merged = mergeThreeWay(base.content, editorContent, incoming.content);
  setEditorContent(merged);
  setBase(incoming);
  resetSnapshotClock();
  editorHistory.clear();
  console.log(`[Sync] Merged rev ${incoming.rev} from another device into local edits`);

  if (merged === incoming.content) {
    clearBackupForDocument(state.currentDocId);
    syncSaveTracking();
    writeDocumentDraft(merged, { dirty: false });
    return;
  }

  writeDocumentDraft(merged, { dirty: true });
  if (!fromSave) scheduleSave();
}

// Open a document that is not the one currently in the editor.
function openServerDocument(doc) {
  clearDraftTimer();
  base = { ...NO_BASE };
  sentWrites = [];

  const incoming = toIncoming(doc);
  const backup = readDraftBackup(doc.id);
  adoptServerVersion(incoming);
  console.log(`[Sync] Loaded rev ${incoming.rev} of year ${doc.year}`);

  if (!backup || backup.content === incoming.content) return;

  // Unsaved text from a previous session with no cached merge base. If it is
  // newer than the server copy, continue from it; otherwise keep both.
  const restored = backup.time > incoming.updatedAt
    ? backup.content
    : mergeWithoutBase(backup.content, incoming.content);
  if (restored === incoming.content) return;

  console.log('[Recovery] Restoring unsaved draft from local backup');
  setEditorContent(restored);
  editorHistory.clear();
  scheduleSave();
}

export function loadYearDocument(year) {
  const doc = state.documentsByYear.get(year);
  if (!doc) return;

  const isSameDocument = state.currentDocId === doc.id;
  state.currentYear = year;
  state.currentDocId = doc.id;
  storeActiveYear(year);
  renderYearOptions();

  if (isSameDocument) {
    reconcileServerDocument(doc);
  } else {
    openServerDocument(doc);
  }
  setEditorBootstrapping(false);
}

// Clear the editor ahead of creating a document for a year that has none.
export function beginBlankDocument(year) {
  clearDraftTimer();
  state.currentYear = year;
  state.currentDocId = null;
  storeActiveYear(year);
  base = { ...NO_BASE };
  sentWrites = [];
  renderYearOptions();
  $editor.value = '';
  editorHistory.clear();
  syncSaveTracking();
  updateLineCounter();
}

// ---------------------------------------------------------------------------
// Startup, subscription and refresh
// ---------------------------------------------------------------------------

export async function applyCachedDocumentForStartup(userId) {
  const cached = await readDocumentCache(userId, state.currentYear);
  if (!cached) return false;

  state.currentDocId = cached.docId;
  base = { rev: cached.baseRev, updatedAt: cached.baseUpdatedAt, content: cached.baseContent };
  sentWrites = cached.sentWrites;
  lastLocalEditAt = cached.localEditAt;

  let content = cached.content;
  let dirty = cached.dirty;

  // The synchronous teardown backup can be newer than the async IndexedDB draft.
  const backup = readDraftBackup(cached.docId);
  if (backup && backup.time > cached.localEditAt && backup.content !== content) {
    content = backup.content;
    dirty = true;
  }

  $editor.value = content;
  saveCoordinator.reset(content);
  if (dirty && content !== base.content) {
    saveCoordinator.markDirty(content);
  }
  updateLineCounter();
  editorHistory.clear();
  console.log(`[Cache] Restored year ${state.currentYear} from IndexedDB draft cache`);
  return true;
}

function chooseCanonicalDocuments(docs) {
  const byYear = new Map();

  docs
    .filter((doc) => Number.isInteger(doc.year))
    .forEach((doc) => {
      const existing = byYear.get(doc.year);
      if (!existing || (doc.updatedAt || 0) > (existing.updatedAt || 0)) {
        byYear.set(doc.year, doc);
      }
    });

  return Array.from(byYear.values());
}

async function applyDocumentsSnapshot(docs) {
  const legacyDocs = docs.filter((doc) => !Number.isInteger(doc.year));
  if (legacyDocs.length && !hasMigratedLegacyDoc && !store.isLocal) {
    hasMigratedLegacyDoc = true;
    await migrateLegacyDocuments(legacyDocs, docs);
    return false;
  }

  state.documentsByYear.clear();
  chooseCanonicalDocuments(docs).forEach((doc) => {
    state.documentsByYear.set(doc.year, doc);
  });

  return true;
}

async function migrateLegacyDocuments(legacyDocs, allDocs) {
  if (!state.currentUser || !legacyDocs.length) return;

  const existingYears = new Set(allDocs.filter((doc) => Number.isInteger(doc.year)).map((doc) => doc.year));
  let targetYear = getStoredYear();

  for (const doc of legacyDocs) {
    while (existingYears.has(targetYear)) {
      targetYear -= 1;
    }

    try {
      await store.updateDocumentFields(doc, {
        year: targetYear,
        updatedAt: doc.updatedAt || Date.now(),
      });
      existingYears.add(targetYear);
    } catch (err) {
      console.error('Error migrating legacy document:', err);
    }
  }
}

async function hydrateCurrentYearFromMemory() {
  if (!state.documentsByYear.size) {
    await createDocument(state.currentYear);
    return;
  }

  if (!state.documentsByYear.has(state.currentYear)) {
    state.currentYear = getAvailableYears()[0];
    storeActiveYear(state.currentYear);
  }

  renderYearOptions();
  loadYearDocument(state.currentYear);
}

async function hydrateFreshDocumentsFromServer() {
  let didApply = true;

  try {
    const docs = await store.fetchDocuments(state.currentUser.id);
    if (!state.currentUser) return;
    didApply = await applyDocumentsSnapshot(docs);
  } catch (err) {
    console.warn('[Sync] Falling back to cached subscription snapshot during initial load:', err);
  } finally {
    hasCompletedInitialDocumentBootstrap = true;
    initialDocumentBootstrapPromise = null;
  }

  if (!didApply) return;
  await hydrateCurrentYearFromMemory();
}

async function handleDocumentsUpdate(docs) {
  if (!state.currentUser) return;

  const didApply = await applyDocumentsSnapshot(docs);
  if (!didApply || !state.currentUser) return;

  await hydrateCurrentYearFromMemory();
  setEditorBootstrapping(false);

  if (hasCompletedInitialDocumentBootstrap) return;

  // The first result can come from the backend's local cache. Confirm it with
  // one fresh read before treating the initial load as complete.
  if (!store.isLocal && typeof navigator !== 'undefined' && navigator.onLine) {
    if (!initialDocumentBootstrapPromise) {
      initialDocumentBootstrapPromise = hydrateFreshDocumentsFromServer();
    }
  } else {
    hasCompletedInitialDocumentBootstrap = true;
  }
}

export function startDocumentSync() {
  if (!state.currentUser) return;

  state.currentYear = getStoredYear();
  renderYearOptions();
  unsubscribeDocuments?.();
  unsubscribeDocuments = store.watchDocuments(state.currentUser.id, (docs) => {
    handleDocumentsUpdate(docs).catch((err) => {
      console.error('[Sync] Failed to apply documents update:', err);
    });
  });
}

export function stopDocumentSync() {
  unsubscribeDocuments?.();
  unsubscribeDocuments = null;
  clearSaveTimer();
  clearDraftTimer();
  state.currentDocId = null;
  state.documentsByYear.clear();
  pendingDocumentYears.clear();
  base = { ...NO_BASE };
  sentWrites = [];
  lastLocalEditAt = 0;
  firstUnsavedAt = 0;
  hasMigratedLegacyDoc = false;
  hasCompletedInitialDocumentBootstrap = false;
  initialDocumentBootstrapPromise = null;
  saveCoordinator.reset('');
  setEditorBootstrapping(false);
}

// Pull the latest server copy (tab became visible, network or realtime link
// came back), then push anything still unsaved on top of it.
export async function refreshRemoteDocumentIfNeeded() {
  if (!state.currentDocId || !state.currentUser) return;
  if (isOffline()) return;

  try {
    const docs = await store.fetchDocuments(state.currentUser.id);
    if (!state.currentUser) return;
    const didApply = await applyDocumentsSnapshot(docs);
    if (!didApply) return;

    await hydrateCurrentYearFromMemory();
  } catch (err) {
    console.warn('[Sync] Failed to refresh document from server:', err);
  }

  if (state.currentDocId && hasUnsavedEditorChanges()) {
    persistContent(true).catch(handleSaveError);
  }
}

export async function createDocument(year = state.currentYear) {
  if (!state.currentUser || pendingDocumentYears.has(year)) return;
  if (state.documentsByYear.has(year)) {
    if (year === state.currentYear) loadYearDocument(year);
    return;
  }

  const { docId, docKey } = createDocumentIdentity(state.currentUser.id, year);
  pendingDocumentYears.add(year);
  const createdAt = Date.now();
  const nextDoc = {
    id: docId,
    docKey,
    userId: state.currentUser.id,
    year,
    content: year === state.currentYear ? $editor.value : '',
    createdAt,
    updatedAt: createdAt,
  };

  try {
    const created = await store.createDocument(nextDoc);

    state.documentsByYear.set(year, created);
    if (year === state.currentYear) {
      state.currentDocId = docId;
      setBase(toIncoming(created));
      if ($editor.value === nextDoc.content) {
        syncSaveTracking();
      } else {
        saveCoordinator.markDirty($editor.value);
        persistContent(true).catch(handleSaveError);
      }
    }
    renderYearOptions();
  } catch (err) {
    console.error('Error creating document:', err);
    showToast('Failed to create document. Please try refreshing.', { type: 'error' });
  } finally {
    pendingDocumentYears.delete(year);
  }
}
