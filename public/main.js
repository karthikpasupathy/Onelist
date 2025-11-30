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
const $btnSearchModal = document.getElementById('btn-search-modal');
const $searchModal = document.getElementById('search-modal');
const $searchInput = document.getElementById('search-input');
const $searchResultsModal = document.getElementById('search-results-modal');
const $btnProfile = document.getElementById('btn-profile');
const $profileDropdown = document.getElementById('profile-dropdown');
const $btnExportMenu = document.getElementById('btn-export-menu');
const $btnSnapshotsMenu = document.getElementById('btn-snapshots-menu');
const $btnTextFormat = document.getElementById('btn-text-format');
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

let currentUser = null;
let currentDocId = null;
let saveTimer = null;

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
  saveTimer = setTimeout(persistContent, 800);
}

async function persistContent() {
  if (!currentDocId || !currentUser) return;
  const content = $editor.value;

  try {
    await db.transact([
      tx.documents[currentDocId].update({
        content,
        updatedAt: Date.now(),
      }),
    ]);

    // Create snapshot every save (we'll limit in UI)
    await saveSnapshot(content);
  } catch (err) {
    console.error('Error saving document:', err);
    alert('Failed to save your document. Please try again.');
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
      }),
    ]);

    lastSnapshotTime = now;

    // Clean old snapshots (keep last 20)
    const { data } = await db.queryOnce({
      snapshots: {
        $: {
          where: {
            userId: currentUser.id,
          },
        },
        createdAt: {},
        id: {},
      },
    });

    const snapshots = data?.snapshots || [];
    if (snapshots.length > 20) {
      const sorted = snapshots.sort((a, b) => a.createdAt - b.createdAt);
      const toDelete = sorted.slice(0, snapshots.length - 20);
      const deleteTxs = toDelete.map((s) => tx.snapshots[s.id].delete());
      await db.transact(deleteTxs);
    }
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
$editor.addEventListener('input', () => {
  handleSlashCommands();
  scheduleSave();
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
