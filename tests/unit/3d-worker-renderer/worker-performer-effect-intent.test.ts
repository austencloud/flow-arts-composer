import { describe, expect, it } from "vitest";

import { TrackingMode } from "$lib/shared/animation-engine/domain/types/trail-types";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import { createWorkerPerformerEffectIntent } from "$lib/shared/3d/worker-renderer/services/worker-performer-effect-intent";

const propBuild = {
  finish: "fire",
  fanBuild: "pictograph",
  fanFrameColor: "black",
  fanCover: "bare",
} as const;

describe("createWorkerPerformerEffectIntent", () => {
  it("paints default trails in the hand colors and keeps custom ones", () => {
    const input = {
      playing: true,
      sampledAtMs: 0,
      currentStep: 0,
      totalSteps: 8,
      seamlesslyLoopable: true,
      qualityTier: "high" as const,
      propBuild,
      leftPropType: "staff",
      rightPropType: "staff",
      staffHalfLength: 0.5,
      trailTrackingMode: TrackingMode.HAND,
      handColors: { left: "#a855f7", right: "#22c55e" },
    };
    const byDefault = createWorkerPerformerEffectIntent({
      ...input,
      effectsConfig: structuredClone(DEFAULT_EFFECTS_CONFIG),
    });
    expect(byDefault.trails).toMatchObject({
      leftColor: "#a855f7",
      rightColor: "#22c55e",
    });

    const custom = structuredClone(DEFAULT_EFFECTS_CONFIG);
    custom.trails.rightColor = "#fbbf24";
    const customized = createWorkerPerformerEffectIntent({
      ...input,
      effectsConfig: custom,
    });
    expect(customized.trails).toMatchObject({
      leftColor: "#a855f7",
      rightColor: "#fbbf24",
    });
  });

  it("preserves the canonical per-tip effect precedence and duplicates", () => {
    const intent = createWorkerPerformerEffectIntent({
      playing: true,
      sampledAtMs: 1_234,
      currentStep: 2,
      totalSteps: 8,
      seamlesslyLoopable: true,
      qualityTier: "high",
      propBuild,
      leftPropType: "fan",
      rightPropType: "staff",
      staffHalfLength: 0.75,
      tipEffectMap: {
        "0": { effect: "sparkles" },
        "1-0": { effect: "fire" },
        "*": { effect: "trails" },
      },
      globalTipEffectMap: { "*": { effect: "charcoal" } },
      effectsConfig: structuredClone(DEFAULT_EFFECTS_CONFIG),
      trailTrackingMode: TrackingMode.BOTH_ENDS,
    });

    expect(intent.tips.filter(({ propIndex }) => propIndex === 0)).toHaveLength(
      5
    );
    expect(
      intent.tips
        .filter(({ propIndex }) => propIndex === 0)
        .every(({ effect }) => effect === "sparkles")
    ).toBe(true);
    expect(intent.tips.filter(({ propIndex }) => propIndex === 1)).toEqual([
      { propIndex: 1, tipIndex: 0, effect: "fire" },
      { propIndex: 1, tipIndex: 1, effect: "trails" },
    ]);
    expect(intent.pooled.sparkles).toBeDefined();
    expect(intent.pooled.fire).toBeDefined();
    expect(intent.pooled.charcoal).toBeUndefined();
    expect(intent.trails.trackingMode).toBe(TrackingMode.BOTH_ENDS);
  });

  it("copies the app-owned clock, choreography, build and quality unchanged", () => {
    const intent = createWorkerPerformerEffectIntent({
      playing: false,
      sampledAtMs: 987.5,
      currentStep: 3,
      totalSteps: 4,
      seamlesslyLoopable: false,
      qualityTier: "low",
      propBuild,
      leftPropType: "staff",
      rightPropType: "staff",
      staffHalfLength: 0.5,
      effectsConfig: structuredClone(DEFAULT_EFFECTS_CONFIG),
      trailTrackingMode: TrackingMode.HAND,
    });

    expect(intent).toMatchObject({
      playing: false,
      sampledAtMs: 987.5,
      currentStep: 3,
      totalSteps: 4,
      seamlesslyLoopable: false,
      qualityTier: "low",
      propBuild,
      tips: [
        { propIndex: 0, tipIndex: 0, effect: "none" },
        { propIndex: 0, tipIndex: 1, effect: "none" },
        { propIndex: 1, tipIndex: 0, effect: "none" },
        { propIndex: 1, tipIndex: 1, effect: "none" },
      ],
    });
  });
});
