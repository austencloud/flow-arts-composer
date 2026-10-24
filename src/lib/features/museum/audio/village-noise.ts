/**
 * The Room of Collaboration's noise, seeded so the room always sounds the
 * same: the same seed gives the same samples on every machine, which is what
 * lets two renders of the room (/test/village-sound) match.
 *
 * The brown noise is the Flow Fest fire-jam recipe, and with the default seed
 * it is that recipe's exact buffer, so the room did not change when it took
 * its own copy.
 */

/** The fire's noise seed: the Flow Fest fire jam's. */
export const VILLAGE_NOISE_SEED = 0x5f3759df;

/** A linear congruential generator: values in [0, 1], repeatable per seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Seeded brown noise, held within ±1. Loops are four seconds by default. */
export function brownNoiseSamples(
  sampleRate: number,
  seconds = 4,
  seed = VILLAGE_NOISE_SEED
): Float32Array {
  const out = new Float32Array(Math.round(sampleRate * seconds));
  const random = seededRandom(seed);
  let brown = 0;
  for (let i = 0; i < out.length; i++) {
    const white = random() * 2 - 1;
    brown = (brown + white * 0.018) / 1.018;
    out[i] = Math.max(-1, Math.min(1, brown * 3.2));
  }
  return out;
}
