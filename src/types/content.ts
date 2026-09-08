/**
 * SINGLE SOURCE OF TRUTH for game content and balance.
 *
 * Two schemas live here:
 *  - Row parsing (`parseCardRow`): turns one spreadsheet row (all cells are
 *    STRINGS, in the team's own phrasing) into a `Card`. Used by
 *    scripts/build-content.ts and by tests. Never used in the browser.
 *  - `CardSchema` / `BalanceSchema`: the JSON shape written to src/data/ and
 *    re-validated by the game at runtime.
 *
 * `validateContentSet` holds the cross-row rules and runs in the build, the
 * game and the tests, so malformed content is caught in every path.
 *
 * Keep this file free of browser-only or Node-only imports — it is compiled for both.
 */
import { z } from 'zod';

// ------------------------------------------------------------------ metrics
export const METRICS = ['team', 'quality', 'deadline', 'budget'] as const;
export type Metric = (typeof METRICS)[number];
export const BOUNDS = [0, 100] as const;
export type Bound = (typeof BOUNDS)[number];

export const CARD_TYPES = ['start', 'regular', 'gameover', 'end'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'svg'] as const;

// --------------------------------------------------------------- JSON shape
const EffectsSchema = z.object({
  team: z.number().int(),
  quality: z.number().int(),
  deadline: z.number().int(),
  budget: z.number().int(),
});
export type Effects = z.infer<typeof EffectsSchema>;
export const ZERO_EFFECTS: Effects = { team: 0, quality: 0, deadline: 0, budget: 0 };

const ChoiceSchema = z.object({
  /** Label on the parchment tag. Optional on non-regular cards (uiStrings fallback). */
  text: z.string().min(1).optional(),
  effects: EffectsSchema,
});
export type Choice = z.infer<typeof ChoiceSchema>;

export const CardSchema = z.object({
  id: z.string().min(1),
  type: z.enum(CARD_TYPES),
  situation: z.string().min(1),
  illustration: z.object({
    /** Filename under public/assets/images/ (existence verified at build time). */
    file: z.string().min(1),
    /** The author's description — doubles as the prompt for generating the art. */
    prompt: z.string(),
  }),
  left: ChoiceSchema,
  right: ChoiceSchema,
  /** gameover cards only: which metric hit which bound. */
  gameover: z.object({ metric: z.enum(METRICS), bound: z.union([z.literal(0), z.literal(100)]) }).optional(),
  /** end cards only: month band lower bound, or the special deck-exhausted card. */
  end: z.union([z.object({ minMonths: z.number().int().min(0) }), z.object({ exhausted: z.literal(true) })]).optional(),
  /** start cards only: `first` = intro/tutorial card, `again` = later runs. */
  startKind: z.enum(['first', 'again']).optional(),
}).superRefine((c, ctx) => {
  // The trigger field must match the card type, so a stale/hand-edited JSON
  // cannot smuggle in a card that never appears (or appears in the wrong place).
  const expect = (present: boolean, field: string, wanted: boolean) => {
    if (present !== wanted) {
      ctx.addIssue({ code: 'custom', message: `${c.type} card "${c.id}" must ${wanted ? 'have' : 'not have'} "${field}"` });
    }
  };
  expect(c.gameover !== undefined, 'gameover', c.type === 'gameover');
  expect(c.end !== undefined, 'end', c.type === 'end');
  expect(c.startKind !== undefined, 'startKind', c.type === 'start');
});
export type Card = z.infer<typeof CardSchema>;
export const ContentFileSchema = z.array(CardSchema);

// ------------------------------------------------------------------ balance
const ms = z.number().int().min(0).max(5000);
const label = z.string().min(1);
const screenStrings = z.object({ left: label, right: label, header: z.string() });

