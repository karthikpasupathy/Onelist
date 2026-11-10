import { state } from './appState.js';
import {
  $editor,
  $snapshotsModal,
} from './dom.js';

import { editorHistory } from './appState.js';
import { scheduleSave, syncSaveTracking } from './documentSync.js';
import { updateLineCounter } from './editorStatus.js';
import { downloadText } from './exportUtils.js';
import { closeModal, openModal } from './modals.js';
import { store } from './store/index.js';
import { showToast } from './toast.js';

const SNAPSHOT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_UNPINNED_SNAPSHOTS = 20;

let lastSnapshotTime = 0;
// Content of the most recent snapshot per year, so an unchanged document is
// not stored again.
const lastSnapshotContent = new Map();
let unsubscribeSnapshots = null;

// Allow the next save to take a snapshot straight away (a different version of
// the document was just loaded).
export function resetSnapshotClock() {
  lastSnapshotTime = 0;
}

export async function saveSnapshot(content, year = state.currentYear) {
  if (!state.currentUser) return;

  // Only snapshot if enough time has passed and the text actually changed.
  const now = Date.now();
  if (now - lastSnapshotTime < SNAPSHOT_INTERVAL) return;
  if (lastSnapshotContent.get(year) === content) {
    lastSnapshotTime = now;
    return;
  }

  try {
    await store.addSnapshot({
      id: store.createId(),
      userId: state.currentUser.id,
      year,
      content,
      createdAt: now,
      pinned: false,
    });

    lastSnapshotTime = now;
    lastSnapshotContent.set(year, content);
    // Cleanup is handled by the snapshot subscription
  } catch (err) {
    console.error('Error saving snapshot:', err);
  }
}

// Keep at most MAX_UNPINNED_SNAPSHOTS automatic snapshots per year.
function pruneSnapshots(snapshots) {
  const snapshotsByYear = new Map();
  snapshots.filter((snapshot) => !snapshot.pinned).forEach((snapshot) => {
    const year = Number.isInteger(snapshot.year) ? snapshot.year : state.currentYear;
    if (!snapshotsByYear.has(year)) snapshotsByYear.set(year, []);
    snapshotsByYear.get(year).push(snapshot);
  });

  snapshotsByYear.forEach((yearSnapshots, year) => {
    const sorted = yearSnapshots.sort((a, b) => a.createdAt - b.createdAt);
    const newest = sorted[sorted.length - 1];
    if (newest && !lastSnapshotContent.has(year)) {
      lastSnapshotContent.set(year, newest.content || '');
    }

    if (sorted.length <= MAX_UNPINNED_SNAPSHOTS) return;

    console.log(`[Snapshot Cleanup] Year ${year} has ${sorted.length} unpinned snapshots. Limit is ${MAX_UNPINNED_SNAPSHOTS}.`);
    sorted.slice(0, sorted.length - MAX_UNPINNED_SNAPSHOTS).forEach((snapshot) => {
      store.deleteSnapshot(snapshot.id).catch((err) => {
        console.error('[Snapshot Cleanup] Error deleting snapshot:', err);
      });
    });
  });
}

export function startSnapshotSync(userId) {
  stopSnapshotSync();
  unsubscribeSnapshots = store.watchSnapshots(userId, pruneSnapshots);
}

export function stopSnapshotSync() {
  unsubscribeSnapshots?.();
  unsubscribeSnapshots = null;
  lastSnapshotTime = 0;
  lastSnapshotContent.clear();
}

export async function showSnapshotsModal() {
  if (!state.currentUser) return;

  const allSnapshots = await store.fetchSnapshots(state.currentUser.id);

  // Separate pinned and unpinned snapshots
  const yearSnapshots = allSnapshots.filter(
    (snapshot) => (snapshot.year || state.currentYear) === state.currentYear
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
    $title.textContent = `Snapshots (${state.currentYear})`;
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
    updateLineCounter();
    syncSaveTracking();
    scheduleSave();
    closeModal($snapshotsModal);
  });

  const downloadBtn = document.createElement('button');
  downloadBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  downloadBtn.setAttribute('aria-label', 'Download');
  downloadBtn.title = 'Download';
  downloadBtn.addEventListener('click', () => {
    downloadText(snapshot.content || '', `OneList snapshot ${snapshot.year || state.currentYear} - ${snapshot.createdAt}.txt`);
  });

  const pinBtn = document.createElement('button');
  pinBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>';
  pinBtn.setAttribute('aria-label', isPinned ? 'Unpin' : 'Pin');
  pinBtn.title = isPinned ? 'Unpin' : 'Pin';
  pinBtn.className = isPinned ? 'pin-btn pinned' : 'pin-btn';
  pinBtn.addEventListener('click', async () => {
    try {
      await store.updateSnapshot(snapshot.id, { pinned: !isPinned });
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
