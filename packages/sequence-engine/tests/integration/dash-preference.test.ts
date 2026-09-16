/**
 * Integration test: dashPreference soft bias surfaces in generated output.
 *
 * This is the end-to-end verification for the "Dashes = High" Generate panel
 * setting. Before the fix, GenerationOrchestrator dropped "prefer-dash" on
 * the floor with a "not wired up yet" comment. The regression test below
 * guarantees that when dashPreference="maximize" is passed to the builder,
 * the resulting sequence is dash-heavy relative to a neutral baseline — and
 * the reverse for "minimize".
 *
 * We can't hard-assert "75% of steps are dashes" because closure + variation
 * pools can force non-dash picks. The bar is "maximize produces noticeably
 * more dashes than the baseline, aggregated over enough runs to average out
 * the random tiebreak in the variation scorer."
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SequenceBuilder } from "../../src/generation/builder/SequenceBuilder.js";
import type { IVariationProvider } from "../../src/generation/data/IVariationProvider.js";
import type { PictographData, MotionData } from "../../src/generation/constraints/types.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import type { ITransitionGraph } from "../../src/core/transition-graph/ITransitionGraph.js";
import type { PlacementGroup, LetterPlacementInfo } from "../../src/core/types/sequence-engine-types.js";

// Mock setup: at every position the builder has BOTH a dash-letter and a
// shift-letter option available, so the soft preference has real room to
// work. Without this duality the test proves nothing.

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

// Letters:
//   α — Type 6 start position at alpha1 and beta3
//   A — alpha1→beta3 (pro shift)
//   B — beta3→alpha1 (pro shift)
//   X — alpha1→beta3 (dash) — dash counterpart to A
//   Y — beta3→alpha1 (dash) — dash counterpart to B
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

  // A: alpha1 → beta3, pro shift
  makePictograph({
    letter: "A",
    startPlacement: "alpha1",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "pro", startLocation: "n", endLocation: "e" }),
    rightMotion: makeMotion({ motionType: "pro", startLocation: "s", endLocation: "w" }),
  }),

  // B: beta3 → alpha1, pro shift
  makePictograph({
    letter: "B",
    startPlacement: "beta3",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "pro", startLocation: "e", endLocation: "n" }),
    rightMotion: makeMotion({ motionType: "pro", startLocation: "w", endLocation: "s" }),
  }),

  // X: alpha1 → beta3, dash (both hands)
  makePictograph({
    letter: "X",
    startPlacement: "alpha1",
    endPlacement: "beta3",
    leftMotion: makeMotion({ motionType: "dash", rotationDirection: "noRotation", startLocation: "n", endLocation: "e" }),
    rightMotion: makeMotion({ motionType: "dash", rotationDirection: "noRotation", startLocation: "s", endLocation: "w" }),
  }),

  // Y: beta3 → alpha1, dash (both hands)
  makePictograph({
    letter: "Y",
    startPlacement: "beta3",
    endPlacement: "alpha1",
    leftMotion: makeMotion({ motionType: "dash", rotationDirection: "noRotation", startLocation: "e", endLocation: "n" }),
    rightMotion: makeMotion({ motionType: "dash", rotationDirection: "noRotation", startLocation: "w", endLocation: "s" }),
  }),
];

class MockVariationProvider implements IVariationProvider {
  getVariations(letter: string, position: string, _gridMode: string): PictographData[] {
    return MOCK_PICTOGRAPHS.filter(
      (p) => p.letter === letter && p.startPlacement === position,
    );
  }

  getAllVariations(_gridMode: string): PictographData[] {
    return MOCK_PICTOGRAPHS;
  }
}

const LETTER_POSITIONS: Record<string, { start: PlacementGroup; end: PlacementGroup }> = {
  A: { start: "alpha", end: "beta" },
  B: { start: "beta", end: "alpha" },
  X: { start: "alpha", end: "beta" },
  Y: { start: "beta", end: "alpha" },
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

  findBridgeLetters(): string[] {
    return [];
  }

  findAllBridgeOptions(): string[] {
    return [];
  }

  getAllLetters(): string[] {
    return Object.keys(LETTER_POSITIONS);
  }

  isInitialized(): boolean {
    return true;
  }
}

function countDashSteps(steps: { motions: { left: MotionData; right: MotionData } }[], skipStart = true): number {
  let count = 0;
  const start = skipStart ? 1 : 0;
  for (let i = start; i < steps.length; i++) {
    const s = steps[i]!;
    if (s.motions.left.motionType === "dash" || s.motions.right.motionType === "dash") {
      count++;
    }
  }
  return count;
}

function totalSteps(stepsLength: number, skipStart = true): number {
  return skipStart ? stepsLength - 1 : stepsLength;
}

// Tests

describe("dashPreference soft bias", () => {
  beforeEach(() => {
    setLetterTransitionGraph(new MockTransitionGraph());
  });

  it("maximize surfaces dramatically more dash steps than baseline", () => {
    const provider = new MockVariationProvider();
    const runs = 30;
    const length = 8;

    let baselineDashes = 0;
    let baselineTotal = 0;
    let maximizeDashes = 0;
    let maximizeTotal = 0;

    for (let run = 0; run < runs; run++) {
      const baseline = new SequenceBuilder(provider).build({
        length,
        gridMode: "diamond",
        level: 1,
      });
      baselineDashes += countDashSteps(baseline.sequence);
      baselineTotal += totalSteps(baseline.sequence.length);

      const maximized = new SequenceBuilder(provider).build({
        length,
        gridMode: "diamond",
        level: 1,
        constraintOptions: { dashPreference: "maximize" },
      });
      maximizeDashes += countDashSteps(maximized.sequence);
      maximizeTotal += totalSteps(maximized.sequence.length);
    }

    const baselineRate = baselineDashes / baselineTotal;
    const maximizeRate = maximizeDashes / maximizeTotal;

    // With equal dash/shift pools and no other preferences, baseline should
    // land near 0.5. Maximize should land well above 0.75 — if it's at or
    // below baseline the wire-up is broken.
    expect(maximizeRate).toBeGreaterThan(0.75);
    expect(maximizeRate).toBeGreaterThan(baselineRate + 0.2);
  });

  it("minimize suppresses dash steps relative to baseline", () => {
    const provider = new MockVariationProvider();
    const runs = 30;
    const length = 8;

    let baselineDashes = 0;
    let baselineTotal = 0;
    let minimizeDashes = 0;
    let minimizeTotal = 0;

    for (let run = 0; run < runs; run++) {
      const baseline = new SequenceBuilder(provider).build({
        length,
        gridMode: "diamond",
        level: 1,
      });
      baselineDashes += countDashSteps(baseline.sequence);
      baselineTotal += totalSteps(baseline.sequence.length);

      const minimized = new SequenceBuilder(provider).build({
        length,
        gridMode: "diamond",
        level: 1,
        constraintOptions: { dashPreference: "minimize" },
      });
      minimizeDashes += countDashSteps(minimized.sequence);
      minimizeTotal += totalSteps(minimized.sequence.length);
    }

    const baselineRate = baselineDashes / baselineTotal;
    const minimizeRate = minimizeDashes / minimizeTotal;

    expect(minimizeRate).toBeLessThan(0.25);
    expect(minimizeRate).toBeLessThan(baselineRate - 0.2);
  });
});
