import { describe, it, expect } from "vitest";
import { buildActSequence } from "$lib/features/write/services/sheet-act-sequence";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

type FakeStep = { letter: string; start: string; end: string };
function seq(
  id: string,
  steps: FakeStep[],
  opts: { startPlacement?: unknown; isCircular?: boolean } = {}
): SequenceData {
  return {
    id,
    startPlacement: opts.startPlacement,
    isCircular: opts.isCircular ?? false,
    steps: steps.map((s, i) => ({
      stepNumber: i + 1,
      letter: s.letter,
      startPlacement: s.start,
      endPlacement: s.end,
      motions: {
        [HandSide.LEFT]: { startOrientation: "in", endOrientation: "in" },
        [HandSide.RIGHT]: { startOrientation: "in", endOrientation: "in" },
      },
    })),
  } as unknown as SequenceData;
}

describe("buildActSequence", () => {
  it("returns null for no rows", () => {
    expect(buildActSequence([], "Act")).toBeNull();
  });

  it("concatenates steps with a running stepNumber and rebuilt word", () => {
    const a = seq("a", [
      { letter: "A", start: "alpha1", end: "beta3" },
      { letter: "B", start: "beta3", end: "alpha1" },
    ]);
    const b = seq("b", [{ letter: "C", start: "alpha1", end: "gamma5" }]);
    const act = buildActSequence([a, b], "My Act")!;
    expect(act.steps).toHaveLength(3);
    expect(act.steps.map((s) => s.stepNumber)).toEqual([1, 2, 3]);
    expect(act.word).toBe("ABC");
    expect(act.name).toBe("My Act");
  });

  it("uses row 0's start position", () => {
    const sp = { gridPlacement: "alpha1", isStartPlacement: true };
    const a = seq("a", [{ letter: "A", start: "alpha1", end: "beta3" }], {
      startPlacement: sp,
    });
    const b = seq("b", [{ letter: "C", start: "beta3", end: "alpha1" }], {
      startPlacement: { gridPlacement: "beta3", isStartPlacement: true },
    });
    expect(buildActSequence([a, b], "Act")!.startPlacement).toStrictEqual(sp);
  });

  it("isCircular true when the act's last end returns to the first start", () => {
    const a = seq("a", [{ letter: "A", start: "alpha1", end: "beta3" }]);
    const b = seq("b", [{ letter: "C", start: "beta3", end: "alpha1" }]);
    expect(buildActSequence([a, b], "Act")!.isCircular).toBe(true);
  });

  it("isCircular false when the act does not return to start", () => {
    const a = seq("a", [{ letter: "A", start: "alpha1", end: "beta3" }]);
    const b = seq("b", [{ letter: "C", start: "beta3", end: "gamma5" }]);
    expect(buildActSequence([a, b], "Act")!.isCircular).toBe(false);
  });
});
