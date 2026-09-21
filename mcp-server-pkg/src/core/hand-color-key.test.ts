import { createCanvas, loadImage } from "@napi-rs/canvas/node-canvas.js";
import { describe, expect, it, vi } from "vitest";
import type { SequenceStep } from "./sequence-builder.js";
import { renderSequenceToImage } from "./sequence-renderer.js";
import {
  getStandaloneRenderer,
  type PictographInput,
  type RenderVisibilityOptions,
} from "./standalone-renderer.js";

const input: PictographInput = {
  letter: "A",
  gridMode: "diamond",
  leftMotion: {
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: "n",
    endLocation: "e",
    startOrientation: "in",
    hand: "left",
    turns: 1,
  },
  rightMotion: {
    motionType: "anti",
    rotationDirection: "ccw",
    startLocation: "s",
    endLocation: "w",
    startOrientation: "in",
    hand: "right",
    turns: 1,
  },
};

const steps: SequenceStep[] = [
  {
    letter: "A",
    variation: 0,
    startPlacement: "alpha1",
    endPlacement: "alpha1",
    stepNumber: 0,
    leftMotion: { ...input.leftMotion, startOrientation: "in", endOrientation: "in" },
    rightMotion: { ...input.rightMotion, startOrientation: "in", endOrientation: "in" },
  },
  {
    letter: "B",
    variation: 0,
    startPlacement: "alpha1",
    endPlacement: "beta1",
    stepNumber: 1,
    leftMotion: { ...input.leftMotion, startOrientation: "in", endOrientation: "in" },
    rightMotion: { ...input.rightMotion, startOrientation: "in", endOrientation: "in" },
  },
];

async function changedKeyPixels(withKey: Buffer, withoutKey: Buffer): Promise<number> {
  const canvas = createCanvas(950, 950);
  const context = canvas.getContext("2d");
  context.drawImage(await loadImage(withKey), 0, 0);
  const keyed = context.getImageData(300, 825, 350, 100).data;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(await loadImage(withoutKey), 0, 0);
  const plain = context.getImageData(300, 825, 350, 100).data;

  let changed = 0;
  for (let index = 0; index < keyed.length; index += 4) {
    if (
      keyed[index] !== plain[index] ||
      keyed[index + 1] !== plain[index + 1] ||
      keyed[index + 2] !== plain[index + 2] ||
      keyed[index + 3] !== plain[index + 3]
    ) {
      changed++;
    }
  }
  return changed;
}

describe("packaged start hand colour key", () => {
  it("renders labelled default and custom swatches into SVG and PNG", async () => {
    const renderer = getStandaloneRenderer();
    const base = {
      darkMode: true,
      size: 950,
      showGrid: false,
      showTKA: false,
      showHandColorKey: true,
    } satisfies RenderVisibilityOptions;

    const defaultSvg = await renderer.renderToSvg(input, base);
    const customSvg = await renderer.renderToSvg(input, {
      ...base,
      primaryPropColors: { left: "#13579b", right: "#c24680" },
    });

    expect(defaultSvg).toContain('class="hand-color-key"');
    expect(defaultSvg).toMatch(/<text[^>]*>L<\/text>/);
    expect(defaultSvg).toMatch(/<text[^>]*>R<\/text>/);
    expect(customSvg).toContain('fill="#13579b"');
    expect(customSvg).toContain('fill="#c24680"');
    expect(
      await changedKeyPixels(
        await renderer.renderToPng(input, base),
        await renderer.renderToPng(input, { ...base, showHandColorKey: false })
      )
    // Two 20px-radius swatches account for roughly 2,500 pixels. Requiring
    // materially more proves the bundled Canvas path adds visible L/R labels,
    // rather than leaving a swatches-only key in the published image.
    ).toBeGreaterThan(3_000);
  });

  it("adds the key to the Start cell only while composing a real card image", async () => {
    const renderer = getStandaloneRenderer();
    const originalRenderToPng = renderer.renderToPng.bind(renderer);
    const calls: RenderVisibilityOptions[] = [];
    const renderSpy = vi
      .spyOn(renderer, "renderToPng")
      .mockImplementation(async (pictograph, options = {}) => {
        calls.push(options);
        return originalRenderToPng(pictograph, options);
      });

    try {
      const image = await renderSequenceToImage(steps, "AB", {
        layout: "strip",
        cellSize: 240,
        padding: 12,
        showStepNumbers: true,
        showWord: false,
        darkMode: true,
      });
      expect(image.length).toBeGreaterThan(1_000);
    } finally {
      renderSpy.mockRestore();
    }

    expect(calls).toHaveLength(2);
    expect(calls.map((options) => options.showHandColorKey)).toEqual([true, false]);
  });
});
