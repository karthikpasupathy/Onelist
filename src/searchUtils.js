function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseSearchQuery(rawQuery) {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return { type: 'empty', value: '' };
  }

  if (trimmed.startsWith('#')) {
    const tag = trimmed.slice(1).toLowerCase();
    return { type: 'tag', value: tag, raw: trimmed };
  }

  return { type: 'text', value: trimmed.toLowerCase(), raw: trimmed };
}

export function lineMatchesQuery(line, queryInfo) {
  if (queryInfo.type === 'empty') return false;

  if (queryInfo.type === 'tag') {
    if (!queryInfo.value) {
      return /(?:^|\s)#[\w-]+/i.test(line);
    }

    const pattern = new RegExp(
      `(?:^|\\s)#${escapeRegex(queryInfo.value)}(?:\\b|$|[\\s,.;:])`,
      'i'
    );
    return pattern.test(line);
  }

  return line.toLowerCase().includes(queryInfo.value);
}

export function searchLines(lines, rawQuery) {
  const queryInfo = parseSearchQuery(rawQuery);
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lineMatchesQuery(line, queryInfo)) {
      results.push({ i, line });
    }
  }

  return results;
}
