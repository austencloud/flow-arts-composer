import { describe, expect, it } from "vitest";
import { POI_REVERSAL_CANDIDATES } from "../../src/lib/features/levels/poi-lab/domain/poi-reversal-candidates";
import {
  createSwingTiming,
  displayTrajectory,
  STILL_HAND_DISPLAY_RADIUS,
} from "../../src/lib/features/levels/poi-lab/domain/poi-swing-timing";

const pendulum = POI_REVERSAL_CANDIDATES.find(
  (candidate) => candidate.id === "poi-r0-dcw-s1-p2"
)!.trajectory;

describe("poi swing timing", () => {
  // The pendulum turns level with the floor at step 1 and passes the bottom
  // at step 3. A real poi is slow at the turn and fast at the bottom.
  it("slows at the turn and speeds up at the bottom", () => {
    const rate = createSwingTiming(displayTrajectory(pendulum));
    expect(rate(0.02)).toBeLessThan(rate(2) / 3);
    expect(rate(4.02)).toBeLessThan(rate(6) / 3);
  });

  it("keeps one cycle at eight step-times", () => {
    const rate = createSwingTiming(pendulum);
    let time = 0;
    const dc = 8 / 4000;
    for (let cursor = 0; cursor < 8; cursor += dc) time += dc / rate(cursor);
    expect(time).toBeCloseTo(8, 1);
  });

  it("draws a still hand with a hair of movement and leaves moving hands alone", () => {
    expect(displayTrajectory(pendulum).radius).toBe(STILL_HAND_DISPLAY_RADIUS);
    const moving = POI_REVERSAL_CANDIDATES.find(
      (candidate) => candidate.trajectory.radius === 1
    )!.trajectory;
    expect(displayTrajectory(moving)).toBe(moving);
  });
});
