import { state } from './appState.js';
import {
  $app,
  $btnRunSearch,
  $btnSearchModal,
  $editor,
  $results,
  $searchInput,
  $searchModal,
  $searchResultsModal,
  $searchScopeSelect,
} from './dom.js';

import { ensureCurrentDocumentIsSafe, loadYearDocument } from './documentSync.js';
import { closeModal, openModal } from './modals.js';
import { lineMatchesQuery, parseSearchQuery } from './searchUtils.js';
import { getAvailableYears } from './yearSwitcher.js';

let currentSearchScope = 'current';

export function openSearchModal() {
  if ($app.style.display === 'none') return;

  openModal($searchModal);
  $searchScopeSelect.value = currentSearchScope;
  $searchInput.focus();
  if (typeof lucide !== 'undefined') {
    setTimeout(() => lucide.createIcons(), 0);
  }
}

$btnSearchModal.addEventListener('click', openSearchModal);


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
        content: year === state.currentYear ? $editor.value : (state.documentsByYear.get(year)?.content || ''),
      }))
    : [{
        year: state.currentYear,
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

  if (year !== state.currentYear) {
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
