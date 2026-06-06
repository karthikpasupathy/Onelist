// main.js - OneList with InstantDB
import { init, tx, id } from '@instantdb/core';
import { registerSW } from 'virtual:pwa-register';
import { createSaveCoordinator } from './saveCoordinator.js';
import { expandSnippetCommand } from './snippetExpansion.js';
import { lineMatchesQuery, parseSearchQuery } from './searchUtils.js';
import { initConfirmDialog, showConfirm, showToast } from './toast.js';
import { createEditorHistory } from './editorHistory.js';
import { isHistoryInput, isUndoShortcut } from './editorShortcuts.js';
import {
  getCaretCoordinates,
  getSlashMenuItems,
  parseSlashContext,
} from './slashMenu.js';
import {
  buildAllYearsExport,
  getAllYearsExportFilename,
} from './exportUtils.js';
import {
  DEV_BYPASS_AUTH,
  DEV_USER,
  addSnapshot as addLocalSnapshot,
  createLocalId,
  deleteSnippet as deleteLocalSnippet,
  getDocuments as getLocalDocuments,
  getSnippets as getLocalSnippets,
  getSnapshots as getLocalSnapshots,
  updateDocumentContent as updateLocalDocumentContent,
  updateSnapshot as updateLocalSnapshot,
  upsertDocument as upsertLocalDocument,
  upsertSnippet as upsertLocalSnippet,
} from './localDevStore.js';
import { readDocumentCache, writeDocumentCache } from './documentCache.js';
import {
  shouldBlockSaveOverRemote,
  shouldQueueBackupConflict,
  shouldRestoreDraftBackup,
} from './syncGuard.js';
import { mergeByRecency } from './textMerge.js';

// Read InstantDB App ID from environment variable
// Users must set VITE_INSTANT_APP_ID in their Vercel environment variables
const APP_ID = import.meta.env.VITE_INSTANT_APP_ID;
const isDevBypass = DEV_BYPASS_AUTH;
const APP_VERSION = __APP_VERSION__;
const APP_BUILD = __APP_BUILD__;
const APP_RELEASE = APP_BUILD === 'local' ? `v${APP_VERSION}` : `v${APP_VERSION} (${APP_BUILD})`;

if (!APP_ID && !isDevBypass) {
  throw new Error('Missing VITE_INSTANT_APP_ID environment variable. Please configure it in Vercel project settings.');
}

// Initialize InstantDB (skipped in local dev bypass mode)
const db = APP_ID ? init({ appId: APP_ID }) : null;

function createEntityId() {
  return isDevBypass ? createLocalId() : id();
}

// Elements
const $authScreen = document.getElementById('auth-screen');
const $app = document.getElementById('app');
const $emailForm = document.getElementById('email-form');
const $codeForm = document.getElementById('code-form');
const $emailInput = document.getElementById('email-input');
const $codeInput = document.getElementById('code-input');
const $btnSendCode = document.getElementById('btn-send-code');
const $btnVerifyCode = document.getElementById('btn-verify-code');
const $btnBack = document.getElementById('btn-back');
const $btnLogout = document.getElementById('btn-logout');
const $editor = document.getElementById('editor');
const $editorWrap = document.querySelector('.editor-wrap');
const $editorLoading = document.getElementById('editor-loading');
const $slashMenu = document.getElementById('slash-menu');
const $results = document.getElementById('search-results');
const $yearSelect = document.getElementById('year-select');
const $snapshotsModal = document.getElementById('snapshots-modal');
const $btnSearchModal = document.getElementById('btn-search-modal');
const $saveIndicator = document.getElementById('save-indicator');
const $btnAppendDate = document.getElementById('btn-append-date');
const $searchModal = document.getElementById('search-modal');
const $searchInput = document.getElementById('search-input');
const $searchResultsModal = document.getElementById('search-results-modal');
const $searchScopeSelect = document.getElementById('search-scope-select');
const $btnRunSearch = document.getElementById('btn-run-search');
const $btnProfile = document.getElementById('btn-profile');
const $profileDropdown = document.getElementById('profile-dropdown');
const $userEmail = document.getElementById('user-email');
const $btnExportYearMenu = document.getElementById('btn-export-year-menu');
const $btnExportAllMenu = document.getElementById('btn-export-all-menu');
const $btnSnapshotsMenu = document.getElementById('btn-snapshots-menu');
const $btnTextFormat = document.getElementById('btn-text-format-menu');
const $textFormatModal = document.getElementById('text-format-modal');
const $btnIncreaseSize = document.getElementById('btn-increase-size');
const $btnDecreaseSize = document.getElementById('btn-decrease-size');
const $fontSizeDisplay = document.getElementById('font-size-display');
const $fontFamilySelect = document.getElementById('font-family-select');
const $btnSaveFormat = document.getElementById('btn-save-format');
const $btnResetFormat = document.getElementById('btn-reset-format');
const $btnSnippetsMenu = document.getElementById('btn-snippets-menu');
const $snippetsModal = document.getElementById('snippets-modal');
const $snippetsListView = document.getElementById('snippets-list-view');
const $snippetsFormView = document.getElementById('snippets-form-view');
const $btnCreateSnippet = document.getElementById('btn-create-snippet');
const $snippetList = document.getElementById('snippet-list');
const $snippetName = document.getElementById('snippet-name');
const $snippetContent = document.getElementById('snippet-content');
const $btnSaveSnippet = document.getElementById('btn-save-snippet');
const $btnCancelSnippet = document.getElementById('btn-cancel-snippet');
const $btnSettingsMenu = document.getElementById('btn-settings-menu');
const $btnHelpMenu = document.getElementById('btn-help-menu');
const $settingsModal = document.getElementById('settings-modal');
const $helpModal = document.getElementById('help-modal');
const $btnSaveSettings = document.getElementById('btn-save-settings');
const $newYearModal = document.getElementById('new-year-modal');
const $newYearInput = document.getElementById('new-year-input');
const $newYearError = document.getElementById('new-year-error');
const $btnCancelNewYear = document.getElementById('btn-cancel-new-year');
const $btnConfirmNewYear = document.getElementById('btn-confirm-new-year');
const $lineCounter = document.getElementById('line-counter');
const $lineCount = document.getElementById('line-count');
const $wordCount = document.getElementById('word-count');
const $updateBanner = document.getElementById('update-banner');
const $updateBannerIcon = document.getElementById('update-banner-icon');
const $updateBannerTitle = document.getElementById('update-banner-title');
const $updateBannerMessage = document.getElementById('update-banner-message');
const $btnUpdateDismiss = document.getElementById('btn-update-dismiss');
const $btnUpdateRefresh = document.getElementById('btn-update-refresh');
const $appVersion = document.getElementById('app-version');

let currentUser = null;
let currentDocId = null;
let currentYear = new Date().getFullYear();
let currentSearchScope = 'current';
let saveTimer = null;
let lastSaveStatus = 'saved';
let localUpdatedAt = 0;
// Last server-confirmed content for the open doc; the common ancestor used as
// the base for silent three-way merges across devices.
let baseContent = '';
// Wall-clock time of the most recent local keystroke, used as the "mine" side
// recency when resolving a true line-level conflict (newest wins).
let lastLocalEditAt = 0;
let isSwitchingYear = false;
let hasMigratedLegacyDoc = false;
const documentsByYear = new Map();
const pendingDocumentYears = new Set();
const snippetsByName = new Map();

// Text formatting state
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_FAMILY = 'google-sans-flex';
const SNAPSHOT_INTERVAL = 5 * 60 * 1000; // 5 minutes

let currentFontSize = DEFAULT_FONT_SIZE;
let currentFontFamily = DEFAULT_FONT_FAMILY;
let currentEditingSnippetId = null;
let lastSnapshotTime = 0;
let newYearResolver = null;
let snippetCache = [];
let hasPendingAppUpdate = false;
let isApplyingAppUpdate = false;
let hasCompletedInitialDocumentBootstrap = false;
let initialDocumentBootstrapPromise = null;

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let modalReturnFocus = null;
let activeModal = null;

initConfirmDialog();

const editorHistory = createEditorHistory();
let slashMenuItems = [];
let slashMenuSelectedIndex = 0;
let slashMenuContext = null;

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    hasPendingAppUpdate = true;
    showUpdateBanner(
      typeof navigator !== 'undefined' && !navigator.onLine
        ? 'Update is ready. Reconnect, then refresh when you are ready.'
        : 'Refresh to load the latest version.'
    );
  },
  onOfflineReady() {
    console.log('[PWA] Offline support is ready.');
  },
});

const saveCoordinator = createSaveCoordinator({
  onStateChange: updateSaveIndicator,
  async saveContent({ content }) {
    if (!currentDocId || !currentUser) {
      return { skipped: true };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { skipped: true, status: 'offline' };
    }

    const docId = currentDocId;
    const year = currentYear;
    const now = Date.now();

    let contentToSave = content;

    const serverDoc = await fetchServerDocument(docId);
    if (
      serverDoc &&
      shouldBlockSaveOverRemote({
        localUpdatedAt,
        localContent: content,
        serverUpdatedAt: serverDoc.updatedAt || 0,
        serverContent: serverDoc.content || '',
      })
    ) {
      documentsByYear.set(year, serverDoc);
      const serverContent = serverDoc.content || '';
      const serverUpdatedAt = serverDoc.updatedAt || 0;

      if (hasUnsavedEditorChanges()) {
        // Both sides changed: merge silently and persist the reconciled text.
        const merged = mergeByRecency(baseContent, $editor.value, serverContent, {
          mineUpdatedAt: lastLocalEditAt || now,
          theirsUpdatedAt: serverUpdatedAt,
        });
        applyMergedContent(merged);
        contentToSave = merged;
        console.log('[Sync] Auto-merged remote changes into local edits');
      } else {
        // No local edits to protect: take the newer remote version.
        hydrateEditorFromDocument(serverDoc, {
          allowConflict: false,
          allowBackupRestore: false,
        });
        return { skipped: true, status: 'synced' };
      }
    }

    if (isDevBypass) {
      updateLocalDocumentContent(docId, contentToSave, now);
    } else {
      await db.transact([
        tx.documents[docId].update({
          content: contentToSave,
          updatedAt: now,
        }),
      ]);
    }

    const currentDoc = documentsByYear.get(year);
    if (currentDoc?.id === docId) {
      documentsByYear.set(year, {
        ...currentDoc,
        content: contentToSave,
        updatedAt: now,
      });
    }

    localUpdatedAt = now;
    baseContent = contentToSave;
    syncDocumentCache(contentToSave);
    clearBackupForDocument(docId);
    console.log(`[Sync] Saved to server (${new Date(now).toISOString()})`);
    await saveSnapshot(contentToSave, year);
    return { updatedAt: now };
  },
});

