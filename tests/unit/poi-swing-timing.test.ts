import { describe, expect, it } from "vitest";
import { POI_REVERSAL_CANDIDATES } from "../../src/lib/features/levels/poi-lab/domain/poi-reversal-candidates";
import {
  createSwingTiming,
  displayTrajectory,
  STILL_HAND_DISPLAY_RADIUS,
} from "../../src/lib/features/levels/poi-lab/domain/poi-swing-timing";
import { trajectoryPosesAt } from "../../src/lib/shared/notation/qft/qft-trajectory";

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

  // Austen, 2026-11-22: the hand goes "up to the left part of the circle, and
  // then down to the right part ... going down every single time", never the
  // whole circle.
  it("swings a still hand along the bottom of its circle, never over the top", () => {
    const shown = displayTrajectory(pendulum);
    const hands = Array.from(
      { length: 401 },
      (_, index) => trajectoryPosesAt(shown, (index / 400) * 8).hand
    );
    expect(Math.min(...hands.map((hand) => -hand.y))).toBeLessThan(-0.07);
    expect(Math.max(...hands.map((hand) => -hand.y))).toBeLessThan(1e-9);
    expect(Math.min(...hands.map((hand) => hand.x))).toBeLessThan(-0.07);
    expect(Math.max(...hands.map((hand) => hand.x))).toBeGreaterThan(0.07);
  });
});
