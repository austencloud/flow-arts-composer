import { describe, expect, it } from "vitest";

import { resolveTheoryPlaybackTick } from "#lib/shared/shape-matrix/services/theory-playback-clock.js";

describe("Theory playback clock", () => {
  it("advances continuously without retaining a step clock", () => {
    expect(resolveTheoryPlaybackTick(240, 16, 1000, 300, "continuous")).toEqual(
      {
        advanceMs: 16,
        clockMs: 0,
      }
    );
  });

  it("holds after each beat and resumes at the next beat boundary", () => {
    expect(resolveTheoryPlaybackTick(990, 20, 1000, 300, "step")).toEqual({
      advanceMs: 10,
      clockMs: 1010,
    });
    expect(resolveTheoryPlaybackTick(1010, 20, 1000, 300, "step")).toEqual({
      advanceMs: 0,
      clockMs: 1030,
    });
    expect(resolveTheoryPlaybackTick(1290, 20, 1000, 300, "step")).toEqual({
      advanceMs: 10,
      clockMs: 10,
    });
  });
});
