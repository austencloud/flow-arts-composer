import { describe, expect, it } from "vitest";
import { ratioStageTips } from "@tka/shape-engine/services/ratio-stage-tips.js";

const head = { x: 10, y: 20 };
const tail = { x: -10, y: -20 };

describe("Ratios stage effect tips", () => {
  it.each(["poi", "club"])("a %s gives off from its head only, marked as its only tip", (prop) => {
    const tips = ratioStageTips(prop, 1, head, tail, "#f00");
    expect(tips).toHaveLength(1);
    expect(tips[0]).toMatchObject({ x: 10, y: 20, end: "A", propIndex: 1, onlyTip: true });
  });

  it("a staff gives off from both ends", () => {
    const tips = ratioStageTips("staff", 0, head, tail, "#00f");
    expect(tips).toHaveLength(2);
    expect(tips.map((t) => t.end)).toEqual(["A", "B"]);
    expect(tips[1]).toMatchObject({ x: -10, y: -20, tipIndex: 1 });
    expect(tips.some((t) => t.onlyTip)).toBe(false);
  });
});
