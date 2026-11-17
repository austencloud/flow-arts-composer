import { describe, expect, it } from "vitest";
import { loopDetector } from "#lib/shared/create/services/loop-detector.js";
import {
  LOOPType,
  Period,
} from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import {
  EXAMPLES,
  SHOWCASE_STEP,
  TYPE_ORDER,
  REFLECTION_AXES,
  passSteps,
  twinIndex,
  type ExampleKind,
} from "./loop-words-examples";
import { isTwinOf } from "./showcase-twins";
import { reflectLocation } from "@tka/sequence-engine/loop";
import { extractPairRelations } from "#lib/shared/loop-explorer/services/relation-extractor.js";

// The detector names a type and, only for turns, how far each pass turns.
// It reports a Rewound LOOP as "rewound" (the generator asks for the
// strict kind, which it then detects under that plain name).
const EXPECTED: Record<ExampleKind, { type: string; period: Period | null }> = {
  rotated: { type: LOOPType.ROTATED, period: Period.HALVED },
  reflected: { type: LOOPType.MIRRORED, period: null },
  swapped: { type: LOOPType.SWAPPED, period: null },
  inverted: { type: LOOPType.INVERTED, period: null },
  rewound: { type: "rewound", period: null },
  quartered: { type: LOOPType.ROTATED, period: Period.QUARTERED },
};

describe("loop-words examples", () => {
  it.each(Object.keys(EXPECTED) as ExampleKind[])(
    "the app's detector names the %s example's type",
    (kind) => {
      const example = EXAMPLES[kind];
      const result = loopDetector.detectLOOPType(example.sequence);
      expect(result.loopType).toBe(EXPECTED[kind].type);
      expect(result.period).toBe(EXPECTED[kind].period);
      expect(example.seedLength).toBeGreaterThanOrEqual(2);
      expect(example.seedLength).toBeLessThanOrEqual(4);
      expect(example.sequence.steps).toHaveLength(
        example.seedLength * example.passes
      );
    }
  );

  // The two-row strips pair each column's steps; a wrong pairing would ring
  // two unrelated steps as "the same step" on screen.
  it.each(TYPE_ORDER)("each %s column holds a step and its own twin", (kind) => {
    const example = EXAMPLES[kind];
    const first = passSteps(example, 0);
    first.forEach((step, k) => {
      const twin = example.sequence.steps[twinIndex(example, k)]!;
      expect(isTwinOf(kind, step, twin)).toBe(true);
    });
  });

  it("the quarter-turn example turns a quarter further each pass", () => {
    const example = EXAMPLES.quartered;
    const relations = extractPairRelations(
      example.sequence.steps,
      example.seedLength
    );
    expect(relations).toHaveLength(example.seedLength * 3);
    for (const relation of relations) {
      expect(relation.transform).toEqual(["rotated"]);
      expect(["90cw", "90ccw"]).toContain(relation.rotation);
    }
  });

  it("screen 2's step spins both props, one pro and one anti", () => {
    const left = SHOWCASE_STEP.motions.left?.motionType;
    const right = SHOWCASE_STEP.motions.right?.motionType;
    expect(new Set([left, right])).toEqual(new Set(["pro", "anti"]));
  });

  // A step that is its own reflection would look the same twice on the
  // four-lines screen.
  it.each(REFLECTION_AXES)("screen 2's step changes when reflected across %s", (axis) => {
    const moved = (["left", "right"] as const).some((hand) => {
      const m = SHOWCASE_STEP.motions[hand]!;
      return (
        reflectLocation(String(m.startLocation), axis) !== String(m.startLocation) ||
        reflectLocation(String(m.endLocation), axis) !== String(m.endLocation)
      );
    });
    expect(moved).toBe(true);
  });
});
