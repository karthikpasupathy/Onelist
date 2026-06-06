let $container = null;
let $confirmDialog = null;
let $confirmMessage = null;
let $btnConfirmCancel = null;
let $btnConfirmOk = null;
let confirmResolver = null;
let toastTimer = null;

function ensureContainer() {
  if ($container) return $container;

  $container = document.createElement('div');
  $container.id = 'toast-container';
  $container.className = 'toast-container';
  $container.setAttribute('aria-live', 'polite');
  $container.setAttribute('aria-atomic', 'true');
  document.body.appendChild($container);
  return $container;
}

export function initConfirmDialog() {
  if ($confirmDialog) return;

  $confirmDialog = document.getElementById('confirm-dialog');
  $confirmMessage = document.getElementById('confirm-message');
  $btnConfirmCancel = document.getElementById('btn-confirm-cancel');
  $btnConfirmOk = document.getElementById('btn-confirm-ok');

  if (!$confirmDialog || !$confirmMessage || !$btnConfirmCancel || !$btnConfirmOk) {
    return;
  }

  $btnConfirmCancel.addEventListener('click', () => resolveConfirm(false));
  $btnConfirmOk.addEventListener('click', () => resolveConfirm(true));

  $confirmDialog.addEventListener('click', (e) => {
    if (e.target === $confirmDialog) resolveConfirm(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $confirmDialog?.getAttribute('aria-hidden') === 'false') {
      e.preventDefault();
      resolveConfirm(false);
    }
  });
}

function resolveConfirm(result) {
  if (!confirmResolver) return;
  const resolver = confirmResolver;
  confirmResolver = null;
  $confirmDialog?.setAttribute('aria-hidden', 'true');
  resolver(result);
}

export function showToast(message, options = {}) {
  const { type = 'info', duration = 4000 } = options;
  const container = ensureContainer();

  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  container.innerHTML = '';
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  container.appendChild(toast);

  toastTimer = setTimeout(() => {
    toast.remove();
    toastTimer = null;
  }, duration);
}

export function showConfirm(message) {
  initConfirmDialog();

  if (!$confirmDialog || !$confirmMessage) {
    return Promise.resolve(window.confirm(message));
  }

  if (confirmResolver) {
    resolveConfirm(false);
  }

  $confirmMessage.textContent = message;
  $confirmDialog.setAttribute('aria-hidden', 'false');
  $btnConfirmOk?.focus();

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}