// Auth state listener
if (isDevBypass) {
  startDevSession();
} else {
  db.subscribeAuth((auth) => {
    if (auth.user) {
      activateUserSession(auth.user);
    } else {
      deactivateUserSession();
    }
  });
}

function activateUserSession(user) {
  currentUser = user;
  currentYear = getStoredYear();
  if ($userEmail && user.email) {
    $userEmail.textContent = user.email;
  }
  showApp();
  const hadCachedDocument = applyCachedDocumentForStartup(user.id);
  if (!hadCachedDocument) {
    setEditorBootstrapping(true);
  }
  subscribeToDocument();
}

function deactivateUserSession() {
  currentUser = null;
  currentDocId = null;
  documentsByYear.clear();
  clearSnippetCache();
  clearSaveTimer();
  saveCoordinator.reset('');
  hideUpdateBanner();
  currentYear = getStoredYear();
  hasMigratedLegacyDoc = false;
  hasCompletedInitialDocumentBootstrap = false;
  initialDocumentBootstrapPromise = null;
  localUpdatedAt = 0;
  baseContent = '';
  setEditorBootstrapping(false);
  if ($editor) {
    $editor.value = '';
  }
  showAuth();
}

function startDevSession() {
  activateUserSession(DEV_USER);
  if ($userEmail) {
    $userEmail.textContent = `${DEV_USER.email} (local dev)`;
  }
  showToast('Local dev mode — data stays in this browser only.', { duration: 6000 });
  console.info('[OneList] Auth bypass enabled for local development.');
}

function showAuth() {
  $authScreen.style.display = 'flex';
  $app.style.display = 'none';
}

function showApp() {
  $authScreen.style.display = 'none';
  $app.style.display = 'flex';

  if ($appVersion) {
    $appVersion.textContent = APP_RELEASE;
  }
}

function setEditorBootstrapping(isBootstrapping) {
  if (!$editorLoading) return;
  $editorLoading.hidden = !isBootstrapping;
  $editorLoading.setAttribute('aria-hidden', isBootstrapping ? 'false' : 'true');
  $editorWrap?.classList.toggle('is-bootstrapping', isBootstrapping);
}

function applyCachedDocumentForStartup(userId) {
  const cached = readDocumentCache(userId, currentYear);
  if (!cached) return false;

  currentDocId = cached.docId;
  localUpdatedAt = cached.updatedAt;
  baseContent = cached.baseContent;
  $editor.value = cached.content;
  saveCoordinator.reset(cached.content);
  updateLineCounter();
  editorHistory.clear();
  console.log(`[Cache] Restored year ${currentYear} from local cache`);
  return true;
}

function syncDocumentCache(content = $editor.value) {
  if (!currentUser || !currentDocId || !Number.isInteger(currentYear)) return;

  writeDocumentCache(currentUser.id, currentYear, {
    docId: currentDocId,
    content,
    updatedAt: localUpdatedAt,
    baseContent,
  });
}

async function fetchServerDocument(docId) {
  if (!docId || !currentUser) return null;

  if (isDevBypass) {
    return getLocalDocuments().find((doc) => doc.id === docId && doc.userId === currentUser.id) || null;
  }

  if (!db) return null;

  const result = await db.queryOnce(getDocumentsQuery());
  const docs = result.data?.documents || [];
  return docs.find((doc) => doc.id === docId) || null;
}

async function refreshRemoteDocumentIfNeeded() {
  if (!currentDocId || !currentUser) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    if (isDevBypass) {
      const docs = getLocalDocuments().filter((doc) => doc.userId === currentUser.id);
      await applyDocumentsSnapshot(docs);
    } else {
      const result = await db.queryOnce(getDocumentsQuery());
      const docs = result.data?.documents || [];
      const didApply = await applyDocumentsSnapshot(docs);
      if (!didApply) return;
    }

    await hydrateCurrentYearFromMemory();
  } catch (err) {
    console.warn('[Sync] Failed to refresh document from server:', err);
  }
}

// Send magic code
$btnSendCode.addEventListener('click', async () => {
  const email = $emailInput.value.trim();
  if (!email) {
    showToast('Please enter your email', { type: 'error' });
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast('Please enter a valid email address', { type: 'error' });
    return;
  }

  try {
    $btnSendCode.disabled = true;
    $btnSendCode.textContent = 'Sending...';
    await db.auth.sendMagicCode({ email });
    $emailForm.style.display = 'none';
    $codeForm.style.display = 'flex';
    $codeInput.focus();
  } catch (err) {
    showToast('Error sending code: ' + err.message, { type: 'error' });
    $btnSendCode.disabled = false;
    $btnSendCode.textContent = 'Send Code';
  }
});

// Verify code and sign in
$btnVerifyCode.addEventListener('click', async () => {
  const email = $emailInput.value.trim();
  const code = $codeInput.value.trim();

  if (!code) {
    showToast('Please enter the verification code', { type: 'error' });
    return;
  }

  try {
    $btnVerifyCode.disabled = true;
    $btnVerifyCode.textContent = 'Signing in...';
    await db.auth.signInWithMagicCode({ email, code });
  } catch (err) {
    showToast('Invalid code. Please try again.', { type: 'error' });
    $btnVerifyCode.disabled = false;
    $btnVerifyCode.textContent = 'Sign In';
    $codeInput.value = '';
    $codeInput.focus();
  }
});

// Back to email input
$btnBack.addEventListener('click', () => {
  $codeForm.style.display = 'none';
  $emailForm.style.display = 'flex';
  $codeInput.value = '';
  $btnSendCode.disabled = false;
  $btnSendCode.textContent = 'Send Code';
  $btnVerifyCode.disabled = false;
  $btnVerifyCode.textContent = 'Sign In';
});

// Enter key support
$emailInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') $btnSendCode.click();
});

$codeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') $btnVerifyCode.click();
});

// Sign out
$btnLogout.addEventListener('click', () => {
  if (isDevBypass) {
    window.location.reload();
    return;
  }

  db.auth.signOut();
});

// Subscribe to user's documents
function subscribeToDocument() {
  if (!currentUser) return;

  if (isDevBypass) {
    subscribeToDocumentLocal();
    return;
  }

  currentYear = getStoredYear();
  renderYearOptions();

  db.subscribeQuery(
    getDocumentsQuery(),
    async (resp) => {
      if (resp.error) {
        console.error('Query error:', resp.error);
        return;
      }

      const docs = resp.data?.documents || [];
      const didApply = await applyDocumentsSnapshot(docs);
      if (!didApply) {
        return;
      }

      if (!hasCompletedInitialDocumentBootstrap) {
        await hydrateCurrentYearFromMemory();
        setEditorBootstrapping(false);

        if (typeof navigator !== 'undefined' && navigator.onLine) {
          if (!initialDocumentBootstrapPromise) {
            initialDocumentBootstrapPromise = hydrateFreshDocumentsFromServer();
          }
        } else {
          hasCompletedInitialDocumentBootstrap = true;
        }
        return;
      }

      await hydrateCurrentYearFromMemory();
    }
  );

  // Subscribe to snapshots and handle cleanup
  db.subscribeQuery(
    {
      snapshots: {
        $: {
          where: {
            userId: currentUser.id,
          },
        },
      },
    },
    (resp) => {
      if (resp.error) {
        console.error('[Snapshot Subscription] Error:', resp.error);
        return;
      }

      const snapshots = resp.data?.snapshots || [];
      console.log(`[Snapshot Subscription] Loaded ${snapshots.length} snapshots.`);

      const snapshotsByYear = new Map();
      snapshots.filter((snapshot) => !snapshot.pinned).forEach((snapshot) => {
        const year = Number.isInteger(snapshot.year) ? snapshot.year : currentYear;
        if (!snapshotsByYear.has(year)) snapshotsByYear.set(year, []);
        snapshotsByYear.get(year).push(snapshot);
      });

      snapshotsByYear.forEach((yearSnapshots, year) => {
        if (yearSnapshots.length <= 20) return;

        console.log(`[Snapshot Cleanup] Year ${year} has ${yearSnapshots.length} unpinned snapshots. Limit is 20.`);
        const sorted = yearSnapshots.sort((a, b) => a.createdAt - b.createdAt);
        const toDelete = sorted.slice(0, yearSnapshots.length - 20);

        toDelete.forEach((snapshot) => {
          db.transact([tx.snapshots[snapshot.id].delete()])
            .then(() => console.log('[Snapshot Cleanup] Successfully deleted snapshot:', snapshot.id))
            .catch(err => {
              console.error('[Snapshot Cleanup] Error deleting snapshot:', err);
              if (err.body) console.error('[Snapshot Cleanup] Error body:', err.body);
            });
        });
      });
    }
  );

  // Subscribe to snippets
  db.subscribeQuery(
    {
      snippets: {
        $: {
          where: {
            userId: currentUser.id,
          },
        },
      },
    },
    (resp) => {
      if (resp.error) {
        console.error('[Snippet Subscription] Error:', resp.error);
        return;
      }

      setSnippetCache(resp.data?.snippets || []);
    }
  );

  // Subscribe to user settings
  db.subscribeQuery(
    {
      settings: {
        $: {
          where: {
            userId: currentUser.id,
          },
        },
      },
    },
    (resp) => {
      if (resp.error) {
        console.error('[Settings Subscription] Error:', resp.error);
      }
    }
  );

  // Expose debug function
  window.debugCleanup = async () => {
    console.log('Running manual cleanup...');
    const { data } = await db.queryOnce({
      snapshots: {
        $: { where: { userId: currentUser.id } },
      }
    });
    const snapshots = data?.snapshots || [];
    const unpinned = snapshots.filter(s => !s.pinned && (s.year || currentYear) === currentYear);
    console.log(`Manual: Found ${unpinned.length} unpinned snapshots for ${currentYear}.`);
    if (unpinned.length <= 20) {
      console.log('Manual: No cleanup needed.');
      return;
    }

    const sorted = unpinned.sort((a, b) => a.createdAt - b.createdAt);
    const toDelete = sorted.slice(0, unpinned.length - 20);

    for (const snapshot of toDelete) {
      try {
        await db.transact([tx.snapshots[snapshot.id].delete()]);
        console.log('Manual: Deleted successfully', snapshot.id);
      } catch (err) {
        console.error('Manual: Delete failed', err);
      }
    }
  };
}

