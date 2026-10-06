import pixelmatch from "pixelmatch";
import {
  calculateSequenceCardLayout,
  COMPOSER_CARD_EXPORT_PROFILE_V1,
  getCardFrameContentInset,
} from "@tka/render-composition";
import type { CardParityCase } from "./card-parity-cases";
import {
  calculateHandColorKeyLayout,
  getGridJoinLayout,
  getNormalHandPointCoordinates,
  HAND_COLOR_KEY,
  type GridMode,
} from "@tka/render-core";

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
  // At 210px print cells, identical bundled glyphs leave 38 edge pixels in
  // this 1,026px crop (3.71%) across Chromium and native Canvas rasterizers.
  // Missing-key controls cover both this smallest print crop and normal cards.
  handColorKey: 4,
  // A 9-36px crop around each Start-cell prop's hand point. The prop covers
  // the grid's hand point there, so a dot painted over it shows here although
  // it vanishes inside the body tolerance. Matching cards measure 0% in every
  // case; the old dot measured 8.33% or more, the painted control 5.56%.
  leftHandPoint: 4,
  rightHandPoint: 4,
};

/** Half the side of each hand-point crop, in the 950 viewBox. */
const HAND_POINT_HALF_SIDE = 8;

/** The grid's hand-point radius in the 950 viewBox, as the painters draw it. */
const HAND_POINT_RADIUS = 4.7;

/** Where each hand's Start-cell prop crosses its grid's hand point (950 box). */
function startHandPoints(testCase: CardParityCase) {
  const gridMode = testCase.sequence.gridMode as GridMode;
  const join = testCase.options.conjoined;
  const joined = join ? getGridJoinLayout(join, gridMode) : null;
  return (["left", "right"] as const).map((hand) => {
    const location =
      testCase.sequence.startPlacement.motions[hand].startLocation;
    if (!joined)
      return {
        hand,
        ...getNormalHandPointCoordinates(location, gridMode),
        pointScale: 1,
      };
    const point = joined.points.find(
      (candidate) =>
        candidate.kind === "hand" &&
        candidate.members.some(
          (member) => member.hand === hand && member.location === location
        )
    );
    if (!point) throw new Error(`No joined ${hand} hand point at ${location}`);
    return {
      hand,
      x: 475 + (point.x - 475) * joined.scale,
      y: 475 + (point.y - 475) * joined.scale,
      pointScale: joined.scale,
    };
  });
}

function cardGeometry(testCase: CardParityCase) {
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
  return {
    layout,
    inset,
    // The Start cell is the grid's first cell.
    cellX: inset + (layout.gridStartX ?? 0),
    cellY: inset + layout.gridStartY,
    scale: (layout.cellSize ?? options.cellSize) / 950,
  };
}

/** Each Start-cell hand point in card pixels, with its drawn radius. */
export function startHandPointPixels(testCase: CardParityCase) {
  const { cellX, cellY, scale } = cardGeometry(testCase);
  return startHandPoints(testCase).map((point) => ({
    hand: point.hand,
    x: cellX + point.x * scale,
    y: cellY + point.y * scale,
    radius: HAND_POINT_RADIUS * point.pointScale * scale,
  }));
}

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

/**
 * `startHandPoints` adds the Start-cell hand-point crops. The MCP comparison
 * measures them; the live-card gate has no measurement for them yet.
 */
export function cardParityMetrics(
  actual: ParityImage,
  expected: ParityImage,
  testCase: CardParityCase,
  { startHandPoints: withHandPoints = false } = {}
) {
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(
      `Card dimensions differ: ${actual.width}x${actual.height} versus ${expected.width}x${expected.height}`
    );
  }
  const { layout, inset, cellX, cellY, scale } = cardGeometry(testCase);
  const key = calculateHandColorKeyLayout(true, true);
  const keyLeft = 475 + key.entries[0]!.swatchX - key.swatchRadius - 8;
  const keyRight =
    475 + key.entries[1]!.labelX + HAND_COLOR_KEY.LABEL_WIDTH + 8;
  const keyTop = key.baselineY - HAND_COLOR_KEY.FONT_SIZE - 8;
  const regions = [
    {
      name: "handColorKey",
      x: Math.floor(cellX + keyLeft * scale),
      y: Math.floor(cellY + keyTop * scale),
      width: Math.ceil((keyRight - keyLeft) * scale),
      height: Math.ceil((HAND_COLOR_KEY.FONT_SIZE + 16) * scale),
    },
    ...(withHandPoints ? startHandPoints(testCase) : []).map((point) => ({
      name: `${point.hand}HandPoint`,
      x: Math.floor(cellX + (point.x - HAND_POINT_HALF_SIDE) * scale),
      y: Math.floor(cellY + (point.y - HAND_POINT_HALF_SIDE) * scale),
      width: Math.ceil(2 * HAND_POINT_HALF_SIDE * scale),
      height: Math.ceil(2 * HAND_POINT_HALF_SIDE * scale),
    })),
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