/** Gameplay balancing + UI boilerplate — tune in content/balance.json, never in code. */
export const BalanceSchema = z.object({
  metrics: z
    .object({ start: z.number().int(), min: z.number().int(), max: z.number().int() })
    .refine((m) => m.min < m.start && m.start < m.max, 'metrics.start must lie strictly between min and max'),
  /** Every effect value authored in the spreadsheet must be one of these. */
  allowedEffects: z.array(z.number().int()).min(1),
  swipe: z.object({
    /** Fraction of the card width the pointer must travel before release commits the choice. */
    thresholdFraction: z.number().min(0.05).max(1),
    maxRotationDeg: z.number().min(0).max(90),
    /** Drag distance (design px) before the preview appears. */
    deadzonePx: z.number().min(0).max(500),
  }),
  anim: z.object({ flyOffMs: ms, snapBackMs: ms, dealInMs: ms, barTweenMs: ms, deltaFloatMs: ms }),
  /** A metric within this distance of a bound is drawn in the danger colour. */
  dangerWithin: z.number().int().min(0).max(100),
  /** Starting volumes (0–1; players adjust with the sliders) and the music file in public/assets/audio/. */
  audio: z.object({
    sfxVolume: z.number().min(0).max(1),
    musicVolume: z.number().min(0).max(1),
    music: z.string().regex(/^[^/\\]+\.(mp3|ogg|m4a|wav)$/i, 'music must be a filename (mp3/ogg/m4a/wav) in public/assets/audio/'),
  }),
  uiStrings: z.object({
    /** Game title, shown on the intro and start screens. */
    title: label,
    intro: screenStrings,
    start: screenStrings,
    gameover: screenStrings,
    end: screenStrings,
    metricLabels: z.object({ team: label, quality: label, deadline: label, budget: label }),
    month: label,
    months: label,
    loading: label,
    rotateDevice: label,
    sfxLabel: label,
    musicLabel: label,
  }),
});
export type Balance = z.infer<typeof BalanceSchema>;

// ------------------------------------------------------- spreadsheet columns
/**
 * Canonical column keys. Spreadsheet headers are matched after
 * trim/lowercase/whitespace-collapse, so "Swipe Left  Effect" matches.
 */
export const COLUMNS = {
  id: 'id',
  type: 'card type',
  situation: 'situation text',
  illustration: 'situation illustration',
  leftText: 'swipe left text',
  leftEffect: 'swipe left effect',
  rightText: 'swipe right text',
  rightEffect: 'swipe right effect',
  notes: 'notes',
  /** Optional dedicated trigger column; when present it is used instead of Notes. */
  trigger: 'trigger',
} as const;
export type ColumnKey = keyof typeof COLUMNS;
export const REQUIRED_COLUMNS: readonly ColumnKey[] = [
  'id',
  'type',
  'situation',
  'illustration',
  'leftText',
  'leftEffect',
  'rightText',
  'rightEffect',
];

export function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

/** Raw row keyed by canonical ColumnKey (cells are trimmed strings, missing = ''). */
export type RawRow = Partial<Record<ColumnKey, string>>;

const CARD_TYPE_WORDS: Record<string, CardType> = {
  'start card': 'start',
  start: 'start',
  intro: 'start',
  'intro card': 'start',
  'regular draw': 'regular',
  regular: 'regular',
  'game over card': 'gameover',
  'game over': 'gameover',
  gameover: 'gameover',
  'end card': 'end',
  end: 'end',
};

const METRIC_WORDS: Record<string, Metric> = {
  team: 'team',
  quality: 'quality',
  deadline: 'deadline',
  deadlines: 'deadline',
  budget: 'budget',
};
const METRIC_RE = 'team|quality|deadlines?|budget';

/** Phrases authors put in effect cells that describe flow, not effects. Ignored. */
const FLOW_PHRASE_RE = /^(then\s+)?(regular draw|regular|end card|end|start card|start|game over card|game over|none|no effect|nothing)$/;

