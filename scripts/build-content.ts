/**
 * Content build step: content/game-content.csv + content/balance.json  ->  src/data/*.json
 *
 * Validates everything the spec requires (required fields, unique IDs, types,
 * permitted values, illustration files, cross-card rules) and reports EVERY
 * problem with its spreadsheet row number, then exits non-zero so
 * `pnpm run check` and CI fail. Warnings never fail the build unless --strict.
 *
 * Run with: pnpm run content [--strict]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BalanceSchema,
  IMAGE_EXTENSIONS,
  illustrationCellAsFilename,
  parseCardRow,
  validateContentSet,
  type Balance,
  type Card,
} from '../src/types/content.ts';
import { parseCsvRows } from './csv.ts';
import { decodeCsv } from './encoding.ts';

const ROOT = resolve(import.meta.dirname, '..');
const CSV_PATH = resolve(ROOT, 'content/game-content.csv');
const BALANCE_PATH = resolve(ROOT, 'content/balance.json');
const IMAGES_DIR = resolve(ROOT, 'public/assets/images');
// Generated JSON is imported by the game (bundled + content-hashed by Vite), so a
// deploy can never serve new code with stale cached content or vice versa.
const OUT_DIR = resolve(ROOT, 'src/data');
const STRICT = process.argv.includes('--strict');

const errors: string[] = [];
const warnings: string[] = [];
const notes: string[] = [];
const fail = (msg: string) => errors.push(msg);
const warn = (msg: string) => warnings.push(msg);

// ------------------------------------------------------------------ helpers
/**
 * Excel's plain "CSV (Comma delimited)" export is Windows-1252, not UTF-8, so
 * "…" and "£" arrive as bytes that are invalid UTF-8. Detect and re-decode.
 */
function readCsvText(path: string): string {
  const { text, fellBack } = decodeCsv(readFileSync(path));
  if (fellBack) {
    warn('game-content.csv is not UTF-8 (decoded as Windows-1252). In Excel use File → Save As → "CSV UTF-8 (Comma delimited)" to avoid mangled characters.');
  }
  return text;
}

/**
 * Exact-case file listing. `existsSync` is case-insensitive on Windows/macOS but
 * Linux (CI, GitHub Pages) is not — "Card-1.PNG" vs "card-1.png" must fail here.
 */
const imageFiles = new Set(existsSync(IMAGES_DIR) ? readdirSync(IMAGES_DIR) : []);
function resolveIllustration(id: string, cell: string): string | null {
  const asFile = illustrationCellAsFilename(cell);
  if (asFile && 'file' in asFile) return imageFiles.has(asFile.file) ? asFile.file : null;
  for (const ext of IMAGE_EXTENSIONS) {
    const name = `card-${id}.${ext}`;
    if (imageFiles.has(name)) return name;
  }
  return null;
}

// ------------------------------------------------------------------- balance
function buildBalance(): Balance | undefined {
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
    for (const issue of result.error.issues) fail(`balance.json: ${issue.path.join('.') || '(root)'} – ${issue.message}`);
    return undefined;
  }
  return result.data;
}

// ---------------------------------------------------------------- content CSV
function buildContent(allowedEffects: readonly number[]): Card[] {
  if (!existsSync(CSV_PATH)) {
    fail(`Missing content file: ${CSV_PATH}`);
    return [];
  }

  const parsed = parseCsvRows(readCsvText(CSV_PATH));
  errors.push(...parsed.errors);
  warnings.push(...parsed.warnings);
  if (errors.length > 0) return [];

  const cards: Card[] = [];
  const skippedTemplate: number[] = [];
  for (const { row, raw } of parsed.rows) {
    const label = `Row ${row}${raw.id ? ` (id=${raw.id})` : ''}`;

    const result = parseCardRow(raw, { allowedEffects, resolveIllustration });
    for (const w of result.warnings) warn(`${label}: ${w}`);
    if (result.status === 'skipped') {
      if (result.reason === 'wip') notes.push(`${label}: skipped — has text but "Card type" is not set (work in progress?)`);
      else skippedTemplate.push(row);
      continue;
    }
    if (result.status === 'error') {
      for (const e of result.errors) fail(`${label}: ${e}`);
      continue;
    }
    cards.push(result.card);
  }
  if (skippedTemplate.length > 0) notes.push(`${skippedTemplate.length} empty template row(s) skipped`);

  const mojibake = cards.filter((c) => /Ã.|â€|�/.test(`${c.situation}${c.left.text ?? ''}${c.right.text ?? ''}`));
  for (const c of mojibake) warn(`card "${c.id}": text contains mangled characters (Ã, â€, �) — re-export the CSV as UTF-8`);

  return cards;
}

// ---------------------------------------------------------------------- main
const balance = buildBalance();
const cards = buildContent(balance?.allowedEffects ?? [-20, -10, 0, 10, 20]);
if (balance && errors.length === 0) {
  const set = validateContentSet(cards, balance);
  errors.push(...set.errors);
  warnings.push(...set.warnings);
}

for (const n of notes) console.log(`  · ${n}`);
if (warnings.length > 0) {
  console.warn(`\n⚠ ${warnings.length} warning(s):`);
  for (const w of warnings) console.warn(`  • ${w}`);
  console.warn('');
  if (STRICT) fail(`--strict: ${warnings.length} warning(s) treated as errors`);
}
if (errors.length > 0) {
  console.error(`\n✖ Content validation failed with ${errors.length} error(s):\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error('');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'game-content.json'), JSON.stringify(cards, null, 2) + '\n');
writeFileSync(resolve(OUT_DIR, 'balance.json'), JSON.stringify(balance, null, 2) + '\n');
const count = (t: Card['type']) => cards.filter((c) => c.type === t).length;
console.log(
  `✔ Content OK: ${cards.length} cards (${count('regular')} regular, ${count('start')} start, ${count('gameover')} game over, ${count('end')} end) written to src/data/`,
);
