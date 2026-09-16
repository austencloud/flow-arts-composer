/**
 * Integration test: smooth constraint must prevent prop rotation reversals.
 *
 * When propContinuity = "maximize", the beam search should never produce
 * a sequence where the rotation direction changes (cw→ccw or ccw→cw)
 * between consecutive non-noRotation steps.
 *
 * The old StepGenerationOrchestrator hard-filtered by rotation direction.
 * The new SequenceBuilder uses soft constraints + enrichment. This test
 * verifies the new path actually prevents reversals.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SequenceBuilder } from "../../src/generation/builder/SequenceBuilder.js";
import type { IVariationProvider } from "../../src/generation/data/IVariationProvider.js";
import type { PictographData, MotionData } from "../../src/generation/constraints/types.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import type { ITransitionGraph } from "../../src/core/transition-graph/ITransitionGraph.js";
import type { PlacementGroup, LetterPlacementInfo } from "../../src/core/types/sequence-engine-types.js";

// Mock data — must have BOTH cw and ccw variations for each letter so the
// constraint has a real choice to make.

function makeMotion(overrides: Partial<MotionData> = {}): MotionData {
  return {
    hand: "left",
    startLocation: "n",
    endLocation: "s",
    motionType: "pro",
    rotationDirection: "cw",
    startOrientation: "in",
    endOrientation: "in",
    ...overrides,
  };
}

function makePictograph(overrides: Partial<PictographData> & { letter: string }): PictographData {
  return {
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    timing: "together",
    direction: "together",
    leftMotion: makeMotion({ hand: "left" }),
    rightMotion: makeMotion({ hand: "right" }),
    ...overrides,
  };
}

// Positions: alpha1, beta3
// Letters:
//   α - Type 6 start position (static at each position)
//   A - alpha1→beta3 (pro, has cw AND ccw variations)
//   B - beta3→alpha1 (pro, has cw AND ccw variations)
//   C - alpha1→alpha1 (static left, pro right — has cw AND ccw for right)
//   D - beta3→beta3 (static left, pro right — has cw AND ccw for right)
const MOCK_PICTOGRAPHS: PictographData[] = [
  // Start positions
  makePictograph({
    letter: "α",
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation", startLocation: "s", endLocation: "s" }),
    rightMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation", startLocation: "n", endLocation: "n" }),
  }),
  makePictograph({
    letter: "α",
    startPlacement: "beta3",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation", startLocation: "e", endLocation: "e" }),
    rightMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation", startLocation: "n", endLocation: "n" }),
  }),

  // A: alpha1→beta3, CW variant
  makePictograph({
    letter: "A",
    startPlacement: "alpha1",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "pro", rotationDirection: "cw", startLocation: "s", endLocation: "e" }),
    rightMotion: makeMotion({ motionType: "pro", rotationDirection: "cw", startLocation: "n", endLocation: "e" }),
  }),
  // A: alpha1→beta3, CCW variant
  makePictograph({
    letter: "A",
    startPlacement: "alpha1",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "pro", rotationDirection: "ccw", startLocation: "s", endLocation: "e" }),
    rightMotion: makeMotion({ motionType: "pro", rotationDirection: "ccw", startLocation: "n", endLocation: "e" }),
  }),

  // B: beta3→alpha1, CW variant
  makePictograph({
    letter: "B",
    startPlacement: "beta3",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "pro", rotationDirection: "cw", startLocation: "e", endLocation: "s" }),
    rightMotion: makeMotion({ motionType: "pro", rotationDirection: "cw", startLocation: "e", endLocation: "n" }),
  }),
  // B: beta3→alpha1, CCW variant
  makePictograph({
    letter: "B",
    startPlacement: "beta3",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "pro", rotationDirection: "ccw", startLocation: "e", endLocation: "s" }),
    rightMotion: makeMotion({ motionType: "pro", rotationDirection: "ccw", startLocation: "e", endLocation: "n" }),
  }),

  // C: alpha1→alpha1 — static left (noRotation), pro right with cw/ccw variants
  makePictograph({
    letter: "C",
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation", startLocation: "s", endLocation: "s" }),
    rightMotion: makeMotion({ motionType: "pro", rotationDirection: "cw", startLocation: "n", endLocation: "n" }),
  }),
  makePictograph({
    letter: "C",
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation", startLocation: "s", endLocation: "s" }),
    rightMotion: makeMotion({ motionType: "pro", rotationDirection: "ccw", startLocation: "n", endLocation: "n" }),
  }),

  // D: beta3→beta3 — static left (noRotation), pro right with cw/ccw variants
  makePictograph({
    letter: "D",
    startPlacement: "beta3",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation", startLocation: "e", endLocation: "e" }),
    rightMotion: makeMotion({ motionType: "pro", rotationDirection: "cw", startLocation: "n", endLocation: "n" }),
  }),
  makePictograph({
    letter: "D",
    startPlacement: "beta3",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation", startLocation: "e", endLocation: "e" }),
    rightMotion: makeMotion({ motionType: "pro", rotationDirection: "ccw", startLocation: "n", endLocation: "n" }),
  }),
];

// Mock variation provider

class MockVariationProvider implements IVariationProvider {
  getVariations(letter: string, startPlacement: string, _gridMode: string): PictographData[] {
    return MOCK_PICTOGRAPHS.filter(
      (p) => p.letter === letter && p.startPlacement === startPlacement,
    );
  }

  getAllVariations(_gridMode: string): PictographData[] {
    return MOCK_PICTOGRAPHS;
  }
}

// Mock transition graph

const mockTransitionGraph: ITransitionGraph = {
  findBridgeLetters: () => [],
  findAllBridgeOptions: () => [],
  getPlacementGroup: (pos: string): PlacementGroup => {
    if (pos.startsWith("alpha")) return "alpha" as PlacementGroup;
    if (pos.startsWith("beta")) return "beta" as PlacementGroup;
    return "gamma" as PlacementGroup;
  },
  getLetterPlacementInfo: (letter: string): LetterPlacementInfo | null => {
    const info: Record<string, LetterPlacementInfo> = {
      A: { letter: "A", startGroups: ["alpha" as PlacementGroup], endGroups: ["beta" as PlacementGroup] },
      B: { letter: "B", startGroups: ["beta" as PlacementGroup], endGroups: ["alpha" as PlacementGroup] },
      C: { letter: "C", startGroups: ["alpha" as PlacementGroup], endGroups: ["alpha" as PlacementGroup] },
      D: { letter: "D", startGroups: ["beta" as PlacementGroup], endGroups: ["beta" as PlacementGroup] },
    };
    return info[letter] ?? null;
  },
};

// Reversal detection helper

function findReversals(steps: { leftMotion: MotionData; rightMotion: MotionData }[]): string[] {
  const issues: string[] = [];

  for (const hand of ["left", "right"] as const) {
    let lastDir: string | null = null;
    for (let i = 0; i < steps.length; i++) {
      const motion = hand === "left" ? steps[i]!.motions.left : steps[i]!.motions.right;
      const dir = motion.rotationDirection;
      if (!dir || dir === "noRotation" || dir === "no_rot") continue;

      if (lastDir && lastDir !== dir) {
        issues.push(`${hand} reversal at step ${i}: ${lastDir}→${dir}`);
      }
      lastDir = dir;
    }
  }

  return issues;
}

// Tests

describe("Smooth constraint prevents prop reversals", () => {
  beforeEach(() => {
    setLetterTransitionGraph(mockTransitionGraph);
  });

  it("length-based generation with smooth props has zero reversals (50 runs)", () => {
    const provider = new MockVariationProvider();
    const allReversals: string[] = [];

    for (let run = 0; run < 200; run++) {
      const builder = new SequenceBuilder(provider);
      const result = builder.build({
        length: 8,
        gridMode: "diamond",
        level: 2,
        maxTurnIntensity: 1,
        constraintOptions: { propContinuity: "maximize" },
      });

      const reversals = findReversals(result.sequence);
      if (reversals.length > 0) {
        // Dump the left directions and turns for debugging
        const leftData = result.sequence.map((s, i) => ({
          step: i,
          letter: s.letter,
          leftType: s.leftMotion.motionType,
          leftDir: s.leftMotion.rotationDirection,
          leftTurns: s.leftMotion.turns,
        }));
        allReversals.push(`Run ${run}: ${reversals.join(", ")} | DATA: ${JSON.stringify(leftData)}`);
      }
    }

    expect(allReversals).toEqual([]);
  });

  it("word-based generation with smooth props has zero reversals (50 runs)", () => {
    const provider = new MockVariationProvider();
    const allReversals: string[] = [];

    for (let run = 0; run < 50; run++) {
      const builder = new SequenceBuilder(provider);
      const result = builder.build({
        word: "ABAB",
        gridMode: "diamond",
        level: 2,
        maxTurnIntensity: 1,
        constraintOptions: { propContinuity: "maximize" },
      });

      const reversals = findReversals(result.sequence);
      if (reversals.length > 0) {
        allReversals.push(`Run ${run}: ${reversals.join(", ")}`);
      }
    }

    expect(allReversals).toEqual([]);
  });
});
