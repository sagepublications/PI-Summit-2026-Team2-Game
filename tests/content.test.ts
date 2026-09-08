import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CardSchema,
  ContentFileSchema,
  normaliseHeader,
  parseCardRow,
  parseEffects,
  parseTrigger,
  validateContentSet,
  type Balance,
  type Card,
  type RawRow,
} from '../src/types/content.ts';
import rawBalance from '../content/balance.json' with { type: 'json' };
import generated from '../src/data/game-content.json' with { type: 'json' };

const balance = rawBalance as Balance;
const allowed = balance.allowedEffects;
const withImages = (_id: string, cell: string) => (cell.endsWith('.png') ? cell : `card-${_id}.svg`);
const noImages = () => null;

// ---------------------------------------------------------------- effects
test('parses every effect phrasing the team has actually used', () => {
  const cases: [string, Partial<Record<string, number>>][] = [
    ['-20 to team, +10 to deadlines, +10 to budget, then regular draw', { team: -20, deadline: 10, budget: 10 }],
    ['Team +20, deadlines -10, budget -10, then regular draw', { team: 20, deadline: -10, budget: -10 }],
    ['-20 to quality then regular draw', { quality: -20 }],
    ['-10 to deadlines, +10 to quality, then regular draw', { deadline: -10, quality: 10 }],
    ['Budget -20, quality +10, then regular draw', { budget: -20, quality: 10 }],
    ['deadlines -10, quality -10, then regular draw', { deadline: -10, quality: -10 }],
    ['Team −10; Budget +20', { team: -10, budget: 20 }], // Unicode minus, semicolon
    ['team: -10 and budget = 20', { team: -10, budget: 20 }],
    ['+ 10 to the team & quality - 10', { team: 10, quality: -10 }], // spaced signs, "the", ampersand
    ['Deadline +10 (then regular draw)', { deadline: 10 }],
    ['team -10 / budget +10', { team: -10, budget: 10 }],
    ['Team + 10, budget - 10 then regular draw.', { team: 10, budget: -10 }], // v3 row 19: spaced signs, trailing full stop
    ['+20 to team, -10 to budget then regular draw', { team: 20, budget: -10 }],
    ['End card', {}],
    ['', {}],
  ];
  for (const [cell, expected] of cases) {
    const r = parseEffects(cell, allowed);
    assert.deepEqual(r.errors, [], `"${cell}" should parse cleanly`);
    assert.deepEqual(r.effects, { team: 0, quality: 0, deadline: 0, budget: 0, ...expected }, cell);
  }
});

test('a "?" where Excel lost a Unicode minus is read as minus, with a warning', () => {
  const r = parseEffects('Quality +20, Deadlines ?20, Budget ?10', allowed);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.effects, { team: 0, quality: 20, deadline: -20, budget: -10 });
  assert.match(r.warnings[0]!, /read as a minus sign/);
  assert.deepEqual(parseEffects('team +10', allowed).warnings, []);
});

test('rejects effect fragments it cannot understand, disallowed values and duplicate metrics', () => {
  assert.match(parseEffects('Budget +20, Deadlines ??', allowed).errors[0]!, /unrecognised effect "deadlines \?\?"/);
  assert.match(parseEffects('team +15', allowed).errors[0]!, /not allowed/);
  assert.match(parseEffects('team +10, team -10', allowed).errors[0]!, /appears twice/);
  assert.match(parseEffects('morale +10', allowed).errors[0]!, /unrecognised effect/);
});

// ---------------------------------------------------------------- triggers
test('reads game over, end band and start triggers from Notes phrasing', () => {
  assert.deepEqual(parseTrigger('gameover', 'Team 0 card'), { kind: 'gameover', metric: 'team', bound: 0 });
  assert.deepEqual(parseTrigger('gameover', 'Deadlines 100 card'), { kind: 'gameover', metric: 'deadline', bound: 100 });
  assert.deepEqual(parseTrigger('end', '0-6 months card'), { kind: 'end', minMonths: 0 });
  assert.deepEqual(parseTrigger('end', '19 – 24 months'), { kind: 'end', minMonths: 19 });
  assert.deepEqual(parseTrigger('end', '25+ months card'), { kind: 'end', minMonths: 25 });
  assert.deepEqual(parseTrigger('end', 'Completed all available decision cards'), { kind: 'exhausted' });
  assert.deepEqual(parseTrigger('start', 'Card for first playthrough'), { kind: 'start', startKind: 'first' });
  assert.deepEqual(parseTrigger('start', 'Card for subsequent playthroughs'), { kind: 'start', startKind: 'again' });
  assert.ok('error' in parseTrigger('gameover', 'Team card'));
  assert.ok('error' in parseTrigger('end', 'a nice ending'));
});

