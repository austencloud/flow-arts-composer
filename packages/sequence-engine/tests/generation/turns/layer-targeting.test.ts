/**
 * Tests for layer targeting — asking a sequence for a chosen layer signature.
 *
 * The claim being tested is strong: at level 3 ANY layer signature can be laid
 * over ANY sequence, because each prop's crossing is decided by its own turn
 * value and nothing else. So the tests do not check the turn values that come
 * out; they retarget a sequence, run the REAL orientation propagator over the
 * result, read the layers back off the propagated orientations, and require
 * that reading to equal what was asked for.
 *
 * That closes the loop through the calculator instead of trusting the rule that
 * was derived from it.
 */

import { describe, it, expect } from "vitest";
import {
  applyLayerPattern,
  enforceHandFlipParity,
  retargetMotionFlip,
} from "../../../src/generation/turns/layer-targeting.js";
import {
  layerOf,
  formatSignature,
  parsePattern,
  parseSignature,
  patternFromSignature,
  signatureFromPattern,
  flipsLayer,
  isLayerClosed,
  layerPatternOf,
  type LayerId,
  type LayerPattern,
} from "../../../src/core/orientation/layer-signature.js";
import {
  OrientationCalculator,
  OrientationPropagator,
} from "../../../src/core/orientation/OrientationPropagator.js";
import type { SequenceStep, Motion } from "../../../src/core/types/sequence-engine-types.js";

// Fixtures

/**
 * Hand paths that actually travel around the circle, so a float on one of them
 * crosses. Alternating them keeps the fixture from accidentally testing one
 * geometry over and over.
 */
const SHIFT_PATHS: Array<[string, string]> = [
  ["s", "w"],
  ["w", "n"],
  ["n", "e"],
  ["e", "s"],
];

function motion(
  index: number,
  overrides: Partial<Motion> = {}
): Motion {
  const [start, end] = SHIFT_PATHS[index % SHIFT_PATHS.length]!;
  return {
    motionType: "pro",
    startLocation: start,
    endLocation: end,
    rotationDirection: "cw",
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
    ...overrides,
  } as Motion;
}

/**
 * A sequence in the shape the builder assembles: step 0 is the start position
 * and carries no turns, steps 1..n are the letters.
 */
function sequence(length: number, overrides: Partial<Motion> = {}): SequenceStep[] {
  const steps: SequenceStep[] = [];
  for (let i = 0; i <= length; i++) {
    steps.push({
      id: `step-${i}`,
      letter: null,
      startPlacement: null,
      endPlacement: null,
      stepNumber: i,
      duration: 1,
      motions: {
        left: motion(i, overrides),
        right: motion(i + 2, overrides),
      },
    } as SequenceStep);
  }
  return steps;
}

/**
 * Run the engine's own propagator over a sequence and read the layer off each
 * step's propagated orientations. This is the reading a person would take by
 * looking at the pictographs, not a re-application of the targeting rule.
 */
function propagatedSignature(steps: SequenceStep[]): LayerId[] {
  const propagator = new OrientationPropagator(new OrientationCalculator());
  let propagated = propagator.propagateForColor([...steps], "left", "in");
  propagated = propagator.propagateForColor(propagated, "right", "in");

  const signature: LayerId[] = [];
  for (let i = 1; i < propagated.length; i++) {
    const step = propagated[i]!;
    const layer = layerOf(
      step.motions.left.endOrientation,
      step.motions.right.endOrientation
    );
    expect(layer, `step ${i} sits on the orientation cycle`).not.toBeNull();
    signature.push(layer!);
  }
  return signature;
}

/** Every pattern of a given length, for exhaustive checks on short sequences. */
function allPatterns(length: number, startLayer: LayerId = 1): LayerPattern[] {
  const symbols = [".", "B", "R", "X"] as const;
  const out: LayerPattern[] = [];
  const total = 4 ** length;
  for (let n = 0; n < total; n++) {
    const flips: Array<(typeof symbols)[number]> = [];
    let rest = n;
    for (let i = 0; i < length; i++) {
      flips.push(symbols[rest % 4]!);
      rest = Math.floor(rest / 4);
    }
    out.push({ startLayer, flips });
  }
  return out;
}

// ---------------------------------------------------------------------------