async function subscribeToDocumentLocal() {
  currentYear = getStoredYear();
  renderYearOptions();

  const docs = getLocalDocuments().filter((doc) => doc.userId === currentUser.id);
  await applyDocumentsSnapshot(docs);
  hasCompletedInitialDocumentBootstrap = true;
  await hydrateCurrentYearFromMemory();
  setEditorBootstrapping(false);
  setSnippetCache(getLocalSnippets(currentUser.id));
}

function getDocumentsQuery() {
  return {
    documents: {
      $: {
        where: {
          userId: currentUser.id,
        },
      },
    },
  };
}

async function applyDocumentsSnapshot(docs) {
  documentsByYear.clear();

  const legacyDocs = docs.filter((doc) => !Number.isInteger(doc.year));
  if (legacyDocs.length && !hasMigratedLegacyDoc) {
    hasMigratedLegacyDoc = true;
    await migrateLegacyDocuments(legacyDocs, docs);
    return false;
  }

  docs.forEach((doc) => {
    const year = Number.isInteger(doc.year) ? doc.year : currentYear;
    documentsByYear.set(year, doc);
  });

  return true;
}

async function hydrateFreshDocumentsFromServer() {
  let didApply = true;

  try {
    const result = await db.queryOnce(getDocumentsQuery());
    const docs = result.data?.documents || [];
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

async function hydrateCurrentYearFromMemory() {
  if (!documentsByYear.size) {
    await createDocument(currentYear);
    return;
  }

  if (!documentsByYear.has(currentYear)) {
    const availableYears = getAvailableYears();
    currentYear = availableYears[0];
    storeActiveYear(currentYear);
  }

  renderYearOptions();
  loadYearDocument(currentYear);
}

async function createDocument(year = currentYear) {
  if (!currentUser || pendingDocumentYears.has(year)) return;
  const docId = createEntityId();
  pendingDocumentYears.add(year);
  const createdAt = Date.now();
  const nextDoc = {
    id: docId,
    userId: currentUser.id,
    year,
    content: year === currentYear ? $editor.value : '',
    createdAt,
    updatedAt: createdAt,
  };

  try {
    if (isDevBypass) {
      upsertLocalDocument(nextDoc);
    } else {
      await db.transact([
        tx.documents[docId].update({
          ...nextDoc,
        }),
      ]);
    }

    documentsByYear.set(year, nextDoc);
    if (year === currentYear) {
      currentDocId = docId;
      localUpdatedAt = nextDoc.updatedAt;
      if ($editor.value === nextDoc.content) {
        syncSaveTracking();
      } else {
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

async function migrateLegacyDocuments(legacyDocs, allDocs) {
  if (!currentUser || !legacyDocs.length || isDevBypass) return;

  const existingYears = new Set(allDocs.filter((doc) => Number.isInteger(doc.year)).map((doc) => doc.year));
  let targetYear = getStoredYear();

  for (const doc of legacyDocs) {
    while (existingYears.has(targetYear)) {
      targetYear -= 1;
    }

    try {
      await db.transact([
        tx.documents[doc.id].update({
          year: targetYear,
          updatedAt: doc.updatedAt || Date.now(),
        }),
      ]);
      existingYears.add(targetYear);
    } catch (err) {
      console.error('Error migrating legacy document:', err);
    }
  }
}

function getStoredYear() {
  const stored = parseInt(localStorage.getItem('onelist_active_year') || '', 10);
  return Number.isInteger(stored) ? stored : new Date().getFullYear();
}

function storeActiveYear(year) {
  localStorage.setItem('onelist_active_year', String(year));
}

function getAvailableYears() {
  return Array.from(documentsByYear.keys()).sort((a, b) => b - a);
}

function renderYearOptions() {
  if (!$yearSelect) return;

  const years = getAvailableYears();
  if (!years.length) {
    years.push(currentYear);
  }

  $yearSelect.innerHTML = '';
  years.forEach((year) => {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    if (year === currentYear) option.selected = true;
    $yearSelect.appendChild(option);
  });

  const addOption = document.createElement('option');
  addOption.value = '__add_year__';
  addOption.textContent = '+ Year';
  $yearSelect.appendChild(addOption);
}

function loadYearDocument(year) {
  const doc = documentsByYear.get(year);
  if (!doc) return;

  currentYear = year;
  currentDocId = doc.id;
  storeActiveYear(year);
  renderYearOptions();
  hydrateEditorFromDocument(doc);
}

function hydrateEditorFromDocument(doc, { allowConflict = true, allowBackupRestore = true } = {}) {
  if (!doc) return;

  const backupContent = localStorage.getItem(`onelist_backup_${doc.id}`);
  const backupTimeStr = localStorage.getItem(`onelist_backup_time_${doc.id}`);
  const serverUpdatedAt = doc.updatedAt || 0;
  const incomingContent = doc.content || '';

  // Local edits diverged from a newer remote version: merge silently and
  // persist the reconciled text so every device converges without a prompt.
  if (allowConflict && shouldMergeRemoteChanges(doc, incomingContent, serverUpdatedAt)) {
    mergeRemoteIntoEditor($editor.value, incomingContent, serverUpdatedAt, lastLocalEditAt);
    setEditorBootstrapping(false);
    return;
  }

  if (allowBackupRestore && backupContent && backupTimeStr) {
    const backupTime = parseInt(backupTimeStr, 10);

    if (
      shouldRestoreDraftBackup({
        backupContent,
        backupTime,
        serverContent: incomingContent,
        serverUpdatedAt,
        localUpdatedAt,
      })
    ) {
      console.log('[Recovery] Restoring unsaved draft from local backup');
      editorHistory.beforeEdit($editor);
      $editor.value = backupContent;
      saveCoordinator.markDirty(backupContent);
      updateLineCounter();
      editorHistory.clear();
      localUpdatedAt = serverUpdatedAt;
      baseContent = incomingContent;
      syncDocumentCache(backupContent);
      scheduleSave();
      setEditorBootstrapping(false);
      return;
    }

    if (
      shouldQueueBackupConflict({
        backupContent,
        backupTime,
        serverContent: incomingContent,
        serverUpdatedAt,
        localUpdatedAt,
      })
    ) {
      // Crash-recovery draft collides with a newer server version: merge them.
      mergeRemoteIntoEditor(backupContent, incomingContent, serverUpdatedAt, backupTime);
      setEditorBootstrapping(false);
      return;
    }

    if (backupTime <= serverUpdatedAt) {
      clearBackupForDocument(doc.id);
    }
  }

  const cursorPos = $editor.selectionStart;

  if ($editor.value !== incomingContent) {
    if (hasUnsavedEditorChanges() && serverUpdatedAt <= localUpdatedAt) {
      setEditorBootstrapping(false);
      return;
    }

    editorHistory.beforeEdit($editor);
    $editor.value = incomingContent;
    if (cursorPos <= $editor.value.length) {
      $editor.selectionStart = $editor.selectionEnd = cursorPos;
    }
  }

  localUpdatedAt = serverUpdatedAt;
  baseContent = incomingContent;
  lastSnapshotTime = 0;
  syncSaveTracking();
  updateLineCounter();
  editorHistory.clear();
  syncDocumentCache(incomingContent);
  setEditorBootstrapping(false);
  console.log(`[Sync] Loaded year ${doc.year} (${new Date(serverUpdatedAt || Date.now()).toISOString()})`);
}

function shouldMergeRemoteChanges(doc, incomingContent, serverUpdatedAt) {
  if (!currentDocId || doc.id !== currentDocId) return false;
  if (serverUpdatedAt <= localUpdatedAt) return false;
  if (!hasUnsavedEditorChanges()) return false;
  if ($editor.value === incomingContent) return false;
  return true;
}

// Reconcile a local version (`mineContent`) with a newer remote version
// (`serverContent`) via three-way merge against the shared ancestor, show the
// result, and schedule a save so the merged text propagates to other devices.
function mergeRemoteIntoEditor(mineContent, serverContent, serverUpdatedAt, mineUpdatedAt) {
  const merged = mergeByRecency(baseContent, mineContent, serverContent, {
    mineUpdatedAt: mineUpdatedAt || Date.now(),
    theirsUpdatedAt: serverUpdatedAt,
  });

  applyMergedContent(merged);
  localUpdatedAt = serverUpdatedAt;
  baseContent = serverContent;
  lastSnapshotTime = 0;
  editorHistory.clear();

  if (merged === serverContent) {
    clearBackupForDocument(currentDocId);
    syncSaveTracking();
    syncDocumentCache(merged);
    return;
  }

  syncDocumentCache(merged);
  scheduleSave();
  console.log('[Sync] Auto-merged remote changes into local edits');
}

function applyMergedContent(merged) {
  if ($editor.value === merged) return;

  const cursorPos = $editor.selectionStart;
  editorHistory.beforeEdit($editor);
  $editor.value = merged;
  const clamped = Math.min(cursorPos, merged.length);
  $editor.selectionStart = $editor.selectionEnd = clamped;
  updateLineCounter();
}

function clearBackupForDocument(docId) {
  localStorage.removeItem(`onelist_backup_${docId}`);
  localStorage.removeItem(`onelist_backup_time_${docId}`);
}

function writeDraftBackup(content) {
  if (!currentDocId || !currentUser) return;

  try {
    localStorage.setItem(`onelist_backup_${currentDocId}`, content);
    localStorage.setItem(`onelist_backup_time_${currentDocId}`, Date.now().toString());
    syncDocumentCache(content);
  } catch (err) {
    console.error('[Backup] Failed to persist draft backup:', err);
  }
}

// Date formatting: dd-MM-yyyy
function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function buildDateHeaderBlock(before, after, dateStr) {
  const header = `${dateStr}\n- `;

  if (!before && !after) return header;
  if (!before) return header;
  if (before.endsWith('\n\n')) return header;
  if (before.endsWith('\n')) return `\n${header}`;
  return `\n\n${header}`;
}

function appendTodayDateHeader() {
  if (!$editor) return;

  $editor.focus();

  const dateStr = formatDate(new Date());
  const pos = $editor.selectionStart;
  const before = $editor.value.slice(0, pos);
  const after = $editor.value.slice(pos);
  const addition = buildDateHeaderBlock(before, after, dateStr);

  editorHistory.beforeEdit($editor);
  $editor.value = before + addition + after;
  const newPos = pos + addition.length;
  $editor.selectionStart = $editor.selectionEnd = newPos;
  scheduleSave();
  updateLineCounter();
}

function isSlashMenuOpen() {
  return Boolean($slashMenu && !$slashMenu.hidden);
}

function hideSlashMenu() {
  if (!$slashMenu) return;
  $slashMenu.hidden = true;
  $slashMenu.setAttribute('aria-hidden', 'true');
  $slashMenu.innerHTML = '';
  slashMenuItems = [];
  slashMenuSelectedIndex = 0;
  slashMenuContext = null;
}

function positionSlashMenu() {
  if (!$slashMenu || !$editor || !slashMenuContext) return;

  const coords = getCaretCoordinates($editor, slashMenuContext.end);
  const wrapRect = $editorWrap?.getBoundingClientRect() || $editor.getBoundingClientRect();
  const menuHeight = $slashMenu.offsetHeight || 220;
  const lineHeight = coords.lineHeight || 24;
  let top = coords.top - wrapRect.top + lineHeight + 6;
  const maxTop = $editor.clientHeight - menuHeight - 8;

  if (top > maxTop) {
    top = Math.max(8, coords.top - wrapRect.top - menuHeight - 6);
  }

  const left = Math.max(
    8,
    Math.min(coords.left - wrapRect.left, $editor.clientWidth - $slashMenu.offsetWidth - 8)
  );

  $slashMenu.style.top = `${top}px`;
  $slashMenu.style.left = `${left}px`;
}

function renderSlashMenu() {
  if (!$slashMenu) return;

  $slashMenu.innerHTML = '';
  slashMenuItems.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `slash-menu-item${index === slashMenuSelectedIndex ? ' is-active' : ''}`;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', index === slashMenuSelectedIndex ? 'true' : 'false');

    const label = document.createElement('span');
    label.className = 'slash-menu-label';
    label.textContent = item.label;

    const description = document.createElement('span');
    description.className = 'slash-menu-description';
    description.textContent = item.description;

    const preview = document.createElement('span');
    preview.className = 'slash-menu-preview';
    preview.textContent = item.preview;

    button.append(label, description, preview);
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      applySlashMenuItem(index);
    });
    $slashMenu.appendChild(button);
  });

  $slashMenu.hidden = false;
  $slashMenu.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => positionSlashMenu());
}

function updateSlashMenu() {
  const previousFilter = slashMenuContext?.filter;
  const context = parseSlashContext($editor.value, $editor.selectionStart);
  if (!context?.token) {
    hideSlashMenu();
    return;
  }

  slashMenuContext = context;
  if (previousFilter !== context.filter) {
    slashMenuSelectedIndex = 0;
  }

  slashMenuItems = getSlashMenuItems(context.filter, snippetCache, formatDate);

  if (!slashMenuItems.length) {
    hideSlashMenu();
    return;
  }

  if (slashMenuSelectedIndex >= slashMenuItems.length) {
    slashMenuSelectedIndex = 0;
  }

  renderSlashMenu();
}

function applySlashMenuItem(index) {
  const item = slashMenuItems[index];
  if (!item || !slashMenuContext) return;
  applySlashCommand(`/${item.name}`, slashMenuContext.start);
}

function tryExpandSlashOnSpace() {
  const pos = $editor.selectionStart;
  if (pos < 2 || $editor.value[pos - 1] !== ' ') return false;

  const beforeSpace = $editor.value.slice(0, pos - 1);
  const match = beforeSpace.match(/(?:^|\s)(\/[a-zA-Z0-9_]+)$/);
  if (!match) return false;

  const token = match[1];
  const start = beforeSpace.length - token.length;
  applySlashCommand(token, start);
  return true;
}

function openSearchModal() {
  if ($app.style.display === 'none') return;

  openModal($searchModal);
  $searchScopeSelect.value = currentSearchScope;
  $searchInput.focus();
  if (typeof lucide !== 'undefined') {
    setTimeout(() => lucide.createIcons(), 0);
  }
}

function openHelpModal() {
  if ($app.style.display === 'none') return;

  openModal($helpModal);
  if (typeof lucide !== 'undefined') {
    setTimeout(() => lucide.createIcons(), 0);
  }
}



// Profile menu toggle
$btnProfile.addEventListener('click', () => {
  const isOpen = $profileDropdown.getAttribute('aria-hidden') === 'false';
  if (isOpen) {
    $profileDropdown.setAttribute('aria-hidden', 'true');
    $editor.focus();
  } else {
    $profileDropdown.setAttribute('aria-hidden', 'false');
  }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.profile-menu')) {
    if ($profileDropdown.getAttribute('aria-hidden') === 'false') {
      $profileDropdown.setAttribute('aria-hidden', 'true');
      $editor.focus();
    }
  }
});

