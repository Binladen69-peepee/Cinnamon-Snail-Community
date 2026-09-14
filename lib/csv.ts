/**
 * A small RFC 4180-shaped CSV reader and writer.
 *
 * Every CSV this project touches is a spreadsheet export handed over by the
 * client — a Mighty Networks member export, a Google Sheet of class media — so
 * the parser has to cope with quoted fields containing commas, escaped
 * quotes, a UTF-8 BOM from Excel, and CRLF line endings. It does not try to be
 * a general CSV library beyond that.
 */

/** Splits one physical line. Exported for tests; most callers want parseCsv. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

export type CsvRow = Record<string, string>;

/**
 * Parses a CSV into row objects keyed by lowercased header name.
 *
 * A quoted field may contain newlines, so rows are assembled by counting
 * quotes rather than by splitting on every line break — a class name or
 * address wrapped across two lines would otherwise silently split into two
 * broken rows.
 */
export function parseCsv(text: string): CsvRow[] {
  const withoutBom = text.replace(/^\uFEFF/, "");
  const lines = withoutBom.split(/\r?\n/);

  const records: string[] = [];
  let buffer = "";
  for (const line of lines) {
    buffer = buffer ? `${buffer}\n${line}` : line;
    // An odd number of quotes means the record is still open.
    const quotes = (buffer.match(/"/g) ?? []).length;
    if (quotes % 2 === 0) {
      if (buffer.trim().length > 0) records.push(buffer);
      buffer = "";
    }
  }
  if (buffer.trim().length > 0) records.push(buffer);

  if (records.length < 2) return [];

  const headers = splitCsvLine(records[0]).map((header) => header.toLowerCase());
  return records.slice(1).map((record) => {
    const cells = splitCsvLine(record);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

/** First non-empty value among the candidate column names. */
export function pickColumn(row: CsvRow, candidates: string[]): string {
  for (const candidate of candidates) {
    const value = row[candidate];
    if (value) return value;
  }
  return "";
}

/** Quotes a single cell only when it needs it. */
export function toCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Renders rows to CSV text with a trailing newline. */
export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(toCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(toCsvCell).join(","));
  return `${lines.join("\n")}\n`;
}
