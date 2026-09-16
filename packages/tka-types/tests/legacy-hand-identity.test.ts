import { describe, expect, it } from "vitest";
import {
  normalizeLegacyHandPair,
  normalizeLegacyHandSide,
  normalizeLegacyPictograph,
  normalizeLegacySequence,
  normalizeLegacyStep,
  normalizeLegacySteps,
  normalizeLegacyStepPairing,
} from "../src/legacy-hand-identity.js";

describe("legacy hand identity normalization", () => {
  it("preserves canonical hand-pair object identity", () => {
    const canonical = { left: { turns: 1 }, right: { turns: 2 } };

    expect(normalizeLegacyHandPair(canonical)).toBe(canonical);
  });

  it("maps canonical palette names to performer-relative hands", () => {
    expect(normalizeLegacyHandSide("blue")).toBe("left");
    expect(normalizeLegacyHandSide("red")).toBe("right");
    expect(normalizeLegacyHandSide("left")).toBe("left");
    expect(normalizeLegacyHandSide("right")).toBe("right");
  });

  it("removes legacy keys while retaining unrelated motion metadata", () => {
    const normalized = normalizeLegacyStep({
      id: "legacy-step",
      blueReversal: true,
      redReversal: false,
      motions: {
        blue: { color: "blue", motionType: "pro", custom: 7 },
        red: { color: "red", motionType: "anti", custom: 9 },
      },
    }) as Record<string, any>;

    expect(normalized).toMatchObject({
      id: "legacy-step",
      leftReversal: true,
      rightReversal: false,
      motions: {
        left: { hand: "left", motionType: "pro", custom: 7 },
        right: { hand: "right", motionType: "anti", custom: 9 },
      },
    });
    expect(normalized).not.toHaveProperty("blueReversal");
    expect(normalized).not.toHaveProperty("redReversal");
    expect(normalized.motions).not.toHaveProperty("blue");
    expect(normalized.motions).not.toHaveProperty("red");
    expect(normalized.motions.left).not.toHaveProperty("color");
    expect(normalized.motions.right).not.toHaveProperty("color");
  });

  it("normalizes arrays without mutating their legacy source", () => {
    const source = [
      { motions: { blue: { color: "blue" }, red: { color: "red" } } },
    ];
    const normalized = normalizeLegacySteps(source) as Array<
      Record<string, any>
    >;

    expect(normalized[0]?.motions.left.hand).toBe("left");
    expect(source[0]?.motions.blue.color).toBe("blue");
  });

  it("normalizes persisted sequence composition and prop intent", () => {
    const source = {
      blueSoloProp: { id: "blue-solo" },
      redSoloProp: { id: "red-solo" },
      bluePathHash: "blue-path",
      redPathHash: "red-path",
      blueSoloHash: "blue-solo-hash",
      redSoloHash: "red-solo-hash",
      stepPairings: [{ blueReversal: true, redReversal: false }],
      intendedProp: { bluePropType: "staff", redPropType: "fan" },
      creatorIntent: {
        propConfig: { bluePropType: "club", redPropType: "poi" },
      },
      loopSpec: {
        blue: { rotated: { period: 4 } },
        red: { mirrored: { period: 2 } },
      },
    };

    const normalized = normalizeLegacySequence(source) as Record<string, any>;

    expect(normalized).toMatchObject({
      leftSoloProp: { id: "blue-solo" },
      rightSoloProp: { id: "red-solo" },
      leftPathHash: "blue-path",
      rightPathHash: "red-path",
      leftSoloHash: "blue-solo-hash",
      rightSoloHash: "red-solo-hash",
      stepPairings: [{ leftReversal: true, rightReversal: false }],
      intendedProp: { leftPropType: "staff", rightPropType: "fan" },
      creatorIntent: {
        propConfig: { leftPropType: "club", rightPropType: "poi" },
      },
      loopSpec: {
        left: { rotated: { period: 4 } },
        right: { mirrored: { period: 2 } },
      },
    });
    expect(normalized).not.toHaveProperty("blueSoloProp");
    expect(normalized).not.toHaveProperty("redSoloProp");
    expect(source.blueSoloProp.id).toBe("blue-solo");
  });
});

