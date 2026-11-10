import {
  $btnUpdateDismiss,
  $btnUpdateRefresh,
  $updateBanner,
  $updateBannerIcon,
  $updateBannerMessage,
  $updateBannerTitle,
} from './dom.js';

import { registerSW } from 'virtual:pwa-register';
import { clearSaveTimer, hasUnsavedEditorChanges, persistContent } from './documentSync.js';

let hasPendingAppUpdate = false;
let isApplyingAppUpdate = false;

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    hasPendingAppUpdate = true;
    showUpdateBanner(
      typeof navigator !== 'undefined' && !navigator.onLine
        ? 'Update is ready. Reconnect, then refresh when you are ready.'
        : 'Refresh to load the latest version.'
    );
  },
  onOfflineReady() {
    console.log('[PWA] Offline support is ready.');
  },
});

// Called when the network comes back: surface an update that became ready
// while offline.
export function remindAboutPendingUpdate() {
  if (hasPendingAppUpdate && $updateBanner?.getAttribute('aria-hidden') !== 'false') {
    showUpdateBanner('Update is ready. Refresh when you are ready.');
  }
}

$btnUpdateDismiss?.addEventListener('click', () => {
  if (isApplyingAppUpdate) return;
  hideUpdateBanner();
});

$btnUpdateRefresh?.addEventListener('click', async () => {
  if (!hasPendingAppUpdate || isApplyingAppUpdate) return;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    showUpdateBanner('Reconnect to the internet before refreshing to the latest version.');
    return;
  }

  isApplyingAppUpdate = true;
  $btnUpdateRefresh.disabled = true;
  $btnUpdateDismiss.disabled = true;
  $btnUpdateRefresh.textContent = 'Refreshing...';
  showUpdateBanner('Saving any pending changes, then refreshing...');

  try {
    clearSaveTimer();

    if (hasUnsavedEditorChanges()) {
      await persistContent(true);
      if (hasUnsavedEditorChanges()) {
        showUpdateBanner('We could not save your latest changes yet. Please try again in a moment.');
        return;
      }
    }

    await applyAppUpdate();
  } catch (err) {
    console.error('[PWA] Failed to apply update:', err);
    showUpdateBanner('Refresh failed. Please try again.');
  } finally {
    isApplyingAppUpdate = false;
    $btnUpdateRefresh.disabled = false;
    $btnUpdateDismiss.disabled = false;
    $btnUpdateRefresh.textContent = 'Refresh';
  }
});

async function applyAppUpdate() {
  if (typeof window === 'undefined') return;

  if (!('serviceWorker' in navigator)) {
    forceReloadToLatestVersion();
    return;
  }

  await new Promise((resolve, reject) => {
    let settled = false;
    let fallbackTimer = null;

    const cleanup = () => {
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };

    const finishWithReload = () => {
      if (settled) return;
      settled = true;
      cleanup();
      forceReloadToLatestVersion();
      resolve();
    };

    const handleControllerChange = () => {
      finishWithReload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    fallbackTimer = window.setTimeout(() => {
      console.warn('[PWA] controllerchange did not fire in time. Falling back to hard reload.');
      finishWithReload();
    }, 1800);

    updateServiceWorker(true).catch((err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    });
  });
}

function forceReloadToLatestVersion() {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('app-update', Date.now().toString());
  window.location.replace(nextUrl.toString());
}

function showUpdateBanner(message) {
  showBanner({
    title: 'New version available',
    message,
    refreshLabel: isApplyingAppUpdate ? 'Refreshing...' : 'Refresh',
  });
}

export function hideUpdateBanner() {
  if (!$updateBanner) return;
  $updateBanner.setAttribute('aria-hidden', 'true');
}

function showBanner({ title, message, refreshLabel }) {
  if (!$updateBanner) return;

  if ($updateBannerIcon) {
    $updateBannerIcon.hidden = true;
  }
  if ($updateBannerTitle) {
    $updateBannerTitle.textContent = title;
  }
  if ($updateBannerMessage) {
    $updateBannerMessage.textContent = message;
  }

  if ($btnUpdateDismiss) {
    $btnUpdateDismiss.textContent = 'Dismiss';
    $btnUpdateDismiss.disabled = false;
  }

  if ($btnUpdateRefresh) {
    $btnUpdateRefresh.textContent = refreshLabel;
    $btnUpdateRefresh.disabled = false;
  }

  $updateBanner.setAttribute('aria-hidden', 'false');

  if (typeof lucide !== 'undefined') {
    setTimeout(() => lucide.createIcons(), 0);
  }
}
