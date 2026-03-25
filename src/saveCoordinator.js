export function createSaveCoordinator({ saveContent, onStateChange }) {
  let editorRevision = 0;
  let lastRequestedContent = '';
  let lastSavedRevision = 0;
  let pendingSave = false;
  let flushPromise = null;

  function hasPendingChanges() {
    return pendingSave || editorRevision > lastSavedRevision;
  }

  function reset(content = '', { saved = true } = {}) {
    lastRequestedContent = content;
    if (saved) {
      lastSavedRevision = editorRevision;
      pendingSave = false;
    }
  }

  function markDirty(content) {
    editorRevision += 1;
    lastRequestedContent = content;
    pendingSave = true;
    onStateChange?.('saving');
    return editorRevision;
  }

  async function flush({ forced = false } = {}) {
    if (flushPromise) {
      await flushPromise;
      if (!hasPendingChanges()) return false;
    }

    if (!hasPendingChanges()) return false;

    const currentRun = (async () => {
      let didSave = false;

      while (hasPendingChanges()) {
        const revision = editorRevision;
        const content = lastRequestedContent;
        pendingSave = false;
        onStateChange?.('saving');

        const result = await saveContent({ content, forced, revision });
        if (result?.skipped) {
          pendingSave = true;
          if (result.status) onStateChange?.(result.status);
          break;
        }

        lastSavedRevision = revision;
        didSave = true;
        onStateChange?.('saved');
      }

      return didSave;
    })();

    flushPromise = currentRun;

    try {
      return await currentRun;
    } catch (err) {
      onStateChange?.('error');
      throw err;
    } finally {
      if (flushPromise === currentRun) {
        flushPromise = null;
      }
    }
  }

  function getState() {
    return {
      editorRevision,
      hasPendingChanges: hasPendingChanges(),
      lastRequestedContent,
      lastSavedRevision,
      pendingSave,
    };
  }

  return {
    flush,
    getState,
    markDirty,
    reset,
  };
}
