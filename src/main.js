// main.js - OneList entry point: session lifecycle and editor wiring.
import { editorHistory, getStoredYear, state } from './appState.js';
import {
  $app,
  $btnAppendDate,
  $btnExportAllMenu,
  $btnExportYearMenu,
  $btnHelpMenu,
  $btnProfile,
  $btnSaveSettings,
  $btnSettingsMenu,
  $btnSnapshotsMenu,
  $btnSnippetsMenu,
  $editor,
  $helpModal,
  $profileDropdown,
  $settingTimestampBullets,
  $settingsModal,
  $slashMenu,
  $userEmail,
} from './dom.js';

import { hideUpdateBanner, remindAboutPendingUpdate } from './appUpdate.js';
import { isTimestampBulletsEnabled, newBulletPrefix, setTimestampBulletsEnabled } from './bulletPrefix.js';
import { showApp, showAuth } from './authUi.js';
import {
  applyCachedDocumentForStartup,
  clearSaveTimer,
  flushDraftNow,
  noteLocalEdit,
  persistContent,
  refreshRemoteDocumentIfNeeded,
  scheduleSave,
  setEditorBootstrapping,
  startDocumentSync,
  stopDocumentSync,
} from './documentSync.js';
import {
  appendTodayDateHeader,
  applySelectedSlashItem,
  hideSlashMenu,
  isSlashMenuOpen,
  moveSlashSelection,
  positionSlashMenu,
  tryExpandSlashOnSpace,
  updateSlashMenu,
} from './editorCommands.js';
import { isHistoryInput, isUndoShortcut } from './editorShortcuts.js';
import { refreshSaveIndicator, updateLineCounter, updateSaveIndicator } from './editorStatus.js';
import {
  buildAllYearsExport,
  downloadText,
  getAllYearsExportFilename,
  getYearFilename,
} from './exportUtils.js';
import { closeModal, dismissTopModal, handleModalTabTrap, openModal } from './modals.js';
import { openSearchModal } from './search.js';
import { showSnapshotsModal, startSnapshotSync, stopSnapshotSync } from './snapshots.js';
import { showSnippetsModal, startSnippetSync, stopSnippetSync } from './snippets.js';
import { store } from './store/index.js';
import { loadTextFormatting } from './textFormatting.js';
import { initConfirmDialog, showToast } from './toast.js';
import { getAvailableYears } from './yearSwitcher.js';

initConfirmDialog();
loadTextFormatting();

// ==================== SESSION ====================

async function activateUserSession(user) {
  if (state.currentUser?.id === user.id) return;

  state.currentUser = user;
  state.currentYear = getStoredYear();
  if ($userEmail && user.email) {
    $userEmail.textContent = store.isLocal ? `${user.email} (local dev)` : user.email;
  }
  showApp();
  const hadCachedDocument = await applyCachedDocumentForStartup(user.id);
  if (state.currentUser?.id !== user.id) return;
  if (!hadCachedDocument) {
    setEditorBootstrapping(true);
  }
  startDocumentSync();
  startSnapshotSync(user.id);
  startSnippetSync(user.id);

  if (store.isLocal) {
    showToast('Local dev mode — data stays in this browser only.', { duration: 6000 });
    console.info('[OneList] Auth bypass enabled for local development.');
  }
}

function deactivateUserSession() {
  state.currentUser = null;
  stopDocumentSync();
  stopSnapshotSync();
  stopSnippetSync();
  hideUpdateBanner();
  state.currentYear = getStoredYear();
  if ($editor) {
    $editor.value = '';
  }
  showAuth();
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


$btnExportYearMenu.addEventListener('click', () => {
  const doc = state.documentsByYear.get(state.currentYear);
  downloadText(doc?.content || $editor.value, getYearFilename(state.currentYear));
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


function exportAllYears() {
  const years = getAvailableYears();
  const exportYears = years.length ? years : [state.currentYear];
  const combined = buildAllYearsExport(exportYears, (year) => {
    if (year === state.currentYear) {
      return $editor.value;
    }
    return state.documentsByYear.get(year)?.content || '';
  });

  downloadText(combined, getAllYearsExportFilename());
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

$btnAppendDate.addEventListener('mousedown', (e) => {
  e.preventDefault();
});
$btnAppendDate.addEventListener('click', appendTodayDateHeader);

$editor.addEventListener('beforeinput', (e) => {
  if (isHistoryInput(e)) {
    e.preventDefault();
    return;
  }

  editorHistory.markBurstStart($editor);
});

$editor.addEventListener('input', () => {
  noteLocalEdit();

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
      moveSlashSelection(1);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSlashSelection(-1);
      return;
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applySelectedSlashItem();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      hideSlashMenu();
      return;
    }
  }

  // Enter -> new bullet (timestamped if the setting is on), Shift+Enter -> plain newline
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
      const insertion = `\n${newBulletPrefix()}`;
      $editor.value = before + insertion + after;
      const newPos = pos + insertion.length;
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
    flushDraftNow();
    clearSaveTimer();
    await persistContent(true);
    return;
  }

  await refreshRemoteDocumentIfNeeded();
});

// On teardown, write the draft synchronously first (the browser may not wait
// for anything async), then still attempt a server save.
function saveBeforeLeaving() {
  clearSaveTimer();
  flushDraftNow();
  persistContent(true);
}

window.addEventListener('beforeunload', saveBeforeLeaving);
// pagehide is more reliable than beforeunload on mobile PWAs
window.addEventListener('pagehide', saveBeforeLeaving);

// Monitor online/offline status
window.addEventListener('online', () => {
  refreshSaveIndicator();
  console.log('[OneList] Back online - syncing...');
  refreshRemoteDocumentIfNeeded().then(remindAboutPendingUpdate);
});

window.addEventListener('offline', () => {
  updateSaveIndicator('offline');
  console.log('[OneList] Offline - edits stay on this device until you reconnect');
});

// The realtime link can drop and return while the browser still reports
// "online" (very common when a phone resumes the app). Treat its return like
// coming back online: pull the latest copy, then push anything unsaved.
store.onConnectionChange((status) => {
  if (status === 'connected') {
    refreshSaveIndicator();
    refreshRemoteDocumentIfNeeded();
  } else if (status === 'offline') {
    updateSaveIndicator('offline');
  } else if (status === 'error') {
    updateSaveIndicator('error');
  }
});

async function showSettingsModal() {
  $settingTimestampBullets.checked = isTimestampBulletsEnabled();
  openModal($settingsModal);
}

$settingTimestampBullets.addEventListener('change', () => {
  setTimestampBulletsEnabled($settingTimestampBullets.checked);
});

$btnSaveSettings.addEventListener('click', () => {
  closeModal($settingsModal);
});

// ==================== START ====================

store.onAuthChange((user) => {
  if (user) {
    activateUserSession(user);
  } else {
    deactivateUserSession();
  }
});
