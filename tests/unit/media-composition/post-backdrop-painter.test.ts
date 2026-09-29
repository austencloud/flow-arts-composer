import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { MediaCompositionPreset } from "$lib/shared/media-composition/domain/media-composition-preset-schema";
import type { EvaluatedFrameLayer } from "$lib/shared/media-composition/services/frame-evaluator";
import {
  backdropLayer,
  paintBlurredBackdrop,
} from "$lib/shared/media-composition/services/post-backdrop-painter";

function layer(clipId: string): EvaluatedFrameLayer {
  return {
    clipId,
    regionId: clipId,
    sourceRole: "take:a",
    opacity: 1,
    sourceTimeSeconds: 0,
    projectProgress: 0,
    transform: {
      scale: 1,
      rotationDegrees: 0,
      translateX: 0,
      translateY: 0,
      flipHorizontal: false,
    },
  };
}

/** A 2D context that keeps what was drawn on it. No `filter` stands for a browser without canvas filters. */
function recorder(filter: string | undefined) {
  return {
    filter,
    globalAlpha: 1,
    fillStyle: "",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    turns: [] as number[],
    draws: [] as { source: unknown; args: number[]; alpha: number; filter?: string }[],
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate(radians: number) {
      this.turns.push((radians * 180) / Math.PI);
    },
    drawImage(source: unknown, ...args: number[]) {
      this.draws.push({ source, args, alpha: this.globalAlpha, filter: this.filter });
    },
    fillRect() {},
  };
}

describe("backdropLayer", () => {
  it("draws the first of the backdrop's clips that is on screen", () => {
    const preset = {
      backdrop: { kind: "blur", clipIds: ["v1", "v2"] },
    } as MediaCompositionPreset;

    expect(backdropLayer(preset, [layer("t1"), layer("v2")])?.clipId).toBe("v2");
    expect(backdropLayer(preset, [layer("v2"), layer("v1")])?.clipId).toBe("v1");
    expect(backdropLayer(preset, [layer("t1")])).toBeNull();
    expect(backdropLayer({} as MediaCompositionPreset, [layer("v1")])).toBeNull();
  });
});

describe("paintBlurredBackdrop", () => {
  let createElement: MockInstance | null = null;
  afterEach(() => createElement?.mockRestore());

  function paint(options: { rotationDegrees: number; filters?: boolean }) {
    const sampleContext = recorder(options.filters === false ? undefined : "none");
    const sample = { width: 0, height: 0, getContext: () => sampleContext };
    createElement = vi
      .spyOn(document, "createElement")
      .mockReturnValue(sample as unknown as HTMLElement);
    const target = recorder("none");
    const source = {} as CanvasImageSource;
    paintBlurredBackdrop(target as unknown as CanvasRenderingContext2D, {
      source,
      sourceSize: { width: 1920, height: 1080 },
      frame: { width: 1080, height: 1920 },
      transform: { rotationDegrees: options.rotationDegrees, flipHorizontal: false },
      opacity: 0.5,
    });
    return { sample, sampleContext, target, source };
  }

  it("fills the whole frame with the picture turned as its clip is", () => {
    const { sample, sampleContext, target, source } = paint({ rotationDegrees: 90 });

    // Turned upright, the landscape picture covers all of the blur's sample.
    const picture = sampleContext.draws[0]!;
    expect(picture.source).toBe(source);
    expect(picture.filter).toMatch(/^blur\(/);
    expect(sampleContext.turns).toEqual([90]);
    const [, , width, height] = picture.args;
    expect(width).toBeGreaterThanOrEqual(sample.height - 1e-6);
    expect(height).toBeGreaterThanOrEqual(sample.width - 1e-6);

    // The sample's middle, clear of the margin the blur fades into, is drawn
    // up over the whole frame.
    const blur = target.draws[0]!;
    const [sx, sy, sw, sh, ...onto] = blur.args;
    expect(blur.source).toBe(sample);
    expect(onto).toEqual([0, 0, 1080, 1920]);
    expect(sx).toBeGreaterThan(0);
    expect(sy).toBeGreaterThan(0);
    expect(sx! + sw!).toBeLessThan(sample.width);
    expect(sy! + sh!).toBeLessThan(sample.height);
    expect(sw! / sh!).toBeCloseTo(1080 / 1920, 2);
    expect(blur.alpha).toBe(0.5);
  });

  it("still fills the frame, from a smaller sample, where canvas filters are missing", () => {
    const { sample, sampleContext, target } = paint({
      rotationDegrees: 0,
      filters: false,
    });

    expect(sampleContext.draws[0]!.filter).toBeUndefined();
    expect(sample.width).toBeLessThan(1080 / 8);
    expect(target.draws[0]!.args.slice(4)).toEqual([0, 0, 1080, 1920]);
  });
});
