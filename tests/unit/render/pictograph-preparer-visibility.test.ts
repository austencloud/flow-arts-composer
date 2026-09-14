import { describe, expect, it, vi } from "vitest";
import { PictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

function staticMotion(color: HandSide) {
  return createMotionData({
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: GridLocation.WEST,
    endLocation: GridLocation.WEST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: 0,
    hand: color,
  });
}

describe("PictographPreparer presentation visibility", () => {
  it("starts independent prop work while arrows are pending and publishes a complete frame", async () => {
    let releaseArrows!: () => void;
    const arrowsPending = new Promise<void>((resolve) => {
      releaseArrows = resolve;
    });
    const propLoader = {
      loadPropSvg: vi.fn(async () => ({
        svgData: {
          svgContent: "<path/>",
          viewBox: { width: 100, height: 100 },
          center: { x: 50, y: 50 },
        },
      })),
    };
    const preparer = new PictographPreparer(
      {
        coordinateArrowLifecycle: async () => {
          await arrowsPending;
          return { positions: {}, assets: {}, mirroring: {} };
        },
      } as never,
      propLoader as never,
      {
        calculatePlacement: async () => ({
          positionX: 475,
          positionY: 500,
          rotationAngle: 0,
        }),
      } as never
    );
    const pictograph: PictographData = {
      id: "parallel-layers",
      motions: {
        left: staticMotion(HandSide.LEFT),
        right: staticMotion(HandSide.RIGHT),
      },
    };
    let published = false;
    const frame = preparer.prepareSingle(pictograph).then((value) => {
      published = true;
      return value;
    });
    await Promise.resolve();
    expect(propLoader.loadPropSvg).toHaveBeenCalledTimes(2);
    expect(published).toBe(false);
    releaseArrows();
    expect(Object.keys((await frame)._prepared!.propAssets)).toEqual([
      "left",
      "right",
    ]);
  });

  it("prepares a masked pair as a genuine one-hand pictograph", async () => {
    let arrowInput: PictographData | null = null;
    let arrowSoloMode = false;
    const arrowManager = {
      coordinateArrowLifecycle: vi.fn(
        async (pictograph: PictographData, options: { soloMode?: boolean }) => {
          arrowInput = pictograph;
          arrowSoloMode = options.soloMode ?? false;
          return {
            positions: {},
            mirroring: {},
            assets: {},
            allReady: true,
            errors: {},
          };
        }
      ),
    };
    const propLoader = {
      loadPropSvg: vi.fn(async () => ({
        svgData: {
          svgContent: "<svg></svg>",
          viewBox: { width: 100, height: 100 },
          center: { x: 50, y: 50 },
        },
      })),
    };
    const propPlacer = {
      calculatePlacement: vi.fn(async () => ({
        positionX: 475,
        positionY: 500,
        rotationAngle: 0,
      })),
    };
    const preparer = new PictographPreparer(
      arrowManager as never,
      propLoader as never,
      propPlacer as never
    );
    const pictograph: PictographData = {
      id: "masked-pair",
      motions: {
        left: staticMotion(HandSide.LEFT),
        right: staticMotion(HandSide.RIGHT),
      },
    };

    const prepared = await preparer.prepareSingle(pictograph, {
      showLeftMotion: true,
      showRightMotion: false,
    });

    expect(arrowInput?.motions.left).toBeDefined();
    expect(arrowInput?.motions.right).toBeUndefined();
    expect(arrowSoloMode).toBe(true);
    expect(Object.keys(prepared._prepared?.propPositions ?? {})).toEqual([
      "left",
    ]);
  });

  it("returns motions with the same hand presentation used to prepare its assets", async () => {
    const preparer = new PictographPreparer(
      {
        coordinateArrowLifecycle: async () => ({
          positions: {},
          assets: {},
          mirroring: {},
        }),
      } as never,
      { loadPropSvg: async () => ({ svgData: null }) } as never,
      {
        calculatePlacement: async () => ({
          positionX: 0,
          positionY: 0,
          rotationAngle: 0,
        }),
      } as never
    );
    const pictograph: PictographData = {
      id: "hands-presentation",
      motions: {
        left: staticMotion(HandSide.LEFT),
        right: staticMotion(HandSide.RIGHT),
      },
    };

    const prepared = await preparer.prepareSingle(pictograph, {
      leftPropType: PropType.HAND,
      rightPropType: PropType.HAND,
    });

    expect(prepared.motions.left!.propType).toBe(PropType.HAND);
    expect(prepared.motions.right!.propType).toBe(PropType.HAND);
    expect(pictograph.motions.left!.propType).toBe(PropType.STAFF);
  });
});
