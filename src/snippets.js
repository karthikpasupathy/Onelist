import { state } from './appState.js';
import {
  $btnCancelSnippet,
  $btnCreateSnippet,
  $btnSaveSnippet,
  $snippetContent,
  $snippetList,
  $snippetName,
  $snippetsFormView,
  $snippetsListView,
  $snippetsModal,
} from './dom.js';

import { isSlashMenuOpen, updateSlashMenu } from './editorCommands.js';
import { openModal } from './modals.js';
import { store } from './store/index.js';
import { showConfirm, showToast } from './toast.js';

export const snippetsByName = new Map();
let snippetCache = [];
let currentEditingSnippetId = null;
let unsubscribeSnippets = null;

export function getSnippetCache() {
  return snippetCache;
}

export function startSnippetSync(userId) {
  stopSnippetSync();
  unsubscribeSnippets = store.watchSnippets(userId, setSnippetCache);
}

export function stopSnippetSync() {
  unsubscribeSnippets?.();
  unsubscribeSnippets = null;
  clearSnippetCache();
}

// Snippets modal
export async function showSnippetsModal() {
  if (!state.currentUser) return;
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
          await store.deleteSnippet(snippet.id);
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
        userId: state.currentUser.id,
        name,
        content,
        updatedAt,
      };

      await store.saveSnippet(nextSnippet);

      upsertSnippetCache(nextSnippet);
    } else {
      const snippetId = store.createId();
      const createdAt = Date.now();
      const nextSnippet = {
        createdAt,
        id: snippetId,
        name,
        content,
        updatedAt: createdAt,
        userId: state.currentUser.id,
      };

      await store.saveSnippet(nextSnippet);

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
