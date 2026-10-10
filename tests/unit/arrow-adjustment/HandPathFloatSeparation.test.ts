/**
 * Hand-Path Float Arrow Separation — Regression Test
 *
 * Two hands travelling the SAME path (tog-same dual-shifts: letter G/H, e.g.
 * both hands S→W) must render SEPARATED float arrows, not one arrow hidden
 * under the other. The system mechanism is the special-placement tier: the
 * letter's "(fl, fl)" entry gives the red arrow its own adjustment while blue
 * falls through to the default float placement — two different offsets, two
 * visible arrows. (Surfaced by the Level 1 guide rebuild, Tog-Same row.)
 *
 * Root cause of the overlap: PictographPreparer.transformForHandPath blanked
 * start/end orientations to `undefined` when converting PRO/ANTI shifts to
 * floats. That killed placement-key layer detection (default keys degraded to
 * a bare "float" miss → 0,0) and — with no letter or a letter but a broken
 * lookup context — both arrows landed identically. The fix keeps orientations
 * radial (IN), matching the static branch and hand start positions.
 *
 * Pipeline trace this test locks down (diamond G, both hands PRO S→W):
 *   - transformForHandPath → float, turns "fl", orientations stay "in"
 *   - generateOrientationKey → "in_in" → legacy bucket "from_layer1"
 *   - turnsTupleGenerator → "(fl, fl)"
 *   - G_placements.json "(fl, fl)" → red [80, -100]; blue absent → null
 *   - generatePlacementKey (blue fallback) → "float_to_layer1_beta" → [30, -30]
 *   - red base ≠ blue base → separated arrows
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Point } from "fabric";
import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
import { SpecialPlacementLookup } from "#lib/shared/pictograph/arrow/positioning/placement/services/special-placement-lookup.js";
import { turnsTupleGenerator } from "#lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator.js";
import {
  generateOrientationKey,
  resolveEffectiveOriKey,
  mapToLegacyBucket,
} from "#lib/shared/pictograph/arrow/positioning/key-generation/services/special-placement-ori-key-generator.js";
import { generatePlacementKey } from "#lib/shared/pictograph/arrow/positioning/key-generation/services/arrow-placement-key-generator.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  floatClockwiseHandpathMap,
  floatCounterClockwiseHandpathMap,
} from "#lib/shared/pictograph/arrow/positioning/calculation/config/float-rotation-maps.js";

const STATIC_ROOT = resolve(process.cwd(), "static");

/** Letter G tog-same dual-shift: both hands PRO S→W, radial start (in/in). */
function makeG_bothHandsSouthToWest(): PictographData {
  const motion = (hand: "left" | "right"): MotionData =>
    createMotionData({
      motionType: "pro" as const,
      rotationDirection: "cw" as const,
      startLocation: "s" as const,
      endLocation: "w" as const,
      turns: 0,
      startOrientation: "in" as const,
      endOrientation: "in" as const,
      hand,
      gridMode: "diamond" as const,
    });
  return {
    id: "g-ts-test",
    letter: "G" as PictographData["letter"],
    motions: { left: motion("left"), right: motion("right") },
  };
}

function handPathTransformed(p: PictographData): PictographData {
  // transformForHandPath is private; it is the exact unit under test.
  return (
    pictographPreparer as unknown as {
      transformForHandPath(p: PictographData): PictographData;
    }
  ).transformForHandPath(p);
}

describe("hand-path float arrow separation (G tog-same)", () => {
  const transformed = handPathTransformed(makeG_bothHandsSouthToWest());
  const left = transformed.motions.left!;
  const right = transformed.motions.right!;

  it("converts PRO shifts to floats but KEEPS radial orientations", () => {
    for (const m of [left, right]) {
      expect(m.motionType).toBe("float");
      expect(m.turns).toBe("fl");
      // The regression: these were blanked to undefined, killing layer
      // detection and with it the placement lookups that separate the arrows.
      expect(m.startOrientation).toBe("in");
      expect(m.endOrientation).toBe("in");
    }
  });

  it("resolves the special-placement lookup context (from_layer1, '(fl, fl)')", () => {
    const rawOriKey = generateOrientationKey(left, transformed);
    expect(rawOriKey).toBe("in_in");
    // HAND props keep the specific key; the placer's folder fallback then maps
    // to the legacy bucket where the static JSON actually lives.
    expect(resolveEffectiveOriKey(rawOriKey, transformed)).toBe("in_in");
    expect(mapToLegacyBucket(rawOriKey)).toBe("from_layer1");
    expect(turnsTupleGenerator.generateTurnsTuple(transformed)).toBe(
      "(fl, fl)"
    );
  });

  it("gives red its special adjustment and lets blue fall to the default", () => {
    const letterData = JSON.parse(
      readFileSync(
        resolve(
          STATIC_ROOT,
          "data/arrow_placement/special/from_layer1/G_placements.json"
        ),
        "utf-8"
      )
    ) as Record<string, unknown>;

    const lookup = new SpecialPlacementLookup();
    const rightAdj = lookup.lookupAdjustment(
      letterData,
      "(fl, fl)",
      right,
      transformed,
      "red"
    );
    const leftAdj = lookup.lookupAdjustment(
      letterData,
      "(fl, fl)",
      left,
      transformed,
      "blue"
    );

    expect(rightAdj).toEqual(new Point(80, -100));
    expect(leftAdj).toBeNull(); // → falls through to the default tier
  });

  it("restores layer detection so blue's default key is beta-specific, not a bare miss", () => {
    const floatDefaults = JSON.parse(
      readFileSync(
        resolve(
          STATIC_ROOT,
          "data/arrow_placement/default/default_float_placements.json"
        ),
        "utf-8"
      )
    ) as Record<string, [number, number][]>;
    const availableKeys = Object.keys(floatDefaults);

    const blueKey = generatePlacementKey(left, transformed, availableKeys);
    expect(blueKey).toBe("float_to_layer1_beta");

    const blueDefault = (
      floatDefaults[blueKey] as unknown as Record<string, [number, number]>
    )["fl"];
    expect(blueDefault).toEqual([30, -30]);
    // Separation: red's special base ≠ blue's default base.
    expect(blueDefault).not.toEqual([80, -100]);
  });
});

describe("float rotation maps are well-formed (tuning-friendly)", () => {
  // These maps are actively tuned via the /test/float-rotations live tuner, so
  // exact per-cell values are NOT locked here — that would red the build on
  // every dial click. We assert only structural sanity: every grid location
  // present, every value a 45° step in [0, 360). (The float chevron is a
  // different glyph from PRO's curved arc, so parity with the PRO maps is not
  // required.)
  const LOCATIONS = ["n", "e", "s", "w", "ne", "se", "sw", "nw", "c"] as const;
  const maps = [
    ["CW", floatClockwiseHandpathMap],
    ["CCW", floatCounterClockwiseHandpathMap],
  ] as const;
  for (const [name, map] of maps) {
    it(`${name} float map has a valid 45° angle for every location`, () => {
      for (const loc of LOCATIONS) {
        const v = (map as Record<string, number>)[loc];
        expect(v, `${name} ${loc} present`).toBeTypeOf("number");
        expect(v % 45, `${name} ${loc} multiple of 45`).toBe(0);
        expect(v >= 0 && v < 360, `${name} ${loc} in [0,360)`).toBe(true);
      }
    });
  }
});
