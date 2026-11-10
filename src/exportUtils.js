export function buildAllYearsExport(years, getContentForYear) {
  const sortedYears = [...years].sort((a, b) => b - a);

  return sortedYears
    .map((year) => {
      const content = getContentForYear(year) || '';
      const header = `=== OneList ${year} ===`;
      return content.trim() ? `${header}\n\n${content}` : `${header}\n`;
    })
    .join('\n\n')
    .trimEnd();
}

export function getAllYearsExportFilename(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `OneList all years (${dd}-${mm}-${yyyy}).txt`;
}

export function downloadText(text, filename) {
  // Generate default filename with app name, date, and time if not provided
  if (!filename) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    let hh = now.getHours();
    const min = String(now.getMinutes()).padStart(2, '0');
    const ampm = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12; // Convert to 12-hour format
    const hhStr = String(hh).padStart(2, '0');
    filename = `OneList (${dd}-${mm}-${yyyy} at ${hhStr}:${min} ${ampm}).txt`;
  }
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function getYearFilename(year) {
  return `OneList ${year}.txt`;
}