function normaliseFreeText(s: string): string {
  return s
    .replace(/[−–—]/g, '-') // minus, en dash, em dash -> hyphen
    .replace(/[()]/g, ' ') // "(then regular draw)"
    .replace(/\.(?!\d)/g, ' ') // trailing full stops: "then regular draw."
    .replace(/([+-])\s+(?=\d)/g, '$1') // "+ 10" -> "+10"
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface EffectsParse {
  effects: Effects;
  errors: string[];
  warnings: string[];
}

/**
 * Parses the team's free-text effect cell, e.g.
 *   "-20 to team, +10 to deadlines, +10 to budget, then regular draw"
 *   "Team +20, deadlines -10, budget -10"
 *   "Budget -20, quality +10"
 */
export function parseEffects(cell: string, allowedEffects: readonly number[]): EffectsParse {
  const effects: Effects = { ...ZERO_EFFECTS };
  const errors: string[] = [];
  const warnings: string[] = [];
  let text = normaliseFreeText(cell);
  // Excel's plain CSV export turns a Unicode minus (U+2212) into "?", so "?20" is
  // an author's "−20". Read it as minus but tell them to use a plain hyphen.
  if (/\?\s*(?=\d)/.test(text)) {
    warnings.push(`"${cell.trim()}": "?" before a number was read as a minus sign (the export lost a special minus character — type a plain hyphen instead)`);
    text = text.replace(/\?\s*(?=\d)/g, '-');
  }
  if (text === '') return { effects, errors, warnings };

  const seen = new Set<Metric>();
  const fragments = text.split(/\s*(?:,|;|&|\/|\bthen\b|\band\b)\s*/).filter((f) => f !== '');
  for (const frag of fragments) {
    if (FLOW_PHRASE_RE.test(frag)) continue;
    const m =
      new RegExp(`^([+-]?\\d+)\\s*(?:to|on|for)?\\s*(?:the\\s+)?(${METRIC_RE})$`).exec(frag) ??
      new RegExp(`^(${METRIC_RE})\\s*[:=]?\\s*([+-]?\\d+)$`).exec(frag);
    if (!m) {
      errors.push(`unrecognised effect "${frag}" (write e.g. "Team +10, Budget -20" or "-10 to deadlines")`);
      continue;
    }
    const numStr = /^[+-]?\d+$/.test(m[1]!) ? m[1]! : m[2]!;
    const metricWord = numStr === m[1] ? m[2]! : m[1]!;
    const metric = METRIC_WORDS[metricWord]!;
    const value = Number(numStr);
    if (seen.has(metric)) {
      errors.push(`metric "${metric}" appears twice in the same effect cell`);
      continue;
    }
    seen.add(metric);
    if (!allowedEffects.includes(value)) {
      errors.push(`effect ${value} on ${metric} is not allowed (allowed: ${allowedEffects.join(', ')})`);
      continue;
    }
    effects[metric] = value;
  }
  return { effects, errors, warnings };
}

export type Trigger =
  | { kind: 'gameover'; metric: Metric; bound: Bound }
  | { kind: 'end'; minMonths: number }
  | { kind: 'exhausted' }
  | { kind: 'start'; startKind: 'first' | 'again' };

/**
 * Non-regular cards say *when* they appear via the Trigger column (preferred)
 * or, failing that, the Notes column:
 *   gameover: "Team 0 card", "Budget 100"
 *   end:      "0-6 months", "25+ months", "Completed all available decision cards"
 *   start:    "Card for first playthrough", "subsequent playthroughs"
 */
export function parseTrigger(type: CardType, text: string): Trigger | { error: string } {
  const t = normaliseFreeText(text);
  switch (type) {
    case 'gameover': {
      const m = new RegExp(`\\b(${METRIC_RE})\\b\\D*?\\b(100|0)\\b`).exec(t);
      if (!m) return { error: `game over card needs its trigger in Trigger/Notes, e.g. "Team 0 card" or "Budget 100 card" (got "${text}")` };
      return { kind: 'gameover', metric: METRIC_WORDS[m[1]!]!, bound: Number(m[2]) as Bound };
    }
    case 'end': {
      if (/completed|all available|exhaust|all cards|no more cards|every card/.test(t)) return { kind: 'exhausted' };
      const range = /(\d+)\s*-\s*(\d+)\s*months?/.exec(t) ?? /(\d+)\s*\+\s*(months?)?/.exec(t) ?? /(\d+)\s*months?\s*(?:and|or)?\s*(?:more|over|plus)/.exec(t);
      if (!range) return { error: `end card needs its month band in Trigger/Notes, e.g. "0-6 months", "25+ months" or "Completed all available decision cards" (got "${text}")` };
      return { kind: 'end', minMonths: Number(range[1]) };
    }
    case 'start':
      return { kind: 'start', startKind: /\bfirst\b|intro|tutorial/.test(t) ? 'first' : 'again' };
    case 'regular':
      return { error: 'regular cards have no trigger' };
  }
}

export interface RowParseOptions {
  allowedEffects: readonly number[];
  /**
   * Returns the illustration filename for a card, or null if none exists.
   * `cell` is the raw illustration cell; when it is itself a filename the
   * resolver must check that exact name, otherwise look for `card-<id>.<ext>`.
   */
  resolveIllustration: (id: string, cell: string) => string | null;
  /** Situation text longer than this is a warning (the card shrinks the font). */
  maxSituationLength?: number;
  maxChoiceLength?: number;
}

/**
 * skipped reasons:
 *  - template:   nothing filled in (a spreadsheet placeholder row)
 *  - wip:        has text but no Card type yet
 *  - incomplete: a Regular draw whose situation or a whole choice side is still blank
 */
export type RowParseResult =
  | { status: 'ok'; card: Card; warnings: string[] }
  | { status: 'skipped'; reason: 'template' | 'wip' | 'incomplete'; warnings: string[] }
  | { status: 'error'; errors: string[]; warnings: string[] };

/** Does the illustration cell look like a filename rather than a prompt? */
export function illustrationCellAsFilename(cell: string): { file: string } | { unsupported: string } | null {
  const m = /^\S+\.([a-z0-9]{2,5})$/i.exec(cell.trim());
  if (!m) return null;
  const ext = m[1]!.toLowerCase();
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext) ? { file: cell.trim() } : { unsupported: ext };
}

