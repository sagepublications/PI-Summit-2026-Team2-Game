/**
 * mulberry32 — tiny seeded PRNG returning floats in [0, 1).
 * Used when the page is opened with ?seed=<number> so play-testers can
 * reproduce a run ("seed 4711 broke on month 6").
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Reads ?seed= from a query string; returns Math.random when absent/invalid. */
export function rngFromQuery(search: string): { rng: () => number; seed: number | null } {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || raw.trim() === '' || !/^-?\d+$/.test(raw.trim())) return { rng: Math.random, seed: null };
  const seed = Number(raw);
  return { rng: mulberry32(seed), seed };
}
