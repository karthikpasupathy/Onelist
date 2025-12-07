// main.js - OneList with InstantDB
import { init, tx, id } from 'https://cdn.jsdelivr.net/npm/@instantdb/core/+esm';

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
const $search = document.getElementById('search');
const $results = document.getElementById('search-results');
const $btnAppendDate = document.getElementById('btn-append-date');
const $btnExport = document.getElementById('btn-export');
const $btnSnapshots = document.getElementById('btn-snapshots');
const $snapshotsModal = document.getElementById('snapshots-modal');
const $btnSearchModal = document.getElementById('btn-search-modal');
const $searchModal = document.getElementById('search-modal');
const $searchInput = document.getElementById('search-input');
const $searchResultsModal = document.getElementById('search-results-modal');
const $btnProfile = document.getElementById('btn-profile');
const $profileDropdown = document.getElementById('profile-dropdown');
const $userEmail = document.getElementById('user-email');
const $btnExportMenu = document.getElementById('btn-export-menu');
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
const $btnAiChat = document.getElementById('btn-ai-chat');
const $aiActionsModal = document.getElementById('ai-actions-modal');
const $aiActionsResult = document.getElementById('ai-actions-result');
const $aiActionSelect = document.getElementById('ai-action-select');
const $btnRunAiAction = document.getElementById('btn-run-ai-action');
const $btnSettingsMenu = document.getElementById('btn-settings-menu');
const $settingsModal = document.getElementById('settings-modal');
const $settingsAiModel = document.getElementById('settings-ai-model');
const $settingsAiSystemPrompt = document.getElementById('settings-ai-system-prompt');
const $btnSaveSettings = document.getElementById('btn-save-settings');
const $lineCounter = document.getElementById('line-counter');
const $lineCount = document.getElementById('line-count');
const $wordCount = document.getElementById('word-count');

let currentUser = null;
let currentDocId = null;
let saveTimer = null;
let isSaving = false;
let lastSaveStatus = 'saved'; // 'saving', 'saved', 'offline'
let localUpdatedAt = 0; // Track local version timestamp

// Text formatting state
const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_FAMILY = 'monospace';
const SNAPSHOT_INTERVAL = 5 * 60 * 1000; // 5 minutes

let currentFontSize = DEFAULT_FONT_SIZE;
let currentFontFamily = DEFAULT_FONT_FAMILY;
let currentEditingSnippetId = null;
let lastSnapshotTime = 0;
let currentSettingsId = null;
let currentAiUsageId = null;
let aiUsageCount = 0;
let usageResetDate = null;

// AI Usage Constants
const AI_MONTHLY_LIMIT = 10;

