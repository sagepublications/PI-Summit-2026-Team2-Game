/**
 * Spreadsheet CSV text -> canonical rows, with the *spreadsheet* row number
 * preserved for every record so validation errors point at the right line.
 * Pure (no filesystem) so it can be unit-tested against docs/content-v1.csv.
 */
import Papa from 'papaparse';
import { COLUMNS, REQUIRED_COLUMNS, normaliseHeader, type ColumnKey, type RawRow } from '../src/types/content.ts';

export interface CsvRow {
  /** 1-based spreadsheet row (header is row 1). */
  row: number;
  raw: RawRow;
}

export interface ParsedCsv {
  rows: CsvRow[];
  errors: string[];
  warnings: string[];
}

export function parseCsvRows(text: string): ParsedCsv {
  const errors: string[] = [];
  const warnings: string[] = [];

  // `skipEmptyLines: true` drops only zero-length lines (e.g. the trailing newline).
  // Excel writes an empty spreadsheet row as ",,,,,,,," — that must stay so row
  // numbers keep matching the sheet; parseCardRow classifies it as a template row.
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transform: (v) => v.trim(),
  });
  for (const e of parsed.errors) {
    // Papa reports "too many/few fields" for Excel's trailing empty column; harmless.
    if (e.code === 'TooManyFields' || e.code === 'TooFewFields') continue;
    errors.push(`CSV parse error at row ${e.row === undefined ? '?' : e.row + 2}: ${e.message}`);
  }

  // Map spreadsheet headers -> canonical column keys (tolerant of case/spacing).
  const headerToKey = new Map<string, ColumnKey>();
  const byNormalised = new Map<string, ColumnKey>(Object.entries(COLUMNS).map(([k, v]) => [v, k as ColumnKey]));
  for (const header of parsed.meta.fields ?? []) {
    const norm = normaliseHeader(header);
    if (norm === '') continue; // Excel's trailing empty column
    const key = byNormalised.get(norm);
    if (key) headerToKey.set(header, key);
    else warnings.push(`CSV column "${header}" is not used by the game and is ignored`);
  }
  const present = new Set(headerToKey.values());
  for (const key of REQUIRED_COLUMNS) {
    if (!present.has(key)) errors.push(`CSV is missing required column "${COLUMNS[key]}"`);
  }
  if (errors.length > 0) return { rows: [], errors, warnings };

  const rows: CsvRow[] = parsed.data.map((record, i) => {
    const raw: RawRow = {};
    for (const [header, key] of headerToKey) raw[key] = record[header] ?? '';
    return { row: i + 2, raw };
  });
  return { rows, errors, warnings };
}
