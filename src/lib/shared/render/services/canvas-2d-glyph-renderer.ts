import type { PictographData } from "../../pictograph/shared/domain/models/pictograph-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { GridMode } from "../../pictograph/grid/domain/enums/grid-enums";
import { getSvgImageCache, type DrawableImage } from "./svg-image-cache";
import { getSvgAssetLoader } from "./svg-asset-loader";
import {
  getLetterImagePath,
  isDashLetter,
} from "../../pictograph/tka-glyph/utils/letter-image-getter";
import { Letter, getLetterType } from "../../foundation/domain/models/letter";
import { LetterType } from "../../foundation/domain/models/letter-type";
import {
  parseTurnsTuple,
  shouldDisplayTurn,
  getTurnNumberImagePath,
  getTurnNumberWidth,
  getHalfMarkWidth,
  MARK_GAP,
  getSlotUnitWidth,
  getSlotOffsetX,
} from "../../pictograph/tka-glyph/utils/turn-tuple-parser";
import {
  interpretTurnColors,
  BLUE_HEX,
  RED_HEX,
} from "../../pictograph/tka-glyph/services/turn-color-interpreter";
import { calculateTurnPositions } from "../../pictograph/tka-glyph/utils/turn-position-calculator";
import { deriveTnDFromPictograph } from "../../pictograph/shared/domain/utils/tnd-deriver";
import {
  calculateReversalPositions,
  calculateHandColorKeyLayout,
  HAND_COLOR_KEY,
} from "../core";
import type { TurnsTupleGenerator } from "../../pictograph/arrow/positioning/placement/services/turns-tuple-generator";
import type { GridPlacement } from "../../pictograph/grid/domain/enums/grid-enums";
import type { MotionData } from "../../pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  getElementImagePath,
} from "../../pictograph/shared/domain/enums/pictograph-enums";
import {
  containElementalGlyph,
  getElementalGlyphBox,
} from "../../pictograph/shared/domain/constants/elemental-glyph-layout";
import { derivePropElementalTypeForStep } from "$lib/shared/shape-matrix/domain/prop-relationship";
import { getMotionColor } from "../../utils/svg-color-utils";
import { drawMonochromeImage, drawTintedImage } from "@tka/render-composition";

const VIEWBOX_SIZE = 950;

const TKA_GLYPH_X = 50;
const TKA_GLYPH_Y = 800;
const TKA_GLYPH_SCALE = 1;

const DOT_PADDING = 10;
const DOT_SIZE = 25;

const TURN_NUMBER_HEIGHT = 45;

const TND_GLYPH_WIDTH = 201.24;
const TND_GLYPH_HEIGHT = 133.6;
const TND_OFFSET_PERCENTAGE = 0.04;

const POSITION_GLYPH_Y = 50;
const POSITION_SCALE_FACTOR = 0.75;
const POSITION_SPACING = 25;
const POSITION_ARROW_WIDTH = 88.9;
const POSITION_ARROW_HEIGHT = 34.8;

const POSITION_LETTER_DIMENSIONS: Record<
  string,
  { width: number; height: number; yOffset: number }
> = {
  alpha: { width: 92.22, height: 100, yOffset: 10.0 },
  beta: { width: 66.05, height: 100, yOffset: 0.0 },
  gamma: { width: 79, height: 100.11, yOffset: 0.0 },
};

const STATIC_LETTERS: readonly Letter[] = [
  Letter.ALPHA,
  Letter.BETA,
  Letter.GAMMA,
];

