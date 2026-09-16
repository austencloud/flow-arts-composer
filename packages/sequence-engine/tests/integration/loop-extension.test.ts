/**
 * Integration tests for LOOP extension in SequenceBuilder.
 *
 * Verifies that building with loop options produces extended sequences
 * via the LOOP executor pipeline. Uses the same mock provider pattern
 * as the other integration tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SequenceBuilder } from "../../src/generation/builder/SequenceBuilder.js";
import type { IVariationProvider } from "../../src/generation/data/IVariationProvider.js";
import type { PictographData, MotionData } from "../../src/generation/constraints/types.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import type { ITransitionGraph } from "../../src/core/transition-graph/ITransitionGraph.js";
import type { PlacementGroup, LetterPlacementInfo } from "../../src/core/types/sequence-engine-types.js";
import { LOOPType, Period } from "../../src/loop/loop-types.js";

// Mock data factory (same pattern as full-build tests)

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

// Mock pictograph dataset
//
// Same minimal graph as full-build:
//   α at alpha1 (Type 6, start position)
//   A: alpha1 → beta3
//   B: beta3 → alpha1
//   C: alpha1 → alpha1
//   D: beta3 → beta3

const MOCK_PICTOGRAPHS: PictographData[] = [
  makePictograph({
    letter: "α",
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation" }),
    rightMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation" }),
  }),
  makePictograph({
    letter: "α",
    startPlacement: "beta3",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation" }),
    rightMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation" }),
  }),
  makePictograph({
    letter: "A",
    startPlacement: "alpha1",
    endPlacement: "beta3",
    leftMotion: makeMotion({ startLocation: "n", endLocation: "e" }),
    rightMotion: makeMotion({ startLocation: "s", endLocation: "w" }),
  }),
  makePictograph({
    letter: "B",
    startPlacement: "beta3",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ startLocation: "e", endLocation: "n" }),
    rightMotion: makeMotion({ startLocation: "w", endLocation: "s" }),
  }),
  makePictograph({
    letter: "C",
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ startLocation: "n", endLocation: "n" }),
    rightMotion: makeMotion({ startLocation: "s", endLocation: "s" }),
  }),
  makePictograph({
    letter: "D",
    startPlacement: "beta3",
    endPlacement: "beta3",
    leftMotion: makeMotion({ startLocation: "e", endLocation: "e" }),
    rightMotion: makeMotion({ startLocation: "w", endLocation: "w" }),
  }),
];

// Mock providers

class MockVariationProvider implements IVariationProvider {
  private readonly data: PictographData[];

  constructor(data: PictographData[]) {
    this.data = data;
  }

  getVariations(letter: string, position: string, _gridMode: string): PictographData[] {
    return this.data.filter(
      (p) => p.letter === letter && p.startPlacement === position,
    );
  }

  getAllVariations(_gridMode: string): PictographData[] {
    return this.data;
  }
}

const LETTER_POSITIONS: Record<string, { start: PlacementGroup; end: PlacementGroup }> = {
  A: { start: "alpha", end: "beta" },
  B: { start: "beta", end: "alpha" },
  C: { start: "alpha", end: "alpha" },
  D: { start: "beta", end: "beta" },
  α: { start: "alpha", end: "alpha" },
};

class MockTransitionGraph implements ITransitionGraph {
  async initialize(): Promise<void> {}

  canFollow(letterA: string, letterB: string): boolean {
    const a = LETTER_POSITIONS[letterA];
    const b = LETTER_POSITIONS[letterB];
    if (!a || !b) return false;
    return a.end === b.start;
  }

  getValidSuccessors(letter: string): string[] {
    const info = LETTER_POSITIONS[letter];
    if (!info) return [];
    return Object.entries(LETTER_POSITIONS)
      .filter(([_, pos]) => pos.start === info.end)
      .map(([l]) => l);
  }

  getLettersStartingAt(placementGroup: PlacementGroup): string[] {
    return Object.entries(LETTER_POSITIONS)
      .filter(([_, pos]) => pos.start === placementGroup)
      .map(([l]) => l);
  }

  getLettersEndingAt(placementGroup: PlacementGroup): string[] {
    return Object.entries(LETTER_POSITIONS)
      .filter(([_, pos]) => pos.end === placementGroup)
      .map(([l]) => l);
  }

  getLetterPlacementInfo(letter: string): LetterPlacementInfo | null {
    const pos = LETTER_POSITIONS[letter];
    if (!pos) return null;
    return { letter, startPlacementGroup: pos.start, endPlacementGroup: pos.end };
  }

  getStartPlacementGroup(letter: string): PlacementGroup | null {
    return LETTER_POSITIONS[letter]?.start ?? null;
  }

  getEndPlacementGroup(letter: string): PlacementGroup | null {
    return LETTER_POSITIONS[letter]?.end ?? null;
  }

  findBridgeLetters(letterA: string, letterB: string): string[] {
    if (this.canFollow(letterA, letterB)) return [];
    const aEnd = LETTER_POSITIONS[letterA]?.end;
    const bStart = LETTER_POSITIONS[letterB]?.start;
    if (!aEnd || !bStart) return [];
    for (const [l, pos] of Object.entries(LETTER_POSITIONS)) {
      if (pos.start === aEnd && pos.end === bStart) return [l];
    }
    return [];
  }

  findAllBridgeOptions(letterA: string, letterB: string): string[] {
    if (this.canFollow(letterA, letterB)) return [];
    const aEnd = LETTER_POSITIONS[letterA]?.end;
    const bStart = LETTER_POSITIONS[letterB]?.start;
    if (!aEnd || !bStart) return [];
    return Object.entries(LETTER_POSITIONS)
      .filter(([_, pos]) => pos.start === aEnd && pos.end === bStart)
      .map(([l]) => l);
  }

  getAllLetters(_excludeLetters?: Set<string>): string[] {
    return Object.keys(LETTER_POSITIONS);
  }

  isInitialized(): boolean {
    return true;
  }
}

// Tests

describe("SequenceBuilder LOOP extension", () => {
  let builder: SequenceBuilder;

  beforeEach(() => {
    setLetterTransitionGraph(new MockTransitionGraph());
    const provider = new MockVariationProvider(MOCK_PICTOGRAPHS);
    builder = new SequenceBuilder(provider);
  });

  it("Rewound LOOP doubles the sequence length", () => {
    // Build "AB" (3 steps: start + A + B), then rewound doubles the steps
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
      loop: {
        type: LOOPType.REWOUND,
        period: Period.HALVED,
      },
    });

    // Original: start + 2 steps = 3 steps
    // Rewound appends 2 reversed steps = 5 total steps
    expect(result.sequence.length).toBe(5);
  });

  it("LOOP metadata is populated in the result", () => {
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
      loop: {
        type: LOOPType.REWOUND,
        period: Period.HALVED,
      },
    });

    expect(result.loop).toBeDefined();
    expect(result.loop!.seedWord).toBe("AB");
    expect(result.loop!.derivedWord.length).toBeGreaterThan(0);
    expect(result.loop!.derivedStepIndices.length).toBe(2);
    expect(result.loop!.components.length).toBe(2);
    expect(result.loop!.orientationCycleMultiplier).toBe(2);
  });

  it("derived step indices point to valid steps", () => {
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
      loop: {
        type: LOOPType.REWOUND,
        period: Period.HALVED,
      },
    });

    for (const idx of result.loop!.derivedStepIndices) {
      expect(idx).toBeLessThan(result.sequence.length);
      expect(result.sequence[idx]).toBeDefined();
    }
  });

  it("extended sequence maintains position continuity", () => {
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
      loop: {
        type: LOOPType.REWOUND,
        period: Period.HALVED,
      },
    });

    // Every step's startPlacement should match the previous step's endPlacement
    for (let i = 1; i < result.sequence.length; i++) {
      const prev = result.sequence[i - 1]!;
      const curr = result.sequence[i]!;
      expect(curr.startPlacement).toBe(prev.endPlacement);
    }
  });

  it("Rewound derives each appended step's letter from its reversed motions (not copied from source)", () => {
    // In this mock A and B are temporal inverses of each other:
    //   A: left n→e, right s→w   (alpha1→beta3)
    //   B: left e→n, right w→s   (beta3→alpha1)
    // Rewinding B (swap locations, flip rotation) yields A's motion signature,
    // and rewinding A yields B's. So the correct derived word is "AB" — the
    // letter of each appended step re-derived from its OWN reversed motions.
    //
    // The bug: RewoundExecutor spreads `...sourceStep`, copying the SOURCE
    // step's letter onto the reversed step, producing the derived word "BA"
    // (rev(B) mislabeled "B", rev(A) mislabeled "A"). This is the "step 12
    // labeled with step 5's letter" defect reported for the generator.
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
      loop: {
        type: LOOPType.REWOUND,
        period: Period.HALVED,
      },
    });

    // Steps: [start, A, B, rev(B), rev(A)]
    expect(result.sequence[3]!.letter).toBe("A"); // rev(B) → A's motion signature
    expect(result.sequence[4]!.letter).toBe("B"); // rev(A) → B's motion signature
    expect(result.loop!.derivedWord).toBe("AB"); // not the copied "BA"
  });

  it("result without loop options has no loop metadata", () => {
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
    });

    expect(result.loop).toBeUndefined();
  });
});