// Auth state listener
db.subscribeAuth((auth) => {
  if (auth.user) {
    currentUser = auth.user;
    // Update user email display
    if ($userEmail && auth.user.email) {
      $userEmail.textContent = auth.user.email;
    }
    showApp();
    subscribeToDocument();
  } else {
    currentUser = null;
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

// Subscribe to user's document
function subscribeToDocument() {
  if (!currentUser) return;

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
    (resp) => {
      if (resp.error) {
        console.error('Query error:', resp.error);
        return;
      }

      const docs = resp.data?.documents || [];
      if (docs.length > 0) {
        // Load existing document
        const doc = docs[0];
        currentDocId = doc.id;
        
        // CRITICAL: Check for localStorage backup and recover if needed
        const backupContent = localStorage.getItem(`onelist_backup_${doc.id}`);
        const backupTimeStr = localStorage.getItem(`onelist_backup_time_${doc.id}`);
        
        if (backupContent && backupTimeStr) {
          const backupTime = parseInt(backupTimeStr, 10);
          const serverTime = doc.updatedAt || 0;
          
          // If backup is newer than server, we lost data - restore it!
          if (backupTime > serverTime) {
            console.log('[Recovery] Found newer backup! Restoring lost content...');
            $editor.value = backupContent;
            localUpdatedAt = backupTime;
            
            // Save the recovered content to server immediately
            persistContent(true).then(() => {
              console.log('[Recovery] Successfully restored and saved backup to server');
              // Clean up backup after successful restore
              localStorage.removeItem(`onelist_backup_${doc.id}`);
              localStorage.removeItem(`onelist_backup_time_${doc.id}`);
            }).catch(err => {
              console.error('[Recovery] Failed to save restored backup:', err);
            });
            
            updateLineCounter();
            return; // Skip normal load since we restored from backup
          } else {
            // Server has newer or equal data, clean up old backup
            localStorage.removeItem(`onelist_backup_${doc.id}`);
            localStorage.removeItem(`onelist_backup_time_${doc.id}`);
          }
        }
        
        // CRITICAL: Only update editor if server version is newer than our local version
        // This prevents old data from mobile PWA overwriting newer laptop data
        const serverUpdatedAt = doc.updatedAt || 0;
        
        if (serverUpdatedAt > localUpdatedAt) {
          // Server has newer data - update editor
          if ($editor.value !== doc.content) {
            const cursorPos = $editor.selectionStart;
            $editor.value = doc.content || '';
            // Restore cursor position if reasonable
            if (cursorPos <= $editor.value.length) {
              $editor.selectionStart = $editor.selectionEnd = cursorPos;
            }
            // Update line counter after loading content
            updateLineCounter();
          }
          // Update our local timestamp to match server
          localUpdatedAt = serverUpdatedAt;
          console.log(`[Sync] Loaded server version (${new Date(serverUpdatedAt).toISOString()})`);
        } else if (serverUpdatedAt < localUpdatedAt) {
          // Timestamps disagree (likely clock skew or cross-device editing).
          // If the content differs, protect local content via a snapshot,
          // then accept server content so remote edits are not ignored.
          if ($editor.value !== doc.content) {
            console.log('[Sync] Timestamp conflict and content mismatch. Snapshotting local, applying server.');
            
            const localContent = $editor.value;
            const snapshotNow = Date.now();
            const conflictSnapshotId = id();
            
            db.transact([
              tx.snapshots[conflictSnapshotId].update({
                userId: currentUser.id,
                content: localContent,
                createdAt: snapshotNow,
                pinned: true,
              }),
            ]).catch(err => {
              console.error('[Sync] Error saving conflict snapshot:', err);
            });
            
            const cursorPos = $editor.selectionStart;
            $editor.value = doc.content || '';
            if (cursorPos <= $editor.value.length) {
              $editor.selectionStart = $editor.selectionEnd = cursorPos;
            }
            updateLineCounter();
          } else {
            console.log('[Sync] Timestamp conflict but content is identical. No change needed.');
          }
          
          // Always align our local timestamp to server after resolving
          localUpdatedAt = serverUpdatedAt;
          console.log(`[Sync] Resolved conflict in favor of server (${new Date(serverUpdatedAt).toISOString()})`);
        } else {
          // Timestamps match - we're in sync
          console.log('[Sync] Already in sync');
        }
      } else {
        // Create new document
        createDocument();
      }
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

      const unpinnedSnapshots = snapshots.filter(s => !s.pinned);

      // Keep only the latest 20 unpinned snapshots
      if (unpinnedSnapshots.length > 20) {
        console.log(`[Snapshot Cleanup] Found ${unpinnedSnapshots.length} unpinned snapshots. Limit is 20.`);
        const sorted = unpinnedSnapshots.sort((a, b) => a.createdAt - b.createdAt);

        // Delete 1 at a time to debug
        const toDelete = sorted.slice(0, 1);
        const s = toDelete[0];
        console.log('[Snapshot Cleanup] Attempting to delete snapshot:', s.id);

        if (toDelete.length > 0) {
          db.transact([tx.snapshots[s.id].delete()])
            .then(() => console.log('[Snapshot Cleanup] Successfully deleted snapshot:', s.id))
            .catch(err => {
              console.error('[Snapshot Cleanup] Error deleting snapshot:', err);
              if (err.body) console.error('[Snapshot Cleanup] Error body:', err.body);
            });
        }
      }
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
      // Snippets loaded - will be used in modal
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
        return;
      }
      const settings = resp.data?.settings || [];
      if (settings.length > 0) {
        currentSettingsId = settings[0].id;
      }
    }
  );

  // Subscribe to AI usage tracking
  db.subscribeQuery(
    {
      aiUsage: {
        $: {
          where: {
            userId: currentUser.id,
          },
        },
      },
    },
    async (resp) => {
      if (resp.error) {
        console.error('[AI Usage Subscription] Error:', resp.error);
        return;
      }
      const usageRecords = resp.data?.aiUsage || [];
      
      if (usageRecords.length > 0) {
        const usage = usageRecords[0];
        currentAiUsageId = usage.id;
        aiUsageCount = usage.count || 0;
        usageResetDate = usage.resetDate ? new Date(usage.resetDate) : null;
        
        // Check if we need to reset the counter
        await checkAndResetUsage();
      } else {
        // Create initial usage record
        await initializeAiUsage();
      }
      
      // Update UI if AI modal is open
      updateAiUsageDisplay();
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
    const unpinned = snapshots.filter(s => !s.pinned);
    console.log(`Manual: Found ${unpinned.length} unpinned snapshots.`);
    if (unpinned.length > 20) {
      const sorted = unpinned.sort((a, b) => a.createdAt - b.createdAt);
      const s = sorted[0];
      console.log('Manual: Deleting snapshot', s.id);
      try {
        await db.transact([tx.snapshots[s.id].delete()]);
        console.log('Manual: Deleted successfully');
      } catch (err) {
        console.error('Manual: Delete failed', err);
      }
    } else {
      console.log('Manual: No cleanup needed.');
    }
  };
}

async function createDocument() {
  if (!currentUser) return;
  const docId = id();
  currentDocId = docId;

  try {
    await db.transact([
      tx.documents[docId].update({
        userId: currentUser.id,
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ]);
  } catch (err) {
    console.error('Error creating document:', err);
    alert('Failed to create document. Please try refreshing.');
  }
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

// Profile menu buttons
$btnExportMenu.addEventListener('click', () => {
  downloadText($editor.value);
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

// AI Insights button
$btnAiChat.addEventListener('click', () => {
  openModal($aiActionsModal);
  updateAiUsageDisplay();
});

// Search modal
$btnSearchModal.addEventListener('click', () => {
  openModal($searchModal);
  $searchInput.focus();
});

$searchInput.addEventListener('input', () => {
  const q = $searchInput.value.trim();
  $searchResultsModal.innerHTML = '';
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
    $searchResultsModal.appendChild(div);
    return;
  }

  results.forEach(({ i, line }) => {
    const item = document.createElement('div');
    item.className = 'result';
    item.innerHTML = `<span class="line-num">#${i + 1}</span>${escapeHtml(line)}`;
    item.addEventListener('click', () => {
      focusLine(i);
      closeModal($searchModal);
    });
    $searchResultsModal.appendChild(item);
  });
});

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
      scheduleSave();
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
  scheduleSave();
}

async function handleSnippetCommand(snippetName, start, before, after) {
  if (!currentUser) return;

  const { data } = await db.queryOnce({
    snippets: {
      $: {
        where: {
          userId: currentUser.id,
          name: snippetName,
        },
      },
    },
  });

  const snippets = data?.snippets || [];
  if (snippets.length === 0) return; // Snippet not found, leave as-is

  const snippet = snippets[0];
  const token = `/${snippetName}`;
  const lineStart = before.lastIndexOf('\n') + 1;
  const currentLine = before.slice(lineStart);

  // Check if the line is just "- /snippetname"
  if (currentLine.trim() === `- ${token}`) {
    // Replace entire bullet point with snippet content
    const beforeLineStart = before.slice(0, lineStart);
    const snippetLines = snippet.content.split('\n');
    const replacement = snippetLines.join('\n');
    const replaced = beforeLineStart + replacement + after;
    $editor.value = replaced;
    const newPos = beforeLineStart.length + replacement.length;
    $editor.selectionStart = $editor.selectionEnd = newPos;
  } else {
    // Append to next line
    const snippetLines = snippet.content.split('\n');
    const replacement = '\n' + snippetLines.join('\n');
    const replaced = $editor.value.slice(0, start) + replacement + after;
    $editor.value = replaced;
    const newPos = start + replacement.length;
    $editor.selectionStart = $editor.selectionEnd = newPos;
  }

  scheduleSave();
}

// Search
function updateSearchResults() {
  const q = $search.value.trim();
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
function focusLine(lineIndex) {
  const lines = $editor.value.split('\n');
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  $editor.focus();
  $editor.selectionStart = $editor.selectionEnd = offset;
  // Scroll into view
  const lineHeight = parseFloat(getComputedStyle($editor).lineHeight) || 20;
  $editor.scrollTop = Math.max(0, lineHeight * Math.max(0, lineIndex - 2));
}

// Save (throttled) + snapshots
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persistContent, 300); // Reduced from 800ms to 300ms
  updateSaveIndicator('saving');
}

async function persistContent(isForced = false) {
  if (!currentDocId || !currentUser) return;
  
  // For forced saves (lifecycle events), bypass the isSaving lock
  if (!isForced && isSaving) return; // Prevent concurrent non-forced saves
  
  if (!isForced) {
    isSaving = true;
  }
  
  const content = $editor.value;
  const now = Date.now();
  
  try {
    updateSaveIndicator('saving');
    
    await db.transact([
      tx.documents[currentDocId].update({
        content,
        updatedAt: now,
      }),
    ]);

    // Update local timestamp after successful save
    localUpdatedAt = now;
    console.log(`[Sync] Saved to server (${new Date(now).toISOString()})`);

    // Create snapshot every save (we'll limit in UI)
    await saveSnapshot(content);
    
    updateSaveIndicator('saved');
  } catch (err) {
    console.error('Error saving document:', err);
    updateSaveIndicator('error');
    if (!isForced) {
      alert('Failed to save your document. Please try again.');
    }
  } finally {
    if (!isForced) {
      isSaving = false;
    }
  }
}

async function saveSnapshot(content) {
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
  const allSnapshots = data?.snapshots || [];
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
    scheduleSave();
    closeModal($snapshotsModal);
  });

  const downloadBtn = document.createElement('button');
  downloadBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  downloadBtn.setAttribute('aria-label', 'Download');
  downloadBtn.title = 'Download';
  downloadBtn.addEventListener('click', () => {
    downloadText(snapshot.content || '', `snapshot-${snapshot.createdAt}.txt`);
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
  if (modal === $aiActionsModal) {
    $aiActionsResult.innerHTML = '';
    $aiActionSelect.value = ''; // Reset dropdown
  }
  modal.setAttribute('aria-hidden', 'true');
}

Array.from(document.querySelectorAll('.modal .modal-close')).forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (modal) closeModal(modal);
  });
});

