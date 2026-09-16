/**
 * Reversal Detector — display policy + signal channels (app-level proof)
 * ======================================================================
 *
 * DISPLAY POLICY (Austen, 2026-07-05): pictograph reversal DOTS are for
 * prop-direction reversals ONLY. `processReversals` / option previews must
 * behave exactly like the legacy rotation-only detector: dot iff the prop's
 * rotation direction flips (covers PROP reversals and FULL reversals — both
 * flip prop direction). HAND reversals (hand retraces, prop continues —
 * rotationDirection unchanged) must NOT produce dots.
 *
 * The hand-reversal signal is retained as a separate, non-display channel
 * (`handReversal`) on the canonical engine API for future consumers (e.g. the
 * practice judgment loop) — proven here by running app StepData through
 * `deriveReversals` directly.
 *
 * Fixtures are grounded in MCP definitions (verified 2026-07-05); the
 * pro/anti convention is proven by canonical letters A/B (same blue hand path
 * w→n, a clockwise arc; A/pro stores rotationDirection "cw", B/anti "ccw").
 */

import { describe, expect, it } from "vitest";
import {
  processReversals,
  detectReversalForOption,
  detectReversalsForOptions,
} from "../../src/lib/shared/create/services/reversal-detector";
import { deriveReversals } from "@tka/sequence-engine";
import type { StepData } from "../../src/lib/shared/foundation/domain/models/step-data";
import type { SequenceData } from "../../src/lib/shared/foundation/domain/models/sequence-data";
import type { PictographData } from "../../src/lib/shared/pictograph/shared/domain/models/pictograph-data";

type MotionLite = {
  motionType: string;
  startLocation: string;
  endLocation: string;
  rotationDirection: string;
  prefloatRotationDirection?: string;
  handPath?: string | null;
};

function motion(
  motionType: string,
  startLocation: string,
  endLocation: string,
  rotationDirection: string,
  handPath?: string
): MotionLite {
  return {
    motionType,
    startLocation,
    endLocation,
    rotationDirection,
    ...(handPath ? { handPath } : {}),
  };
}

/** Parked hand: static, no travel, no spin — inert on both signals. */
const parked = (): MotionLite => motion("static", "s", "s", "noRotation");

function step(
  num: number,
  left: MotionLite,
  right: MotionLite,
  isBlank = false
): StepData {
  return {
    id: `beat-${num}`,
    stepNumber: num,
    duration: 1.0,
    leftReversal: false,
    rightReversal: false,
    isBlank,
    letter: null,
    startPlacement: null,
    endPlacement: null,
    motions: { left: left as never, right: right as never },
  } as unknown as StepData;
}

function seq(steps: StepData[], loopType?: string): SequenceData {
  return {
    id: "seq",
    name: "Test",
    word: "",
    steps,
    thumbnails: [],
    isFavorite: false,
    isCircular: !!loopType,
    ...(loopType ? { loopType } : {}),
    level: 2,
    difficultyLevel: "intermediate",
    tags: [],
    metadata: {},
  } as unknown as SequenceData;
}

// Letter-A-shaped opener: blue hand w→n (clockwise arc), prop cw → pro.
const proOpener = () => motion("pro", "w", "n", "cw");