describe("retargetMotionFlip", () => {
  it("adds a half turn to make a prop cross, and takes it back off", () => {
    const still = motion(0, { turns: 1 });
    expect(flipsLayer(still)).toBe(false);

    const crossing = retargetMotionFlip(still, true);
    expect(crossing.satisfied).toBe(true);
    expect(crossing.motion.turns).toBe(1.5);
    expect(flipsLayer(crossing.motion)).toBe(true);

    const backAgain = retargetMotionFlip(crossing.motion, false);
    expect(backAgain.satisfied).toBe(true);
    expect(flipsLayer(backAgain.motion)).toBe(false);
  });

  it("leaves a motion alone when it already behaves", () => {
    const already = motion(0, { turns: 0.5 });
    const result = retargetMotionFlip(already, true);
    expect(result.satisfied).toBe(true);
    expect(result.motion).toBe(already);
  });

  it("stays inside the turn cap by stepping down instead of up", () => {
    const atCeiling = motion(0, { turns: 3 });
    const result = retargetMotionFlip(atCeiling, true, { maxTurnIntensity: 3 });
    expect(result.satisfied).toBe(true);
    expect(result.motion.turns).toBe(2.5);
    expect(flipsLayer(result.motion)).toBe(true);
  });

  it("cannot take a prop off radial below level 3 — neither level has a half turn", () => {
    for (const level of [1, 2]) {
      const result = retargetMotionFlip(motion(0, { turns: 0 }), true, { level });
      expect(result.satisfied, `level ${level}`).toBe(false);
      expect(result.reason).toMatch(/no half turn/);
      expect(result.motion.turns).toBe(0);
    }
  });

  it("keeps a rewritten turn inside the values its level actually has", () => {
    // Level 2 is whole turns only. Asking a crossing prop to stay put has to
    // land on a whole number, not shave a half off and call it done.
    const crossing = motion(0, { turns: 1.5 });
    const held = retargetMotionFlip(crossing, false, { level: 2 });
    expect(held.satisfied).toBe(true);
    expect(Number.isInteger(held.motion.turns as number)).toBe(true);
    expect(flipsLayer(held.motion)).toBe(false);
  });

  it("turns a float back into the spin it stood in for when asked to stay put", () => {
    const float = motion(0, {
      motionType: "float",
      turns: "fl",
      rotationDirection: "noRotation",
      prefloatMotionType: "anti",
      prefloatRotationDirection: "ccw",
    });
    expect(flipsLayer(float)).toBe(true);

    const result = retargetMotionFlip(float, false);
    expect(result.satisfied).toBe(true);
    expect(result.motion.motionType).toBe("anti");
    expect(result.motion.rotationDirection).toBe("ccw");
    expect(result.motion.turns).toBe(0);
    expect(result.motion.prefloatMotionType).toBeUndefined();
    expect(flipsLayer(result.motion)).toBe(false);
  });

  it("reports the one case turns cannot fix: a float whose hand never goes around", () => {
    const stuck = motion(0, {
      motionType: "float",
      turns: "fl",
      startLocation: "s",
      endLocation: "n", // a dash — straight through the middle
    });
    expect(flipsLayer(stuck)).toBe(false);

    const result = retargetMotionFlip(stuck, true);
    expect(result.satisfied).toBe(false);
    expect(result.reason).toMatch(/does not travel around the circle/);
  });
});

// ---------------------------------------------------------------------------