// -------------------------------------------------------------------- rows
const regularRow: RawRow = {
  id: '17',
  type: 'Regular draw',
  situation: 'You discover the team have created a secret sleep cupboard.',
  illustration: 'Sleep cupboard',
  leftText: 'Take over the sleep cupboard.',
  leftEffect: '-20 to team, +10 to deadlines, +10 to budget, then regular draw',
  rightText: 'Everyone needs a break.',
  rightEffect: 'Team +20, deadlines -10, budget -10, then regular draw',
  notes: 'Team',
};

test('a regular row becomes a card whose JSON round-trips through CardSchema', () => {
  const r = parseCardRow(regularRow, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(r.status, 'ok');
  if (r.status !== 'ok') return;
  assert.equal(r.card.illustration.file, 'card-17.svg');
  assert.equal(r.card.illustration.prompt, 'Sleep cupboard');
  assert.equal(r.card.left.effects.team, -20);
  const reparsed = CardSchema.parse(JSON.parse(JSON.stringify(r.card)));
  assert.deepEqual(reparsed, r.card);
});

test('a missing illustration is an error that includes the prompt and the expected filename', () => {
  const r = parseCardRow(regularRow, { allowedEffects: allowed, resolveIllustration: noImages });
  assert.equal(r.status, 'error');
  if (r.status !== 'error') return;
  assert.match(r.errors[0]!, /card-17\.png/);
  assert.match(r.errors[0]!, /Prompt: "Sleep cupboard"/);
});

test('an illustration cell that is a filename is used directly; unsupported types are rejected', () => {
  const ok = parseCardRow({ ...regularRow, illustration: 'hippo.png' }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(ok.status, 'ok');
  if (ok.status === 'ok') assert.equal(ok.card.illustration.file, 'hippo.png');
  const bad = parseCardRow({ ...regularRow, illustration: 'hippo.gif' }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(bad.status, 'error');
  if (bad.status === 'error') assert.match(bad.errors[0]!, /\.gif.*not supported/);
});

test('template rows are skipped silently; rows with text but no type are flagged as WIP', () => {
  const tpl = parseCardRow({ id: '18', type: 'Card type' }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.deepEqual(tpl, { status: 'skipped', reason: 'template', warnings: [] });
  const wip = parseCardRow({ id: '36', type: 'Card type', situation: 'Azure bill' }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(wip.status, 'skipped');
  if (wip.status === 'skipped') assert.equal(wip.reason, 'wip');
});

test('regular rows need both choice texts and a non-zero effect on each side', () => {
  const r = parseCardRow(
    { ...regularRow, rightText: 'Do nothing', rightEffect: 'then regular draw' },
    { allowedEffects: allowed, resolveIllustration: withImages },
  );
  assert.equal(r.status, 'error');
  if (r.status !== 'error') return;
  assert.ok(r.errors.some((e) => /Swipe right effect must change at least one metric/.test(e)));
  const noText = parseCardRow({ ...regularRow, rightText: '' }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(noText.status, 'error');
  if (noText.status === 'error') assert.ok(noText.errors.some((e) => /Swipe right text is required/.test(e)));
});

test('half-written regular rows are skipped as incomplete, and a typed row with nothing else is a template', () => {
  // Row 25 in content-v2: left text only, right side blank, no image yet.
  const halfDone = parseCardRow(
    { ...regularRow, id: '25', leftEffect: '', rightText: '', rightEffect: '' },
    { allowedEffects: allowed, resolveIllustration: noImages },
  );
  assert.deepEqual(halfDone, { status: 'skipped', reason: 'incomplete', warnings: [] });
  const noSituation = parseCardRow({ ...regularRow, situation: '' }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(noSituation.status, 'skipped');
  // Row 18 in content-v2: "Regular draw" chosen, everything else empty.
  const typedOnly = parseCardRow({ id: '18', type: 'Regular draw', notes: 'Team' }, { allowedEffects: allowed, resolveIllustration: noImages });
  assert.deepEqual(typedOnly, { status: 'skipped', reason: 'template', warnings: [] });
});

test('game over rows take their trigger from Notes (or a Trigger column) and may not change metrics', () => {
  const base: RawRow = {
    id: '1',
    type: 'Game over card',
    situation: 'The team revolts.',
    illustration: 'Locked door',
    leftText: 'What…',
    leftEffect: 'End card',
    rightText: 'What…',
    rightEffect: 'End card',
    notes: 'Team 0 card',
  };
  const ok = parseCardRow(base, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(ok.status, 'ok');
  if (ok.status === 'ok') assert.deepEqual(ok.card.gameover, { metric: 'team', bound: 0 });

  const viaTrigger = parseCardRow({ ...base, notes: 'anything', trigger: 'budget 100' }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(viaTrigger.status, 'ok');
  if (viaTrigger.status === 'ok') assert.deepEqual(viaTrigger.card.gameover, { metric: 'budget', bound: 100 });

  const bad = parseCardRow({ ...base, leftEffect: 'team -10' }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(bad.status, 'error');
  if (bad.status === 'error') assert.match(bad.errors[0]!, /cannot change metrics/);
});

test('start and end rows carry their kind/band; ids must be file-name safe', () => {
  const base: RawRow = { id: '15', type: 'Start card', situation: 'Welcome.', illustration: 'Manager', leftText: 'Go', rightText: 'Go' };
  const first = parseCardRow({ ...base, notes: 'Card for first playthrough' }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(first.status, 'ok');
  if (first.status === 'ok') assert.equal(first.card.startKind, 'first');
  const again = parseCardRow({ ...base, id: '16', notes: 'Card for subsequent playthroughs' }, { allowedEffects: allowed, resolveIllustration: withImages });
  if (again.status === 'ok') assert.equal(again.card.startKind, 'again');

  const band = parseCardRow({ ...base, id: '10', type: 'End card', notes: '7-12 months card' }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(band.status, 'ok');
  if (band.status === 'ok') assert.deepEqual(band.card.end, { minMonths: 7 });
  const done = parseCardRow({ ...base, id: '14', type: 'End card', notes: 'Completed all available decision cards' }, { allowedEffects: allowed, resolveIllustration: withImages });
  if (done.status === 'ok') assert.deepEqual(done.card.end, { exhausted: true });
  const noBand = parseCardRow({ ...base, id: '11', type: 'End card', notes: 'a nice ending' }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(noBand.status, 'error');

  const badId = parseCardRow({ ...regularRow, id: 'A 1' }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(badId.status, 'error');
  if (badId.status === 'error') assert.match(badId.errors[0]!, /may only contain/);
});

test('CardSchema rejects a card whose trigger field does not match its type', () => {
  const cards = ContentFileSchema.parse(generated);
  const gameover = cards.find((c) => c.type === 'gameover')!;
  const { gameover: _g, ...stripped } = gameover;
  assert.equal(CardSchema.safeParse(stripped).success, false);
  assert.equal(CardSchema.safeParse({ ...cards.find((c) => c.type === 'regular')!, end: { minMonths: 0 } }).success, false);
});

test('several start cards with none marked "first" is an error; a single unmarked one is only a warning', () => {
  const cards = ContentFileSchema.parse(generated);
  const unmarked = cards.map((c) => (c.type === 'start' ? { ...c, startKind: 'again' as const } : c));
  assert.ok(validateContentSet(unmarked, balance).errors.some((e) => /first playthrough/.test(e)));
  const single = unmarked.filter((c) => c.type !== 'start' || c.id === '16');
  const v = validateContentSet(single, balance);
  assert.deepEqual(v.errors, []);
  assert.ok(v.warnings.some((w) => /first playthrough/.test(w)));
});

test('long text is a warning, not an error', () => {
  const r = parseCardRow({ ...regularRow, situation: 'x'.repeat(300) }, { allowedEffects: allowed, resolveIllustration: withImages });
  assert.equal(r.status, 'ok');
  assert.match(r.warnings[0]!, /300 characters/);
});

test('headers are matched case- and spacing-insensitively', () => {
  assert.equal(normaliseHeader('  Swipe Left   Effect '), 'swipe left effect');
  assert.equal(normaliseHeader('Card_Type'), 'card type');
});

// ---------------------------------------------------------------- set rules
test('the generated content passes the set-level rules (this is what the game re-checks at boot)', () => {
  const cards = ContentFileSchema.parse(generated);
  const v = validateContentSet(cards, balance);
  assert.deepEqual(v.errors, []);
});

test('set-level rules catch a missing game over card, a missing 0-month end card and duplicate ids', () => {
  const cards = ContentFileSchema.parse(generated);
  const withoutBudget100 = cards.filter((c) => !(c.gameover?.metric === 'budget' && c.gameover.bound === 100));
  assert.ok(validateContentSet(withoutBudget100, balance).errors.some((e) => /budget 100/.test(e)));

  const withoutBand0 = cards.filter((c) => !(c.end && 'minMonths' in c.end && c.end.minMonths === 0));
  assert.ok(validateContentSet(withoutBand0, balance).errors.some((e) => /0-6 months/.test(e)));

  const dup: Card = { ...cards[0]!, id: cards[1]!.id.toUpperCase() };
  assert.ok(validateContentSet([...cards, dup], balance).errors.some((e) => /duplicate id/.test(e)));
});

// ------------------------------------------------------------------ encoding
test("the team's Windows-1252 export decodes to real ellipses and pound signs; UTF-8 passes through", async () => {
  const { decodeCsv } = await import('../scripts/encoding.ts');
  const cp1252 = new Uint8Array([0x63, 0x6f, 0x72, 0x72, 0x69, 0x64, 0x6f, 0x72, 0x85, 0x20, 0xa3, 0x39, 0x20, 0x93, 0x94]); // corridor… £9 “”
  assert.deepEqual(decodeCsv(cp1252), { text: 'corridor… £9 “”', fellBack: true });
  const utf8 = new TextEncoder().encode('﻿corridor… £9');
  assert.deepEqual(decodeCsv(utf8), { text: 'corridor… £9', fellBack: false });
});
