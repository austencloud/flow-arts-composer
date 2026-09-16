import { describe, expect, it } from "vitest";
import {
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { generatePlacementKey } from "$lib/shared/pictograph/arrow/positioning/key-generation/services/arrow-placement-key-generator";
import { ArrowPlacer } from "$lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer";
import {
  HandSide,
  MotionType,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

const PRO_PATH = "/data/arrow_placement/default/default_pro_placements.json";

describe("quarter-turn default placement", () => {
  it("keeps the canonical asset anchor instead of interpolating unrelated legacy bounds", async () => {
    const placer = new ArrowPlacer({
      get: async (path: string) =>
        path === PRO_PATH
          ? { pro_to_layer2_alpha: { "0": [10, 20], "0.5": [30, 50] } }
          : {},
    } as never);

    await expect(
      placer.getDefaultAdjustment(
        MotionType.PRO,
        "pro_to_layer2_alpha",
        0.25,
        GridMode.DIAMOND
      )
    ).resolves.toEqual({ x: 0, y: 0 });
  });

  it("prefers an explicitly authored quarter placement over interpolation", async () => {
    const placer = new ArrowPlacer({
      get: async (path: string) =>
        path === PRO_PATH
          ? {
              pro_to_layer2_alpha: {
                "0": [10, 20],
                "0.25": [91, -47],
                "0.5": [30, 50],
              },
            }
          : {},
    } as never);

    await expect(
      placer.getDefaultAdjustment(
        MotionType.PRO,
        "pro_to_layer2_alpha",
        0.25,
        GridMode.DIAMOND
      )
    ).resolves.toEqual({ x: 91, y: -47 });
  });

  it.each([
    MotionType.PRO,
    MotionType.ANTI,
    MotionType.STATIC,
    MotionType.DASH,
  ])(
    "keeps the %s anchor in every display grid when no exact entry exists",
    async (motionType) => {
      const placer = new ArrowPlacer({ get: async () => ({}) } as never);

      for (const gridMode of [
        GridMode.DIAMOND,
        GridMode.BOX,
        GridMode.SKEWED,
        GridMode.CENTRIC,
        GridMode.TRIGRID,
        GridMode.EIGHT_POINT,
      ]) {
        await expect(
          placer.getDefaultAdjustment(
            motionType,
            `${motionType}_to_layer2_alpha`,
            0.25,
            gridMode,
            "club"
          )
        ).resolves.toEqual({ x: 0, y: 0 });
      }
    }
  );

  it("routes interradial endpoints into the established layer-2 key", () => {
    const left = createMotionData({
      hand: HandSide.LEFT,
      motionType: MotionType.PRO,
      startOrientation: Orientation.CLOCK_IN,
      endOrientation: Orientation.CLOCK_OUT,
      turns: 0.25,
    });
    const right = createMotionData({
      hand: HandSide.RIGHT,
      motionType: MotionType.ANTI,
      startOrientation: Orientation.COUNTER_OUT,
      endOrientation: Orientation.COUNTER_IN,
      turns: 0.25,
    });
    const pictograph = {
      letter: "A",
      endPlacement: GridPlacement.ALPHA1,
      motions: { left, right },
    } as PictographData;

    expect(
      generatePlacementKey(left, pictograph, ["pro_to_layer2_alpha"])
    ).toBe("pro_to_layer2_alpha");
  });
});
