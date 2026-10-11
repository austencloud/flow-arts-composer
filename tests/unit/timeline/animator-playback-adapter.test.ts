import { describe, it, expect } from "vitest";

import {
  computeOverallProgress,
  computeCurrentBeat,
  computeElapsed,
  computeSeekTarget,
  computeBeatMarkerPositions,
} from "#lib/shared/timeline/adapters/animator-playback-adapter.svelte.js";

describe("animator-playback-adapter", () => {
  describe("computeOverallProgress", () => {
    const uniform = [1, 1, 1, 1];

    it("returns 0 at step 1 (start of first beat)", () => {
      expect(computeOverallProgress(1, uniform)).toBeCloseTo(0);
    });

    it("returns 0.5 at step 3 of 4 beats", () => {
      expect(computeOverallProgress(3, uniform)).toBeCloseTo(0.5);
    });

    it("returns ~1 at the end of the last beat", () => {
      expect(computeOverallProgress(4.99, uniform)).toBeCloseTo(0.9975);
    });

    it("returns 0 when currentStep < 1 (start position hold)", () => {
      expect(computeOverallProgress(0.5, uniform)).toBe(0);
    });

    it("handles single-beat sequence", () => {
      expect(computeOverallProgress(1.5, [1])).toBeCloseTo(0.5);
    });

    it("clamps to 0 when durations is empty", () => {
      expect(computeOverallProgress(1, [])).toBe(0);
    });

    it("accounts for variable durations", () => {
      // Beats: [1, 2, 1] total = 4
      // At step 2.0 (start of beat 2), elapsed = 1, progress = 1/4 = 0.25
      expect(computeOverallProgress(2, [1, 2, 1])).toBeCloseTo(0.25);
    });

    it("double-duration beat takes proportionally more scrubber width", () => {
      // Beats: [1, 2, 1] total = 4
      // At step 2.5 (midpoint of beat 2), elapsed = 1 + 0.5*2 = 2, progress = 2/4 = 0.5
      expect(computeOverallProgress(2.5, [1, 2, 1])).toBeCloseTo(0.5);
      // At step 3.0 (end of beat 2), elapsed = 1 + 2 = 3, progress = 3/4 = 0.75
      expect(computeOverallProgress(3, [1, 2, 1])).toBeCloseTo(0.75);
    });
  });

  describe("computeCurrentBeat", () => {
    it("returns 1 at step 1.0", () => {
      expect(computeCurrentBeat(1.0)).toBe(1);
    });

    it("returns 1 at step 1.5 (mid first beat)", () => {
      expect(computeCurrentBeat(1.5)).toBe(1);
    });

    it("returns 3 at step 3.2", () => {
      expect(computeCurrentBeat(3.2)).toBe(3);
    });

    it("returns 0 during start position hold", () => {
      expect(computeCurrentBeat(0.5)).toBe(0);
    });
  });

  describe("computeElapsed", () => {
    const durations = [1.0, 1.0, 1.0, 1.0]; // 4 beats, 1s each

    it("returns 0 at beat 1 start", () => {
      expect(computeElapsed(1.0, durations)).toBeCloseTo(0);
    });

    it("returns 0.5 at beat 1 midpoint", () => {
      expect(computeElapsed(1.5, durations)).toBeCloseTo(0.5);
    });

    it("returns 2.0 at beat 3 start", () => {
      expect(computeElapsed(3.0, durations)).toBeCloseTo(2.0);
    });

    it("handles variable durations", () => {
      const varDurations = [2.0, 1.0, 3.0]; // 6s total
      // Step 2.5 = start of beat 2 + 0.5 = 2.0s + 0.5 * 1.0s = 2.5s
      expect(computeElapsed(2.5, varDurations)).toBeCloseTo(2.5);
    });

    it("returns 0 during start position hold", () => {
      expect(computeElapsed(0.5, durations)).toBe(0);
    });
  });

  describe("computeSeekTarget", () => {
    const uniform = [1, 1, 1, 1];

    it("maps 0 to step 1", () => {
      expect(computeSeekTarget(0, uniform)).toBeCloseTo(1);
    });

    it("maps 0.5 to step 3 for uniform durations", () => {
      expect(computeSeekTarget(0.5, uniform)).toBeCloseTo(3);
    });

    it("maps 1 to the end", () => {
      expect(computeSeekTarget(1, uniform)).toBeCloseTo(5);
    });

    it("clamps below 0", () => {
      expect(computeSeekTarget(-0.5, uniform)).toBeCloseTo(1);
    });

    it("accounts for variable durations on seek", () => {
      // Beats: [1, 2, 1] total = 4
      // Seek to 0.25 → elapsed 1.0 → end of beat 1 → step 2.0
      expect(computeSeekTarget(0.25, [1, 2, 1])).toBeCloseTo(2);
      // Seek to 0.5 → elapsed 2.0 → midpoint of beat 2 → step 2.5
      expect(computeSeekTarget(0.5, [1, 2, 1])).toBeCloseTo(2.5);
    });
  });

  describe("computeBeatMarkerPositions", () => {
    it("returns empty for single beat", () => {
      expect(computeBeatMarkerPositions([1])).toEqual([]);
    });

    it("evenly spaces uniform durations", () => {
      const positions = computeBeatMarkerPositions([1, 1, 1, 1]);
      expect(positions).toHaveLength(3);
      expect(positions[0]).toBeCloseTo(0.25);
      expect(positions[1]).toBeCloseTo(0.5);
      expect(positions[2]).toBeCloseTo(0.75);
    });

    it("spaces by duration for variable beats", () => {
      // [1, 2, 1] total = 4
      // Marker after beat 1: 1/4 = 0.25
      // Marker after beat 2: 3/4 = 0.75
      const positions = computeBeatMarkerPositions([1, 2, 1]);
      expect(positions).toHaveLength(2);
      expect(positions[0]).toBeCloseTo(0.25);
      expect(positions[1]).toBeCloseTo(0.75);
    });
  });
});
