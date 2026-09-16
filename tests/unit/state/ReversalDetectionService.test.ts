/**
 * ReversalDetectionService Tests
 *
 * SUPER HIGH-VALUE: Determines when props reverse direction.
 * If broken: Wrong symbols shown, incorrect exports, impossible to debug.
 */

import { describe, expect, it } from "vitest";
import { processReversals, detectReversal } from "../../../src/lib/shared/create/services/reversal-detector";
import { HandSide } from "../../../src/lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { StepData } from "../../../src/lib/shared/foundation/domain/models/step-data";
import type { SequenceData } from "../../../src/lib/shared/foundation/domain/models/sequence-data";

describe("ReversalDetector", () => {

  const createBeat = (
    num: number,
    leftDir: string | null = null,
    rightDir: string | null = null,
    blank: boolean = false
  ): StepData => ({
    id: `beat-${num}`,
    stepNumber: num,
    duration: 1.0,
    leftReversal: false,
    rightReversal: false,
    isBlank: blank,
    letter: null,
    startPlacement: null,
    endPlacement: null,
    motions: {
      [HandSide.LEFT]: leftDir
        ? ({ rotationDirection: leftDir } as any)
        : undefined,
      [HandSide.RIGHT]: rightDir
        ? ({ rotationDirection: rightDir } as any)
        : undefined,
    },
  });

  const createSeq = (steps: StepData[]): SequenceData => ({
    id: "seq",
    name: "Test",
    word: "",
    steps,
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    level: 2,
    difficultyLevel: "intermediate",
    tags: [],
    metadata: {},
  });

  describe("processReversals", () => {
    it("should handle empty sequence", () => {
      const result = processReversals(createSeq([]));
      expect(result.steps).toHaveLength(0);
    });

    it("should have no reversal on first beat", () => {
      const beat = createBeat(1, "cw", "ccw");
      const result = processReversals(createSeq([beat]));

      expect(result.steps[0]!.leftReversal).toBe(false);
      expect(result.steps[0]!.rightReversal).toBe(false);
    });

    it("should detect NO reversal when same direction", () => {
      const beats = [createBeat(1, "cw", "cw"), createBeat(2, "cw", "cw")];
      const result = processReversals(createSeq(beats));

      expect(result.steps[1]!.leftReversal).toBe(false);
      expect(result.steps[1]!.rightReversal).toBe(false);
    });

    it("should detect reversal when direction changes", () => {
      const beats = [
        createBeat(1, "cw", "ccw"),
        createBeat(2, "ccw", "cw"), // Both reverse!
      ];
      const result = processReversals(createSeq(beats));

      expect(result.steps[1]!.leftReversal).toBe(true); // cw → ccw
      expect(result.steps[1]!.rightReversal).toBe(true); // ccw → cw
    });

    it("should skip blank beats when detecting reversals", () => {
      const beats = [
        createBeat(1, "cw", "cw"),
        createBeat(2, null, null, true), // Blank
        createBeat(3, "ccw", "ccw"),
      ];
      const result = processReversals(createSeq(beats));

      // Beat 3 should reverse based on beat 1 (blank ignored)
      expect(result.steps[2]!.leftReversal).toBe(true);
      expect(result.steps[2]!.rightReversal).toBe(true);
    });

    it("should handle mixed reversals (only one color)", () => {
      const beats = [
        createBeat(1, "cw", "cw"),
        createBeat(2, "cw", "ccw"), // Only red reverses
      ];
      const result = processReversals(createSeq(beats));

      expect(result.steps[1]!.leftReversal).toBe(false); // Blue stays cw
      expect(result.steps[1]!.rightReversal).toBe(true); // Red reverses
    });

    it("should handle multiple reversals in sequence", () => {
      const beats = [
        createBeat(1, "cw", "cw"),
        createBeat(2, "ccw", "ccw"), // Reversal
        createBeat(3, "cw", "cw"), // Reversal again
      ];
      const result = processReversals(createSeq(beats));

      expect(result.steps[1]!.leftReversal).toBe(true);
      expect(result.steps[2]!.leftReversal).toBe(true);
    });

    it("should ignore noRotation direction", () => {
      const beats = [
        createBeat(1, "cw", "cw"),
        createBeat(2, "noRotation", "cw"),
      ];
      const result = processReversals(createSeq(beats));

      expect(result.steps[1]!.leftReversal).toBe(false);
      expect(result.steps[1]!.rightReversal).toBe(false);
    });
  });

  describe("detectReversal", () => {
    it("should return no reversal for blank beat", () => {
      const blank = createBeat(1, null, null, true);
      const result = detectReversal([], blank);

      expect(result.leftReversal).toBe(false);
      expect(result.rightReversal).toBe(false);
    });

    it("should detect reversal correctly", () => {
      const prev = createBeat(1, "cw", "ccw");
      const curr = createBeat(2, "ccw", "cw");
      const result = detectReversal([prev], curr);

      expect(result.leftReversal).toBe(true);
      expect(result.rightReversal).toBe(true);
    });

    it("should look back past multiple blanks", () => {
      const prevSteps = [
        createBeat(1, "cw", "cw"),
        createBeat(2, null, null, true),
        createBeat(3, null, null, true),
      ];
      const curr = createBeat(4, "ccw", "ccw");
      const result = detectReversal(prevSteps, curr);

      expect(result.leftReversal).toBe(true);
      expect(result.rightReversal).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing motion data", () => {
      const beat = { ...createBeat(1), motions: {} };
      const result = detectReversal([], beat);

      expect(result.leftReversal).toBe(false);
      expect(result.rightReversal).toBe(false);
    });

    it("should process long sequences efficiently", () => {
      const beats: StepData[] = [];
      for (let i = 0; i < 64; i++) {
        const dir = i % 2 === 0 ? "cw" : "ccw";
        beats.push(createBeat(i + 1, dir, dir));
      }

      const start = performance.now();
      const result = processReversals(createSeq(beats));
      const duration = performance.now() - start;

      expect(result.steps).toHaveLength(64);
      expect(duration).toBeLessThan(50); // Should be fast
    });
  });
});

/**
 * WHY VALUABLE:
 * - Catches wrong reversal detection (breaks every sequence)
 * - Tests blank beat handling (common bug)
 * - Tests edge cases (null/undefined data)
 * - Performance test (prevent UI freezes)
 */
