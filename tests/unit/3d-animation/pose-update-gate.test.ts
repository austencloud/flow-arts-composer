import { describe, expect, it } from "vitest";
import { createPoseUpdateGate } from "../../../node_modules/@austencloud/scene-3d/src/lib/components/pose-update-gate";

describe("paused avatar pose gate", () => {
  it("solves the initial pose, then skips unchanged paused frames", () => {
    const shouldUpdate = createPoseUpdateGate();
    let progress = 0.85;
    const inputs = () => [progress, 1.2, "wall"];

    expect(shouldUpdate("paused", false, inputs)).toBe(true);
    expect(shouldUpdate("paused", false, inputs)).toBe(false);
    progress = 0.9;
    expect(shouldUpdate("paused", false, inputs)).toBe(true);
    expect(shouldUpdate("paused", false, inputs)).toBe(false);
  });

  it("lets playback run and re-solves after captured replay releases the rig", () => {
    const shouldUpdate = createPoseUpdateGate();
    const inputs = () => [0.85];

    expect(shouldUpdate("paused", false, inputs)).toBe(true);
    expect(shouldUpdate("captured", true, inputs)).toBe(false);
    expect(shouldUpdate("captured", false, inputs)).toBe(false);
    expect(shouldUpdate("paused", false, inputs)).toBe(true);
    expect(shouldUpdate("live", true, inputs)).toBe(true);
    expect(shouldUpdate("live", true, inputs)).toBe(true);
    expect(shouldUpdate("paused", false, inputs)).toBe(true);
    expect(shouldUpdate("paused", false, inputs)).toBe(false);
    expect(shouldUpdate("paused", true, inputs)).toBe(true);
    expect(shouldUpdate("paused", true, inputs)).toBe(true);
    expect(shouldUpdate("paused", false, inputs)).toBe(true);
  });

  it("re-solves when the idle animation finishes loading during a pause", () => {
    const shouldUpdate = createPoseUpdateGate();
    let idleReady = false;
    let loadRevision = 0;
    const inputs = () => [0.85, idleReady, loadRevision];

    expect(shouldUpdate("paused", false, inputs)).toBe(true);
    expect(shouldUpdate("paused", false, inputs)).toBe(false);
    idleReady = true;
    expect(shouldUpdate("paused", false, inputs)).toBe(true);
    expect(shouldUpdate("paused", false, inputs)).toBe(false);
    loadRevision += 1;
    expect(shouldUpdate("paused", false, inputs)).toBe(true);
    expect(shouldUpdate("paused", false, inputs)).toBe(false);
  });
});
