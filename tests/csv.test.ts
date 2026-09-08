import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { parseCsvRows } from '../scripts/csv.ts';
import { decodeCsv } from '../scripts/encoding.ts';
import { parseCardRow, type Balance } from '../src/types/content.ts';
import rawBalance from '../content/balance.json' with { type: 'json' };

const balance = rawBalance as Balance;
const teamExport = () => decodeCsv(readFileSync(resolve(import.meta.dirname, '../docs/content-v4.csv')));

test("the team's real export parses: headers map, trailing empty column ignored, row numbers match the sheet", () => {
  const { text, fellBack } = teamExport();
  assert.equal(fellBack, true);
  const parsed = parseCsvRows(text);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.warnings, []); // "Notes" is a known column; the empty trailing header is silently dropped
  assert.equal(parsed.rows.length, 59);
  assert.equal(parsed.rows[0]!.row, 2);
  assert.equal(parsed.rows[0]!.raw.id, '1');
  assert.equal(parsed.rows[0]!.raw.type, 'Game over card');
  assert.equal(parsed.rows[0]!.raw.notes, 'Team 0 card');
  // Row 16 has an embedded newline inside quotes and still lands on the right row.
  const start = parsed.rows.find((r) => r.raw.id === '15')!;
  assert.equal(start.row, 16);
  assert.match(start.raw.situation!, /Congratulations you have taken over/);
  assert.match(start.raw.situation!, /\n/);
  // Rows after multi-line cells keep their spreadsheet numbers.
  assert.equal(parsed.rows.find((r) => r.raw.id === '36')!.row, 37);
  assert.equal(parsed.rows.find((r) => r.raw.id === '60')!.row, 60);
});

test("the v2 export: 28 finished cards, one half-written row skipped, lost minus signs warned about", () => {
  const { text } = decodeCsv(readFileSync(resolve(import.meta.dirname, '../docs/content-v2.csv')));
  const parsed = parseCsvRows(text);
  assert.deepEqual(parsed.errors, []);
  const outcome = { ok: 0, template: 0, wip: 0, incomplete: [] as number[], error: [] as string[], minusWarnings: 0 };
  for (const { row, raw } of parsed.rows) {
    const r = parseCardRow(raw, { allowedEffects: balance.allowedEffects, resolveIllustration: (id) => `card-${id}.svg` });
    outcome.minusWarnings += r.warnings.filter((w) => /minus sign/.test(w)).length;
    if (r.status === 'ok') outcome.ok++;
    else if (r.status === 'skipped' && r.reason === 'incomplete') outcome.incomplete.push(row);
    else if (r.status === 'skipped') outcome[r.reason]++;
    else outcome.error.push(`row ${row}: ${r.errors.join('; ')}`);
  }
  assert.deepEqual(outcome.error, []);
  assert.equal(outcome.ok, 28); // 8 game over + 6 end + 2 start + 12 regular
  assert.deepEqual(outcome.incomplete, [26]); // id=25 (spreadsheet row 26): right-hand side not written yet
  assert.equal(outcome.template, 21); // 20 placeholder rows + row 18 (typed but empty)
  assert.equal(outcome.wip, 0);
  assert.ok(outcome.minusWarnings >= 10);
});

test('the v3 export: every finished row parses; only row 39 (+30/-30, no-effect choice) is rejected by the rules', () => {
  const { text } = decodeCsv(readFileSync(resolve(import.meta.dirname, '../docs/content-v3.csv')));
  const parsed = parseCsvRows(text);
  assert.deepEqual(parsed.errors, []);
  const errors: Record<string, string[]> = {};
  let ok = 0;
  for (const { raw } of parsed.rows) {
    const r = parseCardRow(raw, { allowedEffects: balance.allowedEffects, resolveIllustration: (id) => `card-${id}.webp` });
    if (r.status === 'ok') ok++;
    else if (r.status === 'error') errors[raw.id!] = r.errors;
  }
  assert.equal(ok, 45); // 8 game over + 6 end + 2 start + 29 regular
  assert.deepEqual(Object.keys(errors), ['39']);
  assert.ok(errors['39']!.some((e) => /30 on quality is not allowed/.test(e)));
  assert.ok(errors['39']!.some((e) => /Swipe right effect must change at least one metric/.test(e)));
});

test('a blank Excel row (",,,,,,,,,") keeps later row numbers aligned and is treated as a template row', () => {
  const text = [
    'ID,Card type,Situation text,Situation illustration,Swipe left text,Swipe left effect,Swipe right text,Swipe right effect,Notes,',
    ',,,,,,,,,',
    '9,Regular draw,Text,Prompt,L,team +10,R,team -10,,',
    '',
  ].join('\r\n');
  const parsed = parseCsvRows(text);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[1]!.row, 3);
  const blank = parseCardRow(parsed.rows[0]!.raw, { allowedEffects: balance.allowedEffects, resolveIllustration: () => 'x.png' });
  assert.deepEqual(blank, { status: 'skipped', reason: 'template', warnings: [] });
});

test('unknown columns warn, missing required columns error, semicolon delimiter is auto-detected', () => {
  const extra = parseCsvRows('ID,Card type,Situation text,Situation illustration,Swipe left text,Swipe left effect,Swipe right text,Swipe right effect,Author\n1,Regular draw,a,b,c,team +10,d,team -10,me\n');
  assert.equal(extra.errors.length, 0);
  assert.match(extra.warnings[0]!, /"Author" is not used/);

  const missing = parseCsvRows('ID,Card type,Situation text\n1,Regular draw,a\n');
  assert.ok(missing.errors.some((e) => /missing required column "situation illustration"/.test(e)));

  const semi = parseCsvRows('ID;Card type;Situation text;Situation illustration;Swipe left text;Swipe left effect;Swipe right text;Swipe right effect\n1;Regular draw;a;b;c;team +10;d;team -10\n');
  assert.equal(semi.errors.length, 0);
  assert.equal(semi.rows[0]!.raw.leftEffect, 'team +10');
});
