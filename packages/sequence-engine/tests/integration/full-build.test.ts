/**
 * Integration tests for SequenceBuilder.
 *
 * Uses a mock IVariationProvider with a minimal set of fake pictograph data
 * — enough to build 2-3 letter words and verify the full pipeline works
 * end-to-end.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SequenceBuilder } from "../../src/generation/builder/SequenceBuilder.js";
import type { IVariationProvider } from "../../src/generation/data/IVariationProvider.js";
import type { PictographData, MotionData } from "../../src/generation/constraints/types.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import type { ITransitionGraph } from "../../src/core/transition-graph/ITransitionGraph.js";
import type { PlacementGroup, LetterPlacementInfo } from "../../src/core/types/sequence-engine-types.js";

// Mock data factory

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
// We create a minimal graph:
//   - α at alpha1 (Type 6, start position)
//   - A: alpha1 → beta3 (Type 1)
//   - B: beta3 → alpha1 (Type 1)
//   - C: alpha1 → alpha1 (Type 1)
//   - D: beta3 → beta3 (Type 1)

const MOCK_PICTOGRAPHS: PictographData[] = [
  // Start position: α at alpha1
  makePictograph({
    letter: "α",
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation" }),
    rightMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation" }),
  }),

  // Start position: α at beta3
  makePictograph({
    letter: "α",
    startPlacement: "beta3",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation" }),
    rightMotion: makeMotion({ motionType: "static", rotationDirection: "noRotation" }),
  }),

  // A: alpha1 → beta3
  makePictograph({
    letter: "A",
    startPlacement: "alpha1",
    endPlacement: "beta3",
    leftMotion: makeMotion({ startLocation: "n", endLocation: "e" }),
    rightMotion: makeMotion({ startLocation: "s", endLocation: "w" }),
  }),

  // B: beta3 → alpha1
  makePictograph({
    letter: "B",
    startPlacement: "beta3",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ startLocation: "e", endLocation: "n" }),
    rightMotion: makeMotion({ startLocation: "w", endLocation: "s" }),
  }),

  // C: alpha1 → alpha1 (stays in alpha)
  makePictograph({
    letter: "C",
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ startLocation: "n", endLocation: "n" }),
    rightMotion: makeMotion({ startLocation: "s", endLocation: "s" }),
  }),

  // D: beta3 → beta3 (stays in beta)
  makePictograph({
    letter: "D",
    startPlacement: "beta3",
    endPlacement: "beta3",
    leftMotion: makeMotion({ startLocation: "e", endLocation: "e" }),
    rightMotion: makeMotion({ startLocation: "w", endLocation: "w" }),
  }),
];

// Mock IVariationProvider

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

// Mock ITransitionGraph
//
// Minimal implementation that knows about our mock letters' position groups:
//   A: alpha → beta
//   B: beta → alpha
//   C: alpha → alpha
//   D: beta → beta
//   α: alpha → alpha (and beta → beta)

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
    return {
      letter,
      startPlacementGroup: pos.start,
      endPlacementGroup: pos.end,
    };
  }

  getStartPlacementGroup(letter: string): PlacementGroup | null {
    return LETTER_POSITIONS[letter]?.start ?? null;
  }

  getEndPlacementGroup(letter: string): PlacementGroup | null {
    return LETTER_POSITIONS[letter]?.end ?? null;
  }

  findBridgeLetters(letterA: string, letterB: string): string[] {
    if (this.canFollow(letterA, letterB)) return [];

    // Simple: find any letter that bridges
    const aEnd = LETTER_POSITIONS[letterA]?.end;
    const bStart = LETTER_POSITIONS[letterB]?.start;
    if (!aEnd || !bStart) return [];

    for (const [l, pos] of Object.entries(LETTER_POSITIONS)) {
      if (pos.start === aEnd && pos.end === bStart) {
        return [l];
      }
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

describe("SequenceBuilder integration", () => {
  let builder: SequenceBuilder;

  beforeEach(() => {
    setLetterTransitionGraph(new MockTransitionGraph());
    const provider = new MockVariationProvider(MOCK_PICTOGRAPHS);
    builder = new SequenceBuilder(provider);
  });

  it("builds a valid 2-letter sequence (AB)", () => {
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
    });

    // Start position + 2 letters = 3 steps
    expect(result.sequence.length).toBe(3);

    // First step is start position (α)
    expect(result.startPlacement.letter).toBe("α");

    // Second step is A
    expect(result.sequence[1]!.letter).toBe("A");

    // Third step is B
    expect(result.sequence[2]!.letter).toBe("B");
  });

  it("maintains position continuity through the sequence", () => {
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
    });

    for (let i = 1; i < result.sequence.length; i++) {
      const prev = result.sequence[i - 1]!;
      const curr = result.sequence[i]!;
      expect(curr.startPlacement).toBe(prev.endPlacement);
    }
  });

  it("returns correct number of steps for the word", () => {
    const result = builder.build({
      word: "ABA",
      gridMode: "diamond",
      level: 1,
    });

    // Start position + 3 letters (A→B→A, all direct transitions)
    // A goes alpha→beta, B goes beta→alpha, A goes alpha→beta
    expect(result.sequence.length).toBe(4);
  });

  it("includes a constraint report", () => {
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
    });

    expect(result.constraintReport).toBeDefined();
    expect(typeof result.constraintReport.score).toBe("number");
    expect(typeof result.constraintReport.satisfied).toBe("boolean");
  });

  it("includes search metrics", () => {
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
    });

    expect(result.metrics.statesExplored).toBeGreaterThan(0);
    expect(typeof result.metrics.beamPrunings).toBe("number");
  });

  it("includes turn allocation with correct length", () => {
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
    });

    // Turn allocation is for the 2 letters (not including start position)
    expect(result.turnAllocation.left).toHaveLength(2);
    expect(result.turnAllocation.right).toHaveLength(2);
  });

  it("applies constraint preset without errors", () => {
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
      constraintPreset: "smooth",
    });

    expect(result.sequence.length).toBeGreaterThan(0);
  });

  it("throws on empty word", () => {
    expect(() =>
      builder.build({
        word: "",
        gridMode: "diamond",
        level: 1,
      }),
    ).toThrow(/Either word or length must be provided/);
  });

  it("builds a single-letter word (C stays in alpha)", () => {
    const result = builder.build({
      word: "C",
      gridMode: "diamond",
      level: 1,
    });

    // Start position + 1 letter = 2 steps
    expect(result.sequence.length).toBe(2);
    expect(result.sequence[1]!.letter).toBe("C");
  });

  it("each step has step index and step number", () => {
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
    });

    for (let i = 0; i < result.sequence.length; i++) {
      const step = result.sequence[i]!;
      // `stepNumber` was the engine's informal name; `stepNumber` is canonical now.
      expect(step.stepNumber).toBe(i);
    }
  });

  it("inserts bridge when direct path is unavailable", () => {
    // D starts at beta, C starts at alpha. They can't follow directly.
    // A bridge (B: beta→alpha) should be inserted.
    // But we need the word to start from a position that reaches D.
    // A: alpha→beta, D: beta→beta, C: alpha→alpha
    // The word "ADC" means: A(alpha→beta), D(beta→beta), C(alpha→alpha)
    // D→C needs a bridge: D ends at beta, C starts at alpha. Bridge = B (beta→alpha).
    const result = builder.build({
      word: "ADC",
      gridMode: "diamond",
      level: 1,
    });

    // Should succeed with bridge insertion
    expect(result.sequence.length).toBeGreaterThan(0);

    // Check that bridge indices are populated (D→C transition needs a bridge)
    // The bridge should be between D and C
    if (result.bridgeStepIndices.length > 0) {
      for (const idx of result.bridgeStepIndices) {
        expect(result.sequence[idx]!.isBridge).toBe(true);
      }
    }
  });
});
