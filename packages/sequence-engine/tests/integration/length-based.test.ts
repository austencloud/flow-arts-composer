/**
 * Integration tests for length-based sequence generation.
 *
 * Verifies that SequenceBuilder can generate sequences by length (picking
 * random letters per step) instead of by word.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SequenceBuilder } from "../../src/generation/builder/SequenceBuilder.js";
import type { IVariationProvider } from "../../src/generation/data/IVariationProvider.js";
import type { PictographData, MotionData } from "../../src/generation/constraints/types.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import type { ITransitionGraph } from "../../src/core/transition-graph/ITransitionGraph.js";
import type { PlacementGroup, LetterPlacementInfo } from "../../src/core/types/sequence-engine-types.js";

// Mock data factory (same pattern as full-build.test.ts)

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
// Same graph as full-build.test.ts but with enough letters at each position
// so length-based generation always has candidates:
//   - α at alpha1 (Type 6, start position)
//   - α at beta3 (Type 6, start position)
//   - A: alpha1 → beta3 (pro motions)
//   - B: beta3 → alpha1 (pro motions)
//   - C: alpha1 → alpha1 (pro motions)
//   - D: beta3 → beta3 (pro motions)

const MOCK_PICTOGRAPHS: PictographData[] = [
  // Start positions (Type 6)
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

  // C: alpha1 → alpha1
  makePictograph({
    letter: "C",
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ startLocation: "n", endLocation: "n" }),
    rightMotion: makeMotion({ startLocation: "s", endLocation: "s" }),
  }),

  // D: beta3 → beta3
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

describe("length-based generation", () => {
  let builder: SequenceBuilder;

  beforeEach(() => {
    setLetterTransitionGraph(new MockTransitionGraph());
    const provider = new MockVariationProvider(MOCK_PICTOGRAPHS);
    builder = new SequenceBuilder(provider);
  });

  it("generates a sequence of exactly N+1 steps (start + N steps)", () => {
    const result = builder.build({
      length: 4,
      gridMode: "diamond",
      level: 1,
    });

    // 1 start position + 4 steps = 5 steps
    expect(result.sequence.length).toBe(5);
  });

  it("throws if neither word nor length is provided", () => {
    expect(() =>
      builder.build({
        gridMode: "diamond",
        level: 1,
      }),
    ).toThrow(/Either word or length must be provided/);
  });

  it("produces no bridge letters", () => {
    const result = builder.build({
      length: 4,
      gridMode: "diamond",
      level: 1,
    });

    expect(result.bridgeStepIndices).toEqual([]);
    for (const step of result.sequence) {
      expect(step.isBridge).toBe(false);
    }
  });

  it("first step is always a Type 6 start position", () => {
    const result = builder.build({
      length: 3,
      gridMode: "diamond",
      level: 1,
    });

    expect(result.startPlacement.letter).toBe("α");
  });

  it("maintains position continuity through the sequence", () => {
    const result = builder.build({
      length: 4,
      gridMode: "diamond",
      level: 1,
    });

    for (let i = 1; i < result.sequence.length; i++) {
      const prev = result.sequence[i - 1]!;
      const curr = result.sequence[i]!;
      expect(curr.startPlacement).toBe(prev.endPlacement);
    }
  });

  it("does not include Type 6 letters in generated steps", () => {
    const result = builder.build({
      length: 4,
      gridMode: "diamond",
      level: 1,
    });

    // Steps are steps 1..N (step 0 is start position)
    const steps = result.sequence.slice(1);
    for (const step of steps) {
      expect(["α", "β", "γ"]).not.toContain(step.letter);
    }
  });

  it("includes search metrics", () => {
    const result = builder.build({
      length: 3,
      gridMode: "diamond",
      level: 1,
    });

    expect(result.metrics.statesExplored).toBeGreaterThan(0);
    expect(typeof result.metrics.beamPrunings).toBe("number");
  });

  it("includes constraint report", () => {
    const result = builder.build({
      length: 3,
      gridMode: "diamond",
      level: 1,
    });

    expect(result.constraintReport).toBeDefined();
    expect(typeof result.constraintReport.score).toBe("number");
  });

  it("includes turn allocation with correct length", () => {
    const result = builder.build({
      length: 4,
      gridMode: "diamond",
      level: 1,
    });

    expect(result.turnAllocation.left).toHaveLength(4);
    expect(result.turnAllocation.right).toHaveLength(4);
  });

  it("respects startPlacement when provided", () => {
    const result = builder.build({
      length: 2,
      gridMode: "diamond",
      level: 1,
      startPlacement: "alpha1",
    });

    expect(result.startPlacement.startPlacement).toBe("alpha1");
  });

  it("applies constraint preset without errors", () => {
    const result = builder.build({
      length: 3,
      gridMode: "diamond",
      level: 1,
      constraintPreset: "smooth",
    });

    expect(result.sequence.length).toBeGreaterThan(0);
  });

  it("word-based generation still works alongside length-based", () => {
    const result = builder.build({
      word: "AB",
      gridMode: "diamond",
      level: 1,
    });

    expect(result.sequence.length).toBe(3);
    expect(result.sequence[1]!.letter).toBe("A");
    expect(result.sequence[2]!.letter).toBe("B");
  });
});

/**
 * End-position constraints.
 *
 * The app collected an end position, persisted it, and showed it on the
 * Customize card, but generation-orchestrator never passed it to build() — the
 * constraint was silently dropped at that boundary, so the picker did nothing.
 * These lock the engine half: a goal that is honoured, and a goal that can be
 * one of several (the search has always held it as a Set; only the option was
 * singular).
 */
