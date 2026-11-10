// InstantDB implementation of the OneList storage interface.
//
// Interface (localStore.js implements the same one):
//
//   isLocal                         true when data never leaves this browser
//   createId()                      new entity id
//   onAuthChange(cb)                cb(user | null) on sign-in / sign-out
//   sendMagicCode(email)
//   signInWithMagicCode(email, code)
//   signOut()
//   isConnected()                   false while the realtime link is down
//   onConnectionChange(cb)          cb('connected' | 'offline' | 'error')
//   watchDocuments(userId, cb)      cb(docs) now and on every change
//   fetchDocuments(userId)          one fresh read from the server
//   createDocument(doc)
//   updateDocumentFields(doc, fields)
//   saveDocumentContent({...})      compare-and-swap save, see below
//   watchSnapshots / fetchSnapshots / addSnapshot / updateSnapshot / deleteSnapshot
//   watchSnippets / saveSnippet / deleteSnippet
import { init, tx, id } from '@instantdb/core';
import { documentRev } from '../syncGuard.js';

function ownedBy(entity, userId) {
  return { [entity]: { $: { where: { userId } } } };
}

export function createInstantStore({ appId, schema }) {
  const db = init({ appId, schema });
  let connectionStatus = 'connecting';
  // Flips to false if the backend rejects the `rev` / `prevRev` attributes
  // (schema not pushed yet). Saves then fall back to the old unversioned write.
  let revSupported = true;

  function mapStatus(status) {
    if (status === 'authenticated') return 'connected';
    if (status === 'errored') return 'error';
    if (status === 'closed') return 'offline';
    return 'connecting';
  }

  async function transact(steps) {
    const result = await db.transact(steps);
    // InstantDB resolves with status "enqueued" when the socket is down: the
    // write only sits in its local queue. Only "synced" means the server has it.
    return result?.status === 'synced' ? 'saved' : 'queued';
  }

  function isServerRejection(err) {
    return Boolean(err?.body);
  }

  async function fetchCollection(entity, userId) {
    const result = await db.queryOnce(ownedBy(entity, userId));
    return result.data?.[entity] || [];
  }

  function watchCollection(entity, userId, onData, onError) {
    return db.subscribeQuery(ownedBy(entity, userId), (resp) => {
      if (resp.error) {
        console.error(`[Store] ${entity} subscription error:`, resp.error);
        onError?.(resp.error);
        return;
      }
      onData(resp.data?.[entity] || []);
    });
  }

  return {
    isLocal: false,

    createId: () => id(),

    onAuthChange(cb) {
      return db.subscribeAuth((auth) => cb(auth.user || null));
    },
    sendMagicCode: (email) => db.auth.sendMagicCode({ email }),
    signInWithMagicCode: (email, code) => db.auth.signInWithMagicCode({ email, code }),
    signOut: () => db.auth.signOut(),

    // Saving while the socket is down would only park the write in InstantDB's
    // local queue, to be replayed blindly later. Prefer the live status; the
    // event-tracked one is the fallback. An unknown state counts as connected
    // because a save attempt reports "queued" anyway if it was not.
    isConnected() {
      const live = db._reactor?.status;
      if (typeof live === 'string') return live === 'authenticated';
      return connectionStatus !== 'offline' && connectionStatus !== 'error';
    },
    onConnectionChange(cb) {
      if (typeof db.subscribeConnectionStatus !== 'function') {
        connectionStatus = 'connected';
        return () => {};
      }
      return db.subscribeConnectionStatus((status) => {
        connectionStatus = mapStatus(status);
        cb(connectionStatus);
      });
    },

    watchDocuments: (userId, onData, onError) => watchCollection('documents', userId, onData, onError),
    fetchDocuments: (userId) => fetchCollection('documents', userId),

    async createDocument(doc) {
      const { id: docId, ...fields } = doc;
      if (revSupported) {
        try {
          await transact([tx.documents[docId].update({ ...fields, rev: 1, prevRev: 0 })]);
          return { ...doc, rev: 1 };
        } catch (err) {
          if (!isServerRejection(err)) throw err;
          revSupported = false;
          console.warn('[Store] Versioned create was rejected; retrying without rev. Push instant.schema.ts to enable it.', err);
        }
      }
      await transact([tx.documents[docId].update(fields)]);
      return doc;
    },

    // Metadata-only update (e.g. assigning a year to a legacy document). Still
    // bumps the revision so the server-side version rule accepts it.
    async updateDocumentFields(doc, fields) {
      const baseRev = documentRev(doc);
      const versioned = revSupported ? { rev: baseRev + 1, prevRev: baseRev } : {};
      await transact([tx.documents[doc.id].update({ ...fields, ...versioned })]);
    },

    // Compare-and-swap save. `baseRev` is the revision the caller's text was
    // derived from. Returns:
    //   { status: 'saved', rev }     server accepted it
    //   { status: 'queued' }         not confirmed (link dropped mid-save)
    //   { status: 'conflict', doc }  server has moved on; `doc` is its copy
    async saveDocumentContent({ userId, docId, content, updatedAt, baseRev }) {
      const nextRev = baseRev + 1;
      const fields = revSupported
        ? { content, updatedAt, rev: nextRev, prevRev: baseRev }
        : { content, updatedAt };

      let outcome;
      try {
        outcome = await transact([tx.documents[docId].update(fields, { upsert: false })]);
      } catch (err) {
        if (!isServerRejection(err)) throw err;

        const docs = await fetchCollection('documents', userId).catch(() => null);
        const current = docs?.find((doc) => doc.id === docId);
        if (!current) throw err;

        if (documentRev(current) !== baseRev) {
          return { status: 'conflict', doc: current };
        }

        if (revSupported && !Number.isInteger(current.rev)) {
          revSupported = false;
          console.warn('[Store] Versioned save was rejected; retrying without rev. Push instant.schema.ts to enable it.', err);
          return this.saveDocumentContent({ userId, docId, content, updatedAt, baseRev });
        }

        throw err;
      }

      if (outcome !== 'saved') return { status: 'queued' };
      return { status: 'saved', rev: revSupported ? nextRev : baseRev };
    },

    watchSnapshots: (userId, onData, onError) => watchCollection('snapshots', userId, onData, onError),
    fetchSnapshots: (userId) => fetchCollection('snapshots', userId),
    async addSnapshot(snapshot) {
      const { id: snapshotId, ...fields } = snapshot;
      await transact([tx.snapshots[snapshotId].update(fields)]);
    },
    async updateSnapshot(snapshotId, fields) {
      await transact([tx.snapshots[snapshotId].update(fields)]);
    },
    async deleteSnapshot(snapshotId) {
      await transact([tx.snapshots[snapshotId].delete()]);
    },

    watchSnippets: (userId, onData, onError) => watchCollection('snippets', userId, onData, onError),
    async saveSnippet(snippet) {
      const { id: snippetId, ...fields } = snippet;
      await transact([tx.snippets[snippetId].update(fields)]);
    },
    async deleteSnippet(snippetId) {
      await transact([tx.snippets[snippetId].delete()]);
    },
  };
}