export function drawTKAGlyphText(
  ctx: CanvasRenderingContext2D,
  letter: string,
  size: number,
  isDarkMode: boolean
): { width: number; height: number } {
  const scale = size / VIEWBOX_SIZE;
  const x = TKA_GLYPH_X * scale;
  const y = TKA_GLYPH_Y * scale;
  const fontSize = 100 * scale;

  ctx.font = `bold ${fontSize}px Georgia, serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = isDarkMode ? "#ffffff" : "#000000";
  ctx.fillText(letter, x, y);

  return { width: 100, height: 100 };
}

export function drawTurnText(
  ctx: CanvasRenderingContext2D,
  value: number | "fl",
  color: string,
  x: number,
  y: number,
  scale: number
): void {
  const fontSize = 40 * scale;
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = color;

  const text = value === "fl" ? "fl" : String(value);
  ctx.fillText(text, x, y);
}

export function drawDirectionDot(
  ctx: CanvasRenderingContext2D,
  pictograph: PictographData,
  letterDimensions: { width: number; height: number },
  scale: number,
  isDarkMode: boolean,
  turnsTupleGeneratorGetter?: () => TurnsTupleGenerator | undefined
): void {
  let turnsTuple = "(s, 0, 0)";
  try {
    const generator = turnsTupleGeneratorGetter?.();
    if (generator) {
      turnsTuple = generator.generateTurnsTuple(pictograph);
    } else {
      return;
    }
  } catch {
    return;
  }

  const parsed = parseTurnsTuple(turnsTuple);
  const direction = parsed.direction;

  if (direction !== "s" && direction !== "o") return;

  const baseX = TKA_GLYPH_X * scale;
  const baseY = TKA_GLYPH_Y * scale;

  const dotCenterX = letterDimensions.width / 2;

  let dotY: number;
  if (direction === "s") {
    dotY = -DOT_PADDING - DOT_SIZE;
  } else {
    dotY = letterDimensions.height + DOT_PADDING;
  }

  const drawX = baseX + (dotCenterX - DOT_SIZE / 2) * scale;
  const drawY = baseY + dotY * scale;
  const radius = (DOT_SIZE / 2) * scale;

  ctx.fillStyle = isDarkMode ? "#ffffff" : "#231f20";
  ctx.beginPath();
  ctx.arc(drawX + radius, drawY + radius, radius, 0, Math.PI * 2);
  ctx.fill();
}

export const drawColoredImage = drawTintedImage;

export async function drawTKAGlyph(
  ctx: CanvasRenderingContext2D,
  letter: Letter,
  size: number,
  isDarkMode: boolean
): Promise<{ width: number; height: number }> {
  const scale = size / VIEWBOX_SIZE;
  const x = TKA_GLYPH_X * scale;
  const y = TKA_GLYPH_Y * scale;

  try {
    const letterPath = getLetterImagePath(letter);

    const assetLoader = getSvgAssetLoader();
    const letterAsset = await assetLoader.getLetterAsset(letterPath);

    if (letterAsset) {
      const { image: letterImg, dimensions: letterDimensions } = letterAsset;

      const drawWidth = letterDimensions.width * TKA_GLYPH_SCALE * scale;
      const drawHeight = letterDimensions.height * TKA_GLYPH_SCALE * scale;

      drawMonochromeImage(
        ctx,
        letterImg,
        x,
        y,
        drawWidth,
        drawHeight,
        isDarkMode
      );

      return letterDimensions;
    }
  } catch (error) {
    console.warn("[Canvas2D] Failed to load letter image:", error);
  }

  return drawTKAGlyphText(ctx, String(letter), size, isDarkMode);
}

export async function drawTurnsColumn(
  ctx: CanvasRenderingContext2D,
  pictograph: PictographData,
  letterDimensions: { width: number; height: number },
  scale: number,
  isDarkMode: boolean,
  turnsTupleGeneratorGetter?: () => TurnsTupleGenerator | undefined,
  motionVisibility?: {
    showLeftMotion?: boolean;
    showRightMotion?: boolean;
    primaryPropColors?: { left: string; right: string } | null;
  }
): Promise<void> {
  let turnsTuple = "(s, 0, 0)";
  try {
    const generator = turnsTupleGeneratorGetter?.();
    if (generator) {
      turnsTuple = generator.generateTurnsTuple(pictograph);
    } else {
      return;
    }
  } catch {
    // Use default
  }

  const parsed = parseTurnsTuple(turnsTuple);
  // A slot renders if it has a displayable number OR is halved - a halved
  // 0-turn motion shows the mark alone (matches TurnsColumn.svelte's showTop/
  // showBottom; shouldDisplayTurn hides bare 0, the mark is what makes a
  // halved 0 visible).
  const showTop = shouldDisplayTurn(parsed.top) || parsed.topHalved;
  const showBottom = shouldDisplayTurn(parsed.bottom) || parsed.bottomHalved;

  if (!showTop && !showBottom) return;

  const turnColors = interpretTurnColors(pictograph.letter, pictograph);

  const displayColor = (color: string) =>
    color === BLUE_HEX
      ? (motionVisibility?.primaryPropColors?.left ?? color)
      : color === RED_HEX
        ? (motionVisibility?.primaryPropColors?.right ?? color)
        : color;

  const isColorHidden = (color: string) => {
    if (color === BLUE_HEX && motionVisibility?.showLeftMotion === false)
      return true;
    if (color === RED_HEX && motionVisibility?.showRightMotion === false)
      return true;
    return false;
  };

  const hasDash = isDashLetter(pictograph.letter);

  const positions = calculateTurnPositions(
    letterDimensions,
    TURN_NUMBER_HEIGHT,
    hasDash
  );

  // Own (number-only) width per slot, plus the shared column box each slot's
  // unit (number, or number+gap+mark when halved) centers within. Matches
  // TurnsColumn.svelte's topOwnWidth/columnWidth/topOffsetX exactly via the
  // shared getSlotUnitWidth/getSlotOffsetX helpers - don't re-derive inline.
  const topOwnWidth = getTurnNumberWidth(parsed.top);
  const bottomOwnWidth = getTurnNumberWidth(parsed.bottom);
  const markWidth = getHalfMarkWidth();

  const columnWidth = Math.max(
    getSlotUnitWidth(topOwnWidth, parsed.topHalved),
    getSlotUnitWidth(bottomOwnWidth, parsed.bottomHalved)
  );

  const topOffsetX = getSlotOffsetX(columnWidth, topOwnWidth, parsed.topHalved);
  const bottomOffsetX = getSlotOffsetX(
    columnWidth,
    bottomOwnWidth,
    parsed.bottomHalved
  );

  const baseX = TKA_GLYPH_X * scale;
  const baseY = TKA_GLYPH_Y * scale;

  const assetLoader = getSvgAssetLoader();

  if (showTop && !isColorHidden(turnColors.top)) {
    if (shouldDisplayTurn(parsed.top)) {
      const topPath = getTurnNumberImagePath(parsed.top);
      if (topPath) {
        try {
          const topImg = await assetLoader.getTurnNumberImage(parsed.top);
          if (topImg) {
            const drawX = baseX + (positions.top.x + topOffsetX) * scale;
            const drawY = baseY + positions.top.y * scale;
            const drawWidth = topOwnWidth * scale;
            const drawHeight = TURN_NUMBER_HEIGHT * scale;

            drawColoredImage(
              ctx,
              topImg,
              drawX,
              drawY,
              drawWidth,
              drawHeight,
              displayColor(turnColors.top)
            );
          }
        } catch {
          drawTurnText(
            ctx,
            parsed.top,
            displayColor(turnColors.top),
            baseX + positions.top.x * scale,
            baseY + positions.top.y * scale,
            scale
          );
        }
      }
    }

    if (parsed.topHalved) {
      try {
        const markImg = await assetLoader.getHalfMarkImage();
        if (markImg) {
          const markX =
            baseX +
            (positions.top.x + topOffsetX + topOwnWidth + MARK_GAP) * scale;
          const markY = baseY + positions.top.y * scale;
          drawColoredImage(
            ctx,
            markImg,
            markX,
            markY,
            markWidth * scale,
            TURN_NUMBER_HEIGHT * scale,
            displayColor(turnColors.top)
          );
        }
      } catch {
        // No text fallback for the mark - the number (if any) already
        // rendered above; missing mark art degrades to "just the number".
      }
    }
  }

  if (showBottom && !isColorHidden(turnColors.bottom)) {
    if (shouldDisplayTurn(parsed.bottom)) {
      const bottomPath = getTurnNumberImagePath(parsed.bottom);
      if (bottomPath) {
        try {
          const bottomImg = await assetLoader.getTurnNumberImage(parsed.bottom);
          if (bottomImg) {
            const drawX = baseX + (positions.bottom.x + bottomOffsetX) * scale;
            const drawY = baseY + positions.bottom.y * scale;
            const drawWidth = bottomOwnWidth * scale;
            const drawHeight = TURN_NUMBER_HEIGHT * scale;

            drawColoredImage(
              ctx,
              bottomImg,
              drawX,
              drawY,
              drawWidth,
              drawHeight,
              displayColor(turnColors.bottom)
            );
          }
        } catch {
          drawTurnText(
            ctx,
            parsed.bottom,
            displayColor(turnColors.bottom),
            baseX + positions.bottom.x * scale,
            baseY + positions.bottom.y * scale,
            scale
          );
        }
      }
    }

    if (parsed.bottomHalved) {
      try {
        const markImg = await assetLoader.getHalfMarkImage();
        if (markImg) {
          const markX =
            baseX +
            (positions.bottom.x + bottomOffsetX + bottomOwnWidth + MARK_GAP) *
              scale;
          const markY = baseY + positions.bottom.y * scale;
          drawColoredImage(
            ctx,
            markImg,
            markX,
            markY,
            markWidth * scale,
            TURN_NUMBER_HEIGHT * scale,
            displayColor(turnColors.bottom)
          );
        }
      } catch {
        // No text fallback for the mark - see the top-slot comment above.
      }
    }
  }
}

export async function drawTnDGlyph(
  ctx: CanvasRenderingContext2D,
  pictograph: PictographData,
  _gridMode: GridMode,
  size: number,
  isDarkMode: boolean
): Promise<void> {
  if (!pictograph.letter) return;

  try {
    const letterType = getLetterType(pictograph.letter as Letter);
    if (letterType !== LetterType.TYPE1) return;
  } catch {
    return;
  }

  const tndResult = deriveTnDFromPictograph(pictograph);
  if (!tndResult.tndMode) return;

  const scale = size / VIEWBOX_SIZE;
  const svgCache = getSvgImageCache();

  const offset = VIEWBOX_SIZE * TND_OFFSET_PERCENTAGE;
  const x = (VIEWBOX_SIZE - TND_GLYPH_WIDTH - offset) * scale;
  const y = (VIEWBOX_SIZE - TND_GLYPH_HEIGHT - offset) * scale;

  try {
    const tndPath = `/images/vtg_glyphs/${tndResult.tndMode}.svg`;
    const response = await fetch(tndPath);
    if (!response.ok) return;

    const svgText = await response.text();
    const cacheKey = `tnd_${tndResult.tndMode}_${isDarkMode}`;
    const img = await svgCache.getImage(svgText, cacheKey);

    const drawWidth = TND_GLYPH_WIDTH * scale;
    const drawHeight = TND_GLYPH_HEIGHT * scale;

    ctx.save();
    if (isDarkMode) {
      ctx.filter = "invert(1)";
    }
    ctx.drawImage(img, x, y, drawWidth, drawHeight);
    ctx.restore();
  } catch (error) {
    console.warn(`[Canvas2D] Failed to draw TnD glyph:`, error);
  }
}

export async function drawElementalGlyph(
  ctx: CanvasRenderingContext2D,
  pictograph: PictographData,
  _gridMode: GridMode,
  size: number,
  _isDarkMode: boolean
): Promise<void> {
  if (!pictograph.letter) return;

  try {
    const letterType = getLetterType(pictograph.letter as Letter);
    if (letterType !== LetterType.TYPE1) return;
  } catch {
    return;
  }

  const tndResult = deriveTnDFromPictograph(pictograph);
  if (!tndResult.elementalType) return;

  const box = getElementalGlyphBox(size);

  try {
    const elementalPath = getElementImagePath(tndResult.elementalType);
    const response = await fetch(elementalPath);
    if (!response.ok) return;

    const blob = await response.blob();
    const img = await createImageBitmap(blob);

    const fitted = containElementalGlyph(box, img.width, img.height);
    if (!fitted) return;

    ctx.save();
    ctx.drawImage(img, fitted.x, fitted.y, fitted.width, fitted.height);
    ctx.restore();
  } catch (error) {
    console.warn(`[Canvas2D] Failed to draw Elemental glyph:`, error);
  }
}

/**
 * Prop timing-and-direction glyph: the step's prop element in the top-right
 * slot. Same geometry as ElementalGlyph.svelte (corner="top-right") so live
 * cells and rasterized cells match.
 */
export async function drawPropElementalGlyph(
  ctx: CanvasRenderingContext2D,
  pictograph: PictographData,
  size: number
): Promise<void> {
  const elementalType = derivePropElementalTypeForStep(pictograph);
  if (!elementalType) return;

  const box = getElementalGlyphBox(size, 0, "top-right");

  try {
    const response = await fetch(getElementImagePath(elementalType));
    if (!response.ok) return;
    const img = await createImageBitmap(await response.blob());
    const fitted = containElementalGlyph(box, img.width, img.height);
    if (!fitted) return;

    ctx.save();
    ctx.drawImage(img, fitted.x, fitted.y, fitted.width, fitted.height);
    ctx.restore();
  } catch (error) {
    console.warn(`[Canvas2D] Failed to draw prop TnD glyph:`, error);
  }
}

export async function drawPlacementGlyph(
  ctx: CanvasRenderingContext2D,
  pictograph: PictographData,
  size: number,
  isDarkMode: boolean
): Promise<void> {
  if (
    pictograph.letter &&
    STATIC_LETTERS.includes(pictograph.letter as Letter)
  ) {
    return;
  }

  const startPlacement = pictograph.startPlacement;
  const endPlacement = pictograph.endPlacement;
  if (!startPlacement || !endPlacement) return;

  const extractGroup = (pos: GridPlacement | string): string | null => {
    const posStr = String(pos);
    const match = posStr.match(/[a-z]+/i);
    return match ? match[0].toLowerCase() : null;
  };

  const startGroup = extractGroup(startPlacement);
  const endGroup = extractGroup(endPlacement);
  if (!startGroup || !endGroup) return;

  const scale = size / VIEWBOX_SIZE;
  const svgCache = getSvgImageCache();

  const groupToSvg: Record<string, string> = {
    alpha: "/images/letters_trimmed/Type6/α.svg",
    beta: "/images/letters_trimmed/Type6/β.svg",
    gamma: "/images/letters_trimmed/Type6/γ.svg",
  };

  const startSvgPath = groupToSvg[startGroup];
  const endSvgPath = groupToSvg[endGroup];
  const arrowSvgPath = "/images/arrow.svg";

  if (!startSvgPath || !endSvgPath) return;

  const startDims = POSITION_LETTER_DIMENSIONS[startGroup];
  const endDims = POSITION_LETTER_DIMENSIONS[endGroup];

  if (!startDims) return;
  if (!endDims) return;

  const scaledStartWidth = startDims.width * POSITION_SCALE_FACTOR;
  const scaledStartHeight = startDims.height * POSITION_SCALE_FACTOR;
  const scaledEndWidth = endDims.width * POSITION_SCALE_FACTOR;
  const scaledEndHeight = endDims.height * POSITION_SCALE_FACTOR;
  const scaledArrowWidth = POSITION_ARROW_WIDTH * POSITION_SCALE_FACTOR;
  const scaledArrowHeight = POSITION_ARROW_HEIGHT * POSITION_SCALE_FACTOR;

  const maxHeight = Math.max(scaledStartHeight, scaledEndHeight);

  const totalWidth =
    scaledStartWidth +
    POSITION_SPACING * POSITION_SCALE_FACTOR +
    scaledArrowWidth +
    POSITION_SPACING * POSITION_SCALE_FACTOR +
    scaledEndWidth;
  const groupX = VIEWBOX_SIZE / 2 - totalWidth / 2;

  const centerLine = maxHeight / 2;

  try {
    const [startImg, arrowImg, endImg] = await Promise.all([
      loadPositionImage(
        startSvgPath,
        `pos_${startGroup}_${isDarkMode}`,
        svgCache
      ),
      loadPositionImage(arrowSvgPath, `pos_arrow_${isDarkMode}`, svgCache),
      loadPositionImage(endSvgPath, `pos_${endGroup}_${isDarkMode}`, svgCache),
    ]);

    if (!startImg || !arrowImg || !endImg) return;

    const drawX = groupX * scale;
    const drawY = POSITION_GLYPH_Y * scale;

    const startX = 0;
    const arrowX = scaledStartWidth + POSITION_SPACING * POSITION_SCALE_FACTOR;
    const endX =
      arrowX + scaledArrowWidth + POSITION_SPACING * POSITION_SCALE_FACTOR;

    const startYOffset = startDims.yOffset * POSITION_SCALE_FACTOR;
    drawMonochromeImage(
      ctx,
      startImg,
      drawX + startX * scale,
      drawY + (centerLine - scaledStartHeight / 2 + startYOffset) * scale,
      scaledStartWidth * scale,
      scaledStartHeight * scale,
      isDarkMode
    );

    drawMonochromeImage(
      ctx,
      arrowImg,
      drawX + arrowX * scale,
      drawY + (centerLine - scaledArrowHeight / 2) * scale,
      scaledArrowWidth * scale,
      scaledArrowHeight * scale,
      isDarkMode
    );

    const endYOffset = endDims.yOffset * POSITION_SCALE_FACTOR;
    drawMonochromeImage(
      ctx,
      endImg,
      drawX + endX * scale,
      drawY + (centerLine - scaledEndHeight / 2 + endYOffset) * scale,
      scaledEndWidth * scale,
      scaledEndHeight * scale,
      isDarkMode
    );
  } catch (error) {
    console.warn(`[Canvas2D] Failed to draw Position glyph:`, error);
  }
}

const LOCATION_LABELS: Record<string, string> = {
  n: "N",
  e: "E",
  s: "S",
  w: "W",
  ne: "NE",
  se: "SE",
  sw: "SW",
  nw: "NW",
  c: "C",
};

const SOLO_GLYPH_Y = 50;
const SOLO_GLYPH_FONT_SIZE = 70;
const SOLO_ARROW_FONT_SIZE = 50;
const SOLO_ROTATION_FONT_SIZE = 45;
const SOLO_SPACING = 15;

export function drawSoloMotionGlyph(
  ctx: CanvasRenderingContext2D,
  pictograph: PictographData,
  size: number,
  isDarkMode: boolean,
  showLeftMotion: boolean,
  showRightMotion: boolean,
  isHandPathMode: boolean
): void {
  const visibleMotion: MotionData | null = showLeftMotion
    ? (pictograph.motions?.left ?? null)
    : showRightMotion
      ? (pictograph.motions?.right ?? null)
      : null;

  if (!visibleMotion) return;

  const startLoc =
    LOCATION_LABELS[visibleMotion.startLocation] ?? visibleMotion.startLocation;
  const endLoc =
    LOCATION_LABELS[visibleMotion.endLocation] ?? visibleMotion.endLocation;
  if (!startLoc || !endLoc) return;

  const motionColor = showLeftMotion ? HandSide.LEFT : HandSide.RIGHT;
  const colorHex = getMotionColor(motionColor, isDarkMode ? "dark" : "light");

  const scale = size / VIEWBOX_SIZE;
  const fontSize = SOLO_GLYPH_FONT_SIZE * scale;
  const arrowFontSize = SOLO_ARROW_FONT_SIZE * scale;
  const rotFontSize = SOLO_ROTATION_FONT_SIZE * scale;

  ctx.save();
  ctx.textBaseline = "top";

  const locationFont = `bold ${fontSize}px Georgia, serif`;
  const arrowFont = `${arrowFontSize}px Georgia, serif`;
  const rotFont = `${rotFontSize}px Georgia, serif`;

  ctx.font = locationFont;
  const startWidth = ctx.measureText(startLoc).width;
  const endWidth = ctx.measureText(endLoc).width;

  ctx.font = arrowFont;
  const arrowText = "→";
  const arrowWidth = ctx.measureText(arrowText).width;

  const spacing = SOLO_SPACING * scale;
  let totalWidth = startWidth + spacing + arrowWidth + spacing + endWidth;

  const rotDir = visibleMotion.rotationDirection;
  const showRotation = !isHandPathMode && rotDir && rotDir !== "noRotation";
  let rotText = "";
  let rotWidth = 0;

  if (showRotation) {
    rotText = rotDir === "cw" ? " ↻" : " ↺";
    ctx.font = rotFont;
    rotWidth = ctx.measureText(rotText).width;
    totalWidth += rotWidth;
  }

  const baseX = (VIEWBOX_SIZE * scale - totalWidth) / 2;
  const baseY = SOLO_GLYPH_Y * scale;

  const arrowYShift = (fontSize - arrowFontSize) / 2;

  ctx.fillStyle = colorHex;

  ctx.font = locationFont;
  ctx.fillText(startLoc, baseX, baseY);

  ctx.font = arrowFont;
  ctx.fillText(arrowText, baseX + startWidth + spacing, baseY + arrowYShift);

  ctx.font = locationFont;
  ctx.fillText(
    endLoc,
    baseX + startWidth + spacing + arrowWidth + spacing,
    baseY
  );

  if (showRotation) {
    ctx.font = rotFont;
    const rotX = baseX + startWidth + spacing + arrowWidth + spacing + endWidth;
    ctx.fillText(rotText, rotX, baseY + (fontSize - rotFontSize) / 2);
  }

  ctx.restore();
}

async function loadPositionImage(
  svgPath: string,
  cacheKey: string,
  svgCache: ReturnType<typeof getSvgImageCache>
): Promise<DrawableImage | null> {
  try {
    const response = await fetch(svgPath);
    if (!response.ok) return null;
    const svgText = await response.text();
    return await svgCache.getImage(svgText, cacheKey);
  } catch {
    return null;
  }
}

export function drawReversalIndicators(
  ctx: CanvasRenderingContext2D,
  pictograph: PictographData | StepData,
  size: number,
  isDarkMode: boolean,
  motionVisibility?: {
    showLeftMotion?: boolean;
    showRightMotion?: boolean;
    primaryPropColors?: { left: string; right: string } | null;
  }
): void {
  let leftReversal = false;
  let rightReversal = false;

  if (isStepData(pictograph)) {
    leftReversal =
      (pictograph.leftReversal ?? false) &&
      (motionVisibility?.showLeftMotion ?? true);
    rightReversal =
      (pictograph.rightReversal ?? false) &&
      (motionVisibility?.showRightMotion ?? true);
  }

  const { dots } = calculateReversalPositions(
    leftReversal,
    rightReversal,
    isDarkMode
  );

  if (dots.length === 0) return;

  const scale = size / VIEWBOX_SIZE;

  for (const dot of dots) {
    const hand =
      dot.color.toLowerCase() ===
      getMotionColor(HandSide.LEFT, isDarkMode ? "dark" : "light").toLowerCase()
        ? "left"
        : "right";
    ctx.fillStyle = motionVisibility?.primaryPropColors?.[hand] ?? dot.color;
    ctx.beginPath();
    ctx.arc(dot.cx * scale, dot.cy * scale, dot.r * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function isStepData(
  pictograph: PictographData | StepData
): pictograph is StepData {
  return "leftReversal" in pictograph || "rightReversal" in pictograph;
}

/**
 * Start-position hand colour key (bottom-centre band).
 *
 * Same geometry as PictographRenderer and the MCP renderer via the shared
 * calculateHandColorKeyLayout, so a printed card front carries the same key
 * as the live viewer. Uses the card serif so it matches the "Start" label the
 * compositor draws in the same cell.
 *
 * @param offsetX Left edge of the 950-unit core inside a wider (duration) cell.
 */
export function drawHandColorKey(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  size: number,
  isDarkMode: boolean,
  hands: {
    showLeft: boolean;
    showRight: boolean;
    primaryPropColors?: { left: string; right: string } | null;
  },
  offsetX = 0
): void {
  const layout = calculateHandColorKeyLayout(hands.showLeft, hands.showRight);
  if (layout.entries.length === 0) return;

  const scale = size / VIEWBOX_SIZE;
  const centerX = offsetX + (VIEWBOX_SIZE / 2) * scale;
  const theme = isDarkMode ? "dark" : "light";

  ctx.save();
  ctx.font = `${HAND_COLOR_KEY.FONT_WEIGHT} ${HAND_COLOR_KEY.FONT_SIZE * scale}px Gelasio, Georgia, serif`;
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  for (const entry of layout.entries) {
    const hand = entry.hand === "left" ? HandSide.LEFT : HandSide.RIGHT;
    ctx.fillStyle =
      hands.primaryPropColors?.[entry.hand] ?? getMotionColor(hand, theme);
    ctx.beginPath();
    ctx.arc(
      centerX + entry.swatchX * scale,
      layout.centerY * scale,
      layout.swatchRadius * scale,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.fillStyle = isDarkMode ? "#ffffff" : "#231f20";
    ctx.fillText(
      entry.label,
      centerX + entry.labelX * scale,
      layout.baselineY * scale
    );
  }
  ctx.restore();
}