// Year selector
$yearSelect.addEventListener('change', async () => {
  const selectedValue = $yearSelect.value;

  if (selectedValue === '__add_year__') {
    $yearSelect.value = String(currentYear);
    await promptForNewYear();
    return;
  }

  const nextYear = parseInt(selectedValue, 10);
  if (!Number.isInteger(nextYear) || nextYear === currentYear) return;

  if (!(await ensureCurrentDocumentIsSafe('switch years'))) {
    $yearSelect.value = String(currentYear);
    return;
  }

  const doc = documentsByYear.get(nextYear);
  if (doc) {
    loadYearDocument(nextYear);
    return;
  }

  currentYear = nextYear;
  storeActiveYear(nextYear);
  currentDocId = null;
  renderYearOptions();
  $editor.value = '';
  editorHistory.clear();
  hideSlashMenu();
  syncSaveTracking();
  updateLineCounter();
  await createDocument(nextYear);
});

// Profile menu buttons
$btnExportYearMenu.addEventListener('click', () => {
  const doc = documentsByYear.get(currentYear);
  downloadText(doc?.content || $editor.value, getYearFilename(currentYear));
  $profileDropdown.setAttribute('aria-hidden', 'true');
  $editor.focus();
});

$btnExportAllMenu.addEventListener('click', async () => {
  clearSaveTimer();
  await persistContent(true);
  exportAllYears();
  $profileDropdown.setAttribute('aria-hidden', 'true');
  $editor.focus();
});

$btnSnapshotsMenu.addEventListener('click', () => {
  showSnapshotsModal();
  $profileDropdown.setAttribute('aria-hidden', 'true');
  $editor.focus();
});

// Snippets menu
$btnSnippetsMenu.addEventListener('click', async () => {
  await showSnippetsModal();
  $profileDropdown.setAttribute('aria-hidden', 'true');
  $editor.focus();
});

// Settings menu
$btnSettingsMenu.addEventListener('click', async () => {
  await showSettingsModal();
  $profileDropdown.setAttribute('aria-hidden', 'true');
});

$btnHelpMenu.addEventListener('click', () => {
  openHelpModal();
  $profileDropdown.setAttribute('aria-hidden', 'true');
});

// Search modal
$btnSearchModal.addEventListener('click', openSearchModal);

$btnAppendDate.addEventListener('mousedown', (e) => {
  e.preventDefault();
});
$btnAppendDate.addEventListener('click', appendTodayDateHeader);

$btnRunSearch.addEventListener('click', () => {
  runSearch();
});

$searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    runSearch();
  }
});

$searchScopeSelect.addEventListener('change', () => {
  currentSearchScope = $searchScopeSelect.value || 'current';
  if ($searchInput.value.trim()) {
    runSearch();
  }
});

