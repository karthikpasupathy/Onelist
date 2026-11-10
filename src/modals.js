import {
  $app,
  $editor,
} from './dom.js';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let modalReturnFocus = null;
let activeModal = null;

// Modals that need their own cancel logic when dismissed with Escape, the
// close button or a backdrop click. A handler returns true once it has dealt
// with the dismissal itself.
const dismissInterceptors = new Map();

export function onModalDismiss(modal, handler) {
  dismissInterceptors.set(modal, handler);
}

function dismissModal(modal) {
  if (dismissInterceptors.get(modal)?.()) return;
  closeModal(modal);
}


function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((el) => !el.disabled && el.getAttribute('aria-hidden') !== 'true');
}

function getOpenModal() {
  if (activeModal?.getAttribute('aria-hidden') === 'false') {
    return activeModal;
  }

  return Array.from(document.querySelectorAll('.modal')).find(
    (modal) => modal.getAttribute('aria-hidden') === 'false'
  ) || null;
}

export function openModal(modal) {
  if (activeModal && activeModal !== modal) {
    closeModal(activeModal);
  }

  modalReturnFocus = document.activeElement;
  modal.setAttribute('aria-hidden', 'false');
  activeModal = modal;

  requestAnimationFrame(() => {
    const content = modal.querySelector('.modal-content');
    if (!content) return;
    const [firstFocusable] = getFocusableElements(content);
    firstFocusable?.focus();
  });
}

export function closeModal(modal) {
  modal.setAttribute('aria-hidden', 'true');

  if (activeModal === modal) {
    activeModal = null;
  }

  const returnTarget = modalReturnFocus;
  modalReturnFocus = null;

  if (returnTarget && typeof returnTarget.focus === 'function' && document.contains(returnTarget)) {
    returnTarget.focus();
  } else if ($editor && $app.style.display !== 'none') {
    $editor.focus();
  }
}

export function dismissTopModal() {
  const modal = getOpenModal();
  if (!modal) return false;

  dismissModal(modal);
  return true;
}

export function handleModalTabTrap(e) {
  if (e.key !== 'Tab') return;

  const modal = getOpenModal();
  if (!modal) return;

  const content = modal.querySelector('.modal-content');
  if (!content) return;

  const focusable = getFocusableElements(content);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

Array.from(document.querySelectorAll('.modal .modal-close')).forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (!modal) return;
    dismissModal(modal);
  });
});

Array.from(document.querySelectorAll('.modal')).forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      dismissModal(modal);
    }
  });
});
