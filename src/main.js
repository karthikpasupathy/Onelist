// main.js - OneList with InstantDB
import { init, tx, id } from '@instantdb/core';
import { createSaveCoordinator } from './saveCoordinator.js';
import { expandSnippetCommand } from './snippetExpansion.js';

// Read InstantDB App ID from environment variable
// Users must set VITE_INSTANT_APP_ID in their Vercel environment variables
const APP_ID = import.meta.env.VITE_INSTANT_APP_ID;

if (!APP_ID) {
  throw new Error('Missing VITE_INSTANT_APP_ID environment variable. Please configure it in Vercel project settings.');
}

// Initialize InstantDB
const db = init({ appId: APP_ID });

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
const $results = document.getElementById('search-results');
const $yearSelect = document.getElementById('year-select');
const $snapshotsModal = document.getElementById('snapshots-modal');
const $btnSearchModal = document.getElementById('btn-search-modal');
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
const $settingsModal = document.getElementById('settings-modal');
const $btnSaveSettings = document.getElementById('btn-save-settings');
const $newYearModal = document.getElementById('new-year-modal');
const $newYearInput = document.getElementById('new-year-input');
const $newYearError = document.getElementById('new-year-error');
const $btnCancelNewYear = document.getElementById('btn-cancel-new-year');
const $btnConfirmNewYear = document.getElementById('btn-confirm-new-year');
const $lineCounter = document.getElementById('line-counter');
const $lineCount = document.getElementById('line-count');
const $wordCount = document.getElementById('word-count');

let currentUser = null;
let currentDocId = null;
let currentYear = new Date().getFullYear();
let currentSearchScope = 'current';
let saveTimer = null;
let lastSaveStatus = 'saved'; // 'saving', 'saved', 'offline'
let localUpdatedAt = 0; // Track local version timestamp
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

    await db.transact([
      tx.documents[docId].update({
        content,
        updatedAt: now,
      }),
    ]);

    const currentDoc = documentsByYear.get(year);
    if (currentDoc?.id === docId) {
      documentsByYear.set(year, {
        ...currentDoc,
        content,
        updatedAt: now,
      });
    }

    localUpdatedAt = now;
    console.log(`[Sync] Saved to server (${new Date(now).toISOString()})`);
    await saveSnapshot(content, year);
    return { updatedAt: now };
  },
});

// Auth state listener
db.subscribeAuth((auth) => {
  if (auth.user) {
    currentUser = auth.user;
    currentYear = getStoredYear();
    // Update user email display
    if ($userEmail && auth.user.email) {
      $userEmail.textContent = auth.user.email;
    }
    showApp();
    subscribeToDocument();
  } else {
    currentUser = null;
    currentDocId = null;
    documentsByYear.clear();
    clearSnippetCache();
    clearSaveTimer();
    saveCoordinator.reset('');
    currentYear = getStoredYear();
    hasMigratedLegacyDoc = false;
    localUpdatedAt = 0;
    showAuth();
  }
});

function showAuth() {
  $authScreen.style.display = 'flex';
  $app.style.display = 'none';
}

function showApp() {
  $authScreen.style.display = 'none';
  $app.style.display = 'flex';
}

// Send magic code
$btnSendCode.addEventListener('click', async () => {
  const email = $emailInput.value.trim();
  if (!email) {
    alert('Please enter your email');
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert('Please enter a valid email address');
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
    alert('Error sending code: ' + err.message);
    $btnSendCode.disabled = false;
    $btnSendCode.textContent = 'Send Code';
  }
});

