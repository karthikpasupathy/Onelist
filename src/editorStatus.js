import {
  $editor,
  $lineCount,
  $saveIndicator,
  $wordCount,
} from './dom.js';

import { hasUnsavedEditorChanges } from './documentSync.js';

let lastSaveStatus = 'saved';

// Update save indicator in UI
export function updateSaveIndicator(status) {
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

export function refreshSaveIndicator() {
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
export function updateLineCounter() {
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
