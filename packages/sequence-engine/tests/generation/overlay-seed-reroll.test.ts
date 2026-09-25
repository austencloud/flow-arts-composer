/**
 * The requested-length re-roll must not shrink a seed below an overlay stage's
 * period.
 *
 * An overlay stage partitions the expanded (pre-orientation-closure) sequence
 * into `period` equal blocks, so it throws when the step count is not divisible
 * by that period. SequenceBuilder's exact-length loop shrinks the seed by
 * whatever expansion orientation closure turned out to need and then KEEPS the
 * shrunken seed for every later attempt — so once it lands on a seed too short
 * for the overlay period, all forty attempts throw the same error and the user
 * gets nothing back.
 *
 * That is reachable straight from the Generate tab: Inverted with
 * "Invert when: Every quarter" + "Build the sequence: On top". Measured on
 * origin/main @ c4be1619, 100 builds each against the Diamond dataset:
 *
 *   inverted                  len 8  level 3   14/100 built, 86 threw
 *   inverted                  len 12 level 3    4/100 built, 96 threw
 *   swapped_inverted          len 8  level 3   36/100 built, 64 threw
 *   rotated_swapped_inverted  len 8  level 3   34/100 built, 66 threw
 *   mirrored_swapped_inverted len 8  level 3   29/100 built, 71 threw
 *
 *   Unable to generate a valid inverted LOOP after 40 attempts
 *   (last failure: Overlay inversion requires the step count (2) to be
 *    divisible by the period (4).)
 *
 * With the seed guard those five configurations built 100/100, 91/100,
 * 100/100, 100/100 and 100/100 — and zero overlay-divisibility throws across
 * all 700. The residual len-12 failures are the ordinary
 * "orientation closure requires a 3x seed expansion" feasibility limit, not
 * this defect.
 */
import { describe, expect, it } from "vitest";
import { SequenceBuilder } from "../../src/generation/builder/SequenceBuilder.js";
import { LOOPType, Period } from "../../src/loop/loop-types.js";
import { loopSpecFromWire } from "../../src/loop/loop-spec.js";
import {
  CsvVariationProvider,
  loadDiamondVariations,
} from "../helpers/csv-variations.js";

/** Level 3 supplies the half turns that make orientation closure extend. */
const LEVEL = 3;

/** ~86% of pre-fix builds threw, so a dozen makes a pre-fix pass ~1e-10. */
const BUILDS = 12;

/**
 * Builds are unseeded, so an occasional draw still hits the ordinary
 * orientation-closure feasibility limit the header describes. That limit is
 * not this defect; it failed about one run in forty of this file when every
 * build had to succeed. Allow a few, and fail on any overlay-divisibility
 * throw, which is what a starved seed produces.
 */
const MAX_INFEASIBLE = 3;

const CASES = [
  {
    type: LOOPType.INVERTED,
    prop: { inverted: { period: 4, mode: "overlay" as const } },
    totalLength: 8,
    expandMultiplier: 1,
  },
  {
    type: LOOPType.SWAPPED_INVERTED,
    prop: {
      swapped: { period: 2 },
      inverted: { period: 4, mode: "overlay" as const },
    },
    totalLength: 8,
    expandMultiplier: 2,
  },
  {
    type: LOOPType.MIRRORED_SWAPPED_INVERTED,
    prop: {
      mirrored: { period: 2, reflectionAxis: "north-south" as const },
      swapped: { period: 2 },
      inverted: { period: 4, mode: "overlay" as const },
    },
    totalLength: 8,
    expandMultiplier: 2,
  },
];

describe("overlay inversion survives the requested-length re-roll", () => {
  const builder = new SequenceBuilder(
    new CsvVariationProvider(loadDiamondVariations())
  );

  it.each(CASES)(
    "builds $type at every-quarter overlay without an overlay-divisibility throw",
    ({ type, prop, totalLength, expandMultiplier }) => {
      const spec = loopSpecFromWire({ left: prop, right: prop });

      let infeasible = 0;
      for (let attempt = 0; attempt < BUILDS; attempt++) {
        let result: ReturnType<SequenceBuilder["build"]>;
        try {
          result = builder.build({
            length: totalLength / expandMultiplier,
            gridMode: "diamond",
            level: LEVEL,
            constraintPreset: "smooth",
            loop: {
              type,
              period: Period.HALVED,
              useTargetedGeneration: true,
              loopSpec: spec,
              requestedTotalLength: totalLength,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          expect(message).not.toMatch(/divisible by the period/);
          expect(message).toMatch(/orientation closure requires/);
          infeasible++;
          continue;
        }

        expect(result.sequence.length - 1).toBe(totalLength);
      }
      expect(infeasible).toBeLessThanOrEqual(MAX_INFEASIBLE);
    }
  );
});
