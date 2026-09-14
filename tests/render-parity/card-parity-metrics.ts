import pixelmatch from "pixelmatch";
import {
  calculateSequenceCardLayout,
  COMPOSER_CARD_EXPORT_PROFILE_V1,
  getCardFrameContentInset,
} from "@tka/render-composition";
import type { CardParityCase } from "./card-parity-cases";

export interface ParityImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

// Region-specific raster tolerance. Never average a small header into the body.
// The footer is text only; browser and napi-rs glyph antialiasing measure
// 1.11% on the viewer footer and 1.85% on the larger print footer.
export const CARD_PARITY_LIMITS: Record<string, number> = {
  header: 0.25,
  body: 0.35,
  footer: 2,
};

export function assertCardParity(
  metrics: ReturnType<typeof cardParityMetrics>,
  label: string
) {
  for (const region of metrics) {
    const limit = CARD_PARITY_LIMITS[region.name]!;
    if (region.percent > limit)
      throw new Error(
        `${label}: ${region.name} differs by ${region.percent.toFixed(4)}% (limit ${limit}%)`
      );
  }
}

export function cardParityMetrics(
  actual: ParityImage,
  expected: ParityImage,
  testCase: CardParityCase
) {
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(
      `Card dimensions differ: ${actual.width}x${actual.height} versus ${expected.width}x${expected.height}`
    );
  }
  const options = { ...COMPOSER_CARD_EXPORT_PROFILE_V1, ...testCase.options };
  const layout = calculateSequenceCardLayout(
    testCase.sequence.steps.length + 1,
    {
      ...options,
      showDifficulty:
        testCase.options.showDifficulty ?? options.exportProfile === "print",
      showLoopGlyph: !!testCase.options.loopComponents?.length,
    }
  );
  const inset =
    options.exportProfile === "print"
      ? getCardFrameContentInset(options.frame?.bleedPx ?? 36)
      : 0;
  const regions = [
    {
      name: "header",
      x: inset,
      y: inset,
      width: layout.width,
      height: layout.headerHeight,
    },
    {
      name: "body",
      x: inset,
      y: inset + layout.headerHeight,
      width: layout.width,
      height: layout.height - layout.headerHeight - layout.footerHeight,
    },
    {
      name: "footer",
      x: inset,
      y: inset + layout.height - layout.footerHeight,
      width: layout.width,
      height: layout.footerHeight,
    },
  ].filter((region) => region.height > 0);
  return regions.map((region) => {
    const crop = (image: ParityImage) => {
      const data = new Uint8Array(region.width * region.height * 4);
      for (let row = 0; row < region.height; row++) {
        const start = ((region.y + row) * image.width + region.x) * 4;
        data.set(
          image.data.subarray(start, start + region.width * 4),
          row * region.width * 4
        );
      }
      return data;
    };
    const changedPixels = pixelmatch(
      crop(actual),
      crop(expected),
      undefined,
      region.width,
      region.height,
      { threshold: 0.1 }
    );
    return {
      name: region.name,
      changedPixels,
      percent: (100 * changedPixels) / (region.width * region.height),
    };
  });
}
