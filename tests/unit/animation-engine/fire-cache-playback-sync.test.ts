import { describe, expect, it } from "vitest";
import {
  hasFireCachePlaybackDiscontinuity,
  isConfirmedFireCacheLoop,
} from "$lib/shared/animation-engine/services/animation-render-loop";

describe("fire frame-cache playback synchronization", () => {
  it("accepts only a known end-to-start transition as a cache boundary", () => {
    expect(isConfirmedFireCacheLoop(4.9, 1.1, 4, true, true)).toBe(true);
    expect(isConfirmedFireCacheLoop(3, 1, 4, true, true)).toBe(false);
    expect(isConfirmedFireCacheLoop(4.9, 1.1, undefined, true, true)).toBe(
      false
    );
    expect(isConfirmedFireCacheLoop(4.9, 1.1, 4, true, false)).toBe(false);
    expect(isConfirmedFireCacheLoop(3.9, 1.1, 4, true, true)).toBe(false);
  });

  it("invalidates cached fire across paused and playing seeks", () => {
    expect(
      hasFireCachePlaybackDiscontinuity(1, 2, false, 1 / 60, true, false, false)
    ).toBe(true);
    expect(
      hasFireCachePlaybackDiscontinuity(1, 3, true, 1 / 60, false, false, false)
    ).toBe(true);
    expect(
      hasFireCachePlaybackDiscontinuity(
        4.9,
        1.1,
        true,
        1 / 60,
        false,
        false,
        true
      )
    ).toBe(false);
  });
});
