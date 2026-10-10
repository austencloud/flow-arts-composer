import type { LayoutRegion } from "#lib/shared/media-composition/domain/media-layout-schema.js";

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MediaFitInput {
  sourceWidth: number;
  sourceHeight: number;
  regionWidth: number;
  regionHeight: number;
  fit: LayoutRegion["fit"];
}

export interface MediaFitResult {
  /** Destination rectangle relative to the region. Cover may extend past it. */
  drawRect: PixelRect;
  /** Source pixels visible after the region clips the destination rectangle. */
  visibleSourceRect: PixelRect;
}

/** Keep a selected part of a source proportional inside its placed box. */
export function calculateSourceCropFit(input: {
  sourceWidth: number;
  sourceHeight: number;
  crop: { left: number; top: number; right: number; bottom: number };
  regionWidth: number;
  regionHeight: number;
}): PixelRect {
  return calculateMediaFit({
    sourceWidth: input.sourceWidth * (input.crop.right - input.crop.left),
    sourceHeight: input.sourceHeight * (input.crop.bottom - input.crop.top),
    regionWidth: input.regionWidth,
    regionHeight: input.regionHeight,
    fit: "contain",
  }).drawRect;
}

function assertPositive(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number`);
  }
}

const QUARTER_TURNS = [
  { cos: 1, sin: 0 },
  { cos: 0, sin: 1 },
  { cos: -1, sin: 0 },
  { cos: 0, sin: -1 },
] as const;

/**
 * The cosine and sine of a turn in degrees, exact at quarter turns.
 * `Math.cos(Math.PI / 2)` is 6e-17 rather than zero, and that remainder would
 * read as a sliver of picture past the slot's edge.
 */
export function turnOf(degrees: number): { cos: number; sin: number } {
  const quarter = degrees / 90;
  if (Number.isInteger(quarter)) {
    return QUARTER_TURNS[((quarter % 4) + 4) % 4]!;
  }
  const radians = (degrees * Math.PI) / 180;
  return { cos: Math.cos(radians), sin: Math.sin(radians) };
}

/** The width and height of the box a turned rectangle takes up. */
export function turnedExtent(
  width: number,
  height: number,
  degrees: number
): { width: number; height: number } {
  const { cos, sin } = turnOf(degrees);
  const c = Math.abs(cos);
  const s = Math.abs(sin);
  return { width: width * c + height * s, height: width * s + height * c };
}

/**
 * Where a layer's pan lands, in region pixels.
 *
 * A pan is stored as -0.5..0.5 — hard one way to hard the other — and resolved
 * against the source that the slot is currently hiding, never against the slot
 * itself. That is the difference between a crop and a shove: a `cover` fit on
 * footage that already matches the slot's aspect hides nothing, so the pan
 * resolves to zero and the frame cannot open a gap beside the picture. Scale
 * the layer up and the same -0.5..0.5 reaches the new edges.
 *
 * A turned picture hides what its turned outline covers past the slot, so
 * the overflow is measured on that outline. After a quarter turn the picture's
 * long side runs the other way, and so does the pan.
 */
export function resolvePanOffset(input: {
  drawWidth: number;
  drawHeight: number;
  regionWidth: number;
  regionHeight: number;
  scale: number;
  translateX: number;
  translateY: number;
  rotationDegrees?: number;
}): { x: number; y: number } {
  const extent = turnedExtent(
    input.drawWidth * input.scale,
    input.drawHeight * input.scale,
    input.rotationDegrees ?? 0
  );
  const overscanX = Math.max(0, extent.width - input.regionWidth);
  const overscanY = Math.max(0, extent.height - input.regionHeight);
  const clamp = (value: number) => Math.min(0.5, Math.max(-0.5, value));
  return {
    x: clamp(input.translateX) * overscanX,
    y: clamp(input.translateY) * overscanY,
  };
}

/**
 * One geometry owner for browser preview and the future frame evaluator.
 * Coordinates are source/destination pixels, with centered positioning.
 */
export function calculateMediaFit(input: MediaFitInput): MediaFitResult {
  assertPositive("sourceWidth", input.sourceWidth);
  assertPositive("sourceHeight", input.sourceHeight);
  assertPositive("regionWidth", input.regionWidth);
  assertPositive("regionHeight", input.regionHeight);

  if (input.fit === "fill") {
    return {
      drawRect: {
        x: 0,
        y: 0,
        width: input.regionWidth,
        height: input.regionHeight,
      },
      visibleSourceRect: {
        x: 0,
        y: 0,
        width: input.sourceWidth,
        height: input.sourceHeight,
      },
    };
  }

  const scaleX = input.regionWidth / input.sourceWidth;
  const scaleY = input.regionHeight / input.sourceHeight;
  const scale =
    input.fit === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const drawWidth = input.sourceWidth * scale;
  const drawHeight = input.sourceHeight * scale;
  const drawX = (input.regionWidth - drawWidth) / 2;
  const drawY = (input.regionHeight - drawHeight) / 2;

  if (input.fit === "contain") {
    return {
      drawRect: { x: drawX, y: drawY, width: drawWidth, height: drawHeight },
      visibleSourceRect: {
        x: 0,
        y: 0,
        width: input.sourceWidth,
        height: input.sourceHeight,
      },
    };
  }

  const visibleWidth = input.regionWidth / scale;
  const visibleHeight = input.regionHeight / scale;
  return {
    drawRect: { x: drawX, y: drawY, width: drawWidth, height: drawHeight },
    visibleSourceRect: {
      x: (input.sourceWidth - visibleWidth) / 2,
      y: (input.sourceHeight - visibleHeight) / 2,
      width: visibleWidth,
      height: visibleHeight,
    },
  };
}
