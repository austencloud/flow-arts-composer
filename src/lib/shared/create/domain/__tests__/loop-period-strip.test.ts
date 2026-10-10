/**
 * Why a LOOP restricts which turn periods the strip will offer.
 *
 * A LOOP repeats a seed block: a 16-step halved LOOP is an 8-step block played
 * twice, a quartered one is a 4-step block played four times. If the turn
 * pattern's period does not divide that block, the turns drift against the
 * shape — the second repetition of the same steps comes back turning
 * differently, and the sequence stops being a LOOP in any way a person would
 * recognise.
 *
 * The whole mechanism is arithmetic plus one existing function: hand the strip
 * editor the seed block instead of the full length, and the periods it offers
 * (divisors of whatever it is given) are already exactly the safe ones.
 */
import { describe, expect, it } from "vitest";
import { divisorsUpTo } from "#lib/shared/create/domain/rhythm/rhythm-mask.js";
import {
  Period,
  periodToNumber,
} from "#lib/shared/foundation/domain/models/generation/circular-models.js";

/** The arithmetic CardBasedSettingsContainer does to size the strip. */
function seedBlock(length: number, period: Period): number {
  return Math.floor(length / periodToNumber(period));
}

describe("turn periods offered under a LOOP", () => {
  it("measures the seed block, not the finished length", () => {
    // periodToNumber answers in REPETITIONS, not steps — the trap that makes
    // this worth a test at all.
    expect(seedBlock(16, Period.HALVED)).toBe(8);
    expect(seedBlock(16, Period.QUARTERED)).toBe(4);
    expect(seedBlock(12, Period.HALVED)).toBe(6);
  });

  it("offers only periods that divide the block evenly", () => {
    expect(divisorsUpTo(seedBlock(16, Period.HALVED))).toEqual([1, 2, 4, 8]);
    expect(divisorsUpTo(seedBlock(16, Period.QUARTERED))).toEqual([1, 2, 4]);
    expect(divisorsUpTo(seedBlock(12, Period.HALVED))).toEqual([1, 2, 3, 6]);
  });

  it("never offers a period that would drift against the shape", () => {
    // A 3 against an 8-step block is the failure case: it would take 24 steps
    // to line back up, and the LOOP only runs 16.
    const block = seedBlock(16, Period.HALVED);
    for (const p of divisorsUpTo(block)) {
      expect(block % p, `period ${p} against a ${block}-step block`).toBe(0);
    }
    expect(divisorsUpTo(block)).not.toContain(3);
  });

  it("uses the full length when no LOOP is on", () => {
    // Without a LOOP there is no block to stay in step with, so every divisor
    // of the sequence itself is fair game.
    expect(divisorsUpTo(16)).toEqual([1, 2, 4, 8]);
    expect(divisorsUpTo(6)).toEqual([1, 2, 3, 6]);
  });
});
