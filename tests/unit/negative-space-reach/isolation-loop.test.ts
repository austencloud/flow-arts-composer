import { describe, expect, it } from "vitest";
import {
  captureIsolationSnapshot,
  DEFAULT_TORSO_KEYFRAMES,
  restoreIsolationSnapshot,
  selectedIsolationKeyframe,
  torsoYawAt,
  torsoYawAtKeyframes,
  upsertTorsoKeyframe,
  wrapIsolationPhase,
} from "../../../src/routes/test/negative-space-reach/isolation-loop";

describe("single-hand isolation loop", () => {
  it("keeps the authored S → E → N → W cycle closed", () => {
    expect(wrapIsolationPhase(4)).toBe(0);
    expect(wrapIsolationPhase(-0.25)).toBe(3.75);
    expect(selectedIsolationKeyframe(2.8)).toBe(2);
  });

  it("interpolates the torso smoothly through the cyclic seam", () => {
    expect(torsoYawAt(0, DEFAULT_TORSO_KEYFRAMES)).toBe(
      torsoYawAt(4, DEFAULT_TORSO_KEYFRAMES)
    );
    expect(torsoYawAt(2.5, DEFAULT_TORSO_KEYFRAMES)).toBeLessThan(
      DEFAULT_TORSO_KEYFRAMES[2]!
    );
  });

  it("restores pose settings without sharing snapshot arrays", () => {
    const saved = captureIsolationSnapshot("data:image/png;base64,real", 4.25, [
      { phase: 0.25, yaw: 0.1 },
    ]);
    const restored = restoreIsolationSnapshot(saved);
    restored.torsoKeyframes[0]!.yaw = 9;
    expect(saved.phase).toBe(0.25);
    expect(saved.torsoKeyframes[0]!.yaw).toBe(0.1);
  });

  it("adds an editable keyframe at the selected moment and keeps the loop smooth", () => {
    const edited = upsertTorsoKeyframe(
      [
        { phase: 0, yaw: 0 },
        { phase: 2, yaw: -0.8 },
      ],
      2.5,
      -1
    );
    expect(edited).toContainEqual({ phase: 2.5, yaw: -1 });
    expect(torsoYawAtKeyframes(0, edited)).toBe(torsoYawAtKeyframes(4, edited));
  });
});
