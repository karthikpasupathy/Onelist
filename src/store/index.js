// The one place that decides which backend the app talks to. Everything else
// imports `store` and uses the interface documented in instantStore.js, so
// replacing InstantDB means writing one new file with the same methods.
import schema from '../../instant.schema.ts';
import { DEV_BYPASS_AUTH } from '../localDevStore.js';
import { createInstantStore } from './instantStore.js';
import { createLocalStore } from './localStore.js';

function createStore() {
  if (DEV_BYPASS_AUTH) return createLocalStore();

  // Read InstantDB App ID from environment variable
  // Users must set VITE_INSTANT_APP_ID in their Vercel environment variables
  const appId = import.meta.env.VITE_INSTANT_APP_ID;
  if (!appId) {
    throw new Error('Missing VITE_INSTANT_APP_ID environment variable. Please configure it in Vercel project settings.');
  }

  return createInstantStore({ appId, schema });
}

export const store = createStore();
