/**
 * The spikes' seeded PRNG. Small, fast and — the point here — identical on
 * every machine, so a person's look is a pure function of their seed and the
 * golden frames are reproducible.
 */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one element of a non-empty array with `rng`. */
export function pick<T>(rng: () => number, arr: readonly T[]): T {
  const v = arr[Math.floor(rng() * arr.length)];
  if (v === undefined) throw new Error("hall: cannot pick from an empty palette");
  return v;
}
