import {
  $editor,
  $editorWrap,
  $slashMenu,
} from './dom.js';

import { editorHistory } from './appState.js';
import { formatTimeStamp, newBulletPrefix } from './bulletPrefix.js';
import { scheduleSave } from './documentSync.js';
import { updateLineCounter } from './editorStatus.js';
import { getCaretCoordinates, getSlashMenuItems, parseSlashContext } from './slashMenu.js';
import { expandSnippetCommand } from './snippetExpansion.js';
import { getSnippetCache, snippetsByName } from './snippets.js';

let slashMenuItems = [];
let slashMenuSelectedIndex = 0;
let slashMenuContext = null;

// Date formatting: dd-MM-yyyy
function formatDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function buildDateHeaderBlock(before, after, dateStr) {
  const header = `${dateStr}\n${newBulletPrefix()}`;

  if (!before && !after) return header;
  if (!before) return header;
  if (before.endsWith('\n\n')) return header;
  if (before.endsWith('\n')) return `\n${header}`;
  return `\n\n${header}`;
}

export function appendTodayDateHeader() {
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

export function isSlashMenuOpen() {
  return Boolean($slashMenu && !$slashMenu.hidden);
}

export function hideSlashMenu() {
  if (!$slashMenu) return;
  $slashMenu.hidden = true;
  $slashMenu.setAttribute('aria-hidden', 'true');
  $slashMenu.innerHTML = '';
  slashMenuItems = [];
  slashMenuSelectedIndex = 0;
  slashMenuContext = null;
}

export function positionSlashMenu() {
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

export function updateSlashMenu() {
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

  slashMenuItems = getSlashMenuItems(context.filter, getSnippetCache(), formatDate);

  if (!slashMenuItems.length) {
    hideSlashMenu();
    return;
  }

  if (slashMenuSelectedIndex >= slashMenuItems.length) {
    slashMenuSelectedIndex = 0;
  }

  renderSlashMenu();
}

// Keyboard navigation while the menu is open.
export function moveSlashSelection(delta) {
  if (!slashMenuItems.length) return;
  slashMenuSelectedIndex =
    (slashMenuSelectedIndex + delta + slashMenuItems.length) % slashMenuItems.length;
  renderSlashMenu();
}

export function applySelectedSlashItem() {
  applySlashMenuItem(slashMenuSelectedIndex);
}

function applySlashMenuItem(index) {
  const item = slashMenuItems[index];
  if (!item || !slashMenuContext) return;
  applySlashCommand(`/${item.name}`, slashMenuContext.start);
}

export function tryExpandSlashOnSpace() {
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
    replacement = formatTimeStamp();
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
