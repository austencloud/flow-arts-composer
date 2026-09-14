/**
 * Every pairing the Ratio Playground can actually produce, checked against
 * what the pairing claims to be.
 *
 * The half turn Austen found in Sun was one cell of a field with thousands of
 * them, and it was invisible everywhere the arithmetic happened to land on a
 * whole number of turns. Spot-checking a flower cannot cover that. This walks
 * the real atlas — every reduced ratio the surface offers, every variant the
 * axis builds for it, all six pairings — and holds each right hand to the
 * definition of its own pairing rather than to a remembered picture.
 */
import { describe, expect, it } from "vitest";
import {
  buildTheorySpinRatioAtlas,
  spinRatioKey,
  type SpinRatio,
} from "@vtg/domain";
import { handIndexAt, propIndexAt } from "$lib/shared/notation/qft/qft-model";
import {
  buildTheoryAxis,
  theoryFlowerKey,
  theoryKnobs,
  theorySoloKnobs,
  STATIONARY_RATIO,
  type TheoryFlower,
} from "$lib/shared/shape-matrix/domain/theory-flower";
import {
  MODE_ORDER,
  type VtgMode,
} from "$lib/shared/shape-matrix/services/shape-matrix-realizations";

/** The eighths a timing puts between the two hands. */
const TIMING_OFFSET: Record<string, number> = { S: 4, T: 0, Q: 2 };

/** Bearings are compass eighths, so 0 and 8 are the same place. */
function eighthsApart(a: number, b: number): number {
  const raw = (((a - b) % 8) + 8) % 8;
  return Math.min(raw, 8 - raw);
}

const SAME_PLACE = 1e-9;

/** Arbitrary reals: both sides are affine in u, so any two would settle it. */
const SAMPLES = [0, 0.375, 1, 2.5, 4, 7.25];

/**
 * Every flower on the surface: the atlas the Ratio Playground enumerates, each
 * through the axis that decides which starts are genuinely different at that
 * ratio. The stationary endpoint is named alongside it because it is the one
 * case the pairing arithmetic has to treat differently, and a rename or a
 * bound change should break this list loudly rather than silently drop it.
 */
function everyFlower(): { ratio: SpinRatio; flower: TheoryFlower }[] {
  const atlas = buildTheorySpinRatioAtlas();
  const stationary = atlas.filter((ratio) => ratio.handCycles === 0);
  expect(stationary.map(spinRatioKey)).toEqual([
    spinRatioKey(STATIONARY_RATIO),
  ]);

  return atlas.flatMap((ratio) =>
    buildTheoryAxis(ratio).map((flower) => ({ ratio, flower }))
  );
}

const FLOWERS = everyFlower();

function describeCase(flower: TheoryFlower, mode: VtgMode): string {
  return `${theoryFlowerKey(flower)} in ${mode}`;
}

/** Report the first few misses rather than a bare count. */
function reportMisses(misses: string[]): void {
  expect(misses.slice(0, 5), `${misses.length} pairings off`).toEqual([]);
}

