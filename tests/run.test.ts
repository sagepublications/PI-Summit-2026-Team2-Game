import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyChoice, createRun, findFailure, pickEndBand, toRoman } from '../src/systems/run.ts';
import { ZERO_EFFECTS, type Balance, type Card, type Effects } from '../src/types/content.ts';
import rawBalance from '../content/balance.json' with { type: 'json' };

const balance = rawBalance as Balance;

function regular(id: string, left: Partial<Effects>, right: Partial<Effects> = { budget: 10 }): Card {
  return {
    id,
    type: 'regular',
    situation: `Situation ${id}`,
    illustration: { file: `card-${id}.svg`, prompt: '' },
    left: { text: 'L', effects: { ...ZERO_EFFECTS, ...left } },
    right: { text: 'R', effects: { ...ZERO_EFFECTS, ...right } },
  };
}
function endCard(id: string, minMonths: number): Card {
  return { ...regular(id, {}), type: 'end', end: { minMonths } };
}

test('run starts with every metric at the balance start value and month 0', () => {
  const run = createRun([regular('a', { team: -10 })], balance);
  assert.deepEqual(run.metrics, { team: 50, quality: 50, deadline: 50, budget: 50 });
  assert.equal(run.months, 0);
  assert.equal(run.current?.id, 'a');
});

test('a choice applies its deltas, advances one month and deals the next card', () => {
  const run = createRun([regular('a', { team: -10, budget: 20 }), regular('b', { quality: 10 })], balance, () => 0);
  const first = run.current!.id;
  const result = applyChoice(run, 'left', balance);
  assert.equal(result.outcome.kind, 'continue');
  assert.equal(run.months, 1);
  assert.notEqual(run.current!.id, first);
  const expected = first === 'a' ? { team: 40, quality: 50, deadline: 50, budget: 70 } : { team: 50, quality: 60, deadline: 50, budget: 50 };
  assert.deepEqual(result.after, expected);
});

test('hitting the minimum bound is game over; the fatal card does not count as a month', () => {
  const run = createRun([regular('a', { team: -20 }), regular('b', { team: -20 }), regular('c', { team: -20 })], balance);
  applyChoice(run, 'left', balance);
  applyChoice(run, 'left', balance);
  const result = applyChoice(run, 'left', balance);
  assert.deepEqual(result.outcome, { kind: 'gameover', metric: 'team', bound: 0 });
  assert.equal(result.after.team, 0);
  assert.equal(run.months, 2);
  assert.equal(run.current, null);
});

test('hitting the maximum bound is also game over', () => {
  const run = createRun([regular('a', { budget: 20 }), regular('b', { budget: 20 }), regular('c', { budget: 20 })], balance);
  applyChoice(run, 'left', balance);
  applyChoice(run, 'left', balance);
  const result = applyChoice(run, 'left', balance);
  assert.deepEqual(result.outcome, { kind: 'gameover', metric: 'budget', bound: 100 });
});

test('values are clamped to [min, max]', () => {
  const metrics = { team: 10, quality: 50, deadline: 50, budget: 90 };
  const run = { metrics, months: 0, deck: [], current: regular('a', { team: -20, budget: 20 }) };
  const result = applyChoice(run, 'left', balance);
  assert.equal(result.after.team, 0);
  assert.equal(result.after.budget, 100);
});

test('tie-break: when two metrics fail at once the first in team→quality→deadline→budget order is reported', () => {
  const failure = findFailure({ team: 50, quality: 100, deadline: 0, budget: 50 }, balance);
  assert.deepEqual(failure, { metric: 'quality', bound: 100 });
});

test('exhausting the deck ends the run as a success', () => {
  const run = createRun([regular('a', { team: -10 })], balance);
  const result = applyChoice(run, 'left', balance);
  assert.equal(result.outcome.kind, 'exhausted');
  assert.equal(run.months, 1);
  assert.equal(run.current, null);
});

test('each card appears once per run', () => {
  const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => regular(id, { quality: 10 }, { quality: -10 }));
  const run = createRun(cards, balance);
  const seen: string[] = [];
  while (run.current) {
    seen.push(run.current.id);
    applyChoice(run, seen.length % 2 ? 'left' : 'right', balance);
  }
  assert.deepEqual([...seen].sort(), ['a', 'b', 'c', 'd', 'e']);
});

test('end band picks the highest minMonths ≤ months, and bands are inclusive at both edges', () => {
  const ends = [endCard('e0', 0), endCard('e7', 7), endCard('e13', 13), endCard('e19', 19), endCard('e25', 25)];
  const ids = (n: number) => pickEndBand(ends, n).map((c) => c.id);
  assert.deepEqual(ids(0), ['e0']);
  assert.deepEqual(ids(6), ['e0']);
  assert.deepEqual(ids(7), ['e7']);
  assert.deepEqual(ids(12), ['e7']);
  assert.deepEqual(ids(13), ['e13']);
  assert.deepEqual(ids(24), ['e19']);
  assert.deepEqual(ids(25), ['e25']);
  assert.deepEqual(ids(400), ['e25']);
});

test('seeded runs are reproducible', async () => {
  const { mulberry32 } = await import('../src/utils/rng.ts');
  const cards = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => regular(id, { quality: 10 }));
  const order = (seed: number) => createRun(cards, balance, mulberry32(seed)).deck.map((c) => c.id);
  assert.deepEqual(order(42), order(42));
  assert.notDeepEqual(order(42), order(43));
});

test('roman numerals for the clock', () => {
  assert.equal(toRoman(0), '0');
  assert.equal(toRoman(1), 'I');
  assert.equal(toRoman(4), 'IV');
  assert.equal(toRoman(7), 'VII');
  assert.equal(toRoman(11), 'XI');
  assert.equal(toRoman(31), 'XXXI');
  assert.equal(toRoman(49), 'XLIX');
});
