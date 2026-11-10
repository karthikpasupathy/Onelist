import {
  $btnDecreaseSize,
  $btnIncreaseSize,
  $btnResetFormat,
  $btnSaveFormat,
  $btnTextFormat,
  $editor,
  $fontFamilySelect,
  $fontSizeDisplay,
  $profileDropdown,
  $textFormatModal,
} from './dom.js';

import { closeModal, openModal } from './modals.js';
import { showConfirm } from './toast.js';

const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_FAMILY = 'google-sans-flex';

let currentFontSize = DEFAULT_FONT_SIZE;
let currentFontFamily = DEFAULT_FONT_FAMILY;

export function loadTextFormatting() {
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
    const allowedFamilies = ['google-sans-flex', 'serif', 'sans-serif', 'cursive', 'system-ui'];
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
    'google-sans-flex': "'Google Sans Flex', 'Google Sans', system-ui, sans-serif",
    'serif': "'Georgia', 'Times New Roman', serif",
    'sans-serif': "'Google Sans Flex', 'Google Sans', 'Helvetica Neue', Arial, sans-serif",
    'cursive': "'Comic Sans MS', 'Apple Chancery', cursive",
    'system-ui': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  };

  $editor.style.fontFamily = fontFamilyMap[currentFontFamily] || fontFamilyMap['google-sans-flex'];
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

$btnResetFormat.addEventListener('click', async () => {
  if (await showConfirm('Reset text formatting to default settings?')) {
    resetTextFormatting();
  }
});
