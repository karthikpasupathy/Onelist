import {
  $app,
  $appVersion,
  $authScreen,
  $btnBack,
  $btnLogout,
  $btnSendCode,
  $btnVerifyCode,
  $codeForm,
  $codeInput,
  $emailForm,
  $emailInput,
} from './dom.js';

import { store } from './store/index.js';
import { showToast } from './toast.js';

const APP_VERSION = __APP_VERSION__;
const APP_BUILD = __APP_BUILD__;
const APP_RELEASE = APP_BUILD === 'local' ? `v${APP_VERSION}` : `v${APP_VERSION} (${APP_BUILD})`;

export function showAuth() {
  $authScreen.style.display = 'flex';
  $app.style.display = 'none';
}

export function showApp() {
  $authScreen.style.display = 'none';
  $app.style.display = 'flex';

  if ($appVersion) {
    $appVersion.textContent = APP_RELEASE;
  }
}

// Send magic code
$btnSendCode.addEventListener('click', async () => {
  const email = $emailInput.value.trim();
  if (!email) {
    showToast('Please enter your email', { type: 'error' });
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast('Please enter a valid email address', { type: 'error' });
    return;
  }

  try {
    $btnSendCode.disabled = true;
    $btnSendCode.textContent = 'Sending...';
    await store.sendMagicCode(email);
    $emailForm.style.display = 'none';
    $codeForm.style.display = 'flex';
    $codeInput.focus();
  } catch (err) {
    showToast('Error sending code: ' + err.message, { type: 'error' });
    $btnSendCode.disabled = false;
    $btnSendCode.textContent = 'Send Code';
  }
});

// Verify code and sign in
$btnVerifyCode.addEventListener('click', async () => {
  const email = $emailInput.value.trim();
  const code = $codeInput.value.trim();

  if (!code) {
    showToast('Please enter the verification code', { type: 'error' });
    return;
  }

  try {
    $btnVerifyCode.disabled = true;
    $btnVerifyCode.textContent = 'Signing in...';
    await store.signInWithMagicCode(email, code);
  } catch (err) {
    showToast('Invalid code. Please try again.', { type: 'error' });
    $btnVerifyCode.disabled = false;
    $btnVerifyCode.textContent = 'Sign In';
    $codeInput.value = '';
    $codeInput.focus();
  }
});

// Back to email input
$btnBack.addEventListener('click', () => {
  $codeForm.style.display = 'none';
  $emailForm.style.display = 'flex';
  $codeInput.value = '';
  $btnSendCode.disabled = false;
  $btnSendCode.textContent = 'Send Code';
  $btnVerifyCode.disabled = false;
  $btnVerifyCode.textContent = 'Sign In';
});

// Enter key support
$emailInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') $btnSendCode.click();
});

$codeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') $btnVerifyCode.click();
});

// Sign out
$btnLogout.addEventListener('click', () => {
  store.signOut();
});