// Verify code and sign in
$btnVerifyCode.addEventListener('click', async () => {
  const email = $emailInput.value.trim();
  const code = $codeInput.value.trim();

  if (!code) {
    alert('Please enter the verification code');
    return;
  }

  try {
    $btnVerifyCode.disabled = true;
    $btnVerifyCode.textContent = 'Signing in...';
    await db.auth.signInWithMagicCode({ email, code });
  } catch (err) {
    alert('Invalid code. Please try again.');
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
  db.auth.signOut();
});

// Subscribe to user's documents
function subscribeToDocument() {
  if (!currentUser) return;

  currentYear = getStoredYear();
  renderYearOptions();

  db.subscribeQuery(
    {
      documents: {
        $: {
          where: {
            userId: currentUser.id,
          },
        },
      },
    },
    async (resp) => {
      if (resp.error) {
        console.error('Query error:', resp.error);
        return;
      }

      const docs = resp.data?.documents || [];
      documentsByYear.clear();

      const legacyDocs = docs.filter((doc) => !Number.isInteger(doc.year));
      if (legacyDocs.length && !hasMigratedLegacyDoc) {
        hasMigratedLegacyDoc = true;
        await migrateLegacyDocuments(legacyDocs, docs);
        return;
      }

      docs.forEach((doc) => {
        const year = Number.isInteger(doc.year) ? doc.year : currentYear;
        documentsByYear.set(year, doc);
      });

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

async function createDocument(year = currentYear) {
  if (!currentUser || pendingDocumentYears.has(year)) return;
  const docId = id();
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
    await db.transact([
      tx.documents[docId].update({
        ...nextDoc,
      }),
    ]);

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
    alert('Failed to create document. Please try refreshing.');
  } finally {
    pendingDocumentYears.delete(year);
  }
}

async function migrateLegacyDocuments(legacyDocs, allDocs) {
  if (!currentUser || !legacyDocs.length) return;

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

function hydrateEditorFromDocument(doc) {
  if (!doc) return;

  const backupContent = localStorage.getItem(`onelist_backup_${doc.id}`);
  const backupTimeStr = localStorage.getItem(`onelist_backup_time_${doc.id}`);

  if (backupContent && backupTimeStr) {
    const backupTime = parseInt(backupTimeStr, 10);
    const serverTime = doc.updatedAt || 0;

    if (backupTime > serverTime) {
      console.log('[Recovery] Found newer backup! Restoring lost content...');
      $editor.value = backupContent;
      localUpdatedAt = backupTime;
      saveCoordinator.markDirty(backupContent);
      persistContent(true).then(() => {
        console.log('[Recovery] Successfully restored and saved backup to server');
        localStorage.removeItem(`onelist_backup_${doc.id}`);
        localStorage.removeItem(`onelist_backup_time_${doc.id}`);
      }).catch(handleSaveError);
      updateLineCounter();
      return;
    }

    localStorage.removeItem(`onelist_backup_${doc.id}`);
    localStorage.removeItem(`onelist_backup_time_${doc.id}`);
  }

  const serverUpdatedAt = doc.updatedAt || 0;
  const cursorPos = $editor.selectionStart;

  if ($editor.value !== (doc.content || '')) {
    $editor.value = doc.content || '';
    if (cursorPos <= $editor.value.length) {
      $editor.selectionStart = $editor.selectionEnd = cursorPos;
    }
  }

  localUpdatedAt = serverUpdatedAt;
  lastSnapshotTime = 0;
  syncSaveTracking();
  updateLineCounter();
  console.log(`[Sync] Loaded year ${doc.year} (${new Date(serverUpdatedAt || Date.now()).toISOString()})`);
}

// Date formatting: dd-MM-yyyy
function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
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

  clearSaveTimer();
  await persistContent(true);

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

// Search modal
$btnSearchModal.addEventListener('click', () => {
  openModal($searchModal);
  $searchScopeSelect.value = currentSearchScope;
  $searchInput.focus();
  if (typeof lucide !== 'undefined') {
    setTimeout(() => lucide.createIcons(), 0);
  }
});

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
function handleSlashCommands() {
  const pos = $editor.selectionStart;
  const before = $editor.value.slice(0, pos);
  const after = $editor.value.slice(pos);
  const match = before.match(/(?:^|\s)(\/[a-zA-Z0-9_]+)$/);
  if (!match) return;

  const token = match[1];
  const start = before.length - token.length;
  let replacement;

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

    // Check if current line starts with bullet point and replace entire line
    const lineStart = before.lastIndexOf('\n') + 1;
    const currentLine = before.slice(lineStart);

    if (currentLine.trim() === '- /line') {
      const beforeLineStart = $editor.value.slice(0, lineStart);
      const replaced = beforeLineStart + replacement + after;
      $editor.value = replaced;
      const newPos = lineStart + replacement.length;
      $editor.selectionStart = $editor.selectionEnd = newPos;
      return;
    }
  } else {
    // Check if it's a custom snippet
    const snippetName = token.slice(1); // Remove leading /
    handleSnippetCommand(snippetName, start, before, after);
    return;
  }

  const replaced = $editor.value.slice(0, start) + replacement + after;
  $editor.value = replaced;

  const newPos = start + replacement.length;
  $editor.selectionStart = $editor.selectionEnd = newPos;
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
  const loweredQuery = query.toLowerCase();
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
      if (line.toLowerCase().includes(loweredQuery)) {
        results.push({ year, i, line });
      }
    }
  });

  return results;
}

