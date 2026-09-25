// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { POST_STUDIO_PRESETS } from "$lib/shared/media-composition/domain/post-studio-presets";
import {
  resolveFrameLayerGeometry,
  waitForPictographMotion,
} from "$lib/shared/media-composition/services/post-studio-frame-compositor";

const preset = POST_STUDIO_PRESETS.find(
  (candidate) => candidate.id === "performance-breakdown"
)!;
const region = preset.regions.find(
  (candidate) => candidate.id === "performance"
)!;

describe("resolveFrameLayerGeometry", () => {
  it("resolves the performance crop in output pixels", () => {
    const geometry = resolveFrameLayerGeometry({
      preset,
      region,
      sourceWidth: 1920,
      sourceHeight: 1080,
      transform: {
        scale: 1,
        rotationDegrees: 0,
        translateX: 0,
        translateY: 0,
      },
    });

    expect(geometry.region).toEqual({
      x: 0,
      y: 0,
      width: 1080,
      height: 1152,
    });
    expect(geometry.drawRect.x).toBeCloseTo(-484);
    expect(geometry.drawRect.y).toBe(0);
    expect(geometry.drawRect.width).toBeCloseTo(2048);
    expect(geometry.drawRect.height).toBe(1152);
  });

  it("resolves clip translation against the source the slot hides", () => {
    // A 1080-square source covering a 1080x1152 slot draws 1152 wide, and the
    // 1.25 scale takes both sides to 1440: 360 hidden across, 288 down. A pan
    // is a fraction of that, so 0.1 across is 36px and -0.25 down is -72px.
    const geometry = resolveFrameLayerGeometry({
      preset,
      region,
      sourceWidth: 1080,
      sourceHeight: 1080,
      transform: {
        scale: 1.25,
        rotationDegrees: 12,
        translateX: 0.1,
        translateY: -0.25,
      },
    });

    expect(geometry.translateX).toBeCloseTo(36);
    expect(geometry.translateY).toBeCloseTo(-72);
    expect(geometry.scale).toBe(1.25);
    expect(geometry.rotationDegrees).toBe(12);
  });

  it("refuses to pan a layer that is hiding nothing", () => {
    // Source and slot share an aspect, so a cover fit hides no source at all.
    // Panning here could only open a gap beside the picture, which is the
    // difference between a crop control and a shove.
    const geometry = resolveFrameLayerGeometry({
      preset,
      region,
      sourceWidth: 1080,
      sourceHeight: 1152,
      transform: {
        scale: 1,
        rotationDegrees: 0,
        translateX: 0.4,
        translateY: -0.5,
      },
    });

    expect(geometry.translateX).toBeCloseTo(0);
    expect(geometry.translateY).toBeCloseTo(0);
  });
});

describe("waitForPictographMotion", () => {
  it("waits through a remount and ignores a stale, unready pictograph", async () => {
    const createDiv = () =>
      document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div"
      ) as HTMLElement;
    const layer = createDiv();
    const pending = waitForPictographMotion(layer, 1_000);
    const motion = createDiv();
    motion.dataset.pictographMotion = "";
    const container = createDiv();
    container.dataset.pictographRenderReady = "false";
    motion.append(container);
    layer.append(motion);
    vi.spyOn(motion, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 200,
    } as DOMRect);

    let resolved = false;
    void pending.then(() => (resolved = true));
    await Promise.resolve();
    expect(resolved).toBe(false);

    container.dataset.pictographRenderReady = "true";
    await expect(pending).resolves.toMatchObject({ element: motion });
  });

  it("fails with a bounded readiness error", async () => {
    const layer = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    ) as HTMLElement;
    await expect(waitForPictographMotion(layer, 10)).rejects.toThrow(
      "The pictograph motion layer was not ready to render."
    );
  });
});
