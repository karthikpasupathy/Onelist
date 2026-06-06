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
  documents: ownerRules,
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
