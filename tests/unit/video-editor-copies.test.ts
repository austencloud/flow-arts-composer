import { describe, expect, it } from "vitest";
import * as core from "@austencloud/video-editor/core";
// ease.ts is internal to the package and not in the dist exports, so this reaches its source by
// absolute path. Step 4 removes the path: once the package installs from npm, import
// cssCubicBezier another way or move this comparison.
import * as packageEase from "E:/worktrees/shared-packages/video-editor/packages/video-editor/src/core/project/ease";
import * as timing from "#lib/shared/animation-engine/domain/constants/timing.js";
import * as tkaEase from "#lib/shared/transitions/ws-ease.js";

describe("values the package copies from tka", () => {
  it("keeps the playback BPM and speed bounds", () => {
    expect(core.PLAYBACK_MIN_BPM).toBe(timing.PLAYBACK_MIN_BPM);
    expect(core.PLAYBACK_MAX_BPM).toBe(timing.PLAYBACK_MAX_BPM);
    expect(core.PLAYBACK_BASELINE_BPM).toBe(timing.PLAYBACK_BASELINE_BPM);
    expect(core.PLAYBACK_MIN_SPEED).toBe(timing.PLAYBACK_MIN_SPEED);
    expect(core.PLAYBACK_MAX_SPEED).toBe(timing.PLAYBACK_MAX_SPEED);
  });
});

describe("functions the package copies from tka", () => {
  it.each([
    [0.2, 0, 0, 1],
    [0.4, 0, 0.2, 1],
    [0, 0, 1, 1],
    [0.42, 0, 0.58, 1],
    // At x = 0.9 this curve reaches the bisection fallback.
    [1, 0, 1, 1],
  ] as const)("keeps cssCubicBezier(%s, %s, %s, %s)", (p1x, p1y, p2x, p2y) => {
    const copied = packageEase.cssCubicBezier(p1x, p1y, p2x, p2y);
    const original = tkaEase.cssCubicBezier(p1x, p1y, p2x, p2y);
    for (let i = 0; i <= 10; i++) {
      expect(copied(i / 10)).toBeCloseTo(original(i / 10), 12);
    }
  });
});
