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
