import { describe, it, expect } from "vitest";
import { calculate } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { buildIndex, type IndexInput } from "#lib/shared/mandala/services/mandala-index-builder.js";
import { decode } from "#lib/shared/mandala/services/mandala-decoder.js";
import type { StepLike, MotionLike } from "#lib/shared/mandala/services/types.js";

// Two minimal hand-authored 2-beat sequences with blue+red motions. Locations
// use the lowercase strings the calculator resolves ("n","e","s","w").
function step(left: Partial<MotionLike>, right: Partial<MotionLike>): StepLike {
  const base: MotionLike = {
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: "n",
    endLocation: "e",
    startOrientation: "out",
    endOrientation: "out",
    turns: 0,
  };
  return { motions: { left: { ...base, ...left }, right: { ...base, ...right } } };
}

const seqA: StepLike[] = [
  step({ startLocation: "n", endLocation: "e" }, { startLocation: "s", endLocation: "w" }),
  step({ startLocation: "e", endLocation: "s" }, { startLocation: "w", endLocation: "n" }),
];
const seqB: StepLike[] = [
  step(
    { motionType: "anti", rotationDirection: "ccw", startLocation: "n", endLocation: "w" },
    { motionType: "anti", rotationDirection: "ccw", startLocation: "s", endLocation: "e" },
  ),
  step(
    { motionType: "anti", rotationDirection: "ccw", startLocation: "w", endLocation: "s" },
    { motionType: "anti", rotationDirection: "ccw", startLocation: "e", endLocation: "n" },
  ),
];

describe("decode round-trip", () => {
  it("a catalog sequence's own glyph decodes to a class containing itself", () => {
    const inputs: IndexInput[] = [
      { ref: { seqId: "A", word: "A", deck: "t" }, paths: calculate(seqA, "staff", "staff") },
      { ref: { seqId: "B", word: "B", deck: "t" }, paths: calculate(seqB, "staff", "staff") },
    ];
    const index = buildIndex(inputs);

    const resultA = decode(calculate(seqA, "staff", "staff"), index);
    expect(resultA.exactClass.map((r) => r.seqId)).toContain("A");

    const resultB = decode(calculate(seqB, "staff", "staff"), index);
    expect(resultB.exactClass.map((r) => r.seqId)).toContain("B");
  });

  it("shapeKey of the same sequence is byte-stable across recomputation", () => {
    const p1 = calculate(seqA, "staff", "staff");
    const p2 = calculate(seqA, "staff", "staff");
    const i1 = buildIndex([{ ref: { seqId: "A", word: "A", deck: "t" }, paths: p1 }]);
    const k1 = Object.keys(i1.byShape)[0];
    const i2 = buildIndex([{ ref: { seqId: "A", word: "A", deck: "t" }, paths: p2 }]);
    const k2 = Object.keys(i2.byShape)[0];
    expect(k1).toBe(k2);
  });
});
