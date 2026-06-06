export const BUILTIN_SLASH_COMMANDS = [
  {
    name: 'today',
    description: "Insert today's date (dd-MM-yyyy)",
    preview: (formatDate) => formatDate(new Date()),
  },
  {
    name: 'tomorrow',
    description: "Insert tomorrow's date (dd-MM-yyyy)",
    preview: (formatDate) => formatDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  },
  {
    name: 'time',
    description: 'Insert current time (H:MM)',
    preview: () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      return `(${hours}:${minutes})`;
    },
  },
  {
    name: 'line',
    description: 'Insert a divider line',
    preview: () => '-'.repeat(36),
  },
];

export function parseSlashContext(value, cursorPos) {
  const before = value.slice(0, cursorPos);
  const match = before.match(/(?:^|\s)(\/[a-zA-Z0-9_]*)$/);
  if (!match) return null;

  const token = match[1];
  const start = before.length - token.length;

  return {
    token,
    filter: token.slice(1).toLowerCase(),
    start,
    end: cursorPos,
  };
}

export function getSlashMenuItems(filter, snippets, formatDate) {
  const items = [];

  BUILTIN_SLASH_COMMANDS.forEach((command) => {
    if (filter && !command.name.startsWith(filter)) return;

    items.push({
      type: 'builtin',
      name: command.name,
      label: `/${command.name}`,
      description: command.description,
      preview: command.preview(formatDate),
    });
  });

  snippets.forEach((snippet) => {
    const name = snippet.name || '';
    if (filter && !name.startsWith(filter)) return;

    items.push({
      type: 'snippet',
      name,
      label: `/${name}`,
      description: 'Snippet',
      preview: truncatePreview(snippet.content || ''),
    });
  });

  return items;
}

function truncatePreview(text) {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= 72) return singleLine;
  return `${singleLine.slice(0, 69)}...`;
}

export function getCaretCoordinates(textarea, position) {
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  const textBefore = textarea.value.slice(0, position);

  const mirroredProperties = [
    'boxSizing',
    'width',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textTransform',
    'textIndent',
    'whiteSpace',
    'wordBreak',
    'overflowWrap',
  ];

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordBreak = 'break-word';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';

  mirroredProperties.forEach((property) => {
    mirror.style[property] = computed[property];
  });

  mirror.textContent = textBefore;
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  document.body.removeChild(mirror);

  const textareaRect = textarea.getBoundingClientRect();
  const lineHeight = parseFloat(computed.lineHeight) || 24;

  return {
    top: markerRect.top - mirrorRect.top - textarea.scrollTop + textareaRect.top,
    left: markerRect.left - mirrorRect.left - textarea.scrollLeft + textareaRect.left,
    lineHeight,
  };
}