function runSearch() {
  const q = $searchInput.value.trim();
  $searchResultsModal.innerHTML = '';
  if (!q) return;

  const results = searchDocuments(q);

  if (!results.length) {
    const div = document.createElement('div');
    div.className = 'no-results';
    div.textContent = 'No matches';
    $searchResultsModal.appendChild(div);
    return;
  }

  results.forEach(({ i, line, year }) => {
    const item = document.createElement('div');
    item.className = 'result';
    const yearLabel = currentSearchScope === 'all' ? `<span class="result-year">${year}</span>` : '';
    item.innerHTML = `${yearLabel}<span class="line-num">#${i + 1}</span>${escapeHtml(line)}`;
    item.addEventListener('click', async () => {
      await focusSearchResult(year, i, q);
    });
    $searchResultsModal.appendChild(item);
  });
}

// Slash commands: /today /tomorrow -> dd-MM-yyyy, /time -> H:M, /line -> 36 hyphens
function applySlashCommand(token, startOverride) {
  const pos = $editor.selectionEnd;
  const before = $editor.value.slice(0, pos);
  const after = $editor.value.slice(pos);
  const start = Number.isInteger(startOverride)
    ? startOverride
    : before.length - token.length;
  let replacement;

  if (token !== '/today' && token !== '/tomorrow' && token !== '/time' && token !== '/line') {
    const snippetName = token.slice(1);
    if (!snippetsByName.get(snippetName)?.content) {
      return;
    }
  }

  editorHistory.beforeEdit($editor);

  if (token === '/today') {
    replacement = formatDate(new Date());
  } else if (token === '/tomorrow') {
    replacement = formatDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
  } else if (token === '/time') {
    const now = new Date();
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    replacement = `(${hours}:${minutes})`;
  } else if (token === '/line') {
    replacement = '-'.repeat(36);

    const lineStart = before.lastIndexOf('\n') + 1;
    const currentLine = before.slice(lineStart);

    if (currentLine.trim() === '- /line') {
      const beforeLineStart = $editor.value.slice(0, lineStart);
      const replaced = beforeLineStart + replacement + after;
      $editor.value = replaced;
      const newPos = lineStart + replacement.length;
      $editor.selectionStart = $editor.selectionEnd = newPos;
      hideSlashMenu();
      scheduleSave();
      updateLineCounter();
      return;
    }
  } else {
    const snippetName = token.slice(1);
    handleSnippetCommand(snippetName, start, before, after);
    hideSlashMenu();
    scheduleSave();
    updateLineCounter();
    return;
  }

  const replaced = $editor.value.slice(0, start) + replacement + after;
  $editor.value = replaced;

  const newPos = start + replacement.length;
  $editor.selectionStart = $editor.selectionEnd = newPos;
  hideSlashMenu();
  scheduleSave();
  updateLineCounter();
}

function handleSnippetCommand(snippetName, start, before, after) {
  const snippet = snippetsByName.get(snippetName);
  if (!snippet?.content) return;

  const expanded = expandSnippetCommand({
    after,
    before,
    snippetContent: snippet.content,
    snippetName,
    start,
  });
  if (!expanded) return;

  $editor.value = expanded.value;
  $editor.selectionStart = expanded.selectionStart;
  $editor.selectionEnd = expanded.selectionEnd;
}

// Search
function updateSearchResults() {
  const q = $searchInput.value.trim();
  $results.innerHTML = '';
  if (!q) return;

  const lines = $editor.value.split('\n');
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes(q.toLowerCase())) {
      results.push({ i, line });
    }
  }

  if (!results.length) {
    const div = document.createElement('div');
    div.className = 'no-results';
    div.textContent = 'No matches';
    $results.appendChild(div);
    return;
  }

  results.forEach(({ i, line }) => {
    const item = document.createElement('div');
    item.className = 'result';
    item.innerHTML = `<span class="line-num">#${i + 1}</span>${escapeHtml(
      line
    )}`;
    item.addEventListener('click', () => focusLine(i));
    $results.appendChild(item);
  });
}

function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
      c
    ])
  );
}

// Focus line in textarea
function focusLine(lineIndex, searchTerm = '') {
  const lines = $editor.value.split('\n');
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  const lineText = lines[lineIndex] || '';
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const matchIndex = normalizedSearch ? lineText.toLowerCase().indexOf(normalizedSearch) : -1;
  const selectionStart = matchIndex >= 0 ? offset + matchIndex : offset;
  const selectionEnd = matchIndex >= 0 ? selectionStart + searchTerm.length : offset + lineText.length;

  $editor.focus();
  $editor.setSelectionRange(selectionStart, selectionEnd);
  scrollSelectionIntoView(selectionStart);
}

function scrollSelectionIntoView(selectionStart) {
  const computed = window.getComputedStyle($editor);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  const textBefore = $editor.value.slice(0, selectionStart);

  const mirroredProperties = [
    'boxSizing',
    'width',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textTransform',
    'textIndent',
    'whiteSpace',
    'wordBreak',
    'overflowWrap'
  ];

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordBreak = 'break-word';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';

  mirroredProperties.forEach((property) => {
    mirror.style[property] = computed[property];
  });

  mirror.textContent = textBefore;
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const markerTop = marker.offsetTop;
  const lineHeight = parseFloat(computed.lineHeight) || 24;
  const targetScrollTop = Math.max(0, markerTop - ($editor.clientHeight / 2) + lineHeight);

  document.body.removeChild(mirror);
  $editor.scrollTop = targetScrollTop;
}

function searchDocuments(query) {
  const queryInfo = parseSearchQuery(query);
  if (queryInfo.type === 'empty') return [];

  const sources = currentSearchScope === 'all'
    ? getAvailableYears().map((year) => ({
        year,
        content: year === currentYear ? $editor.value : (documentsByYear.get(year)?.content || ''),
      }))
    : [{
        year: currentYear,
        content: $editor.value,
      }];

  const results = [];

  sources.forEach(({ year, content }) => {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (lineMatchesQuery(line, queryInfo)) {
        results.push({ year, i, line });
      }
    }
  });

  return results;
}

async function focusSearchResult(year, lineIndex, searchTerm) {
  closeModal($searchModal);

  if (year !== currentYear) {
    if (!(await ensureCurrentDocumentIsSafe('jump to another year'))) {
      return;
    }
    loadYearDocument(year);
  }

  await waitForNextFrame();
  await waitForNextFrame();
  focusLine(lineIndex, searchTerm);
}

function waitForNextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// Save (throttled) + snapshots
function scheduleSave() {
  writeDraftBackup($editor.value);
  saveCoordinator.markDirty($editor.value);
  clearSaveTimer();
  saveTimer = setTimeout(() => {
    persistContent().catch(handleSaveError);
  }, 300);
}

async function persistContent(isForced = false) {
  try {
    return await saveCoordinator.flush({ forced: isForced });
  } catch (err) {
    handleSaveError(err);
    if (!isForced) {
      showToast('Failed to save your document. Please try again.', { type: 'error' });
    }
    return false;
  }
}

async function ensureCurrentDocumentIsSafe(nextActionLabel = 'continue') {
  clearSaveTimer();
  await persistContent(true);

  if (hasUnsavedEditorChanges()) {
    showToast(`We could not save your latest changes yet. Please try again before you ${nextActionLabel}.`, { type: 'error' });
    return false;
  }

  return true;
}

async function saveSnapshot(content, year = currentYear) {
  if (!currentUser) return;

  // Optimization: Only save snapshot if enough time has passed
  const now = Date.now();
  if (now - lastSnapshotTime < SNAPSHOT_INTERVAL) {
    return;
  }

  const snapshotId = createEntityId();

  try {
    const snapshot = {
      id: snapshotId,
      userId: currentUser.id,
      year,
      content,
      createdAt: now,
      pinned: false,
    };

    if (isDevBypass) {
      addLocalSnapshot(snapshot);
    } else {
      await db.transact([
        tx.snapshots[snapshotId].update(snapshot),
      ]);
    }

    lastSnapshotTime = now;
    // Cleanup is handled by the snapshot subscription
  } catch (err) {
    console.error('Error saving snapshot:', err);
  }
}

function placeCursorAtEnd() {
  $editor.focus();
  const len = $editor.value.length;
  $editor.selectionStart = $editor.selectionEnd = len;
  $editor.scrollTop = $editor.scrollHeight;
}

async function promptForNewYear() {
  const suggestedYear = Math.max(new Date().getFullYear(), ...getAvailableYears(), currentYear) + 1;
  const normalizedInput = await openNewYearModal(String(suggestedYear));
  if (normalizedInput === null) {
    renderYearOptions();
    return;
  }

  const nextYear = parseInt(normalizedInput, 10);

  if (!(await ensureCurrentDocumentIsSafe('switch years'))) {
    renderYearOptions();
    return;
  }

  if (documentsByYear.has(nextYear)) {
    loadYearDocument(nextYear);
    return;
  }

  currentYear = nextYear;
  storeActiveYear(nextYear);
  currentDocId = null;
  renderYearOptions();
  $editor.value = '';
  editorHistory.clear();
  hideSlashMenu();
  syncSaveTracking();
  localUpdatedAt = 0;
  updateLineCounter();
  await createDocument(nextYear);
}

function openNewYearModal(defaultValue) {
  return new Promise((resolve) => {
    newYearResolver = resolve;
    $newYearError.textContent = '';
    $newYearInput.value = defaultValue;
    openModal($newYearModal);
    requestAnimationFrame(() => {
      $newYearInput.focus();
      $newYearInput.select();
    });
  });
}

