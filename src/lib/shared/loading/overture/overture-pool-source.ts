/**
 * Which sequences the Overture's cold-boot pool holds, by stable id. Read by
 * scripts/build-overture-pool.mjs (which writes static/boot/overture-pool.json)
 * and by overture-pool.test.ts (which recomputes every entry through the real
 * calculator, so the checked-in file cannot drift from the geometry).
 *
 * The pool: the hero's demo word, five CAPs with distinct shapes, and four
 * Zan's Diamond variations. All are loops, so every scene closes on itself.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import demoSequence from "#lib/shared/landing/data/demo-sequence.json";
import {
  HERO_CAP_POOL,
  HERO_ZANS_POOL,
  capSequence,
  zansSequence,
} from "#lib/shared/landing/data/hero-authored-pool.js";

export const OVERTURE_POOL_IDS = [
  "demo",
  "cap:1-AA",
  "cap:2-AA",
  "cap:3-AA",
  "cap:5-AA",
  "cap:7-AA",
  "zans:original",
  "zans:right+2",
  "zans:right+4",
  "zans:right-rev+5",
] as const;

/** The source sequence of a pool id, or null for an unknown id. */
export function overturePoolSequence(id: string): SequenceData | null {
  if (id === "demo") return demoSequence as unknown as SequenceData;
  if (id.startsWith("cap:")) {
    const cap = HERO_CAP_POOL.find((c) => c.id === id.slice(4));
    return cap ? capSequence(cap) : null;
  }
  if (id.startsWith("zans:")) {
    const variation = HERO_ZANS_POOL.find((z) => z.id === id.slice(5));
    return variation ? zansSequence(variation) : null;
  }
  return null;
}
