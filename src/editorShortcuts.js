export function isUndoShortcut(event) {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod || event.shiftKey) return false;

  // Only lowercase z — Cmd+Shift+Z reports as "Z" and must not trigger undo.
  return event.key === 'z';
}

export function isHistoryInput(event) {
  return event.inputType === 'historyUndo' || event.inputType === 'historyRedo';
}