Array.from(document.querySelectorAll('.modal')).forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
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
  }
});

// ==================== CRITICAL: PREVENT DATA LOSS ON APP SUSPENSION ====================

// Save immediately when user switches tabs or minimizes app (CRITICAL for PWA!)
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    // User switched away - save immediately and wait for completion!
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await persistContent(true);
  }
});

// Save immediately when user closes tab/window
window.addEventListener('beforeunload', (e) => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  
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
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  
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
    const allowedFamilies = ['monospace', 'serif', 'sans-serif', 'cursive', 'system-ui'];
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
    'monospace': "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Droid Sans Mono', 'Source Code Pro', ui-monospace, monospace",
    'serif': "'Georgia', 'Times New Roman', serif",
    'sans-serif': "'Arial', 'Helvetica', sans-serif",
    'cursive': "'Comic Sans MS', 'Apple Chancery', cursive",
    'system-ui': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  };

  $editor.style.fontFamily = fontFamilyMap[currentFontFamily] || fontFamilyMap['monospace'];
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

  const { data } = await db.queryOnce({
    snippets: {
      $: {
        where: {
          userId: currentUser.id,
        },
      },
    },
  });

  const snippets = (data?.snippets || []).sort(
    (a, b) => (a.name || '').localeCompare(b.name || '')
  );

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
      await db.transact([
        tx.snippets[currentEditingSnippetId].update({
          name,
          content,
          updatedAt: Date.now(),
        }),
      ]);
    } else {
      // Create new snippet
      const snippetId = id();
      await db.transact([
        tx.snippets[snippetId].update({
          userId: currentUser.id,
          name,
          content,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      ]);
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

// ==================== AI INSIGHTS FUNCTIONALITY ====================

// Delegate clicks on action buttons (desktop)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.action-btn');
  if (btn && btn.dataset.action) {
    runAiAction(btn.dataset.action);
  }
});

// Mobile dropdown handler
$btnRunAiAction.addEventListener('click', () => {
  const action = $aiActionSelect.value;
  if (!action) {
    alert('Please select an AI action first');
    return;
  }
  runAiAction(action);
});

// Helper: parse document into date sections using dd-MM-yyyy headers
function parseDateSections() {
  const lines = $editor.value.split('\n');
  const dateRegex = /^(\d{2})-(\d{2})-(\d{4})$/;
  const sections = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = line.match(dateRegex);
    if (m) {
      // close previous section
      if (current) {
        current.endIndex = i - 1;
        current.text = lines.slice(current.startIndex, current.endIndex + 1).join('\n');
        sections.push(current);
      }
      const dd = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      const yyyy = parseInt(m[3], 10);
      const dt = new Date(yyyy, mm - 1, dd);
      current = { date: dt, headerIndex: i, startIndex: i + 1, endIndex: i + 1, text: '' };
    }
  }
  if (current) {
    current.endIndex = lines.length - 1;
    current.text = lines.slice(current.startIndex, current.endIndex + 1).join('\n');
    sections.push(current);
  }
  return sections;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Collect content for a range type
function getRangeContent(type) {
  const secs = parseDateSections();
  const today = new Date();
  let selected = [];

  if (type === 'weekly') {
    const from = addDays(today, -6);
    selected = secs.filter(s => s.date >= from && s.date <= today);
  } else if (type === 'monthly') {
    const from = startOfMonth(today);
    selected = secs.filter(s => s.date >= from && s.date <= today);
  } else if (type === 'mental') {
    selected = secs.filter(s => sameDay(s.date, today));
    if (!selected.length && secs.length) {
      selected = [secs[secs.length - 1]]; // fallback to last section
    }
  } else if (type === 'plan') {
    const selText = getSelectedText();
    if (selText && selText.trim()) {
      return selText.trim();
    }
    // fallback to today or last section
    const todaySec = secs.filter(s => sameDay(s.date, today));
    selected = todaySec.length ? todaySec : (secs.length ? [secs[secs.length - 1]] : []);
  }

  const combined = selected.map(s => s.text.trim()).filter(Boolean).join('\n\n');
  return combined || '';
}

function getSelectedText() {
  const start = $editor.selectionStart;
  const end = $editor.selectionEnd;
  if (start === end) return '';
  return $editor.value.slice(start, end);
}

// Build a specific instruction per action
function actionInstruction(type) {
  if (type === 'weekly') {
    return [
      'Produce a concise weekly summary based strictly on the provided context.',
      'Include: Highlights (top wins), Themes, Blockers, and 5 actionable next steps.',
      'Be specific and avoid speculation beyond the context.'
    ].join(' ');
  }
  if (type === 'monthly') {
    return [
      'Summarize this month-to-date: key projects, patterns, progress, risks.',
      'End with priorities for the next week and risk mitigations.',
      'Ground all points in the provided context.'
    ].join(' ');
  }
  if (type === 'mental') {
    return [
      'Assess mental health for today using only the provided context.',
      'Output sections: Mood, Stress, Energy, Sleep, Confidence.',
      'Finish with 3 practical self-care actions (brief, doable).'
    ].join(' ');
  }
  if (type === 'plan') {
    return [
      'Turn the provided text into a short, prioritized plan.',
      'Include steps, dependencies, and a simple timeline.',
      'Keep it actionable and minimal.'
    ].join(' ');
  }
  return 'Provide a concise, context-grounded analysis.';
}

// Run an AI action
async function runAiAction(type) {
  // Check quota before running
  const canRun = await checkAiQuota();
  if (!canRun) {
    return; // Error message already shown by checkAiQuota
  }

  // Clear previous result
  $aiActionsResult.innerHTML = '';
  // Show modal if not open
  openModal($aiActionsModal);

  // Loading UI
  const loading = document.createElement('div');
  loading.className = 'ai-message-content';
  loading.textContent = 'Thinking...';
  loading.style.fontStyle = 'italic';
  loading.style.color = '#8b7355';
  $aiActionsResult.appendChild(loading);

  try {
    // Load settings (model and system prompt only)
    const { data: settingsData } = await db.queryOnce({
      settings: { $: { where: { userId: currentUser.id } } }
    });
    const settings = settingsData?.settings || [];
    const userSettings = settings[0] || {};
    const model = userSettings.aiModel || 'gpt-4o';
    const systemPrompt = userSettings.aiSystemPrompt || 'You are a helpful assistant that analyzes my OneList document. Respond strictly based on provided context.';

    // Collect context for the action
    const contextText = getRangeContent(type);
    const instruction = actionInstruction(type);

    // Build messages
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `Action: ${type}. Instruction: ${instruction}` }
    ];

    if (contextText && contextText.trim()) {
      const truncated = contextText.length > 8000 ? '...' + contextText.slice(-8000) : contextText;
      messages.push({ role: 'system', content: `Context:\n\n${truncated}` });
    } else {
      messages.push({ role: 'system', content: 'Context: No date-based content found. If applicable, provide a general guidance with clear caveats.' });
    }

    messages.push({ role: 'user', content: 'Return the result in clear sections and bullet points.' });

    // Call serverless proxy (reads OPENAI_API_KEY from env)
    const resp = await fetch('/api/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.5, max_tokens: 900 }),
    });

    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson.error || 'Failed to get AI response');
    }

    const data = await resp.json();
    const answer = data.answer || 'No response from AI';

    // Increment usage count
    await incrementAiUsage();

    // Render
    $aiActionsResult.innerHTML = formatAiResponse(answer);
    
    // Update usage display
    updateAiUsageDisplay();
  } catch (err) {
    $aiActionsResult.innerHTML = `<div class="ai-message-content">Error: ${escapeHtml(err.message)}</div>`;
  }
}

