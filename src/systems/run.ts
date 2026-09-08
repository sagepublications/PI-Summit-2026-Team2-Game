/**
 * Pure run logic — no PixiJS, no DOM. Everything the spec calls "rules":
 * metrics, months, deck, game over at either bound, deck exhaustion, end bands.
 */
import { METRICS, type Balance, type Card, type Effects, type Metric } from '../types/content';
import { shuffle } from '../utils/random';

export type Side = 'left' | 'right';
export type Metrics = Record<Metric, number>;

export interface Run {
  metrics: Metrics;
  /** Regular cards successfully navigated. */
  months: number;
  /** Remaining regular cards, top of the deck last. */
  deck: Card[];
  /** The card currently shown, or null when the deck is exhausted. */
  current: Card | null;
}

export type Outcome =
  | { kind: 'continue' }
  | { kind: 'gameover'; metric: Metric; bound: 0 | 100 }
  | { kind: 'exhausted' };

export interface ChoiceResult {
  deltas: Effects;
  before: Metrics;
  after: Metrics;
  outcome: Outcome;
}

export function createRun(regularCards: readonly Card[], balance: Balance, rng: () => number = Math.random): Run {
  const deck = shuffle(regularCards, rng);
  const s = balance.metrics.start;
  return {
    metrics: { team: s, quality: s, deadline: s, budget: s },
    months: 0,
    deck,
    current: deck.pop() ?? null,
  };
}

/**
 * Which metric ended the run, if any. When several metrics hit a bound on the
 * same choice, the first in METRICS order (team, quality, deadline, budget) wins.
 */
export function findFailure(metrics: Metrics, balance: Balance): { metric: Metric; bound: 0 | 100 } | null {
  for (const m of METRICS) {
    if (metrics[m] <= balance.metrics.min) return { metric: m, bound: 0 };
    if (metrics[m] >= balance.metrics.max) return { metric: m, bound: 100 };
  }
  return null;
}

/** Applies the current card's chosen side. Mutates and returns details for the UI. */
export function applyChoice(run: Run, side: Side, balance: Balance): ChoiceResult {
  if (!run.current) throw new Error('applyChoice called with no current card');
  const deltas = run.current[side].effects;
  const before = { ...run.metrics };
  const after: Metrics = { ...before };
  const { min, max } = balance.metrics;
  for (const m of METRICS) after[m] = Math.max(min, Math.min(max, before[m] + deltas[m]));
  run.metrics = after;

  const failure = findFailure(after, balance);
  if (failure) {
    run.current = null;
    return { deltas, before, after, outcome: { kind: 'gameover', ...failure } };
  }
  run.months += 1;
  run.current = run.deck.pop() ?? null;
  return { deltas, before, after, outcome: run.current ? { kind: 'continue' } : { kind: 'exhausted' } };
}

/** End card for a month count: the band with the highest minMonths ≤ months. */
export function pickEndBand(endCards: readonly Card[], months: number): Card[] {
  let best = -1;
  for (const c of endCards) {
    if (c.end && 'minMonths' in c.end && c.end.minMonths <= months && c.end.minMonths > best) best = c.end.minMonths;
  }
  return endCards.filter((c) => c.end && 'minMonths' in c.end && c.end.minMonths === best);
}

/** Roman numerals for the HUD clock ("MONTH VII"); 0 stays "0". */
export function toRoman(n: number): string {
  if (n <= 0) return '0';
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let rest = n;
  for (const [v, s] of table) while (rest >= v) { out += s; rest -= v; }
  return out;
}