/** Parse one spreadsheet row. Errors/warnings are phrased for content authors (no row prefix; the caller adds it). */
export function parseCardRow(raw: RawRow, opts: RowParseOptions): RowParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cell = (k: ColumnKey): string => (raw[k] ?? '').trim();

  const typeWord = normaliseFreeText(cell('type'));
  const hasContent = (['situation', 'illustration', 'leftText', 'rightText', 'leftEffect', 'rightEffect'] as const).some((k) => cell(k) !== '');
  if (typeWord === '' || typeWord === 'card type') {
    return { status: 'skipped', reason: hasContent ? 'wip' : 'template', warnings };
  }
  const type = CARD_TYPE_WORDS[typeWord];
  if (!type) {
    return {
      status: 'error',
      errors: [`Card type "${cell('type')}" is not one of: Start card, Regular draw, Game over card, End card`],
      warnings,
    };
  }
  // A typed row with nothing else filled in is still just a placeholder.
  if (!hasContent) return { status: 'skipped', reason: 'template', warnings };

  const id = cell('id');
  if (id === '') errors.push('ID must not be empty');
  else if (!/^[A-Za-z0-9_-]+$/.test(id)) errors.push(`ID "${id}" may only contain letters, digits, "-" and "_" (it names the image file card-${id}.png)`);

  const situation = cell('situation');
  if (situation === '') errors.push('Situation text must not be empty');
  else if (situation.length > (opts.maxSituationLength ?? 220)) {
    warnings.push(`Situation text is ${situation.length} characters; keep it under ${opts.maxSituationLength ?? 220} so it fits the card`);
  }

  // Illustration: required. The cell is normally the art prompt; the file is card-<id>.<ext>.
  const illCell = cell('illustration');
  let file: string | null = null;
  if (illCell === '') {
    errors.push('Situation illustration must not be empty (describe the picture; the file is public/assets/images/card-<ID>.png)');
  } else {
    const asFile = illustrationCellAsFilename(illCell);
    if (asFile && 'unsupported' in asFile) {
      errors.push(`illustration file type ".${asFile.unsupported}" is not supported (use ${IMAGE_EXTENSIONS.join(', ')})`);
    } else if (id !== '') {
      file = opts.resolveIllustration(id, illCell);
      if (!file) {
        errors.push(
          asFile
            ? `illustration file "${asFile.file}" not found in public/assets/images/ (name must match exactly, including case)`
            : `illustration missing — add public/assets/images/card-${id}.png (or .svg/.jpg/.webp). Prompt: "${illCell}"`,
        );
      }
    }
  }

  const left = parseEffects(cell('leftEffect'), opts.allowedEffects);
  const right = parseEffects(cell('rightEffect'), opts.allowedEffects);
  errors.push(...left.errors.map((e) => `Swipe left effect: ${e}`), ...right.errors.map((e) => `Swipe right effect: ${e}`));
  warnings.push(...left.warnings.map((w) => `Swipe left effect: ${w}`), ...right.warnings.map((w) => `Swipe right effect: ${w}`));

  const leftText = cell('leftText');
  const rightText = cell('rightText');
  const maxChoice = opts.maxChoiceLength ?? 60;
  for (const [name, t] of [['Swipe left text', leftText], ['Swipe right text', rightText]] as const) {
    if (t.length > maxChoice) warnings.push(`${name} is ${t.length} characters; keep it under ${maxChoice}`);
  }

  const isZero = (e: Effects) => METRICS.every((m) => e[m] === 0);
  let gameover: Card['gameover'];
  let end: Card['end'];
  let startKind: Card['startKind'];

  if (type === 'regular') {
    // Still being written: a side with neither text nor effect, or no situation yet.
    // Skip with a note rather than fail the whole build on someone's half-typed row.
    const sideBlank = (text: string, effect: string) => text === '' && normaliseFreeText(effect) === '';
    if (situation === '' || sideBlank(leftText, cell('leftEffect')) || sideBlank(rightText, cell('rightEffect'))) {
      return { status: 'skipped', reason: 'incomplete', warnings };
    }
    if (leftText === '') errors.push('Swipe left text is required on a Regular draw card');
    if (rightText === '') errors.push('Swipe right text is required on a Regular draw card');
    if (left.errors.length === 0 && isZero(left.effects)) errors.push('Swipe left effect must change at least one metric');
    if (right.errors.length === 0 && isZero(right.effects)) errors.push('Swipe right effect must change at least one metric');
  } else {
    if (!isZero(left.effects) || !isZero(right.effects)) {
      errors.push(`${cell('type')} cards cannot change metrics — leave the effect cells empty or write "${type === 'end' ? 'Start card' : type === 'gameover' ? 'End card' : 'Regular draw'}"`);
    }
    const triggerText = cell('trigger') !== '' ? cell('trigger') : cell('notes');
    const trig = parseTrigger(type, triggerText);
    if ('error' in trig) errors.push(trig.error);
    else if (trig.kind === 'gameover') gameover = { metric: trig.metric, bound: trig.bound };
    else if (trig.kind === 'end') end = { minMonths: trig.minMonths };
    else if (trig.kind === 'exhausted') end = { exhausted: true };
    else startKind = trig.startKind;
  }

  if (errors.length > 0) return { status: 'error', errors, warnings };

  const card: Card = {
    id,
    type,
    situation,
    illustration: { file: file!, prompt: illustrationCellAsFilename(illCell) ? '' : illCell },
    left: { ...(leftText !== '' ? { text: leftText } : {}), effects: left.effects },
    right: { ...(rightText !== '' ? { text: rightText } : {}), effects: right.effects },
    ...(gameover ? { gameover } : {}),
    ...(end ? { end } : {}),
    ...(startKind ? { startKind } : {}),
  };
  return { status: 'ok', card, warnings };
}