function resolveNewYearModal(value) {
  if (!newYearResolver) return;
  const resolver = newYearResolver;
  newYearResolver = null;
  closeModal($newYearModal);
  resolver(value);
}

// Export
function downloadText(text, filename) {
  // Generate default filename with app name, date, and time if not provided
  if (!filename) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    let hh = now.getHours();
    const min = String(now.getMinutes()).padStart(2, '0');
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12; // Convert to 12-hour format
    const hhStr = String(hh).padStart(2, '0');
    filename = `OneList (${dd}-${mm}-${yyyy} at ${hhStr}:${min} ${ampm}).txt`;
  }
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getYearFilename(year) {
  return `OneList ${year}.txt`;
}

function exportAllYears() {
  const years = getAvailableYears();
  const exportYears = years.length ? years : [currentYear];
  const combined = buildAllYearsExport(exportYears, (year) => {
    if (year === currentYear) {
      return $editor.value;
    }
    return documentsByYear.get(year)?.content || '';
  });

  downloadText(combined, getAllYearsExportFilename());
}

// Snapshots modal
async function showSnapshotsModal() {
  if (!currentUser) return;

  const allSnapshots = isDevBypass
    ? getLocalSnapshots(currentUser.id)
    : (await db.queryOnce({
        snapshots: {
          $: {
            where: {
              userId: currentUser.id,
            },
          },
        },
      })).data?.snapshots || [];

  // Separate pinned and unpinned snapshots
  const yearSnapshots = allSnapshots.filter(
    (snapshot) => (snapshot.year || currentYear) === currentYear
  );
  const pinnedSnapshots = yearSnapshots.filter(s => s.pinned).sort(
    (a, b) => b.createdAt - a.createdAt
  );
  const unpinnedSnapshots = yearSnapshots.filter(s => !s.pinned).sort(
    (a, b) => b.createdAt - a.createdAt
  );

  const $list = document.getElementById('snapshot-list');
  $list.innerHTML = '';

  if (!yearSnapshots.length) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="time">No snapshots yet</span>';
    $list.appendChild(li);
  } else {
    // Display pinned snapshots first
    if (pinnedSnapshots.length > 0) {
      const pinnedHeader = document.createElement('li');
      pinnedHeader.className = 'snapshot-group-header';
      pinnedHeader.textContent = 'Pinned Snapshots';
      $list.appendChild(pinnedHeader);

      pinnedSnapshots.forEach((snapshot) => {
        appendSnapshotItem(snapshot, $list, true);
      });
    }

    // Display unpinned snapshots
    if (unpinnedSnapshots.length > 0) {
      if (pinnedSnapshots.length > 0) {
        const unpinnedHeader = document.createElement('li');
        unpinnedHeader.className = 'snapshot-group-header';
        unpinnedHeader.textContent = `Dynamic Snapshots (${unpinnedSnapshots.length}/20)`;
        $list.appendChild(unpinnedHeader);
      }

      unpinnedSnapshots.forEach((snapshot) => {
        appendSnapshotItem(snapshot, $list, false);
      });
    }
  }

  const $title = document.getElementById('snapshots-title');
  if ($title) {
    $title.textContent = `Snapshots (${currentYear})`;
  }

  openModal($snapshotsModal);
}

function appendSnapshotItem(snapshot, $list, isPinned) {
  const li = document.createElement('li');
  const time = new Date(snapshot.createdAt).toLocaleString();

  const timeSpan = document.createElement('span');
  timeSpan.className = 'time';
  timeSpan.textContent = time;

  const actions = document.createElement('div');
  actions.className = 'actions';

  const restoreBtn = document.createElement('button');
  restoreBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
  restoreBtn.setAttribute('aria-label', 'Restore');
  restoreBtn.title = 'Restore';
  restoreBtn.addEventListener('click', async () => {
    editorHistory.beforeEdit($editor);
    $editor.value = snapshot.content || '';
    syncSaveTracking();
    scheduleSave();
    closeModal($snapshotsModal);
  });

  const downloadBtn = document.createElement('button');
  downloadBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  downloadBtn.setAttribute('aria-label', 'Download');
  downloadBtn.title = 'Download';
  downloadBtn.addEventListener('click', () => {
    downloadText(snapshot.content || '', `OneList snapshot ${snapshot.year || currentYear} - ${snapshot.createdAt}.txt`);
  });

  const pinBtn = document.createElement('button');
  pinBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>';
  pinBtn.setAttribute('aria-label', isPinned ? 'Unpin' : 'Pin');
  pinBtn.title = isPinned ? 'Unpin' : 'Pin';
  pinBtn.className = isPinned ? 'pin-btn pinned' : 'pin-btn';
  pinBtn.addEventListener('click', async () => {
    try {
      if (isDevBypass) {
        updateLocalSnapshot(snapshot.id, { pinned: !isPinned });
      } else {
        await db.transact([
          tx.snapshots[snapshot.id].update({
            pinned: !isPinned,
          }),
        ]);
      }
      showSnapshotsModal();
    } catch (err) {
      console.error('Error toggling pin:', err);
      showToast('Failed to update snapshot. Please try again.', { type: 'error' });
    }
  });

  actions.appendChild(restoreBtn);
  actions.appendChild(downloadBtn);
  actions.appendChild(pinBtn);

  li.appendChild(timeSpan);
  li.appendChild(actions);
  $list.appendChild(li);
}

// Modal helpers
function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((el) => !el.disabled && el.getAttribute('aria-hidden') !== 'true');
}

function getOpenModal() {
  if (activeModal?.getAttribute('aria-hidden') === 'false') {
    return activeModal;
  }

  return Array.from(document.querySelectorAll('.modal')).find(
    (modal) => modal.getAttribute('aria-hidden') === 'false'
  ) || null;
}

function openModal(modal) {
  if (activeModal && activeModal !== modal) {
    closeModal(activeModal);
  }

  modalReturnFocus = document.activeElement;
  modal.setAttribute('aria-hidden', 'false');
  activeModal = modal;

  requestAnimationFrame(() => {
    const content = modal.querySelector('.modal-content');
    if (!content) return;
    const [firstFocusable] = getFocusableElements(content);
    firstFocusable?.focus();
  });
}

function closeModal(modal) {
  modal.setAttribute('aria-hidden', 'true');

  if (activeModal === modal) {
    activeModal = null;
  }

  const returnTarget = modalReturnFocus;
  modalReturnFocus = null;

  if (returnTarget && typeof returnTarget.focus === 'function' && document.contains(returnTarget)) {
    returnTarget.focus();
  } else if ($editor && $app.style.display !== 'none') {
    $editor.focus();
  }
}

function dismissTopModal() {
  const modal = getOpenModal();
  if (!modal) return false;

  if (modal === $newYearModal && newYearResolver) {
    resolveNewYearModal(null);
    return true;
  }

  closeModal(modal);
  return true;
}

function handleModalTabTrap(e) {
  if (e.key !== 'Tab') return;

  const modal = getOpenModal();
  if (!modal) return;

  const content = modal.querySelector('.modal-content');
  if (!content) return;

  const focusable = getFocusableElements(content);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

document.addEventListener('keydown', (e) => {
  handleModalTabTrap(e);

  if (e.key !== 'Escape') return;

  if (dismissTopModal()) {
    e.preventDefault();
    return;
  }

  if ($profileDropdown?.getAttribute('aria-hidden') === 'false') {
    $profileDropdown.setAttribute('aria-hidden', 'true');
    $editor?.focus();
    e.preventDefault();
  }
});

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;

  if (e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    openSearchModal();
    return;
  }

  if (e.key === 'f' || e.key === 'F') {
    if ($app.style.display === 'none') return;
    e.preventDefault();
    openSearchModal();
    return;
  }

  if (e.key === '/') {
    e.preventDefault();
    openHelpModal();
    return;
  }

  if (e.shiftKey && (e.key === 'd' || e.key === 'D')) {
    if ($app.style.display === 'none') return;
    e.preventDefault();
    appendTodayDateHeader();
  }
});

Array.from(document.querySelectorAll('.modal .modal-close')).forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (!modal) return;
    if (modal === $newYearModal && newYearResolver) {
      resolveNewYearModal(null);
      return;
    }
    closeModal(modal);
  });
});

Array.from(document.querySelectorAll('.modal')).forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      if (modal === $newYearModal && newYearResolver) {
        resolveNewYearModal(null);
        return;
      }
      closeModal(modal);
    }
  });
});

$newYearInput.addEventListener('input', () => {
  const digitsOnly = $newYearInput.value.replace(/\D/g, '').slice(0, 4);
  if ($newYearInput.value !== digitsOnly) {
    $newYearInput.value = digitsOnly;
  }
  if ($newYearError.textContent) {
    $newYearError.textContent = '';
  }
});

$newYearInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $btnConfirmNewYear.click();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    resolveNewYearModal(null);
  }
});

$btnCancelNewYear.addEventListener('click', () => {
  resolveNewYearModal(null);
});

$btnConfirmNewYear.addEventListener('click', () => {
  const normalizedInput = $newYearInput.value.trim();
  if (!/^\d{4}$/.test(normalizedInput)) {
    $newYearError.textContent = 'Please enter exactly 4 numbers.';
    $newYearInput.focus();
    return;
  }
  resolveNewYearModal(normalizedInput);
});

// Events
$editor.addEventListener('beforeinput', (e) => {
  if (isHistoryInput(e)) {
    e.preventDefault();
    return;
  }

  editorHistory.markBurstStart($editor);
});

$editor.addEventListener('input', () => {
  lastLocalEditAt = Date.now();

  if (tryExpandSlashOnSpace()) {
    hideSlashMenu();
  } else {
    updateSlashMenu();
  }

  editorHistory.recordDebounced($editor);
  scheduleSave();
  updateLineCounter();
});

