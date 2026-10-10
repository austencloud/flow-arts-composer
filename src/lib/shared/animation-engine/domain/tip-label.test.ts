import { describe, expect, it } from "vitest";
import { getTipLabel } from "./tip-label";
import { getTipPoints } from "./types/prop-tip-points";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

/**
 * The compose cell editor names each per-tip effect key with this label. It
 * once called tip 0 the thumb, so "Left Thumb" set the effect on the pinky end
 * and nothing on screen said so. The thumb end is +x in prop-local space: the
 * staff crossbar is drawn there and "in" turns it toward the centre.
 */
describe("getTipLabel", () => {
  it("names the staff's -x tip Pinky and its +x tip Thumb", () => {
    const [tip0, tip1] = getTipPoints("staff").points;
    expect(tip0!.dx).toBeLessThan(0);
    expect(tip1!.dx).toBeGreaterThan(0);
    expect(getTipLabel("staff", 0)).toBe("Pinky");
    expect(getTipLabel("staff", 1)).toBe("Thumb");
  });

  it("puts Thumb on the +x tip of every prop that names its ends that way", () => {
    const checked: string[] = [];
    for (const propType of Object.values(PropType)) {
      const points = getTipPoints(propType).points;
      if (points.length !== 2) continue;
      points.forEach((point, index) => {
        const label = getTipLabel(propType, index);
        if (label === "Thumb") expect(point.dx, propType).toBeGreaterThan(0);
        if (label === "Pinky") expect(point.dx, propType).toBeLessThan(0);
      });
      if (getTipLabel(propType, 1) === "Thumb") checked.push(propType);
    }
    // The whole staff family plus Energy Staff, so the loop cannot pass empty.
    expect(checked.length).toBeGreaterThanOrEqual(7);
  });

  it("keeps generic names where a prop has no thumb or pinky pair", () => {
    expect(getTipLabel("buugeng", 0)).toBe("End 1");
    expect(getTipLabel("buugeng", 1)).toBe("End 2");
    expect(getTipLabel("club", 0)).toBe("Tip");
    expect(getTipLabel("fan", 2)).toBe("Tip 3");
  });
});
