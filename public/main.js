// main.js - OneList with InstantDB
import { init, tx, id } from 'https://cdn.jsdelivr.net/npm/@instantdb/core/+esm';

const APP_ID = 'e94c7dfa-ef77-4fe5-bb80-0cfdc96eb1c0';

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
const $btnCalendar = document.getElementById('btn-calendar');
const $btnSearchModal = document.getElementById('btn-search-modal');
const $searchModal = document.getElementById('search-modal');
const $searchInput = document.getElementById('search-input');
const $searchResultsModal = document.getElementById('search-results-modal');
const $btnProfile = document.getElementById('btn-profile');
const $profileDropdown = document.getElementById('profile-dropdown');
const $btnExportMenu = document.getElementById('btn-export-menu');
const $btnSnapshotsMenu = document.getElementById('btn-snapshots-menu');

let currentUser = null;
let currentDocId = null;
let saveTimer = null;

// Auth state listener
db.subscribeAuth((auth) => {
  if (auth.user) {
    currentUser = auth.user;
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
        // Only update if content actually changed to avoid disrupting typing
        if ($editor.value !== doc.content) {
          const cursorPos = $editor.selectionStart;
          $editor.value = doc.content || '';
          // Restore cursor position if reasonable
          if (cursorPos <= $editor.value.length) {
            $editor.selectionStart = $editor.selectionEnd = cursorPos;
          }
        }
      } else {
        // Create new document
        createDocument();
      }
    }
  );

  // Subscribe to snapshots
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
      // Snapshots loaded - will be used in modal
    }
  );
}

async function createDocument() {
  if (!currentUser) return;
  const docId = id();
  currentDocId = docId;

  await db.transact([
    tx.documents[docId].update({
      userId: currentUser.id,
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  ]);
}

// Date formatting: dd-MM-yyyy
function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function placeCursorAtTop() {
  $editor.focus();
  $editor.selectionStart = $editor.selectionEnd = 0;
  $editor.scrollTop = 0;
}

// Ensure today's date is at top; put cursor on new line after it
function ensureTodayAtTop() {
  const today = formatDate(new Date());
  const lines = $editor.value.split('\n');
  const firstLine = (lines[0] || '').trim();

  if (firstLine === today) {
    // Already present; ensure cursor at start of next line
    const pos = today.length + 1;
    $editor.selectionStart = $editor.selectionEnd = Math.min(pos, $editor.value.length);
    $editor.scrollTop = 0;
    return;
  }

  // Insert today's date at top
  const newHeader = `${today}\n`;
  const newContent = newHeader + $editor.value;
  $editor.value = newContent;

  // Cursor after date header
  const pos = newHeader.length;
  $editor.selectionStart = $editor.selectionEnd = pos;
  $editor.scrollTop = 0;
  scheduleSave();
}

// Insert date header at top
function appendTodayHeader() {
  ensureTodayAtTop();
}

// Profile menu toggle
$btnProfile.addEventListener('click', () => {
  const isOpen = $profileDropdown.getAttribute('aria-hidden') === 'false';
  $profileDropdown.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.profile-menu')) {
    $profileDropdown.setAttribute('aria-hidden', 'true');
  }
});

// Profile menu buttons
$btnExportMenu.addEventListener('click', () => {
  downloadText($editor.value);
  $profileDropdown.setAttribute('aria-hidden', 'true');
});

$btnSnapshotsMenu.addEventListener('click', () => {
  showSnapshotsModal();
  $profileDropdown.setAttribute('aria-hidden', 'true');
});

// Search modal
$btnCalendar.addEventListener('click', appendTodayHeader);

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
  const match = before.match(/(?:^|\s)(\/today|\/tomorrow|\/time|\/line)$/);
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
    replacement = `${hours}:${minutes}`;
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
  }

  const replaced = $editor.value.slice(0, start) + replacement + after;
  $editor.value = replaced;

  const newPos = start + replacement.length;
  $editor.selectionStart = $editor.selectionEnd = newPos;
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
  saveTimer = setTimeout(persistContent, 800);
}

async function persistContent() {
  if (!currentDocId || !currentUser) return;
  const content = $editor.value;

  await db.transact([
    tx.documents[currentDocId].update({
      content,
      updatedAt: Date.now(),
    }),
  ]);

  // Create snapshot every save (we'll limit in UI)
  await saveSnapshot(content);
}

async function saveSnapshot(content) {
  if (!currentUser) return;
  const snapshotId = id();
  const ts = Date.now();

  await db.transact([
    tx.snapshots[snapshotId].update({
      userId: currentUser.id,
      content,
      createdAt: ts,
    }),
  ]);

  // Clean old snapshots (keep last 20)
  const { data } = await db.queryOnce({
    snapshots: {
      $: {
        where: {
          userId: currentUser.id,
        },
      },
    },
  });

  const snapshots = data?.snapshots || [];
  if (snapshots.length > 20) {
    const sorted = snapshots.sort((a, b) => a.createdAt - b.createdAt);
    const toDelete = sorted.slice(0, snapshots.length - 20);
    const deleteTxs = toDelete.map((s) => tx.snapshots[s.id].delete());
    await db.transact(deleteTxs);
  }
}

function placeCursorAtEnd() {
  $editor.focus();
  const len = $editor.value.length;
  $editor.selectionStart = $editor.selectionEnd = len;
  $editor.scrollTop = $editor.scrollHeight;
}

// Export
function downloadText(text, filename = 'onelist.txt') {
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

  const snapshots = (data?.snapshots || []).sort(
    (a, b) => b.createdAt - a.createdAt
  );

  const $list = document.getElementById('snapshot-list');
  $list.innerHTML = '';

  if (!snapshots.length) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="time">No snapshots yet</span>';
    $list.appendChild(li);
  } else {
    snapshots.forEach((snapshot) => {
      const li = document.createElement('li');
      const time = new Date(snapshot.createdAt).toLocaleString();

      const timeSpan = document.createElement('span');
      timeSpan.className = 'time';
      timeSpan.textContent = time;

      const actions = document.createElement('div');
      actions.className = 'actions';

      const restoreBtn = document.createElement('button');
      restoreBtn.textContent = 'Restore';
      restoreBtn.addEventListener('click', async () => {
        $editor.value = snapshot.content || '';
        scheduleSave();
        closeModal($snapshotsModal);
      });

      const downloadBtn = document.createElement('button');
      downloadBtn.textContent = 'Download';
      downloadBtn.addEventListener('click', () => {
        downloadText(snapshot.content || '', `snapshot-${snapshot.createdAt}.txt`);
      });

      actions.appendChild(restoreBtn);
      actions.appendChild(downloadBtn);

      li.appendChild(timeSpan);
      li.appendChild(actions);
      $list.appendChild(li);
    });
  }

  openModal($snapshotsModal);
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
    if (modal) closeModal(modal);
  });
});

Array.from(document.querySelectorAll('.modal')).forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
});

// Events
$btnCalendar.addEventListener('click', appendTodayHeader);
$btnSearchModal.addEventListener('click', () => {
  openModal($searchModal);
  $searchInput.focus();
});

$editor.addEventListener('input', () => {
  handleSlashCommands();
  scheduleSave();
});

$editor.addEventListener('keydown', (e) => {
  // Ctrl+Shift+D -> Append Date
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    appendTodayHeader();
    return;
  }

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

$search.addEventListener('input', updateSearchResults);

// Init
(async function init() {
  await loadContent();
  ensureTodayAtTop();
  updateSearchResults();
})();
