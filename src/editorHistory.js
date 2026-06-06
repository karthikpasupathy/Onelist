export function createEditorHistory({ maxSize = 100, debounceMs = 400 } = {}) {
  let undoStack = [];
  let isApplying = false;
  let debounceTimer = null;
  let burstStartSnapshot = null;
  let burstActive = false;
  let deleteBurstActive = false;

  function snapshot(editor) {
    return {
      value: editor.value,
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
    };
  }

  function statesEqual(a, b) {
    return (
      a.value === b.value &&
      a.selectionStart === b.selectionStart &&
      a.selectionEnd === b.selectionEnd
    );
  }

  function apply(editor, state) {
    isApplying = true;
    editor.value = state.value;
    editor.selectionStart = state.selectionStart;
    editor.selectionEnd = state.selectionEnd;
    isApplying = false;
  }

  function pushUndo(state) {
    const last = undoStack[undoStack.length - 1];
    if (last && statesEqual(last, state)) return;

    undoStack.push(state);
    if (undoStack.length > maxSize) {
      undoStack.shift();
    }
  }

  function resetBurstTracking() {
    burstActive = false;
    burstStartSnapshot = null;
    deleteBurstActive = false;
  }

  function markBurstStart(editor) {
    if (isApplying || burstActive) return;
    burstStartSnapshot = snapshot(editor);
    burstActive = true;
  }

  function prepareDeleteBurst(editor) {
    if (isApplying) return;

    clearTimeout(debounceTimer);

    if (!deleteBurstActive) {
      burstStartSnapshot = snapshot(editor);
      burstActive = true;
      deleteBurstActive = true;
    }
  }

  function flushBurst(editor) {
    if (!burstActive || !burstStartSnapshot) {
      resetBurstTracking();
      return;
    }

    const current = snapshot(editor);
    if (!statesEqual(burstStartSnapshot, current)) {
      pushUndo(burstStartSnapshot);
    }

    resetBurstTracking();
  }

  function recordDebounced(editor) {
    if (isApplying) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      flushBurst(editor);
    }, debounceMs);
  }

  function beforeEdit(editor) {
    if (isApplying) return;

    clearTimeout(debounceTimer);
    flushBurst(editor);
    pushUndo(snapshot(editor));
    resetBurstTracking();
  }

  function undo(editor) {
    clearTimeout(debounceTimer);
    flushBurst(editor);

    if (!undoStack.length) return false;

    apply(editor, undoStack.pop());
    resetBurstTracking();
    return true;
  }

  function clear() {
    clearTimeout(debounceTimer);
    undoStack = [];
    resetBurstTracking();
  }

  function isHistoryApplying() {
    return isApplying;
  }

  return {
    beforeEdit,
    clear,
    isHistoryApplying,
    markBurstStart,
    prepareDeleteBurst,
    recordDebounced,
    undo,
  };
}