// ------------------------------------------------------------ set-level rules
export interface SetValidation {
  errors: string[];
  warnings: string[];
}

/** Cross-card rules. Runs in the build, in the game at boot, and in tests. */
export function validateContentSet(cards: readonly Card[], balance: Balance): SetValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const seen = new Map<string, string>();
  for (const c of cards) {
    const key = c.id.toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) errors.push(`duplicate id "${c.id}" (ids are compared case-insensitively; first used by "${first}")`);
    else seen.set(key, c.id);
  }

  const byType = (t: CardType) => cards.filter((c) => c.type === t);
  const regular = byType('regular');
  if (regular.length === 0) errors.push('no Regular draw cards — the deck is empty');
  const starts = byType('start');
  if (starts.length === 0) errors.push('no Start card');
  else if (!starts.some((s) => s.startKind === 'first')) {
    const msg = 'no Start card is marked for the first playthrough (put "first playthrough" in its Notes)';
    // With several start cards this is almost certainly a mistake; with one it is a fine fallback.
    if (starts.length > 1) errors.push(msg);
    else warnings.push(`${msg} — the same start card will be used as the intro`);
  }
  if (!starts.some((s) => s.startKind === 'again') && starts.length > 0) {
    warnings.push('no Start card for subsequent playthroughs — the intro card will be reused');
  }

  for (const metric of METRICS) {
    for (const bound of BOUNDS) {
      if (!cards.some((c) => c.gameover?.metric === metric && c.gameover.bound === bound)) {
        errors.push(`missing Game over card for ${metric} ${bound} (add a row with "${metric} ${bound}" in Notes)`);
      }
    }
  }

  const bands = cards.filter((c) => c.end && 'minMonths' in c.end).map((c) => (c.end as { minMonths: number }).minMonths);
  if (!bands.includes(0)) errors.push('missing End card for the 0-6 months band (needs "0-6 months" in Notes)');
  const topBand = Math.max(0, ...bands);
  if (regular.length > 0 && regular.length < topBand) {
    warnings.push(`only ${regular.length} Regular draw cards, so the "${topBand}+ months" end card can never be reached`);
  }
  if (regular.length > 0 && regular.length < 8) {
    warnings.push(`only ${regular.length} Regular draw cards — runs will be very short (spec targets 5–15 minutes)`);
  }

  for (const c of cards) {
    for (const side of ['left', 'right'] as const) {
      for (const m of METRICS) {
        const v = c[side].effects[m];
        if (!balance.allowedEffects.includes(v)) errors.push(`card "${c.id}": ${side} effect ${v} on ${m} is not in balance.allowedEffects`);
      }
    }
  }
  return { errors, warnings };
}
