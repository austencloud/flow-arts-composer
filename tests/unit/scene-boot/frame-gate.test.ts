/**
 * The frame gate decides when the loading curtain may lift. Get it wrong in one
 * direction and the curtain hangs on a scene that is already smooth; get it
 * wrong in the other and it lifts onto the stutter it exists to hide. Neither
 * failure throws, so it is pinned down here.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_FRAME_GATE, createFrameGate } from "#lib/shared/3d/scene-boot/frame-gate.js";

describe("createFrameGate", () => {
  it("stays closed until enough consecutive frames land inside the budget", () => {
    const gate = createFrameGate();
    for (let i = 1; i < DEFAULT_FRAME_GATE.requiredConsecutive; i += 1) {
      expect(gate.observe(16, i * 16)).toBe(false);
      expect(gate.verdict).toBeNull();
    }
    expect(gate.observe(16, DEFAULT_FRAME_GATE.requiredConsecutive * 16)).toBe(true);
    expect(gate.verdict).toBe("passed");
    expect(gate.streakFraction).toBe(1);
  });

  it("restarts the streak after one frame over budget", () => {
    const gate = createFrameGate();
    gate.observe(16, 16);
    gate.observe(16, 32);
    expect(gate.streakFraction).toBeCloseTo(2 / 5);

    expect(gate.observe(60, 92)).toBe(false);
    expect(gate.streakFraction).toBe(0);

    for (let i = 0; i < 4; i += 1) expect(gate.observe(16, 100 + i * 16)).toBe(false);
    expect(gate.observe(16, 200)).toBe(true);
    expect(gate.verdict).toBe("passed");
  });

  it("opens on the cap so a device that never gets smooth still sees the scene", () => {
    const gate = createFrameGate();
    expect(gate.observe(60, 600)).toBe(false);
    expect(gate.observe(60, DEFAULT_FRAME_GATE.capMs)).toBe(true);
    expect(gate.verdict).toBe("capped");
    expect(gate.streakFraction).toBe(1);
  });

  it("reports a pass when the last frame both completes the streak and hits the cap", () => {
    const gate = createFrameGate({ requiredConsecutive: 2, capMs: 100 });
    gate.observe(16, 50);
    expect(gate.observe(16, 100)).toBe(true);
    expect(gate.verdict).toBe("passed");
  });

  it("keeps its verdict once decided", () => {
    const gate = createFrameGate({ requiredConsecutive: 1 });
    expect(gate.observe(16, 16)).toBe(true);
    expect(gate.observe(500, 5000)).toBe(true);
    expect(gate.verdict).toBe("passed");
  });

  it("passes on a steady 30fps scene, which the old 20ms budget made unreachable", () => {
    // The measured ocean-scene settle ran at p50 33.3ms / p90 33.4ms. Under the
    // old budget no five consecutive frames ever landed inside it, so the gate
    // capped on every boot and became a flat delay instead of a smoothness test.
    const gate = createFrameGate();
    let elapsed = 0;
    let opened = false;
    for (let i = 0; i < DEFAULT_FRAME_GATE.requiredConsecutive; i += 1) {
      elapsed += 33.4;
      opened = gate.observe(33.4, elapsed);
    }
    expect(opened).toBe(true);
    expect(gate.verdict).toBe("passed");
    expect(elapsed).toBeLessThan(DEFAULT_FRAME_GATE.capMs);
  });

  it("still resets on the hitch it exists to hide", () => {
    const gate = createFrameGate();
    gate.observe(33.3, 33);
    gate.observe(33.3, 67);
    expect(gate.streakFraction).toBeCloseTo(2 / 5);
    expect(gate.observe(133.3, 200)).toBe(false);
    expect(gate.streakFraction).toBe(0);
  });

  it("honours a custom budget and streak length", () => {
    const gate = createFrameGate({ requiredConsecutive: 3, frameBudgetMs: 10 });
    expect(gate.observe(12, 12)).toBe(false);
    expect(gate.streakFraction).toBe(0);
    gate.observe(9, 21);
    gate.observe(9, 30);
    expect(gate.observe(9, 39)).toBe(true);
    expect(gate.verdict).toBe("passed");
  });
});