describe("legacy placement (position -> placement) normalization", () => {
  it("moves startPosition/endPosition on a step-shaped record", () => {
    const normalized = normalizeLegacyStep({
      id: "legacy-step",
      startPosition: "alpha1",
      endPosition: "beta3",
    }) as Record<string, any>;

    expect(normalized).toMatchObject({
      id: "legacy-step",
      startPlacement: "alpha1",
      endPlacement: "beta3",
    });
    expect(normalized).not.toHaveProperty("startPosition");
    expect(normalized).not.toHaveProperty("endPosition");
  });

  it("moves gridPosition/isStartPosition on a start-placement-shaped record", () => {
    const normalized = normalizeLegacyStep({
      id: "legacy-start",
      isStartPosition: true,
      gridPosition: "gamma7",
      startPosition: "gamma7",
      endPosition: "gamma7",
    }) as Record<string, any>;

    expect(normalized).toMatchObject({
      id: "legacy-start",
      isStartPlacement: true,
      gridPlacement: "gamma7",
      startPlacement: "gamma7",
      endPlacement: "gamma7",
    });
    expect(normalized).not.toHaveProperty("isStartPosition");
    expect(normalized).not.toHaveProperty("gridPosition");
    expect(normalized).not.toHaveProperty("startPosition");
    expect(normalized).not.toHaveProperty("endPosition");
  });

  it("prefers canonical placement keys over legacy position keys when both are present", () => {
    const normalized = normalizeLegacyStep({
      startPosition: "alpha1",
      startPlacement: "beta3",
      endPosition: "gamma5",
      endPlacement: "delta1",
    }) as Record<string, any>;

    expect(normalized.startPlacement).toBe("beta3");
    expect(normalized.endPlacement).toBe("delta1");
    expect(normalized).not.toHaveProperty("startPosition");
    expect(normalized).not.toHaveProperty("endPosition");
  });

  it("normalizes legacy position keys on a bare pictograph-shaped record", () => {
    const normalized = normalizeLegacyPictograph({
      id: "pict-1",
      startPosition: "alpha1",
      endPosition: "beta3",
      motions: {
        blue: { color: "blue", motionType: "pro" },
        red: { color: "red", motionType: "anti" },
      },
    }) as Record<string, any>;

    expect(normalized.startPlacement).toBe("alpha1");
    expect(normalized.endPlacement).toBe("beta3");
    expect(normalized.motions.left.hand).toBe("left");
    expect(normalized).not.toHaveProperty("startPosition");
    expect(normalized).not.toHaveProperty("endPosition");
  });

  it("moves startPosition/endPosition on a step pairing", () => {
    const normalized = normalizeLegacyStepPairing({
      letter: "A",
      startPosition: "alpha1",
      endPosition: "beta3",
    }) as Record<string, any>;

    expect(normalized).toMatchObject({
      letter: "A",
      startPlacement: "alpha1",
      endPlacement: "beta3",
    });
    expect(normalized).not.toHaveProperty("startPosition");
    expect(normalized).not.toHaveProperty("endPosition");
  });

  it("moves a legacy startPosition/startingPosition sequence field, normalizing recursively", () => {
    const source = {
      id: "seq-1",
      startPosition: {
        id: "start-cell",
        isStartPosition: true,
        gridPosition: "alpha1",
        blueReversal: false,
        redReversal: false,
        motions: { blue: { color: "blue" }, red: { color: "red" } },
      },
      startingPosition: {
        id: "starting-cell",
        gridPosition: "beta3",
      },
    };

    const normalized = normalizeLegacySequence(source) as Record<string, any>;

    expect(normalized).not.toHaveProperty("startPosition");
    expect(normalized).not.toHaveProperty("startingPosition");
    expect(normalized.startPlacement).toMatchObject({
      id: "start-cell",
      isStartPlacement: true,
      gridPlacement: "alpha1",
      leftReversal: false,
      rightReversal: false,
      motions: { left: { hand: "left" }, right: { hand: "right" } },
    });
    expect(normalized.startingPlacement).toMatchObject({
      id: "starting-cell",
      gridPlacement: "beta3",
    });
    // Source is untouched.
    expect(source.startPosition.gridPosition).toBe("alpha1");
  });

  it("prefers a canonical startPlacement sequence field over a legacy startPosition sibling", () => {
    const source = {
      id: "seq-2",
      startPosition: { id: "legacy-start", gridPosition: "alpha1" },
      startPlacement: { id: "canonical-start", gridPlacement: "gamma5" },
    };

    const normalized = normalizeLegacySequence(source) as Record<string, any>;

    expect(normalized.startPlacement).toMatchObject({
      id: "canonical-start",
      gridPlacement: "gamma5",
    });
    expect(normalized).not.toHaveProperty("startPosition");
  });

  it("normalizes a mixed document carrying both hand-identity and placement legacy keys", () => {
    const source = {
      id: "seq-mixed",
      steps: [
        {
          id: "step-1",
          blueReversal: true,
          startPosition: "alpha1",
          endPosition: "beta3",
          motions: { blue: { color: "blue" }, red: { color: "red" } },
        },
      ],
      startPosition: {
        id: "start-cell",
        gridPosition: "alpha1",
      },
      stepPairings: [
        { blueReversal: true, startPosition: "alpha1", endPosition: "beta3" },
      ],
    };

    const normalized = normalizeLegacySequence(source) as Record<string, any>;

    expect(normalized.steps[0]).toMatchObject({
      leftReversal: true,
      startPlacement: "alpha1",
      endPlacement: "beta3",
      motions: { left: { hand: "left" } },
    });
    expect(normalized.startPlacement).toMatchObject({
      id: "start-cell",
      gridPlacement: "alpha1",
    });
    expect(normalized.stepPairings[0]).toMatchObject({
      leftReversal: true,
      startPlacement: "alpha1",
      endPlacement: "beta3",
    });
  });
});
