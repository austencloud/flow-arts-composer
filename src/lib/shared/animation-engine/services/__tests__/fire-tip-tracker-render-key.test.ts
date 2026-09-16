import { describe, expect, it } from "vitest";
import { FireTipTracker, type FireTipTrackerConfig } from "../fire-tip-tracker";
import { getTipPoints } from "../../domain/types/prop-tip-points";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";

const CENTRE = 475;

function trackTips(config: Partial<FireTipTrackerConfig>) {
  const tracker = new FireTipTracker();
  const full: FireTipTrackerConfig = {
    canvasSize: 950,
    leftPropDimensions: { width: 260, height: 207 },
    rightPropDimensions: { width: 260, height: 207 },
    leftPropType: "fan",
    rightPropType: "fan",
    renderedTransforms: {
      left: { centerX: CENTRE, centerY: CENTRE, angle: 0, scaleFactor: 1 },
      right: null,
    },
    ...config,
  };
  const prop = {} as PropState;
  let result = tracker.update(prop, null, full, 0);
  // The tracker holds the first frames back while the canvas settles.
  for (let time = 16; result.tips.length === 0 && time < 200; time += 16) {
    result = tracker.update(prop, null, full, time);
  }
  return result.tips.map((tip) => ({ x: tip.x - CENTRE, y: tip.y - CENTRE }));
}

/**
 * The tracker resolved tips by notation prop type, so every fan build and
 * every model sprite emitted from the pictograph rib positions. With the
 * loaded render key it emits from the artwork that is actually painted.
 */
describe("FireTipTracker render keys", () => {
  it("emits from the fan build's wicks when the loaded render key is given", () => {
    const tips = trackTips({ leftPropRenderKey: "fan__fire_bare" });
    const expected = getTipPoints("fan__fire_bare").points;
    expect(tips).toHaveLength(expected.length);
    tips.forEach((tip, index) => {
      expect(tip.x).toBeCloseTo(expected[index]!.dx, 3);
      expect(tip.y).toBeCloseTo(expected[index]!.dy, 3);
    });
    expect(tips[2]!.x).toBeCloseTo(119.05, 3);
  });

  it("keeps the notation table when no render key is loaded", () => {
    const tips = trackTips({});
    expect(tips[2]!.x).toBeCloseTo(130, 3);
  });
});
