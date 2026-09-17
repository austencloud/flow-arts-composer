import { describe, expect, it } from "vitest";
import { FireTipTracker, type FireTipTrackerConfig } from "../fire-tip-tracker";
import { getTipPoints } from "../../domain/types/prop-tip-points";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";

const CENTRE = 475;

function trackTips(config: Partial<FireTipTrackerConfig>) {
  const tracker = new FireTipTracker();
  const full: FireTipTrackerConfig = {
    canvasSize: 950,
    leftPropDimensions: { width: 250, height: 236.7 },
    rightPropDimensions: { width: 250, height: 236.7 },
    leftPropType: "trigeng",
    rightPropType: "trigeng",
    renderedTransforms: {
      left: { centerX: CENTRE, centerY: CENTRE, angle: 0, scaleFactor: 1 },
      right: { centerX: CENTRE, centerY: CENTRE, angle: 0, scaleFactor: 1 },
    },
    ...config,
  };
  const prop = {} as PropState;
  let result = tracker.update(prop, prop, full, 0);
  for (let time = 16; result.tips.length === 0 && time < 200; time += 16) {
    result = tracker.update(prop, prop, full, time);
  }
  return result.tips.map((tip) => ({
    propIndex: tip.propIndex,
    x: tip.x - CENTRE,
    y: tip.y - CENTRE,
  }));
}

/**
 * The Canvas2D renderer mirrors a chirality-B prop with `ctx.scale(-1, 1)`
 * after rotating it, so every painted point lands at (-dx, dy) in prop-local
 * space. The tracker used the unmirrored table, which for a three-armed
 * trigeng put every emitter 60 degrees off, in the gap between two arms.
 */
describe("FireTipTracker chirality flip", () => {
  const table = getTipPoints("trigeng").points;

  it("mirrors the tip table across the prop's vertical axis for a flipped prop", () => {
    const tips = trackTips({ leftPropFlipped: true }).filter(
      (tip) => tip.propIndex === 0
    );
    expect(tips).toHaveLength(table.length);
    tips.forEach((tip, index) => {
      expect(tip.x).toBeCloseTo(-table[index]!.dx, 3);
      expect(tip.y).toBeCloseTo(table[index]!.dy, 3);
    });
  });

  it("flips each hand independently", () => {
    const tips = trackTips({ rightPropFlipped: true });
    const left = tips.filter((tip) => tip.propIndex === 0);
    const right = tips.filter((tip) => tip.propIndex === 1);
    expect(left[0]!.x).toBeCloseTo(table[0]!.dx, 3);
    expect(right[0]!.x).toBeCloseTo(-table[0]!.dx, 3);
    expect(right[0]!.y).toBeCloseTo(table[0]!.dy, 3);
  });

  it("leaves an unflipped prop on the authored table", () => {
    const tips = trackTips({}).filter((tip) => tip.propIndex === 0);
    expect(tips[0]!.x).toBeCloseTo(table[0]!.dx, 3);
  });
});