async function focusSearchResult(year, lineIndex, searchTerm) {
  closeModal($searchModal);

  if (year !== currentYear) {
    clearSaveTimer();
    await persistContent(true);
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
      alert('Failed to save your document. Please try again.');
    }
    return false;
  }
}

async function saveSnapshot(content, year = currentYear) {
  if (!currentUser) return;

  // Optimization: Only save snapshot if enough time has passed
  const now = Date.now();
  if (now - lastSnapshotTime < SNAPSHOT_INTERVAL) {
    return;
  }

  const snapshotId = id();

  try {
    await db.transact([
      tx.snapshots[snapshotId].update({
        userId: currentUser.id,
        year,
        content,
        createdAt: now,
        pinned: false,
      }),
    ]);

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

  clearSaveTimer();
  await persistContent(true);

  if (documentsByYear.has(nextYear)) {
    loadYearDocument(nextYear);
    return;
  }

  currentYear = nextYear;
  storeActiveYear(nextYear);
  currentDocId = null;
  renderYearOptions();
  $editor.value = '';
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
  if (!years.length) {
    downloadText($editor.value, getYearFilename(currentYear));
    return;
  }

  years.forEach((year, index) => {
    const doc = documentsByYear.get(year);
    window.setTimeout(() => {
      downloadText(doc?.content || '', getYearFilename(year));
    }, index * 180);
  });
}

// Snapshots modal
async function showSnapshotsModal() {
  if (!currentUser) return;

  const { data } = await db.queryOnce({
    snapshots: {
      $: {
        where: {
          userId: currentUser.id,
        },
      },
    },
  });

  // Separate pinned and unpinned snapshots
  const allSnapshots = (data?.snapshots || []).filter(
    (snapshot) => (snapshot.year || currentYear) === currentYear
  );
  const pinnedSnapshots = allSnapshots.filter(s => s.pinned).sort(
    (a, b) => b.createdAt - a.createdAt
  );
  const unpinnedSnapshots = allSnapshots.filter(s => !s.pinned).sort(
    (a, b) => b.createdAt - a.createdAt
  );

  const $list = document.getElementById('snapshot-list');
  $list.innerHTML = '';

  if (!allSnapshots.length) {
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
      await db.transact([
        tx.snapshots[snapshot.id].update({
          pinned: !isPinned,
        }),
      ]);
      showSnapshotsModal();
    } catch (err) {
      console.error('Error toggling pin:', err);
      alert('Failed to update snapshot. Please try again.');
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
function openModal(modal) {
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal) {
  modal.setAttribute('aria-hidden', 'true');
}

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
$editor.addEventListener('input', () => {
  handleSlashCommands();
  scheduleSave();
  updateLineCounter();
});

$editor.addEventListener('keydown', (e) => {
  // Enter -> add hyphen, Shift+Enter -> plain newline
  if (e.key === 'Enter') {
    e.preventDefault();
    const pos = $editor.selectionStart;
    const before = $editor.value.slice(0, pos);
    const after = $editor.value.slice($editor.selectionEnd);

    if (e.shiftKey) {
      // Shift+Enter: just newline, no hyphen
      $editor.value = before + '\n' + after;
      const newPos = pos + 1;
      $editor.selectionStart = $editor.selectionEnd = newPos;
    } else {
      // Enter: newline + hyphen
      $editor.value = before + '\n- ' + after;
      const newPos = pos + 3; // after "\n- "
      $editor.selectionStart = $editor.selectionEnd = newPos;
    }

    scheduleSave();
    updateLineCounter();
  }
});

// ==================== CRITICAL: PREVENT DATA LOSS ON APP SUSPENSION ====================

// Save immediately when user switches tabs or minimizes app (CRITICAL for PWA!)
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    // User switched away - save immediately and wait for completion!
    clearSaveTimer();
    await persistContent(true);
  }
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
  updateSaveIndicator('saved');
  console.log('[OneList] Back online - syncing...');
  // Try to save any pending changes
  if (currentDocId && currentUser) {
    persistContent(true);
  }
});