describe("processReversals — dots are prop-direction reversals ONLY", () => {
  it("HAND reversal (hand retraces, prop continues) → NO dot", () => {
    // rotationDirection unchanged cw→cw; hand retraces n→w. Legacy showed no
    // dot here, and per the display policy the dot must stay absent.
    const result = processReversals(
      seq([
        step(1, proOpener(), parked()),
        step(2, motion("anti", "n", "w", "cw"), parked()),
      ])
    );
    expect(result.steps[1]!.leftReversal).toBe(false);
    expect(result.steps[1]!.rightReversal).toBe(false);
  });

  it("PROP reversal (hand continues, prop reverses) → dot", () => {
    const result = processReversals(
      seq([
        step(1, proOpener(), parked()),
        step(2, motion("anti", "n", "e", "ccw"), parked()),
      ])
    );
    expect(result.steps[1]!.leftReversal).toBe(true);
    expect(result.steps[1]!.rightReversal).toBe(false);
  });

  it("FULL reversal (both retrace — prop direction flips too) → dot", () => {
    const result = processReversals(
      seq([
        step(1, proOpener(), parked()),
        step(2, motion("pro", "n", "w", "ccw"), parked()),
      ])
    );
    expect(result.steps[1]!.leftReversal).toBe(true);
  });

  it("natural continuation → no dot", () => {
    const result = processReversals(
      seq([
        step(1, proOpener(), parked()),
        step(2, motion("pro", "n", "e", "cw"), parked()),
      ])
    );
    expect(result.steps[1]!.leftReversal).toBe(false);
    expect(result.steps[1]!.rightReversal).toBe(false);
  });

  it("FLOAT hand-arc flip via authored handPath → NO dot (no prop-direction flip)", () => {
    const result = processReversals(
      seq([
        step(1, motion("float", "w", "n", "noRotation", "cw"), parked()),
        step(2, motion("float", "n", "w", "noRotation", "ccw"), parked()),
      ])
    );
    expect(result.steps[1]!.leftReversal).toBe(false);
  });

  it("loop wrap applies to the DOT channel (alternating prop spin dots every step)", () => {
    const steps = [
      step(1, motion("pro", "w", "n", "cw"), parked()),
      step(2, motion("anti", "n", "e", "ccw"), parked()),
      step(3, motion("pro", "e", "s", "cw"), parked()),
      step(4, motion("anti", "s", "w", "ccw"), parked()),
    ];
    const looped = processReversals(seq(steps, "rotated"));
    expect(looped.steps.map((s) => s.leftReversal)).toEqual([
      true,
      true,
      true,
      true,
    ]);

    const linear = processReversals(seq(steps));
    expect(linear.steps.map((s) => s.leftReversal)).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it("loop wrap does NOT dot a pure hand-reversal loop (prop direction never flips)", () => {
    const steps = [
      step(1, proOpener(), parked()),
      step(2, motion("anti", "n", "w", "cw"), parked()),
    ];
    const looped = processReversals(seq(steps, "rotated"));
    expect(looped.steps.map((s) => s.leftReversal)).toEqual([false, false]);
  });

  it("blanks stay transparent for the dot chain (production semantics preserved)", () => {
    const result = processReversals(
      seq([
        step(1, proOpener(), parked()),
        step(2, parked(), parked(), true), // blank
        step(3, motion("anti", "n", "e", "ccw"), parked()), // prop reversal across the blank
      ])
    );
    expect(result.steps[1]!.leftReversal).toBe(false);
    expect(result.steps[2]!.leftReversal).toBe(true);
  });
});

describe("canonical engine API — handReversal signal channel retained (non-display)", () => {
  it("reports the HAND reversal on the signal channel for app StepData", () => {
    const steps = [
      step(1, proOpener(), parked()),
      step(2, motion("anti", "n", "w", "cw"), parked()),
    ];
    const signals = deriveReversals(steps);
    expect(signals[1]!.left.handReversal).toBe(true);
    expect(signals[1]!.left.propReversal).toBe(false); // and the dot channel stays quiet
  });

  it("reports both channels on a FULL reversal", () => {
    const steps = [
      step(1, proOpener(), parked()),
      step(2, motion("pro", "n", "w", "ccw"), parked()),
    ];
    const signals = deriveReversals(steps);
    expect(signals[1]!.left).toEqual({
      propReversal: true,
      handReversal: true,
    });
  });

  it("sees float hand-arc flips (authored handPath) on the signal channel only", () => {
    const steps = [
      step(1, motion("float", "w", "n", "noRotation", "cw"), parked()),
      step(2, motion("float", "n", "w", "noRotation", "ccw"), parked()),
    ];
    const signals = deriveReversals(steps);
    expect(signals[1]!.left).toEqual({
      propReversal: false,
      handReversal: true,
    });
  });
});

describe("option previews — dot channel only (prop-direction flip)", () => {
  const currentSequence = [step(1, proOpener(), parked())];

  it("does NOT flag a hand-reversal option (prop direction unchanged)", () => {
    const option = {
      motions: {
        left: motion("anti", "n", "w", "cw"), // hand retraces, prop continues
        right: parked(),
      },
    } as unknown as PictographData;
    expect(detectReversalForOption(currentSequence, option)).toEqual({
      leftReversal: false,
      rightReversal: false,
    });
  });

  it("flags a prop-reversal option", () => {
    const option = {
      motions: {
        left: motion("anti", "n", "e", "ccw"),
        right: parked(),
      },
    } as unknown as PictographData;
    expect(detectReversalForOption(currentSequence, option)).toEqual({
      leftReversal: true,
      rightReversal: false,
    });
  });

  it("dots a float from its preserved pre-float prop direction", () => {
    const option = {
      motions: {
        left: {
          ...motion("float", "n", "e", "noRotation"),
          prefloatRotationDirection: "ccw",
        },
        right: parked(),
      },
    } as unknown as PictographData;

    expect(detectReversalForOption(currentSequence, option)).toEqual({
      leftReversal: true,
      rightReversal: false,
    });
  });

  it("detectReversalsForOptions dots prop/full options, not hand-reversal or continuation options", () => {
    const sequencePictographs = [
      { motions: { left: proOpener(), right: parked() } },
    ] as unknown as PictographData[];
    const options = [
      { motions: { left: motion("anti", "n", "w", "cw"), right: parked() } }, // hand reversal → no dot
      { motions: { left: motion("anti", "n", "e", "ccw"), right: parked() } }, // prop reversal → dot
      { motions: { left: motion("pro", "n", "w", "ccw"), right: parked() } }, // full reversal → dot
      { motions: { left: motion("pro", "n", "e", "cw"), right: parked() } }, // continuation → no dot
    ] as unknown as PictographData[];

    const annotated = detectReversalsForOptions(sequencePictographs, options);
    expect(annotated.map((o) => o.leftReversal)).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(annotated.map((o) => o.rightReversal)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("returns all-false for an empty sequence", () => {
    const options = [
      { motions: { left: motion("pro", "n", "e", "cw"), right: parked() } },
    ] as unknown as PictographData[];
    expect(detectReversalsForOptions([], options)[0]!.leftReversal).toBe(false);
  });
});