describe("end-placement constraints", () => {
  let builder: SequenceBuilder;

  beforeEach(() => {
    setLetterTransitionGraph(new MockTransitionGraph());
    builder = new SequenceBuilder(new MockVariationProvider(MOCK_PICTOGRAPHS));
  });

  const lastEnd = (r: { sequence: { endPlacement: string }[] }) =>
    r.sequence[r.sequence.length - 1]!.endPlacement;

  // Repeated, because this mock graph only has two positions: a build that
  // ignored the goal entirely would still land on it by chance about half the
  // time. Ten runs per goal makes an accidental pass ~1 in a million.
  it("honours a single endPlacements entry", () => {
    for (const goal of ["alpha1", "beta3"]) {
      for (let i = 0; i < 10; i++) {
        const result = builder.build({
          length: 4,
          gridMode: "diamond",
          level: 1,
          endPlacements: [goal],
        });
        expect(lastEnd(result)).toBe(goal);
      }
    }
  });

  it("honours the deprecated single endPlacement", () => {
    const result = builder.build({
      length: 4,
      gridMode: "diamond",
      level: 1,
      endPlacement: "beta3",
    });

    expect(lastEnd(result)).toBe("beta3");
  });

  it("accepts one of several allowed end positions", () => {
    // Both goals are reachable at this length, so the search is free to pick
    // either — the assertion is membership, not a specific value.
    const result = builder.build({
      length: 4,
      gridMode: "diamond",
      level: 1,
      endPlacements: ["alpha1", "beta3"],
    });

    expect(["alpha1", "beta3"]).toContain(lastEnd(result));
  });

  it("is unconstrained when endPlacements is empty", () => {
    const result = builder.build({
      length: 4,
      gridMode: "diamond",
      level: 1,
      endPlacements: [],
    });

    // An empty list must mean "Any", not an impossible zero-goal search.
    expect(result.sequence.length).toBe(5);
  });

  // The bug this suite exists for. buildByLength has TWO attempt loops: the
  // main one, and a fallback that demotes hard prop-continuity to soft when the
  // beam dies and retries. The fallback re-derived its goal from scratch and
  // only ever read the legacy single endPlacement, so with Props on Choppy the
  // constrained pass would fail, the fallback would regenerate with NO end
  // constraint, and the user's picked positions were silently ignored. Both
  // loops now call the same userEndPlacements helper.
  it("honours end positions when prop continuity forces the retry path", () => {
    for (const goal of ["alpha1", "beta3"]) {
      for (let i = 0; i < 5; i++) {
        const result = builder.build({
          length: 4,
          gridMode: "diamond",
          level: 1,
          constraintPreset: "smooth",
          endPlacements: [goal],
        });
        expect(lastEnd(result)).toBe(goal);
      }
    }
  });

  it("unions the legacy field with the multi-select list", () => {
    const result = builder.build({
      length: 4,
      gridMode: "diamond",
      level: 1,
      endPlacements: ["alpha1"],
      endPlacement: "beta3",
    });

    expect(["alpha1", "beta3"]).toContain(lastEnd(result));
  });
});
