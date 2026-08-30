/**
 * Content build step: content/*.csv|json  ->  public/data/*.json
 *
 * Validates everything the spec requires (required fields, unique IDs, types,
 * ranges, ID references, asset existence, non-empty text) and reports EVERY
 * problem with its spreadsheet row number, then exits non-zero so `pnpm run check`
 * and CI fail. Run with: pnpm run content
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Papa from 'papaparse';
import {
  ASSET_FIELDS,
  BalanceSchema,
  ContentItemSchema,
  ID_REFERENCE_FIELDS,
  type ContentItem,
} from '../src/types/content.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CSV_PATH = resolve(ROOT, 'content/game-content.csv');
const BALANCE_PATH = resolve(ROOT, 'content/balance.json');
const OUT_DIR = resolve(ROOT, 'public/data');

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

// ---------------------------------------------------------------- content CSV
function buildContent(): ContentItem[] {
  if (!existsSync(CSV_PATH)) {
    fail(`Missing content file: ${CSV_PATH}`);
    return [];
  }

  const csv = readFileSync(CSV_PATH, 'utf8').replace(/^﻿/, ''); // strip Excel BOM
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });

  for (const e of parsed.errors) {
    fail(`CSV parse error at row ${e.row === undefined ? '?' : e.row + 2}: ${e.message}`);
  }

  const expected = Object.keys(ContentItemSchema.shape);
  const actual = parsed.meta.fields ?? [];
  for (const col of expected) {
    if (!actual.includes(col)) fail(`CSV is missing required column "${col}"`);
  }
  for (const col of actual) {
    if (!expected.includes(col)) fail(`CSV has unknown column "${col}" (add it to src/types/content.ts or remove it)`);
  }

  const items: ContentItem[] = [];
  const seenIds = new Map<string, number>();

  parsed.data.forEach((raw, i) => {
    const row = i + 2; // 1-based, plus header line -> matches the spreadsheet row
    const id = raw['id'] ?? '';
    const label = `Row ${row}${id ? ` (id=${id})` : ''}`;

    // These checks run on the raw values so that every problem on a row is
    // reported in one pass, even if the row also fails schema validation.
    if (id) {
      const firstRow = seenIds.get(id);
      if (firstRow !== undefined) fail(`${label}: duplicate id, first used on row ${firstRow}`);
      else seenIds.set(id, row);
    }
    for (const { field, dir } of ASSET_FIELDS) {
      const file = raw[field];
      if (file && !existsSync(resolve(ROOT, dir, file))) {
        fail(`${label}: ${field} "${file}" not found in ${dir}/`);
      }
    }

    const result = ContentItemSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        fail(`${label}: ${issue.path.join('.') || '(row)'} – ${issue.message}`);
      }
      return;
    }
    items.push(result.data);
  });

  // Cross-row check: fields that reference another item's id.
  const ids = new Set(seenIds.keys());
  parsed.data.forEach((raw, i) => {
    for (const field of ID_REFERENCE_FIELDS) {
      const ref = raw[field];
      if (ref && !ids.has(ref)) {
        fail(`Row ${i + 2} (id=${raw['id'] ?? ''}): ${field} references unknown id "${ref}"`);
      }
    }
  });

  if (items.length === 0 && errors.length === 0) fail('Content CSV contains no rows');
  return items;
}

// ------------------------------------------------------------------- balance
function buildBalance(): unknown {
  if (!existsSync(BALANCE_PATH)) {
    fail(`Missing balance file: ${BALANCE_PATH}`);
    return undefined;
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(BALANCE_PATH, 'utf8'));
  } catch (e) {
    fail(`balance.json is not valid JSON: ${(e as Error).message}`);
    return undefined;
  }
  const result = BalanceSchema.safeParse(json);
  if (!result.success) {
    for (const issue of result.error.issues) {
      fail(`balance.json: ${issue.path.join('.') || '(root)'} – ${issue.message}`);
    }
    return undefined;
  }
  return result.data;
}

// ---------------------------------------------------------------------- main
const content = buildContent();
const balance = buildBalance();

if (errors.length > 0) {
  console.error(`\n✖ Content validation failed with ${errors.length} error(s):\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error('');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'game-content.json'), JSON.stringify(content, null, 2) + '\n');
writeFileSync(resolve(OUT_DIR, 'balance.json'), JSON.stringify(balance, null, 2) + '\n');
console.log(`✔ Content OK: ${content.length} item(s) written to public/data/`);
