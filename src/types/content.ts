/**
 * SINGLE SOURCE OF TRUTH for game content and balance schemas.
 *
 * Used by BOTH:
 *  - scripts/build-content.ts (validates the CSV/JSON authored by the team)
 *  - the game at runtime (parses the generated JSON defensively)
 *
 * To change the content format after the planning meeting: edit the schema here,
 * update the CSV columns in content/game-content.csv, run `pnpm run content`.
 * TypeScript types are derived automatically via z.infer.
 *
 * Keep this file free of browser-only or Node-only imports — it is compiled for both.
 */
import { z } from 'zod';

// ---- Helpers for CSV columns (every CSV cell arrives as a STRING) -------------
// Use these instead of bare z.number()/z.boolean(), which would reject every row.
//   points: csvInt(0, 100),                      -> number
//   weight: csvNumber(0, 1),                     -> number (decimals allowed)
//   kind:   csvEnum(['good', 'bad', 'neutral']), -> 'good' | 'bad' | 'neutral'
//   flag:   csvBool,                             -> boolean ("true"/"yes"/"1" -> true)
//   note:   optionalText,                        -> string | undefined ("" -> undefined)
const nonEmpty = (field: string) => z.string().trim().min(1, `${field} must not be empty`);
export const optionalText = z.string().trim().optional().transform((v) => (v === '' ? undefined : v));
export const csvNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, 'must be a number')
    .transform(Number)
    .pipe(z.number().min(min).max(max));
export const csvInt = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^-?\d+$/, 'must be a whole number')
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
export const csvEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.string().trim().pipe(z.enum(values));
export const csvBool = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(['true', 'false', 'yes', 'no', '1', '0', '']))
  .transform((v) => v === 'true' || v === 'yes' || v === '1');

/** One independently authored piece of content == one spreadsheet row. */
export const ContentItemSchema = z.object({
  id: nonEmpty('id').regex(/^[a-z0-9-]+$/, 'id must be lowercase letters, digits and hyphens only'),
  title: nonEmpty('title'),
  text: nonEmpty('text'),
  /** Optional filename under public/assets/images/ (existence checked at build time). */
  image: optionalText,
});
export type ContentItem = z.infer<typeof ContentItemSchema>;

export const ContentFileSchema = z.array(ContentItemSchema).min(1, 'content must contain at least one item');

/**
 * Fields on a ContentItem that reference another item's id.
 * Add e.g. 'nextId' here and the build script will verify the target exists.
 */
export const ID_REFERENCE_FIELDS: readonly (keyof ContentItem)[] = [];

/** Fields on a ContentItem that name an asset file, with the folder they live in. */
export const ASSET_FIELDS: readonly { field: keyof ContentItem; dir: string }[] = [
  { field: 'image', dir: 'public/assets/images' },
];

/** Gameplay balancing values — tune in content/balance.json, never in code. */
export const BalanceSchema = z.object({
  itemsPerRun: z.number().int().min(1).max(1000),
  pointsPerItem: z.number().int().min(0).max(100000),
});
export type Balance = z.infer<typeof BalanceSchema>;
