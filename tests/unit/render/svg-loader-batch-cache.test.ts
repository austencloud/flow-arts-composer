import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PropSvgLoader } from "$lib/shared/pictograph/prop/services/prop-svg-loader";
import { ArrowSvgLoader } from "$lib/shared/pictograph/arrow/rendering/services/arrow-svg-loader";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { createPropPlacementFromPosition } from "$lib/shared/pictograph/prop/domain/factories/create-prop-placement-data";
import {
  HandSide,
  MotionType,
  Orientation,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

const motion = createMotionData({
  hand: HandSide.LEFT,
  motionType: MotionType.PRO,
  startOrientation: Orientation.IN,
  turns: 0,
});
const propSvg = readFileSync(
  "static/images/props/pictograph/staff.svg",
  "utf8"
);
const arrowSvg = readFileSync(
  "static/images/arrows/pro/from_radial/pro_0.0.svg",
  "utf8"
);

afterEach(() => vi.unstubAllGlobals());

describe("concurrent SVG preparation", () => {
  it("shares one prop transform while preserving each card's position and rotation", async () => {
    const loader = new PropSvgLoader();
    loader.clearCache();
    const fetchAsset = vi.fn(async () => new Response(propSvg));
    vi.stubGlobal("fetch", fetchAsset);
    const poses = Array.from({ length: 36 }, (_, index) =>
      createPropPlacementFromPosition(index * 10, index * 20, index * 5)
    );
    const batch = await Promise.all(
      poses.map((pose) =>
        loader.loadPropSvg(pose, motion, false, { themeMode: "dark" })
      )
    );
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(loader.getCacheStats().cacheMisses).toBe(1);
    for (let index = 0; index < batch.length; index++) {
      expect(batch[index]!.svgData).toBe(batch[0]!.svgData);
      expect(batch[index]!.position).toEqual({ x: index * 10, y: index * 20 });
      expect(batch[index]!.rotation).toBe(index * 5);
    }
    const right = await loader.loadPropSvg(
      poses[0]!,
      { ...motion, hand: HandSide.RIGHT },
      false,
      { themeMode: "dark" }
    );
    const light = await loader.loadPropSvg(poses[0]!, motion, false, {
      themeMode: "light",
    });
    expect(right.svgData?.svgContent).not.toEqual(
      batch[0]!.svgData?.svgContent
    );
    expect(light.svgData?.svgContent).not.toEqual(
      batch[0]!.svgData?.svgContent
    );
  });

  it("shares complete arrow artwork including split paths and keeps hand colors separate", async () => {
    const loader = new ArrowSvgLoader();
    loader.clearCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (path: string) =>
          new Response(
            path.endsWith(".json")
              ? JSON.stringify({
                  "pro/from_radial/pro_0.0.svg": {
                    shaftPath: '<path fill="#000000" d="M0 0L10 10"/>',
                    tipPath: '<path fill="#000000" d="M10 10L12 8"/>',
                    tipBBox: { x: 8, y: 8, width: 4, height: 4 },
                  },
                })
              : arrowSvg
          )
      )
    );
    const batch = await Promise.all(
      Array.from({ length: 36 }, () =>
        loader.loadArrowSvg(motion.arrowPlacementData!, motion, {
          themeMode: "dark",
        })
      )
    );
    expect(loader.getCacheStats().cacheMisses).toBe(1);
    expect(batch.every((item) => item === batch[0])).toBe(true);
    expect(batch[0]!.shaftSrc).toBeTruthy();
    expect(batch[0]!.tipSrc).toBeTruthy();
    const right = await loader.loadArrowSvg(
      motion.arrowPlacementData!,
      { ...motion, hand: HandSide.RIGHT },
      { themeMode: "dark" }
    );
    expect(right.imageSrc).not.toEqual(batch[0]!.imageSrc);
  });

  it("retries a failed arrow fetch instead of retaining a rejected batch", async () => {
    const loader = new ArrowSvgLoader();
    loader.clearCache();
    const fetchAsset = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchAsset);
    await expect(
      loader.loadArrowSvg(motion.arrowPlacementData!, motion)
    ).rejects.toThrow("503");
    fetchAsset.mockImplementation(async () => new Response(arrowSvg));
    const recovered = await loader.loadArrowSvg(
      motion.arrowPlacementData!,
      motion
    );
    expect(recovered.imageSrc).toBeTruthy();
    expect(fetchAsset).toHaveBeenCalledTimes(2);
  });
});
