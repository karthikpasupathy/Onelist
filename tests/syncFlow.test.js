// Two simulated devices sharing one server (the local dev store), driven by
// the same decision helpers the app uses. Device state mirrors documentSync.js:
// an editor, a dirty flag, a merge base and the list of unconfirmed writes.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getDocuments,
  saveDocumentContent,
  updateDocumentContent,
  upsertDocument,
} from '../src/localDevStore.js';
import { decideIncoming, hashText, isOwnPendingWrite, versionOf } from '../src/syncGuard.js';
import { mergeThreeWay } from '../src/textMerge.js';

const storage = new Map();
const DOC_ID = 'doc-2026';

test.beforeEach(() => {
  storage.clear();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
});

function seedServer(content, updatedAt = 1_000) {
  upsertDocument({ id: DOC_ID, userId: 'u', year: 2026, content, createdAt: updatedAt, updatedAt });
}

function serverDoc() {
  return getDocuments()[0];
}

function createDevice({ clockOffset = 0 } = {}) {
  let tick = 0;
  const device = {
    editor: '',
    dirty: false,
    base: { rev: -1, updatedAt: -1, content: '' },
    sentWrites: [],
    now: () => 10_000 + clockOffset + ++tick,

    type(content) {
      device.editor = content;
      device.dirty = true;
    },

    // A copy of the document arrives from the server.
    receive(doc = serverDoc()) {
      const incoming = { ...versionOf(doc), content: doc.content };
      const action = decideIncoming({
        base: device.base,
        incoming,
        editorContent: device.editor,
        dirty: device.dirty,
        sentWrites: device.sentWrites,
      });

      if (action === 'adopt') {
        device.editor = incoming.content;
        device.dirty = false;
        device.base = incoming;
      } else if (action === 'merge') {
        device.editor = mergeThreeWay(device.base.content, device.editor, incoming.content);
        device.dirty = device.editor !== incoming.content;
        device.base = incoming;
      }
      return action;
    },

    // Compare-and-swap save with merge-and-retry, as in saveToServer().
    save() {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (device.editor === device.base.content) {
          device.dirty = false;
          return 'clean';
        }

        const content = device.editor;
        const updatedAt = Math.max(device.now(), device.base.updatedAt + 1);
        device.sentWrites.push({ updatedAt, hash: hashText(content) });
        const result = saveDocumentContent({
          docId: DOC_ID,
          content,
          updatedAt,
          baseRev: Math.max(device.base.rev, 0),
        });

        if (result.status === 'saved') {
          device.base = { rev: result.rev, updatedAt, content };
          device.dirty = false;
          return 'saved';
        }

        const incoming = { ...versionOf(result.doc), content: result.doc.content };
        if (isOwnPendingWrite(incoming, device.base, device.sentWrites)) {
          device.base = incoming;
        } else {
          device.receive(result.doc);
        }
      }
      return 'gave-up';
    },
  };
  return device;
}

test('a stale device cannot overwrite a newer save: it merges first', () => {
  seedServer('- a\n- b\n- c');
  const laptop = createDevice();
  const phone = createDevice();
  laptop.receive();
  phone.receive();

  phone.type('- a\n- b\n- c (phone)');
  assert.equal(phone.save(), 'saved');

  // Laptop never saw the phone's save and edits a different line.
  laptop.type('- a (laptop)\n- b\n- c');
  assert.equal(laptop.save(), 'saved');

  assert.equal(serverDoc().content, '- a (laptop)\n- b\n- c (phone)');
  assert.equal(serverDoc().rev, 2);

  assert.equal(phone.receive(), 'adopt');
  assert.equal(phone.editor, laptop.editor);
});

test('clock skew does not decide who wins', () => {
  seedServer('- a\n- b');
  // The laptop's clock runs an hour ahead; the phone's an hour behind.
  const laptop = createDevice({ clockOffset: 3_600_000 });
  const phone = createDevice({ clockOffset: -3_600_000 });
  laptop.receive();
  phone.receive();

  laptop.type('- a\n- b\n- laptop first');
  laptop.save();

  // Phone writes later in real time but with a much smaller timestamp.
  phone.receive();
  phone.type('- a\n- b\n- laptop first\n- phone second');
  phone.save();

  assert.equal(laptop.receive(), 'adopt', 'the later revision is accepted despite its older timestamp');
  assert.equal(laptop.editor, '- a\n- b\n- laptop first\n- phone second');
  assert.ok(serverDoc().updatedAt > 3_600_000, 'timestamps stay monotonic for older clients');
});

test('simultaneous saves from the same base: one wins, the other merges and retries', () => {
  seedServer('- shared');
  const laptop = createDevice();
  const phone = createDevice();
  laptop.receive();
  phone.receive();

  laptop.type('- shared\n- laptop line');
  phone.type('- phone line\n- shared');

  assert.equal(phone.save(), 'saved');
  assert.equal(laptop.save(), 'saved');

  assert.equal(serverDoc().content, '- phone line\n- shared\n- laptop line');
});

test('typing during a save is not a conflict with our own write', () => {
  seedServer('a');
  const laptop = createDevice();
  laptop.receive();

  laptop.type('ab');
  laptop.save();
  const echo = serverDoc();

  // More typing, then the saved copy arrives through the subscription.
  laptop.type('abc');
  assert.equal(laptop.receive(echo), 'ignore');
  assert.equal(laptop.editor, 'abc');
  assert.equal(laptop.save(), 'saved');
  assert.equal(serverDoc().content, 'abc');
});

test('a queued write replayed after a reload is recognised as our own', () => {
  seedServer('a');
  const laptop = createDevice();
  laptop.receive();

  // The write reaches the server but the page dies before the ack is recorded:
  // the device restarts with its old base, its newer draft and the sent-write log.
  laptop.type('ab');
  const updatedAt = laptop.now();
  laptop.sentWrites.push({ updatedAt, hash: hashText('ab') });
  saveDocumentContent({ docId: DOC_ID, content: 'ab', updatedAt, baseRev: 0 });
  laptop.type('abc');

  assert.equal(laptop.receive(), 'ignore', 'own write is not merged as a remote edit');
  assert.equal(laptop.save(), 'saved');
  assert.equal(serverDoc().content, 'abc', 'no conflict markers from merging with ourselves');
});

test('a device reopening with no local changes takes the newer server copy', () => {
  seedServer('laptop old');
  const laptop = createDevice();
  laptop.receive();

  updateDocumentContent(DOC_ID, 'phone newer', 2_000);

  assert.equal(laptop.receive(), 'adopt');
  assert.equal(laptop.editor, 'phone newer');
});

test('edits to the same line from two devices keep both versions visibly', () => {
  seedServer('- call mom');
  const laptop = createDevice();
  const phone = createDevice();
  laptop.receive();
  phone.receive();

  phone.type('- call mom at 6');
  phone.save();
  laptop.type('- call mom tomorrow');
  laptop.save();

  assert.equal(
    serverDoc().content,
    [
      '<<<<<<< ONELIST LOCAL',
      '- call mom tomorrow',
      '||||||| ONELIST REMOTE',
      '- call mom at 6',
      '>>>>>>> ONELIST MERGE CONFLICT',
    ].join('\n')
  );
});

test('typing and undoing back to the saved text sends nothing', () => {
  seedServer('saved');
  const laptop = createDevice();
  laptop.receive();

  laptop.type('saved plus');
  laptop.type('saved');
  assert.equal(laptop.save(), 'clean');
  assert.equal(serverDoc().rev ?? 0, 0);
});
