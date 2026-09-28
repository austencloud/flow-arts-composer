import { describe, expect, it } from "vitest";
import {
  clipBox,
  clipShapeFor,
  postOutputSize,
  shapedBox,
  spotAround,
} from "$lib/shared/media-composition/domain/post-canvas";
import { compilePostProject } from "$lib/shared/media-composition/domain/post-project-compiler";
import { EASING_PRESETS } from "$lib/shared/media-composition/domain/post-project-keyframes";
import {
  POST_BOX,
  PostProjectSchema,
} from "$lib/shared/media-composition/domain/post-project";
import {
  setProjectCanvas,
  updateItem,
} from "$lib/shared/media-composition/domain/post-project-edits";
import { NOW, project, video } from "./post-project-fixtures";

const ctx = { now: NOW };
const PORTRAIT = postOutputSize("9:16");

function pixels(box: { width: number; height: number }, output = PORTRAIT) {
  return { width: box.width * output.width, height: box.height * output.height };
}

describe("post canvas", () => {
  it("sizes the export from the post's shape, 9:16 when none is set", () => {
    expect(postOutputSize(undefined)).toEqual({ width: 1080, height: 1920 });
    expect(postOutputSize("4:5")).toEqual({ width: 1080, height: 1350 });
    expect(postOutputSize("16:9")).toEqual({ width: 1920, height: 1080 });

    const proj = project([video("v1")]);
    expect(compilePostProject(proj, ctx)!.preset.output).toMatchObject({
      width: 1080,
      height: 1920,
    });
    const square = setProjectCanvas(proj, "1:1", ctx);
    expect(square.canvas).toBe("1:1");
    expect(PostProjectSchema.safeParse(square).success).toBe(true);
    expect(compilePostProject(square, ctx)!.preset.output).toMatchObject({
      width: 1080,
      height: 1080,
    });
    // Going back to the default stores nothing, as older projects have it.
    expect("canvas" in setProjectCanvas(square, "9:16", ctx)).toBe(false);
  });

  it("fits a clip's shape as the largest of it centred in its box", () => {
    const square = shapedBox(POST_BOX.full, 1, PORTRAIT);
    expect(pixels(square).width).toBeCloseTo(1080);
    expect(pixels(square).height).toBeCloseTo(1080);
    expect(square.x).toBeCloseTo(0);
    expect(square.y + square.height / 2).toBeCloseTo(0.5);

    const wide = shapedBox(POST_BOX.top, 16 / 9, PORTRAIT);
    expect(pixels(wide).width).toBeCloseTo(1080);
    expect(pixels(wide).height).toBeCloseTo(607.5);
    expect(wide.y + wide.height / 2).toBeCloseTo(0.25);

    const tall = shapedBox(POST_BOX.full, 9 / 16, postOutputSize("16:9"));
    const tallPixels = pixels(tall, postOutputSize("16:9"));
    expect(tallPixels.height).toBeCloseTo(1080);
    expect(tallPixels.width).toBeCloseTo(607.5);
    expect(tall.x + tall.width / 2).toBeCloseTo(0.5);
  });

  it("draws a shaped clip in its shape, keyed boxes included", () => {
    const shape = clipShapeFor("1:1")!;
    const keyed = video("v1", {
      shape,
      keyframes: {
        box: [
          { t: 0, value: { ...POST_BOX.full }, easing: EASING_PRESETS.linear },
          { t: 5, value: { ...POST_BOX.top }, easing: EASING_PRESETS.linear },
        ],
      },
    });
    const preset = compilePostProject(project([keyed]), ctx)!.preset;
    const region = preset.regions.find((entry) => entry.id === "v1")!;
    expect(pixels(region).width).toBeCloseTo(1080);
    expect(pixels(region).height).toBeCloseTo(1080);
    const track = preset.regionKeyframes!.find((entry) => entry.regionId === "v1")!;
    const [first, second] = track.keyframes.map((kf) => pixels(kf.value));
    expect(first!.height).toBeCloseTo(1080);
    expect(second!.width).toBeCloseTo(960);
    expect(second!.height).toBeCloseTo(960);
  });

  it("sets and clears a clip's shape as one field", () => {
    const proj = project([video("v1")]);
    const shaped = updateItem(proj, "v1", { shape: clipShapeFor("original", 16 / 9) }, ctx);
    const item = shaped.tracks[0]!.items[0]!;
    expect(item.kind === "video" && item.shape).toEqual({ kind: "original", ratio: 16 / 9 });
    expect(PostProjectSchema.safeParse(shaped).success).toBe(true);
    const cleared = updateItem(shaped, "v1", { shape: null }, ctx);
    expect("shape" in cleared.tracks[0]!.items[0]!).toBe(false);
  });

  it("needs a ratio for the footage's own shape or a free one", () => {
    expect(clipShapeFor("original")).toBeNull();
    expect(clipShapeFor("free", 0.5)).toEqual({ kind: "free", ratio: 0.5 });
    expect(clipShapeFor("free", 100)!.ratio).toBe(4);
    expect(clipShapeFor("4:5")).toEqual({ kind: "4:5", ratio: 0.8 });
  });

  describe("a moved or resized shape", () => {
    const square = { shape: clipShapeFor("1:1")! };
    const frame = { ...POST_BOX.full };
    const shown = shapedBox(frame, 1, PORTRAIT);

    function expectBox(actual: object, expected: object) {
      for (const [key, value] of Object.entries(expected)) {
        expect((actual as Record<string, number>)[key]).toBeCloseTo(value as number, 9);
      }
    }

    it("keeps the room its box had, so the shape still lands where it was put", () => {
      const moved = { ...shown, y: shown.y + 0.1 };
      const spot = spotAround(square, moved, frame, PORTRAIT);

      expectBox(clipBox(square, spot, PORTRAIT), moved);
      // Room above and below, as far as the frame allows either way.
      expectBox(spot, { x: 0, width: 1 });
      expect(spot.height).toBeGreaterThan(moved.height);
      expect(spot.y).toBeGreaterThanOrEqual(0);
      expect(spot.y + spot.height).toBeLessThanOrEqual(1 + 1e-9);
    });

    it("fills the frame again once it is back in the middle", () => {
      const nudged = spotAround(square, { ...shown, y: shown.y + 0.005 }, frame, PORTRAIT);
      const back = spotAround(square, shown, nudged, PORTRAIT);

      expectBox(back, frame);
    });

    it("keeps its width to grow into when its corners made it smaller", () => {
      const width = shown.width / 2;
      const smaller = {
        x: 0.25,
        y: 0.5 - (shown.height / 2) / 2,
        width,
        height: shown.height / 2,
      };
      const spot = spotAround(square, smaller, frame, PORTRAIT);

      expectBox(spot, { x: 0.25, y: 0, width, height: 1 });
      expectBox(clipBox(square, spot, PORTRAIT), smaller);
      // A taller shape then grows into that height, as wide as before.
      const tall = clipBox({ shape: clipShapeFor("9:16")! }, spot, PORTRAIT);
      expect(tall.width).toBeCloseTo(width, 9);
      expect(tall.height).toBeGreaterThan(smaller.height);
    });

    it("takes what is shown as the box for a clip without a shape", () => {
      const moved = { x: 0.1, y: 0.2, width: 0.5, height: 0.3 };
      expect(spotAround({ shape: undefined }, moved, frame, PORTRAIT)).toBe(moved);
    });
  });
});