$editor.addEventListener('keydown', (e) => {
  if (!isUndoShortcut(e)) return;

  e.preventDefault();
  e.stopPropagation();

  if (editorHistory.undo($editor)) {
    hideSlashMenu();
    scheduleSave();
    updateLineCounter();
  }
}, true);

$editor.addEventListener('keydown', (e) => {
  if (isUndoShortcut(e)) {
    return;
  }

  if (e.key === 'Backspace' || e.key === 'Delete') {
    editorHistory.prepareDeleteBurst($editor);
  } else if (
    e.key.length === 1 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey
  ) {
    editorHistory.markBurstStart($editor);
  }

  if (isSlashMenuOpen()) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      slashMenuSelectedIndex = (slashMenuSelectedIndex + 1) % slashMenuItems.length;
      renderSlashMenu();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      slashMenuSelectedIndex =
        (slashMenuSelectedIndex - 1 + slashMenuItems.length) % slashMenuItems.length;
      renderSlashMenu();
      return;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applySlashMenuItem(slashMenuSelectedIndex);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      hideSlashMenu();
      return;
    }
  }

  // Enter -> add hyphen, Shift+Enter -> plain newline
  if (e.key === 'Enter') {
    e.preventDefault();
    hideSlashMenu();

    const pos = $editor.selectionStart;
    const before = $editor.value.slice(0, pos);
    const after = $editor.value.slice($editor.selectionEnd);

    editorHistory.beforeEdit($editor);

    if (e.shiftKey) {
      $editor.value = before + '\n' + after;
      const newPos = pos + 1;
      $editor.selectionStart = $editor.selectionEnd = newPos;
    } else {
      $editor.value = before + '\n- ' + after;
      const newPos = pos + 3;
      $editor.selectionStart = $editor.selectionEnd = newPos;
    }

    scheduleSave();
    updateLineCounter();
  }
});

$editor.addEventListener('blur', () => {
  window.setTimeout(() => {
    if (!$slashMenu?.contains(document.activeElement)) {
      hideSlashMenu();
    }
  }, 120);
});

$editor.addEventListener('scroll', () => {
  if (isSlashMenuOpen()) {
    positionSlashMenu();
  }
});

// ==================== CRITICAL: PREVENT DATA LOSS ON APP SUSPENSION ====================

// Save immediately when user switches tabs or minimizes app (CRITICAL for PWA!)
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    clearSaveTimer();
    await persistContent(true);
    return;
  }

  await refreshRemoteDocumentIfNeeded();
});

// Save immediately when user closes tab/window
window.addEventListener('beforeunload', (e) => {
  clearSaveTimer();
  
  // Create localStorage backup as safety net (synchronous)
  if (currentDocId && currentUser && $editor) {
    try {
      const content = $editor.value;
      const timestamp = Date.now();
      localStorage.setItem(`onelist_backup_${currentDocId}`, content);
      localStorage.setItem(`onelist_backup_time_${currentDocId}`, timestamp.toString());
      console.log('[Backup] Created localStorage backup on beforeunload');
    } catch (err) {
      console.error('[Backup] Failed to create localStorage backup:', err);
    }
  }
  
  // Also attempt async save (browser may or may not wait)
  persistContent(true);
});

// Save immediately on page hide (more reliable on mobile PWA)
window.addEventListener('pagehide', (e) => {
  clearSaveTimer();
  
  // Create localStorage backup as safety net (synchronous)
  if (currentDocId && currentUser && $editor) {
    try {
      const content = $editor.value;
      const timestamp = Date.now();
      localStorage.setItem(`onelist_backup_${currentDocId}`, content);
      localStorage.setItem(`onelist_backup_time_${currentDocId}`, timestamp.toString());
      console.log('[Backup] Created localStorage backup on pagehide');
    } catch (err) {
      console.error('[Backup] Failed to create localStorage backup:', err);
    }
  }
  
  // Also attempt async save
  persistContent(true);
});

// Monitor online/offline status
window.addEventListener('online', () => {
  refreshSaveIndicator();
  console.log('[OneList] Back online - syncing...');
  refreshRemoteDocumentIfNeeded()
    .then(() => {
      if (currentDocId && currentUser && hasUnsavedEditorChanges()) {
        persistContent(true).catch(handleSaveError);
      }
      if (hasPendingAppUpdate && $updateBanner?.getAttribute('aria-hidden') !== 'false') {
        showUpdateBanner('Update is ready. Refresh when you are ready.');
      }
    })
    .catch((err) => {
      console.warn('[Sync] Failed to refresh after reconnect:', err);
    });
});

window.addEventListener('offline', () => {
  updateSaveIndicator('offline');
  console.log('[OneList] Offline - edits stay on this device until you reconnect');
});

// Update save indicator in UI
function updateSaveIndicator(status) {
  lastSaveStatus = status;
  const indicator = $saveIndicator;
  if (!indicator) return;

  indicator.disabled = true;
  indicator.removeAttribute('aria-label');

  switch (status) {
    case 'saving':
      indicator.textContent = 'Saving...';
      indicator.className = 'save-indicator saving';
      indicator.hidden = false;
      break;
    case 'saved':
      indicator.textContent = 'Saved';
      indicator.className = 'save-indicator saved';
      indicator.hidden = false;
      setTimeout(() => {
        if (lastSaveStatus === 'saved') {
          indicator.hidden = true;
        }
      }, 2000);
      break;
    case 'offline':
      indicator.textContent = hasUnsavedEditorChanges() ? 'Unsynced offline' : 'Offline';
      indicator.className = 'save-indicator offline';
      indicator.hidden = false;
      break;
    case 'error':
      indicator.textContent = 'Save failed';
      indicator.className = 'save-indicator error';
      indicator.hidden = false;
      break;
  }
}

function refreshSaveIndicator() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    updateSaveIndicator('offline');
    return;
  }

  if (hasUnsavedEditorChanges()) {
    updateSaveIndicator('saving');
    return;
  }

  updateSaveIndicator('saved');
}

// Update line counter
function updateLineCounter() {
  if (!$lineCount || !$wordCount) return;
  
  const content = $editor.value;
  
  // Count non-empty lines
  const lines = content.split('\n');
  const nonEmptyLines = lines.filter(line => line.trim().length > 0);
  const lineCount = nonEmptyLines.length;
  
  // Count words (split by whitespace and filter out empty strings)
  const words = content.trim().split(/\s+/).filter(word => word.length > 0);
  const wordCount = content.trim().length > 0 ? words.length : 0;
  
  $lineCount.textContent = lineCount;
  $wordCount.textContent = wordCount;
}

// Text formatting functions
function loadTextFormatting() {
  const savedSize = localStorage.getItem('editorFontSize');
  const savedFamily = localStorage.getItem('editorFontFamily');

  if (savedSize) {
    const size = parseInt(savedSize, 10);
    // Validate font size is within acceptable range
    if (size >= MIN_FONT_SIZE && size <= MAX_FONT_SIZE) {
      currentFontSize = size;
    }
  }
  if (savedFamily) {
    // Only apply if it's in the allowed list
    const allowedFamilies = ['google-sans-flex', 'serif', 'sans-serif', 'cursive', 'system-ui'];
    if (allowedFamilies.includes(savedFamily)) {
      currentFontFamily = savedFamily;
    }
  }

  applyTextFormatting();
  updateFormatDisplay();
}

function applyTextFormatting() {
  $editor.style.fontSize = `${currentFontSize}px`;

  // Apply font family with fallbacks
  const fontFamilyMap = {
    'google-sans-flex': "'Google Sans Flex', 'Google Sans', system-ui, sans-serif",
    'serif': "'Georgia', 'Times New Roman', serif",
    'sans-serif': "'Google Sans Flex', 'Google Sans', 'Helvetica Neue', Arial, sans-serif",
    'cursive': "'Comic Sans MS', 'Apple Chancery', cursive",
    'system-ui': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  };

  $editor.style.fontFamily = fontFamilyMap[currentFontFamily] || fontFamilyMap['google-sans-flex'];
}

function updateFormatDisplay() {
  $fontSizeDisplay.textContent = `${currentFontSize}px`;
  $fontFamilySelect.value = currentFontFamily;
}

function saveTextFormatting() {
  localStorage.setItem('editorFontSize', currentFontSize.toString());
  localStorage.setItem('editorFontFamily', currentFontFamily);
}

function resetTextFormatting() {
  currentFontSize = DEFAULT_FONT_SIZE;
  currentFontFamily = DEFAULT_FONT_FAMILY;
  applyTextFormatting();
  updateFormatDisplay();
  saveTextFormatting();
}

// Text format modal
$btnTextFormat.addEventListener('click', () => {
  openModal($textFormatModal);
  updateFormatDisplay();
  $profileDropdown.setAttribute('aria-hidden', 'true');
  $editor.focus();
});

$btnIncreaseSize.addEventListener('click', () => {
  if (currentFontSize < MAX_FONT_SIZE) {
    currentFontSize++;
    applyTextFormatting();
    updateFormatDisplay();
  }
});

$btnDecreaseSize.addEventListener('click', () => {
  if (currentFontSize > MIN_FONT_SIZE) {
    currentFontSize--;
    applyTextFormatting();
    updateFormatDisplay();
  }
});

$fontFamilySelect.addEventListener('change', () => {
  currentFontFamily = $fontFamilySelect.value;
  applyTextFormatting();
});

$btnSaveFormat.addEventListener('click', () => {
  saveTextFormatting();
  closeModal($textFormatModal);
  // Optional: show a brief confirmation
  const originalText = $btnSaveFormat.textContent;
  $btnSaveFormat.textContent = 'Saved!';
  setTimeout(() => {
    $btnSaveFormat.textContent = originalText;
  }, 1000);
});

