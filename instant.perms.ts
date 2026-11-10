import type { InstantRules } from '@instantdb/core';

const ownerRules = {
  allow: {
    view: 'isOwner',
    create: 'isOwner',
    update: 'isOwner && isStillOwner',
    delete: 'isOwner',
  },
  bind: {
    isOwner: 'auth.id != null && auth.id == data.userId',
    isStillOwner: 'auth.id != null && auth.id == newData.userId',
  },
};

// Documents add an optimistic-concurrency check: an update must name the
// revision it was based on (`prevRev`), and that must still be the stored
// `rev`. A device holding a stale copy is rejected instead of overwriting newer
// text; the app then merges and retries. Documents saved before revisions
// existed (`rev` unset) accept their first versioned write.
//
// Push this only after every device runs a build that writes `rev`; older
// builds do not, and their saves would be refused.
const documentRules = {
  allow: {
    ...ownerRules.allow,
    update: 'isOwner && isStillOwner && isBasedOnCurrentRev',
  },
  bind: {
    ...ownerRules.bind,
    isBasedOnCurrentRev: 'data.rev == null || newData.prevRev == data.rev',
  },
};

const rules = {
  attrs: {
    allow: {
      create: 'false',
    },
  },
  $default: {
    allow: {
      $default: 'false',
    },
  },
  documents: documentRules,
  snapshots: ownerRules,
  snippets: ownerRules,
  settings: ownerRules,
  $users: {
    allow: {
      view: 'auth.id == data.id',
    },
    fields: {
      email: 'auth.id == data.id',
    },
  },
} satisfies InstantRules;

export default rules;
