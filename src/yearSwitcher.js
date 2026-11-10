import { state } from './appState.js';
import {
  $btnCancelNewYear,
  $btnConfirmNewYear,
  $newYearError,
  $newYearInput,
  $newYearModal,
  $yearSelect,
} from './dom.js';

import { beginBlankDocument, createDocument, ensureCurrentDocumentIsSafe, loadYearDocument } from './documentSync.js';
import { hideSlashMenu } from './editorCommands.js';
import { closeModal, onModalDismiss, openModal } from './modals.js';

let newYearResolver = null;

export function getAvailableYears() {
  return Array.from(state.documentsByYear.keys()).sort((a, b) => b - a);
}

export function renderYearOptions() {
  if (!$yearSelect) return;

  const years = getAvailableYears();
  if (!years.length) {
    years.push(state.currentYear);
  }

  $yearSelect.innerHTML = '';
  years.forEach((year) => {
    const option = document.createElement('option');
    option.value = String(year);
    option.textContent = String(year);
    if (year === state.currentYear) option.selected = true;
    $yearSelect.appendChild(option);
  });

  const addOption = document.createElement('option');
  addOption.value = '__add_year__';
  addOption.textContent = '+ Year';
  $yearSelect.appendChild(addOption);
}

$yearSelect.addEventListener('change', async () => {
  const selectedValue = $yearSelect.value;

  if (selectedValue === '__add_year__') {
    $yearSelect.value = String(state.currentYear);
    await promptForNewYear();
    return;
  }

  const nextYear = parseInt(selectedValue, 10);
  if (!Number.isInteger(nextYear) || nextYear === state.currentYear) return;

  if (!(await ensureCurrentDocumentIsSafe('switch years'))) {
    $yearSelect.value = String(state.currentYear);
    return;
  }

  const doc = state.documentsByYear.get(nextYear);
  if (doc) {
    loadYearDocument(nextYear);
    return;
  }

  hideSlashMenu();
  beginBlankDocument(nextYear);
  await createDocument(nextYear);
});


async function promptForNewYear() {
  const suggestedYear = Math.max(new Date().getFullYear(), ...getAvailableYears(), state.currentYear) + 1;
  const normalizedInput = await openNewYearModal(String(suggestedYear));
  if (normalizedInput === null) {
    renderYearOptions();
    return;
  }

  const nextYear = parseInt(normalizedInput, 10);

  if (!(await ensureCurrentDocumentIsSafe('switch years'))) {
    renderYearOptions();
    return;
  }

  if (state.documentsByYear.has(nextYear)) {
    loadYearDocument(nextYear);
    return;
  }

  hideSlashMenu();
  beginBlankDocument(nextYear);
  await createDocument(nextYear);
}

function openNewYearModal(defaultValue) {
  return new Promise((resolve) => {
    newYearResolver = resolve;
    $newYearError.textContent = '';
    $newYearInput.value = defaultValue;
    openModal($newYearModal);
    requestAnimationFrame(() => {
      $newYearInput.focus();
      $newYearInput.select();
    });
  });
}

function resolveNewYearModal(value) {
  if (!newYearResolver) return;
  const resolver = newYearResolver;
  newYearResolver = null;
  closeModal($newYearModal);
  resolver(value);
}


$newYearInput.addEventListener('input', () => {
  const digitsOnly = $newYearInput.value.replace(/\D/g, '').slice(0, 4);
  if ($newYearInput.value !== digitsOnly) {
    $newYearInput.value = digitsOnly;
  }
  if ($newYearError.textContent) {
    $newYearError.textContent = '';
  }
});

$newYearInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $btnConfirmNewYear.click();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    resolveNewYearModal(null);
  }
});

$btnCancelNewYear.addEventListener('click', () => {
  resolveNewYearModal(null);
});

$btnConfirmNewYear.addEventListener('click', () => {
  const normalizedInput = $newYearInput.value.trim();
  if (!/^\d{4}$/.test(normalizedInput)) {
    $newYearError.textContent = 'Please enter exactly 4 numbers.';
    $newYearInput.focus();
    return;
  }
  resolveNewYearModal(normalizedInput);
});

onModalDismiss($newYearModal, () => {
  if (!newYearResolver) return false;
  resolveNewYearModal(null);
  return true;
});