window.addEventListener('offline', () => {
  updateSaveIndicator('offline');
  console.log('[OneList] Offline - changes will be queued');
});

// Update save indicator in UI
function updateSaveIndicator(status) {
  lastSaveStatus = status;
  const indicator = document.getElementById('save-indicator');
  if (!indicator) return;

  switch (status) {
    case 'saving':
      indicator.textContent = 'Saving...';
      indicator.className = 'save-indicator saving';
      indicator.style.display = 'inline-block';
      break;
    case 'saved':
      indicator.textContent = 'Saved';
      indicator.className = 'save-indicator saved';
      indicator.style.display = 'inline-block';
      // Hide after 2 seconds
      setTimeout(() => {
        if (lastSaveStatus === 'saved') {
          indicator.style.display = 'none';
        }
      }, 2000);
      break;
    case 'offline':
      indicator.textContent = 'Offline';
      indicator.className = 'save-indicator offline';
      indicator.style.display = 'inline-block';
      break;
    case 'error':
      indicator.textContent = 'Save failed';
      indicator.className = 'save-indicator error';
      indicator.style.display = 'inline-block';
      break;
  }
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

$btnResetFormat.addEventListener('click', () => {
  if (confirm('Reset text formatting to default settings?')) {
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
        if (confirm(`Delete snippet /${snippet.name}?`)) {
          await db.transact([tx.snippets[snippet.id].delete()]);
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
    alert('Please enter a snippet name');
    return;
  }

  if (!content) {
    alert('Please enter snippet content');
    return;
  }

  // Validate name format (alphanumeric and underscore only)
  if (!/^[a-z0-9_]+$/.test(name)) {
    alert('Snippet name must contain only letters, numbers, and underscores (no spaces)');
    return;
  }

  // Validate name length (max 17 characters)
  if (name.length > 17) {
    alert('Snippet name must be 17 characters or less');
    return;
  }

  try {
    if (currentEditingSnippetId) {
      // Update existing snippet
      const updatedAt = Date.now();
      await db.transact([
        tx.snippets[currentEditingSnippetId].update({
          name,
          content,
          updatedAt,
        }),
      ]);
      const existingSnippet = snippetCache.find(
        (snippet) => snippet.id === currentEditingSnippetId
      );
      upsertSnippetCache({
        ...(existingSnippet || {}),
        id: currentEditingSnippetId,
        name,
        content,
        updatedAt,
      });
    } else {
      // Create new snippet
      const snippetId = id();
      const createdAt = Date.now();
      await db.transact([
        tx.snippets[snippetId].update({
          userId: currentUser.id,
          name,
          content,
          createdAt,
          updatedAt: createdAt,
        }),
      ]);
      upsertSnippetCache({
        createdAt,
        id: snippetId,
        name,
        content,
        updatedAt: createdAt,
        userId: currentUser.id,
      });
    }

    showSnippetsModal();
  } catch (err) {
    alert('Error saving snippet: ' + err.message);
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
}

function upsertSnippetCache(snippet) {
  const nextSnippets = snippetCache.filter((entry) => entry.id !== snippet.id);
  nextSnippets.push(snippet);
  setSnippetCache(nextSnippets);
}

function removeSnippetFromCache(snippetId) {
  setSnippetCache(snippetCache.filter((snippet) => snippet.id !== snippetId));
}
