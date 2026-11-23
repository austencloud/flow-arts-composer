import { describe, it, expect } from "vitest";
import { buildArrayTips, buildEmitterTips } from "./effect-tip-builders";
import type { PropTipData } from "../domain/types/fire-types";
import type { TipEffectMap } from "../domain/types/tip-effect-types";
import type { RenderFrameParams } from "./IAnimationRenderLoop";

const params = {
  props: { additionalLayers: [], tunnelSpectrum: false },
  trailSettings: { leftColor: "#3a7fd9", rightColor: "#d94f4f" },
} as unknown as RenderFrameParams;

function tip(propIndex: number, tipIndex: number): PropTipData {
  return { x: propIndex * 10, y: tipIndex * 10, propIndex, tipIndex } as PropTipData;
}

describe("buildEmitterTips onlyTip", () => {
  const all: TipEffectMap = { "*": { effect: "animal" } } as TipEffectMap;

  it("marks a prop that has one tip, and not a prop that has two", () => {
    // Prop 0 is a poi (one tip), prop 1 a staff (two tips).
    const out = buildEmitterTips(
      [tip(0, 0), tip(1, 0), tip(1, 1)],
      all,
      "animal",
      params
    );
    expect(out.map((t) => [t.propIndex, t.tipIndex, t.onlyTip])).toEqual([
      [0, 0, true],
      [1, 0, false],
      [1, 1, false],
    ]);
  });

  it("counts a prop's tips before the per-effect filter", () => {
    // Staff tip 0 wears animal, tip 1 wears smoke: still a two-tip prop.
    const split = {
      "0-0": { effect: "animal" },
      "0-1": { effect: "smoke" },
    } as unknown as TipEffectMap;
    const out = buildEmitterTips([tip(0, 0), tip(0, 1)], split, "animal", params);
    expect(out).toHaveLength(1);
    expect(out[0]!.onlyTip).toBe(false);
  });

  it("buildArrayTips (Pulse) marks one-tip props the same way", () => {
    const out = buildArrayTips(
      [tip(0, 0), tip(1, 0), tip(1, 1)],
      all,
      "animal",
      params,
      undefined
    );
    expect(out.map((t) => t.onlyTip)).toEqual([true, false, false]);
  });
});
