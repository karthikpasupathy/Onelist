export function expandSnippetCommand({ after, before, snippetContent, snippetName, start }) {
  if (!snippetContent) return null;

  const token = `/${snippetName}`;
  const lineStart = before.lastIndexOf('\n') + 1;
  const currentLine = before.slice(lineStart);

  if (currentLine.trim() === `- ${token}`) {
    const beforeLineStart = before.slice(0, lineStart);
    const replacement = snippetContent.split('\n').join('\n');
    const selectionStart = beforeLineStart.length + replacement.length;

    return {
      selectionEnd: selectionStart,
      selectionStart,
      value: beforeLineStart + replacement + after,
    };
  }

  const replacement = '\n' + snippetContent.split('\n').join('\n');
  const selectionStart = start + replacement.length;

  return {
    selectionEnd: selectionStart,
    selectionStart,
    value: before.slice(0, start) + replacement + after,
  };
}
