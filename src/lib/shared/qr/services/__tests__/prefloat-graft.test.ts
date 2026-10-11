import { describe, expect, it } from "vitest";
import { graftPrefloatFromEmbedded } from "../prefloat-graft";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

type LooseMotion = Record<string, unknown>;

const float = (
  start: string,
  end: string,
  prefloat?: { type: string; rotation: string }
): LooseMotion => ({
  motionType: MotionType.FLOAT,
  startLocation: start,
  endLocation: end,
  ...(prefloat && {
    prefloatMotionType: prefloat.type,
    prefloatRotationDirection: prefloat.rotation,
  }),
});

const staticMotion = (loc: string): LooseMotion => ({
  motionType: MotionType.STATIC,
  startLocation: loc,
  endLocation: loc,
});

const seq = (steps: Array<{ left: LooseMotion; right: LooseMotion }>): SequenceData =>
  ({ id: "t", steps: steps.map((m) => ({ motions: m })) }) as unknown as SequenceData;

const blueOf = (s: SequenceData, i: number): LooseMotion =>
  (s.steps as unknown as Array<{ motions: { left: LooseMotion } }>)[i]!.motions.left;

describe("graftPrefloatFromEmbedded", () => {
  it("grafts a real prefloat pair onto a matching prefloat-less float", () => {
    const decoded = seq([{ left: float("n", "w"), right: staticMotion("w") }]);
    const embedded = {
      steps: [
        {
          motions: {
            left: float("n", "w", { type: MotionType.PRO, rotation: RotationDirection.COUNTER_CLOCKWISE }),
            right: staticMotion("w"),
          },
        },
      ],
    };
    const out = graftPrefloatFromEmbedded(decoded, embedded);
    expect(blueOf(out, 0).prefloatMotionType).toBe(MotionType.PRO);
    expect(blueOf(out, 0).prefloatRotationDirection).toBe(RotationDirection.COUNTER_CLOCKWISE);
  });

  it("never propagates a fabricated pair (prefloat type + noRotation)", () => {
    const decoded = seq([{ left: float("n", "w"), right: staticMotion("w") }]);
    const embedded = {
      steps: [
        {
          motions: {
            left: float("n", "w", { type: MotionType.PRO, rotation: RotationDirection.NO_ROTATION }),
            right: staticMotion("w"),
          },
        },
      ],
    };
    const out = graftPrefloatFromEmbedded(decoded, embedded);
    expect(blueOf(out, 0).prefloatMotionType).toBeUndefined();
    expect(blueOf(out, 0).prefloatRotationDirection).toBeUndefined();
  });

  it("skips motions whose start→end path disagrees (misaligned data)", () => {
    const decoded = seq([{ left: float("n", "w"), right: staticMotion("w") }]);
    const embedded = {
      steps: [
        {
          motions: {
            left: float("w", "s", { type: MotionType.PRO, rotation: RotationDirection.COUNTER_CLOCKWISE }),
            right: staticMotion("w"),
          },
        },
      ],
    };
    const out = graftPrefloatFromEmbedded(decoded, embedded);
    expect(blueOf(out, 0).prefloatMotionType).toBeUndefined();
  });

  it("aligns content beats from the tail when embedded carries a leading start step", () => {
    const decoded = seq([{ left: float("n", "w"), right: staticMotion("w") }]);
    const embedded = {
      steps: [
        { motions: { left: staticMotion("n"), right: staticMotion("w") } },
        {
          motions: {
            left: float("n", "w", { type: MotionType.ANTI, rotation: RotationDirection.CLOCKWISE }),
            right: staticMotion("w"),
          },
        },
      ],
    };
    const out = graftPrefloatFromEmbedded(decoded, embedded);
    expect(blueOf(out, 0).prefloatMotionType).toBe(MotionType.ANTI);
  });

  it("refuses to graft when step counts are more than one apart", () => {
    const decoded = seq([{ left: float("n", "w"), right: staticMotion("w") }]);
    const embedded = {
      steps: [
        { motions: { left: staticMotion("n"), right: staticMotion("w") } },
        { motions: { left: staticMotion("n"), right: staticMotion("w") } },
        {
          motions: {
            left: float("n", "w", { type: MotionType.PRO, rotation: RotationDirection.COUNTER_CLOCKWISE }),
            right: staticMotion("w"),
          },
        },
      ],
    };
    const out = graftPrefloatFromEmbedded(decoded, embedded);
    expect(blueOf(out, 0).prefloatMotionType).toBeUndefined();
  });

  it("grafts the mint letter onto a letterless decoded step when both channels' motion identity matches", () => {
    const decoded = seq([{ left: float("n", "w"), right: staticMotion("w") }]);
    const embedded = {
      steps: [
        {
          letter: "Z-",
          motions: { left: float("n", "w"), right: staticMotion("w") },
        },
      ],
    };
    const out = graftPrefloatFromEmbedded(decoded, embedded);
    expect(
      (out.steps as unknown as Array<{ letter?: unknown }>)[0]!.letter
    ).toBe("Z-");
  });

  it("never overwrites a letter the decoded step already carries", () => {
    const decoded = seq([{ left: float("n", "w"), right: staticMotion("w") }]);
    (decoded.steps as unknown as Array<{ letter?: unknown }>)[0]!.letter = "Y-";
    const embedded = {
      steps: [
        {
          letter: "Z-",
          motions: { left: float("n", "w"), right: staticMotion("w") },
        },
      ],
    };
    const out = graftPrefloatFromEmbedded(decoded, embedded);
    expect(
      (out.steps as unknown as Array<{ letter?: unknown }>)[0]!.letter
    ).toBe("Y-");
  });

  it("refuses the letter when any channel's motion identity disagrees", () => {
    const decoded = seq([{ left: float("n", "w"), right: staticMotion("w") }]);
    const embedded = {
      steps: [
        {
          letter: "Z-",
          motions: { left: float("n", "e"), right: staticMotion("w") },
        },
      ],
    };
    const out = graftPrefloatFromEmbedded(decoded, embedded);
    expect(
      (out.steps as unknown as Array<{ letter?: unknown }>)[0]!.letter
    ).toBeUndefined();
  });

  it("ignores empty or non-string embedded letters", () => {
    const decoded = seq([
      { left: float("n", "w"), right: staticMotion("w") },
      { left: float("w", "s"), right: staticMotion("w") },
    ]);
    const embedded = {
      steps: [
        { letter: "", motions: { left: float("n", "w"), right: staticMotion("w") } },
        { letter: 7, motions: { left: float("w", "s"), right: staticMotion("w") } },
      ],
    };
    const out = graftPrefloatFromEmbedded(decoded, embedded);
    const steps = out.steps as unknown as Array<{ letter?: unknown }>;
    expect(steps[0]!.letter).toBeUndefined();
    expect(steps[1]!.letter).toBeUndefined();
  });

  it("leaves non-float and already-prefloated motions untouched, and tolerates absent embedded data", () => {
    const decoded = seq([
      {
        left: float("n", "w", { type: MotionType.PRO, rotation: RotationDirection.CLOCKWISE }),
        right: staticMotion("w"),
      },
    ]);
    const embedded = {
      steps: [
        {
          motions: {
            left: float("n", "w", { type: MotionType.ANTI, rotation: RotationDirection.COUNTER_CLOCKWISE }),
            right: staticMotion("w"),
          },
        },
      ],
    };
    const out = graftPrefloatFromEmbedded(decoded, embedded);
    expect(blueOf(out, 0).prefloatMotionType).toBe(MotionType.PRO);
    expect(graftPrefloatFromEmbedded(decoded, undefined)).toBe(decoded);
  });
});
