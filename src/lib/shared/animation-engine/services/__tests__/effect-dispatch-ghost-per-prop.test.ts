import { describe, expect, it } from "vitest";
import type { TipEffectMap } from "../../domain/types/tip-effect-types";
import {
  EFFECT_DISPATCH_REGISTRY,
  type EffectDispatchContext,
} from "../effect-dispatch-registry";

// Ghost echoes the whole prop picture, not its tips, so it builds its own
// input. It has to honour the per-prop map the way the tip effects do, or
// Ghost on one prop draws echoes of the other.

const transform = { centerX: 10, centerY: 20, angle: 0, scaleFactor: 1 };
const dimensions = { width: 30, height: 8 };

function ghostPropIds(tipMap: TipEffectMap): number[] {
  const entry = EFFECT_DISPATCH_REGISTRY.find((e) => e.effect === "ghost");
  if (!entry) throw new Error("ghost is not in the dispatch registry");
  const ctx = {
    tipMap,
    sharedTips: [],
    params: {
      currentStep: 0,
      sequenceContentHash: "seq",
      props: {
        leftProp: {},
        rightProp: {},
        leftPropDimensions: dimensions,
        rightPropDimensions: dimensions,
      },
    },
    currentTime: 0,
    renderedTransforms: { left: transform, right: transform },
    propImages: { left: {}, right: {} },
    loopDetectedThisFrame: false,
    isSeamlesslyLoopable: false,
  } as unknown as EffectDispatchContext;
  const input = entry.buildInput(ctx, 0) as { props: Array<{ id: number }> };
  return input.props.map((p) => p.id);
}

describe("ghost dispatch: per-prop choice", () => {
  it("echoes both props when both wear Ghost", () => {
    expect(ghostPropIds({ "*": { effect: "ghost" } })).toEqual([0, 1]);
  });

  it("echoes only the left prop when the right wears nothing", () => {
    expect(
      ghostPropIds({ "0": { effect: "ghost" }, "1": { effect: "none" } })
    ).toEqual([0]);
  });

  it("echoes only the right prop when the left wears another effect", () => {
    expect(
      ghostPropIds({ "0": { effect: "trails" }, "1": { effect: "ghost" } })
    ).toEqual([1]);
  });
});