describe("every Theory pairing on the surface", () => {
  it("covers the whole atlas, not a sample of it", () => {
    // A silent shrink here would quietly stop testing the field, so the
    // breadth is pinned too: every ratio contributes at least one flower.
    expect(FLOWERS.length).toBeGreaterThan(400);
    const ratios = new Set(FLOWERS.map(({ ratio }) => spinRatioKey(ratio)));
    expect(ratios.size).toBe(buildTheorySpinRatioAtlas().length);
    expect(MODE_ORDER).toHaveLength(6);
  });

  /*
   * Same Direction is one motion played by two hands, the second some number
   * of steps into it. So there is no freedom left: the right hand at u has to
   * be the left hand at u + offset, hand and prop both. Anything else is a
   * second motion wearing the pairing's name — which is what Quarter Time was
   * doing at 5:1 antispin.
   */
  for (const mode of MODE_ORDER.filter((m) => m.endsWith("S"))) {
    it(`plays ${mode} as the left hand's own motion, offset in time`, () => {
      const offset = TIMING_OFFSET[mode.charAt(0)] ?? 0;
      const misses: string[] = [];

      for (const { ratio, flower } of FLOWERS) {
        // A hand that never travels has no clock to run ahead of; its timing
        // is a plain bearing offset, checked on its own below.
        if (ratio.handCycles === 0) continue;

        const left = theorySoloKnobs(flower);
        const right = theoryKnobs(flower, "right", mode);

        for (const u of SAMPLES) {
          const handOff = eighthsApart(
            handIndexAt(right, u),
            handIndexAt(left, u + offset)
          );
          const propOff = eighthsApart(
            propIndexAt(right, u),
            propIndexAt(left, u + offset)
          );
          if (handOff > SAME_PLACE || propOff > SAME_PLACE) {
            misses.push(
              `${describeCase(flower, mode)} at u=${u}: hand off by ` +
                `${handOff.toFixed(3)}, prop off by ${propOff.toFixed(3)}`
            );
            break;
          }
        }
      }

      reportMisses(misses);
    });
  }

  /*
   * Opposite Direction is that same motion run backwards from the offset: the
   * right hand at u is the left hand at offset - u, hand and prop both. That
   * is the only reading that keeps the right hand on its own tile's flower.
   * The earlier one — a mirror about the axis standing between the hands —
   * reflected the flower about an axis it is symmetric about only by
   * coincidence, and 2:3 in Fire turned the red hand's petals into its gaps.
   */
  for (const mode of MODE_ORDER.filter((m) => m.endsWith("O"))) {
    it(`plays ${mode} as the left hand's own motion, run backwards from the offset`, () => {
      const offset = TIMING_OFFSET[mode.charAt(0)] ?? 0;
      const misses: string[] = [];

      for (const { ratio, flower } of FLOWERS) {
        // A hand that never travels has no motion to run backwards; its
        // timing is a plain bearing offset, checked on its own below.
        if (ratio.handCycles === 0) continue;

        const left = theorySoloKnobs(flower);
        const right = theoryKnobs(flower, "right", mode);

        for (const u of SAMPLES) {
          const handOff = eighthsApart(
            handIndexAt(right, u),
            handIndexAt(left, offset - u)
          );
          const propOff = eighthsApart(
            propIndexAt(right, u),
            propIndexAt(left, offset - u)
          );
          if (handOff > SAME_PLACE || propOff > SAME_PLACE) {
            misses.push(
              `${describeCase(flower, mode)} at u=${u}: hand off by ` +
                `${handOff.toFixed(3)}, prop off by ${propOff.toFixed(3)}`
            );
            break;
          }
        }
      }

      reportMisses(misses);
    });
  }

  /*
   * The left hand is the frame everything else is expressed against, so it
   * never moves off its own solo knobs whatever the pairing is.
   */
  it("leaves the left hand in its own frame in all six pairings", () => {
    const misses: string[] = [];
    for (const { flower } of FLOWERS) {
      for (const mode of MODE_ORDER) {
        const left = theoryKnobs(flower, "left", mode);
        if (JSON.stringify(left) !== JSON.stringify(theorySoloKnobs(flower))) {
          misses.push(describeCase(flower, mode));
        }
      }
    }
    reportMisses(misses);
  });

  /*
   * A stationary hand stands at the centre with no bearing of its own, so the
   * timing between the hands can only be a bearing offset on the prop. That is
   * deliberate, and it is the one place the time-shift reading does not apply.
   */
  it("keeps a stationary hand's timing a plain bearing offset", () => {
    for (const { flower } of FLOWERS.filter(
      ({ ratio }) => ratio.handCycles === 0
    )) {
      for (const mode of MODE_ORDER) {
        const offset = TIMING_OFFSET[mode.charAt(0)] ?? 0;
        const left = theorySoloKnobs(flower);
        const right = theoryKnobs(flower, "right", mode);
        // Opposite Direction reverses the prop's spin, so the two props agree
        // only at the downbeat and then part; Same Direction agrees throughout.
        const samples = mode.endsWith("O") ? [0] : SAMPLES;
        for (const u of samples) {
          expect(
            eighthsApart(propIndexAt(right, u), propIndexAt(left, u) + offset),
            describeCase(flower, mode)
          ).toBeLessThan(SAME_PLACE);
        }
        expect(right.handDirection, describeCase(flower, mode)).toBe(
          mode.endsWith("O") ? -1 : 1
        );
      }
    }
  });

  /*
   * The pairing is a relationship between the hands, not a repaint of either.
   * Whatever it does to the right hand, the shape that hand draws is still the
   * flower the axis named: same ratio, same spin, same petal count.
   */
  it("never turns the right hand's flower into another flower", () => {
    const misses: string[] = [];
    for (const { flower } of FLOWERS) {
      for (const mode of MODE_ORDER) {
        const right = theoryKnobs(flower, "right", mode);
        const solo = theorySoloKnobs(flower);
        if (
          right.ratio !== solo.ratio ||
          right.spin !== solo.spin ||
          right.radius !== solo.radius ||
          right.downbeats !== solo.downbeats
        ) {
          misses.push(describeCase(flower, mode));
        }
      }
    }
    reportMisses(misses);
  });
});
