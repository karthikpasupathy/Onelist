// Shared session state. Feature modules read and write this object instead of
// module-level variables so they can live in separate files.
import { createEditorHistory } from './editorHistory.js';

const ACTIVE_YEAR_KEY = 'onelist_active_year';

export function getStoredYear() {
  const stored = parseInt(localStorage.getItem(ACTIVE_YEAR_KEY) || '', 10);
  return Number.isInteger(stored) ? stored : new Date().getFullYear();
}

export function storeActiveYear(year) {
  localStorage.setItem(ACTIVE_YEAR_KEY, String(year));
}

export const state = {
  currentUser: null,
  currentDocId: null,
  currentYear: new Date().getFullYear(),
  // Latest known server copy of each year's document, keyed by year.
  documentsByYear: new Map(),
};

export const editorHistory = createEditorHistory();
