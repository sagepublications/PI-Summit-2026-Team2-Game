/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** Random integer in [min, max] inclusive. */
export function randomInt(min: number, max: number, rng: () => number = Math.random): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick one element at random. */
export function pick<T>(items: readonly T[], rng: () => number = Math.random): T {
  if (items.length === 0) throw new Error('pick() called with empty array');
  return items[Math.floor(rng() * items.length)] as T;
}