// ==================== AI CHAT FUNCTIONALITY (OLD - KEPT FOR COMPATIBILITY) ====================

// Format AI response with markdown-like styling
function formatAiResponse(text) {
  // Escape HTML first
  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert **bold** to <strong>
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Convert *italic* to <em>
  formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // Convert numbered lists (1. 2. 3. etc)
  formatted = formatted.replace(/^(\d+\.\s.+)$/gm, '<div class="ai-list-item">$1</div>');
  
  // Convert bullet points (- or *)
  formatted = formatted.replace(/^[-*]\s(.+)$/gm, '<div class="ai-list-item">• $1</div>');
  
  // Convert line breaks to <br>
  formatted = formatted.replace(/\n/g, '<br>');
  
  return formatted;
}

// ==================== SETTINGS FUNCTIONALITY ====================

// Show settings modal
async function showSettingsModal() {
  if (!currentUser) return;

  try {
    const { data } = await db.queryOnce({
      settings: {
        $: {
          where: {
            userId: currentUser.id,
          },
        },
      },
    });

    const settings = data?.settings || [];
    if (settings.length > 0) {
      const userSettings = settings[0];
      currentSettingsId = userSettings.id;

      $settingsAiModel.value = userSettings.aiModel || 'gpt-4o';
      $settingsAiSystemPrompt.value = userSettings.aiSystemPrompt || '';
    } else {
      // No settings yet - set defaults
      currentSettingsId = null;
      $settingsAiModel.value = 'gpt-4o';
      $settingsAiSystemPrompt.value = 'You are a helpful assistant that analyzes my OneList document. Answer questions based on the document content. If you cannot find relevant information in the document, say so clearly.';
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }

  openModal($settingsModal);
}

// Save settings
$btnSaveSettings.addEventListener('click', async () => {
  if (!currentUser) return;

  const model = $settingsAiModel.value;
  const systemPrompt = $settingsAiSystemPrompt.value.trim();

  try {
    if (currentSettingsId) {
      const updateData = {
        aiModel: model,
        aiSystemPrompt: systemPrompt,
        updatedAt: Date.now(),
      };
      await db.transact([
        tx.settings[currentSettingsId].update(updateData),
      ]);
    } else {
      const settingsId = id();
      await db.transact([
        tx.settings[settingsId].update({
          userId: currentUser.id,
          aiModel: model,
          aiSystemPrompt: systemPrompt,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      ]);
      currentSettingsId = settingsId;
    }

    // Show success feedback
    const originalText = $btnSaveSettings.textContent;
    $btnSaveSettings.textContent = 'Saved!';
    setTimeout(() => {
      $btnSaveSettings.textContent = originalText;
    }, 1500);
  } catch (err) {
    console.error('Error saving settings:', err);
    alert('Failed to save settings: ' + err.message);
  }
});

// ==================== AI USAGE QUOTA MANAGEMENT ====================

// Initialize AI usage tracking for new users
async function initializeAiUsage() {
  if (!currentUser) return;
  
  const usageId = id();
  const resetDate = getNextMonthFirstDay();
  
  try {
    await db.transact([
      tx.aiUsage[usageId].update({
        userId: currentUser.id,
        count: 0,
        resetDate: resetDate.toISOString(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ]);
    
    currentAiUsageId = usageId;
    aiUsageCount = 0;
    usageResetDate = resetDate;
  } catch (err) {
    console.error('Error initializing AI usage:', err);
  }
}

// Get the first day of next month
function getNextMonthFirstDay() {
  const now = new Date();
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const month = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
  return new Date(year, month, 1, 0, 0, 0, 0);
}

// Check if usage needs to be reset
async function checkAndResetUsage() {
  if (!currentAiUsageId || !usageResetDate) return;
  
  const now = new Date();
  if (now >= usageResetDate) {
    // Reset the counter
    const newResetDate = getNextMonthFirstDay();
    
    try {
      await db.transact([
        tx.aiUsage[currentAiUsageId].update({
          count: 0,
          resetDate: newResetDate.toISOString(),
          updatedAt: Date.now(),
        }),
      ]);
      
      aiUsageCount = 0;
      usageResetDate = newResetDate;
      console.log('[AI Usage] Counter reset for new month');
    } catch (err) {
      console.error('Error resetting AI usage:', err);
    }
  }
}

// Check if user can run AI action
async function checkAiQuota() {
  // Ensure usage is initialized
  if (!currentAiUsageId) {
    await initializeAiUsage();
  }
  
  // Check and reset if needed
  await checkAndResetUsage();
  
  if (aiUsageCount >= AI_MONTHLY_LIMIT) {
    const resetDateStr = usageResetDate ? usageResetDate.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    }) : '1st of next month';
    
    $aiActionsResult.innerHTML = `
      <div class="ai-message-content" style="color: #d9534f;">
        <strong>Monthly AI limit reached (${AI_MONTHLY_LIMIT}/${AI_MONTHLY_LIMIT})</strong><br><br>
        Your free tier allows ${AI_MONTHLY_LIMIT} AI generations per month. Your quota will reset on <strong>${resetDateStr}</strong>.
      </div>
    `;
    return false;
  }
  
  return true;
}

// Increment AI usage count
async function incrementAiUsage() {
  if (!currentAiUsageId) return;
  
  const newCount = aiUsageCount + 1;
  
  try {
    await db.transact([
      tx.aiUsage[currentAiUsageId].update({
        count: newCount,
        updatedAt: Date.now(),
      }),
    ]);
    
    aiUsageCount = newCount;
    console.log(`[AI Usage] Count: ${aiUsageCount}/${AI_MONTHLY_LIMIT}`);
  } catch (err) {
    console.error('Error incrementing AI usage:', err);
  }
}

// Update AI usage display in modal
function updateAiUsageDisplay() {
  const container = document.querySelector('#ai-actions-modal .modal-content');
  if (!container) return;
  
  // Remove existing usage display
  const existing = container.querySelector('.ai-usage-display');
  if (existing) {
    existing.remove();
  }
  
  // Create new usage display
  const usageDisplay = document.createElement('div');
  usageDisplay.className = 'ai-usage-display';
  
  const remaining = Math.max(0, AI_MONTHLY_LIMIT - aiUsageCount);
  const resetDateStr = usageResetDate ? usageResetDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long'
  }) : '1st of next month';
  
  if (remaining > 0) {
    usageDisplay.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
      <span>${remaining} generation${remaining !== 1 ? 's' : ''} remaining this month</span>
    `;
    usageDisplay.style.color = remaining <= 3 ? '#d9534f' : '#8b7355';
  } else {
    usageDisplay.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
      <span>Limit reached • Resets ${resetDateStr}</span>
    `;
    usageDisplay.style.color = '#d9534f';
  }
  
  // Insert after the title
  const title = container.querySelector('h2');
  if (title) {
    title.insertAdjacentElement('afterend', usageDisplay);
  }
  
  // Reinitialize Lucide icons for dynamic content
  if (typeof lucide !== 'undefined') {
    setTimeout(() => lucide.createIcons(), 0);
  }
}
