import { BalanceSchema, ContentFileSchema, type Balance, type ContentItem } from '../types/content';

export interface GameData {
  items: ContentItem[];
  balance: Balance;
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
  return res.json();
}

/**
 * Loads and re-validates the generated JSON. The build script already validated
 * it, but re-checking here means malformed data can never crash the game mid-play:
 * we fail fast with a readable message instead.
 */
export async function loadGameData(): Promise<GameData> {
  const [rawItems, rawBalance] = await Promise.all([
    fetchJson('data/game-content.json'),
    fetchJson('data/balance.json'),
  ]);

  const items = ContentFileSchema.safeParse(rawItems);
  if (!items.success) throw new Error(`Invalid game-content.json:\n${items.error.message}`);

  const balance = BalanceSchema.safeParse(rawBalance);
  if (!balance.success) throw new Error(`Invalid balance.json:\n${balance.error.message}`);

  return { items: items.data, balance: balance.data };
}
