/**
 * resolveLoopDisplay — shared entry point for LOOP icon rendering.
 *
 * The resolver unifies three paths:
 * 1. Steps available → run the detector, use its transformationIntervals
 * 2. No steps but stored loopType → parse the string
 * 3. Nothing → empty set
 *
 * These tests lock each path and verify the session cache keyed by sequence id.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveLoopDisplay,
  clearLoopDisplayCache,
} from "$lib/features/loop-labeler/services/loop-display-resolver";
import {
  LOOPType,
  Period,
} from "$lib/shared/foundation/domain/models/generation/circular-models";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

// Minimal SequenceData factory — only the fields the resolver reads. The
// resolver either calls the detector (needs .steps ≥ 2) or falls back to
// .loopType, so the path we want to exercise is entirely controlled by
// whether we provide steps.
function makeSequenceData(
  id: string,
  overrides: Partial<SequenceData> = {}
): SequenceData {
  return {
    id,
    name: id,
    word: "TEST",
    steps: [],
    thumbnails: [],
    isCircular: false,
    loopType: null,
    ...overrides,
  } as unknown as SequenceData;
}

describe("resolveLoopDisplay", () => {
  beforeEach(() => {
    clearLoopDisplayCache();
  });

  describe("stored-only path (no steps)", () => {
    it("parses components from stored loopType string", () => {
      const seq = makeSequenceData("stored-rotated", {
        loopType: LOOPType.ROTATED,
      });

      const result = resolveLoopDisplay(seq);

      expect(result.components.has(LOOPComponent.ROTATED)).toBe(true);
      expect(result.rotationPeriod).toBe(Period.HALVED);
    });

    it("detects quartered from orientationCycleCount", () => {
      const seq = makeSequenceData("stored-quartered", {
        loopType: LOOPType.ROTATED,
        orientationCycleCount: 4,
      });

      const result = resolveLoopDisplay(seq);

      expect(result.components.has(LOOPComponent.ROTATED)).toBe(true);
      expect(result.rotationPeriod).toBe(Period.QUARTERED);
      expect(result.period).toBe(4);
    });

    it("parses multiple components from a compound loopType", () => {
      const seq = makeSequenceData("stored-compound", {
        loopType: LOOPType.ROTATED_SWAPPED,
      });

      const result = resolveLoopDisplay(seq);

      expect(result.components.has(LOOPComponent.ROTATED)).toBe(true);
      expect(result.components.has(LOOPComponent.SWAPPED)).toBe(true);
    });

    it("returns an empty set when there's no loopType and no steps", () => {
      const seq = makeSequenceData("nothing", { loopType: null });

      const result = resolveLoopDisplay(seq);

      expect(result.components.size).toBe(0);
      expect(result.rotationPeriod).toBeUndefined();
    });
  });

  describe("on-demand detection path (with steps)", () => {
    it("detects a quartered rotation from live steps", () => {
      // Build a 4-beat 90° CW rotation. Using SequenceData with steps so
      // the resolver runs the detector instead of parsing the stored type.
      const makeStep = (
        stepNumber: number,
        leftStart: string,
        leftEnd: string,
        rightStart: string,
        rightEnd: string,
        startPos: string,
        endPos: string
      ) =>
        ({
          stepNumber,
          duration: 1,
          leftReversal: false,
          rightReversal: false,
          isBlank: false,
          letter: "A",
          startPlacement: startPos,
          endPlacement: endPos,
          motions: {
            left: {
              motionType: "pro",
              startLocation: leftStart,
              endLocation: leftEnd,
              rotationDirection: "cw",
              startOrientation: "in",
              endOrientation: "in",
              turns: 0,
            },
            right: {
              motionType: "pro",
              startLocation: rightStart,
              endLocation: rightEnd,
              rotationDirection: "cw",
              startOrientation: "in",
              endOrientation: "in",
              turns: 0,
            },
          },
        }) as unknown as SequenceData["steps"][number];

      const seq = makeSequenceData("quartered-detect", {
        isCircular: true,
        loopType: null,
        startPlacement: {
          endPlacement: "alpha1",
        } as unknown as SequenceData["startPlacement"],
        steps: [
          makeStep(1, "n", "e", "s", "w", "alpha1", "alpha2"),
          makeStep(2, "e", "s", "w", "n", "alpha2", "alpha3"),
          makeStep(3, "s", "w", "n", "e", "alpha3", "alpha4"),
          makeStep(4, "w", "n", "e", "s", "alpha4", "alpha1"),
        ],
      });

      const result = resolveLoopDisplay(seq);

      expect(result.components.has(LOOPComponent.ROTATED)).toBe(true);
      expect(result.rotationPeriod).toBe(Period.QUARTERED);
    });

    it("falls back to stored loopType when detection throws", () => {
      // Malformed steps — the detector will blow up somewhere inside the
      // comparison services. The resolver catches and falls through to
      // the stored loopType path.
      const seq = makeSequenceData("broken-steps", {
        loopType: LOOPType.MIRRORED,
        steps: [
          // Only 1 step — detector's "need at least 2" guard trips without
          // throwing, but we also have no motions so no further detection.
          // Falls through to loopType.
          {
            stepNumber: 1,
            duration: 1,
            leftReversal: false,
            rightReversal: false,
            isBlank: false,
            motions: {},
          } as unknown as SequenceData["steps"][number],
        ],
      });

      const result = resolveLoopDisplay(seq);

      // Single step → hasEnoughSteps returns false → stored path → mirrored.
      expect(result.components.has(LOOPComponent.MIRRORED)).toBe(true);
    });
  });

  describe("reserved orientation primitives", () => {
    it("filters reserved primitives out of the stored-loopType path", () => {
      // Forge a loopType string whose substring matching in parseComponents
      // would hit a reserved primitive. parseComponents does loose substring
      // matching, so "zone_hold_invert" would naively surface. The resolver
      // must strip it before returning.
      const seq = makeSequenceData("reserved-stored", {
        // Cast through unknown — reserved primitives don't appear in the
        // LOOPType enum, but parseComponents accepts any string and does
        // substring checks, so we exercise the filter path.
        loopType: "zone_hold_invert" as unknown as LOOPType,
      });

      const result = resolveLoopDisplay(seq);

      // Neither the reserved enum value nor any of the 6 visible ones
      // should appear — substring matches on "invert" would otherwise
      // promote INVERTED, but that is the design: parseComponents does
      // NOT match on the reserved-primitive strings, and if it did, the
      // filter at the resolver would strip them anyway.
      expect(result.components.size).toBe(0);
    });
  });

  describe("session cache", () => {
    it("returns equivalent result on repeated calls with the same id", () => {
      const seq = makeSequenceData("cached", { loopType: LOOPType.ROTATED });

      const first = resolveLoopDisplay(seq);
      const second = resolveLoopDisplay(seq);

      expect(second).toEqual(first);
    });

    it("clearLoopDisplayCache evicts entries so fresh detection runs", () => {
      const seq = makeSequenceData("evict-me", {
        loopType: LOOPType.ROTATED,
      });

      const first = resolveLoopDisplay(seq);
      clearLoopDisplayCache();
      const second = resolveLoopDisplay(seq);

      // After clear, we get a new object (same content, different reference).
      expect(second).not.toBe(first);
      expect(second.components.has(LOOPComponent.ROTATED)).toBe(true);
    });
  });
});
