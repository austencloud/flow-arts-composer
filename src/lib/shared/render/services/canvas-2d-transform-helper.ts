import type { DrawableImage } from "./svg-image-cache";
import type { PreparedPictographData } from "../../pictograph/shared/domain/models/prepared-pictograph-data";
import {
  HandSide,
  type HandSide as HandSideValue,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { DirectRenderOptions } from "./IDirectRenderer";
import { buildArrowHaloFilter } from "../../pictograph/arrow/rendering/arrow-halo";
import { isBuugengFamilyProp } from "../core/constants/prop-classification";

const SVG_OVERFLOW_RATIO = 0.15;

const TKA_GLYPH_X = 50;
const TKA_GLYPH_Y = 800;

const DASH_WIDTH = 70;
const DASH_HEIGHT = 20;
const DASH_GAP = 10;
const DASH_RADIUS = 9.5;
const DASH_FILL_DARK = "#231f20";
const DASH_FILL_LIGHT = "#ffffff";

const _VIEWBOX_SIZE = 950;

export function wrapSvgContent(
  innerContent: string,
  viewBoxWidth: number,
  viewBoxHeight: number,
  expandViewBox: boolean = false,
  fullViewBox?: string,
  // When provided (arrows only), bake the shared background-matching halo <filter>
  // into the wrapped SVG so the composed image matches the live renderer. Props
  // never pass this — no prop halo. See arrow-halo.ts for the single definition.
  halo?: { id: string; isDarkMode: boolean }
): {
  svg: string;
  offsetX: number;
  offsetY: number;
  newWidth: number;
  newHeight: number;
} {
  let minX = 0,
    minY = 0;
  if (fullViewBox) {
    const parts = fullViewBox.split(/\s+/);
    minX = parseFloat(parts[0] || "0") || 0;
    minY = parseFloat(parts[1] || "0") || 0;
  }

  // Wrap the content in a halo-filtered group (filter region is relative to the
  // group's bbox — the arrow — so the blur tracks the arrow, not the viewBox).
  const content = halo
    ? `<defs>${buildArrowHaloFilter(halo.id, halo.isDarkMode)}</defs><g filter="url(#${halo.id})">${innerContent}</g>`
    : innerContent;

  if (!expandViewBox) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${minX} ${minY} ${viewBoxWidth} ${viewBoxHeight}" width="${viewBoxWidth}" height="${viewBoxHeight}">${content}</svg>`,
      offsetX: 0,
      offsetY: 0,
      newWidth: viewBoxWidth,
      newHeight: viewBoxHeight,
    };
  }

  const expandX = viewBoxWidth * SVG_OVERFLOW_RATIO;
  const expandY = viewBoxHeight * SVG_OVERFLOW_RATIO;
  const newWidth = viewBoxWidth + expandX * 2;
  const newHeight = viewBoxHeight + expandY * 2;

  const newMinX = minX - expandX;
  const newMinY = minY - expandY;

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${newMinX} ${newMinY} ${newWidth} ${newHeight}" width="${newWidth}" height="${newHeight}">${content}</svg>`,
    offsetX: expandX,
    offsetY: expandY,
    newWidth,
    newHeight,
  };
}

export function shouldMirrorProp(
  color: HandSideValue,
  pictograph: PreparedPictographData,
  options: DirectRenderOptions
): boolean {
  const motionData = pictograph.motions?.[color];
  if (!motionData) return false;

  let actualPropType: string | undefined;
  if (color === HandSide.LEFT && options.visibility.leftPropType) {
    actualPropType = options.visibility.leftPropType;
  } else if (color === HandSide.RIGHT && options.visibility.rightPropType) {
    actualPropType = options.visibility.rightPropType;
  } else {
    actualPropType = motionData.propType;
  }

  if (actualPropType?.toLowerCase() === "hand" && color === HandSide.RIGHT) {
    return true;
  }

  // Buugeng chirality. This is the raster twin of PropSvg's shouldMirror: an
  // S-shaped prop is 180-degree-rotation invariant, so the flip setting can
  // only be honored by mirroring. Without this branch the choreo-card cells
  // and every other rasterized pictograph rendered the unflipped prop while
  // the 2D animation canvas (which reads the same setting) rendered the
  // flipped one.
  if (actualPropType && isBuugengFamilyProp(actualPropType)) {
    return color === HandSide.LEFT
      ? (options.visibility.leftBuugengFlipped ?? false)
      : (options.visibility.rightBuugengFlipped ?? false);
  }

  return false;
}

export function drawElementWithTransform(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: DrawableImage,
  params: {
    x: number;
    y: number;
    rotation: number;
    centerX: number;
    centerY: number;
    viewBoxWidth: number;
    viewBoxHeight: number;
    scale: number;
    shouldMirror: boolean;
  }
): void {
  const {
    x,
    y,
    rotation,
    centerX,
    centerY,
    viewBoxWidth,
    viewBoxHeight,
    scale,
    shouldMirror,
  } = params;

  ctx.save();

  ctx.translate(x, y);

  ctx.rotate((rotation * Math.PI) / 180);

  if (shouldMirror) {
    ctx.scale(-1, 1);
  }

  ctx.scale(scale, scale);

  ctx.translate(-centerX, -centerY);

  ctx.drawImage(img, 0, 0, viewBoxWidth, viewBoxHeight);

  ctx.restore();
}

export function drawDash(
  ctx: CanvasRenderingContext2D,
  letterDimensions: { width: number; height: number },
  scale: number,
  isDarkMode: boolean
): void {
  const glyphScale = 1.0;
  const baseX = TKA_GLYPH_X * scale;
  const baseY = TKA_GLYPH_Y * scale;

  const letterWidth = letterDimensions.width * glyphScale * scale;
  const letterHeight = letterDimensions.height * glyphScale * scale;
  const dashWidth = DASH_WIDTH * scale;
  const dashHeight = DASH_HEIGHT * scale;
  const dashGap = DASH_GAP * scale;
  const dashRadius = DASH_RADIUS * scale;

  const dashX = baseX + letterWidth + dashGap;
  const dashY = baseY + (letterHeight - dashHeight) / 2;

  ctx.save();
  ctx.fillStyle = isDarkMode ? DASH_FILL_LIGHT : DASH_FILL_DARK;
  ctx.beginPath();
  ctx.roundRect(dashX, dashY, dashWidth, dashHeight, dashRadius);
  ctx.fill();
  ctx.restore();
}
