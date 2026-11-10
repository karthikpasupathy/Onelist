// Browser-only implementation of the storage interface (see instantStore.js),
// used by `VITE_DEV_BYPASS_AUTH=true npm run dev`. Data lives in localStorage,
// so two tabs behave like two devices sharing one server.
import {
  DEV_USER,
  addSnapshot,
  createLocalId,
  deleteSnapshots,
  deleteSnippet,
  getDocuments,
  getSnapshots,
  getSnippets,
  saveDocumentContent,
  updateSnapshot,
  upsertDocument,
  upsertSnippet,
} from '../localDevStore.js';

const DOCUMENTS_KEY = 'onelist_dev_documents';

export function createLocalStore() {
  const documentsFor = (userId) => getDocuments().filter((doc) => doc.userId === userId);

  return {
    isLocal: true,

    createId: () => createLocalId(),

    onAuthChange(cb) {
      queueMicrotask(() => cb(DEV_USER));
      return () => {};
    },
    async sendMagicCode() {},
    async signInWithMagicCode() {},
    signOut() {
      window.location.reload();
    },

    isConnected: () => true,
    onConnectionChange: () => () => {},

    watchDocuments(userId, onData) {
      queueMicrotask(() => onData(documentsFor(userId)));

      // Another tab wrote to the shared localStorage "server".
      const onStorage = (event) => {
        if (event.key === DOCUMENTS_KEY) onData(documentsFor(userId));
      };
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
    fetchDocuments: async (userId) => documentsFor(userId),

    async createDocument(doc) {
      return upsertDocument({ ...doc, rev: 1 });
    },
    async updateDocumentFields(doc, fields) {
      upsertDocument({ id: doc.id, ...fields });
    },
    async saveDocumentContent({ docId, content, updatedAt, baseRev }) {
      return saveDocumentContent({ docId, content, updatedAt, baseRev });
    },

    watchSnapshots: () => () => {},
    fetchSnapshots: async (userId) => getSnapshots(userId),
    async addSnapshot(snapshot) {
      addSnapshot(snapshot);
    },
    async updateSnapshot(snapshotId, fields) {
      updateSnapshot(snapshotId, fields);
    },
    async deleteSnapshot(snapshotId) {
      deleteSnapshots([snapshotId]);
    },

    watchSnippets(userId, onData) {
      queueMicrotask(() => onData(getSnippets(userId)));
      return () => {};
    },
    async saveSnippet(snippet) {
      upsertSnippet(snippet);
    },
    async deleteSnippet(snippetId) {
      deleteSnippet(snippetId);
    },
  };
}