$btnResetFormat.addEventListener('click', async () => {
  if (await showConfirm('Reset text formatting to default settings?')) {
    resetTextFormatting();
  }
});

// Snippets modal
async function showSnippetsModal() {
  if (!currentUser) return;
  const snippets = snippetCache;

  $snippetList.innerHTML = '';

  if (!snippets.length) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="empty-msg">No snippets yet. Create one to get started.</span>';
    $snippetList.appendChild(li);
  } else {
    snippets.forEach((snippet) => {
      const li = document.createElement('li');
      li.className = 'snippet-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'snippet-name';
      nameSpan.textContent = `/${snippet.name}`;

      const actions = document.createElement('div');
      actions.className = 'actions';

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        editSnippet(snippet);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        if (await showConfirm(`Delete snippet /${snippet.name}?`)) {
          if (isDevBypass) {
            deleteLocalSnippet(snippet.id);
          } else {
            await db.transact([tx.snippets[snippet.id].delete()]);
          }
          removeSnippetFromCache(snippet.id);
          showSnippetsModal();
        }
      });

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(nameSpan);
      li.appendChild(actions);
      $snippetList.appendChild(li);
    });
  }

  currentEditingSnippetId = null;
  showSnippetsListView();
  openModal($snippetsModal);
}

function showSnippetsListView() {
  $snippetsListView.style.display = 'block';
  $snippetsFormView.style.display = 'none';
  $snippetName.value = '';
  $snippetContent.value = '';
}

function showSnippetsFormView() {
  $snippetsListView.style.display = 'none';
  $snippetsFormView.style.display = 'block';
  $snippetName.focus();
}

function editSnippet(snippet) {
  currentEditingSnippetId = snippet.id;
  $snippetName.value = snippet.name || '';
  $snippetContent.value = snippet.content || '';
  showSnippetsFormView();
}

// Snippets form handlers
$btnCreateSnippet.addEventListener('click', () => {
  currentEditingSnippetId = null;
  $snippetName.value = '';
  $snippetContent.value = '';
  showSnippetsFormView();
});

$btnSaveSnippet.addEventListener('click', async () => {
  const name = $snippetName.value.trim().toLowerCase();
  const content = $snippetContent.value.trim();

  if (!name) {
    showToast('Please enter a snippet name', { type: 'error' });
    return;
  }

  if (!content) {
    showToast('Please enter snippet content', { type: 'error' });
    return;
  }

  // Validate name format (alphanumeric and underscore only)
  if (!/^[a-z0-9_]+$/.test(name)) {
    showToast('Snippet name must contain only letters, numbers, and underscores (no spaces)', { type: 'error' });
    return;
  }

  // Validate name length (max 17 characters)
  if (name.length > 17) {
    showToast('Snippet name must be 17 characters or less', { type: 'error' });
    return;
  }

  try {
    if (currentEditingSnippetId) {
      const updatedAt = Date.now();
      const existingSnippet = snippetCache.find(
        (snippet) => snippet.id === currentEditingSnippetId
      );
      const nextSnippet = {
        ...(existingSnippet || {}),
        id: currentEditingSnippetId,
        userId: currentUser.id,
        name,
        content,
        updatedAt,
      };

      if (isDevBypass) {
        upsertLocalSnippet(nextSnippet);
      } else {
        await db.transact([
          tx.snippets[currentEditingSnippetId].update({
            name,
            content,
            updatedAt,
          }),
        ]);
      }

      upsertSnippetCache(nextSnippet);
    } else {
      const snippetId = createEntityId();
      const createdAt = Date.now();
      const nextSnippet = {
        createdAt,
        id: snippetId,
        name,
        content,
        updatedAt: createdAt,
        userId: currentUser.id,
      };

      if (isDevBypass) {
        upsertLocalSnippet(nextSnippet);
      } else {
        await db.transact([
          tx.snippets[snippetId].update(nextSnippet),
        ]);
      }

      upsertSnippetCache(nextSnippet);
    }

    showSnippetsModal();
  } catch (err) {
    showToast('Error saving snippet: ' + err.message, { type: 'error' });
  }
});

$btnCancelSnippet.addEventListener('click', () => {
  showSnippetsListView();
});

// Snippet content keydown handler
$snippetContent.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const pos = $snippetContent.selectionStart;
    const before = $snippetContent.value.slice(0, pos);
    const after = $snippetContent.value.slice($snippetContent.selectionEnd);

    if (e.shiftKey) {
      // Shift+Enter: just newline, no hyphen
      $snippetContent.value = before + '\n' + after;
      const newPos = pos + 1;
      $snippetContent.selectionStart = $snippetContent.selectionEnd = newPos;
    } else {
      // Enter: newline + hyphen
      $snippetContent.value = before + '\n- ' + after;
      const newPos = pos + 3; // after "\n- "
      $snippetContent.selectionStart = $snippetContent.selectionEnd = newPos;
    }
  }
});

// Init
(async function init() {
  loadTextFormatting();
})();

async function showSettingsModal() {
  openModal($settingsModal);
}

$btnSaveSettings.addEventListener('click', () => {
  closeModal($settingsModal);
});

$btnUpdateDismiss?.addEventListener('click', () => {
  if (isApplyingAppUpdate) return;
  hideUpdateBanner();
});

$btnUpdateRefresh?.addEventListener('click', async () => {
  if (!hasPendingAppUpdate || isApplyingAppUpdate) return;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    showUpdateBanner('Reconnect to the internet before refreshing to the latest version.');
    return;
  }

  isApplyingAppUpdate = true;
  $btnUpdateRefresh.disabled = true;
  $btnUpdateDismiss.disabled = true;
  $btnUpdateRefresh.textContent = 'Refreshing...';
  showUpdateBanner('Saving any pending changes, then refreshing...');

  try {
    clearSaveTimer();

    if (hasUnsavedEditorChanges()) {
      await persistContent(true);
      if (hasUnsavedEditorChanges()) {
        showUpdateBanner('We could not save your latest changes yet. Please try again in a moment.');
        return;
      }
    }

    await applyAppUpdate();
  } catch (err) {
    console.error('[PWA] Failed to apply update:', err);
    showUpdateBanner('Refresh failed. Please try again.');
  } finally {
    isApplyingAppUpdate = false;
    $btnUpdateRefresh.disabled = false;
    $btnUpdateDismiss.disabled = false;
    $btnUpdateRefresh.textContent = 'Refresh';
  }
});

function clearSaveTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function handleSaveError(err) {
  console.error('Error saving document:', err);
}

function syncSaveTracking() {
  saveCoordinator.reset($editor.value);
  refreshSaveIndicator();
}

function hasUnsavedEditorChanges() {
  const state = saveCoordinator.getState();
  return state.pendingSave || state.editorRevision > state.lastSavedRevision;
}

async function applyAppUpdate() {
  if (typeof window === 'undefined') return;

  if (!('serviceWorker' in navigator)) {
    forceReloadToLatestVersion();
    return;
  }

  await new Promise((resolve, reject) => {
    let settled = false;
    let fallbackTimer = null;

    const cleanup = () => {
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };

    const finishWithReload = () => {
      if (settled) return;
      settled = true;
      cleanup();
      forceReloadToLatestVersion();
      resolve();
    };

    const handleControllerChange = () => {
      finishWithReload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    fallbackTimer = window.setTimeout(() => {
      console.warn('[PWA] controllerchange did not fire in time. Falling back to hard reload.');
      finishWithReload();
    }, 1800);

    updateServiceWorker(true).catch((err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });
  });
}

function forceReloadToLatestVersion() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('app-update', Date.now().toString());
  window.location.replace(nextUrl.toString());
}

function showUpdateBanner(message) {
  showBanner({
    title: 'New version available',
    message,
    refreshLabel: isApplyingAppUpdate ? 'Refreshing...' : 'Refresh',
  });
}

function hideUpdateBanner() {
  if (!$updateBanner) return;
  $updateBanner.setAttribute('aria-hidden', 'true');
}

function showBanner({ title, message, refreshLabel }) {
  if (!$updateBanner) return;

  if ($updateBannerIcon) {
    $updateBannerIcon.hidden = true;
  }
  if ($updateBannerTitle) {
    $updateBannerTitle.textContent = title;
  }
  if ($updateBannerMessage) {
    $updateBannerMessage.textContent = message;
  }

  if ($btnUpdateDismiss) {
    $btnUpdateDismiss.textContent = 'Dismiss';
    $btnUpdateDismiss.disabled = false;
  }

  if ($btnUpdateRefresh) {
    $btnUpdateRefresh.textContent = refreshLabel;
    $btnUpdateRefresh.disabled = false;
  }

  $updateBanner.setAttribute('aria-hidden', 'false');

  if (typeof lucide !== 'undefined') {
    setTimeout(() => lucide.createIcons(), 0);
  }
}

function clearSnippetCache() {
  snippetCache = [];
  snippetsByName.clear();
}

function setSnippetCache(snippets) {
  snippetCache = [...snippets].sort(
    (a, b) => (a.name || '').localeCompare(b.name || '')
  );
  snippetsByName.clear();

  snippetCache.forEach((snippet) => {
    if (snippet.name) {
      snippetsByName.set(snippet.name, snippet);
    }
  });

  if (isSlashMenuOpen()) {
    updateSlashMenu();
  }
}

function upsertSnippetCache(snippet) {
  const nextSnippets = snippetCache.filter((entry) => entry.id !== snippet.id);
  nextSnippets.push(snippet);
  setSnippetCache(nextSnippets);
}

function removeSnippetFromCache(snippetId) {
  setSnippetCache(snippetCache.filter((snippet) => snippet.id !== snippetId));
}