describe("applyLayerPattern — the signature comes out as asked", () => {
  it("reproduces every one of the 256 patterns of length 4, verified through the propagator", () => {
    const failures: string[] = [];

    for (const pattern of allPatterns(4)) {
      const result = applyLayerPattern(sequence(4), pattern);
      if (!result.satisfied) {
        failures.push(`${JSON.stringify(pattern.flips)} unreachable`);
        continue;
      }
      const actual = formatSignature(propagatedSignature(result.steps));
      const wanted = formatSignature(signatureFromPattern(pattern));
      if (actual !== wanted) {
        failures.push(`${pattern.flips.join("")}: wanted ${wanted}, got ${actual}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("lays Austen's own signature over a sequence that had nothing to do with it", () => {
    // 1233341112333411 — the reading he took off his ABBΦ- LOOP by eye. His
    // sequence starts with both props radial, so the walk starts in layer 1.
    const wanted = "1233341112333411";
    const pattern = patternFromSignature(parseSignature(wanted)!, 1);
    expect(formatSignature(signatureFromPattern(pattern))).toBe(wanted);

    const result = applyLayerPattern(sequence(16), pattern);
    expect(result.satisfied).toBe(true);
    expect(formatSignature(propagatedSignature(result.steps))).toBe(wanted);
  });

  it("works the same over a sequence that started out full of floats", () => {
    const pattern = parsePattern("1:XB.RX.BR")!;
    const floaty = sequence(8, {
      motionType: "float",
      turns: "fl",
      rotationDirection: "noRotation",
      prefloatMotionType: "pro",
      prefloatRotationDirection: "cw",
    });

    const result = applyLayerPattern(floaty, pattern);
    expect(result.satisfied).toBe(true);
    expect(formatSignature(propagatedSignature(result.steps))).toBe(
      formatSignature(signatureFromPattern(pattern))
    );
  });

  it("round-trips: reading the pattern back off a retargeted sequence returns it", () => {
    const pattern = parsePattern("1:XB.RX.BR")!;
    const result = applyLayerPattern(sequence(8), pattern);
    const readBack = layerPatternOf(result.steps.slice(1));
    expect(readBack.flips.join("")).toBe(pattern.flips.join(""));
  });

  it("reports which motions it could not place when the turn cap forbids crossing", () => {
    const pattern = parsePattern("1:XXXX")!;
    const result = applyLayerPattern(sequence(4), pattern, { maxTurnIntensity: 0 });
    expect(result.satisfied).toBe(false);
    // Both props on all four steps were asked to cross and none could.
    expect(result.misses).toHaveLength(8);
  });

  it("leaves steps beyond the pattern untouched", () => {
    const original = sequence(6);
    const result = applyLayerPattern(original, parsePattern("1:XX")!);
    expect(result.steps.slice(3)).toEqual(original.slice(3));
  });
});

// ---------------------------------------------------------------------------

describe("enforceHandFlipParity", () => {
  it("makes each prop cross an even number of times, closing the loop", () => {
    // Three crossings on left, one on right — both odd, so neither prop comes home.
    const start = applyLayerPattern(sequence(6), parsePattern("1:BBBR..")!).steps;
    expect(isLayerClosed(layerPatternOf(start.slice(1)))).toBe(false);

    const result = enforceHandFlipParity(start, "even");
    expect(result.satisfied).toBe(true);
    expect(isLayerClosed(layerPatternOf(result.steps.slice(1)))).toBe(true);
  });

  it("makes each prop cross an odd number of times, so the layers take two passes", () => {
    const start = applyLayerPattern(sequence(6), parsePattern("1:XX....")!).steps;
    expect(isLayerClosed(layerPatternOf(start.slice(1)))).toBe(true);

    const result = enforceHandFlipParity(start, "odd");
    expect(result.satisfied).toBe(true);
    expect(isLayerClosed(layerPatternOf(result.steps.slice(1)))).toBe(false);

    for (const hand of ["left", "right"] as const) {
      const crossings = result.steps
        .slice(1)
        .filter((step) => flipsLayer(step.motions[hand])).length;
      expect(crossings % 2, `${hand} crossings`).toBe(1);
    }
  });

  it("does nothing when the parity is already right", () => {
    const start = applyLayerPattern(sequence(4), parsePattern("1:XX..")!).steps;
    const result = enforceHandFlipParity(start, "even");
    expect(result.steps).toEqual(start);
  });

  it("counts a float as a crossing, which is what the allocator's tally misses", () => {
    // Every step is a float on a shift, so every step crosses. Six crossings
    // per prop is even. The allocator scores a float as zero and would read
    // this as zero crossings — also even, but for the wrong reason. Asking for
    // odd parity is what separates the two accountings.
    const floaty = sequence(6, {
      motionType: "float",
      turns: "fl",
      rotationDirection: "noRotation",
      prefloatMotionType: "pro",
      prefloatRotationDirection: "cw",
    });
    for (let i = 1; i < floaty.length; i++) {
      expect(flipsLayer(floaty[i]!.motions.left)).toBe(true);
    }

    const result = enforceHandFlipParity(floaty, "odd");
    expect(result.satisfied).toBe(true);
    for (const hand of ["left", "right"] as const) {
      const crossings = result.steps
        .slice(1)
        .filter((step) => flipsLayer(step.motions[hand])).length;
      expect(crossings % 2, `${hand} crossings`).toBe(1);
    }
  });
});
