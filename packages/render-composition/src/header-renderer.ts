import type {
  LOOPComponentId,
  LetterStyle,
  GlyphImageData,
  CompressedSegment,
} from "./types.js";
import { tokenizeGlyphWord } from "./glyph-word.js";
import {
  BADGE_SIZE_SCALE,
  BADGE_PADDING_SCALE,
  BADGE_NUMBER_FONT_SCALE,
  BADGE_BORDER_WIDTH_DIVISOR,
  HEADER_WORD_FONT_SCALE,
  HEADER_WORD_BREATHING_GAP_SCALE,
  LOOP_ICON_SIZE_SCALE,
  LOOP_ICON_STRIP_OFFSET_SCALE,
} from "./dimensions.js";
import {
  DIFFICULTY_LEVELS,
  DEFAULT_DIFFICULTY_STYLE,
  DIFFICULTY_FONT_FAMILY,
  applyGradientStops,
} from "./difficulty-config.js";
import {
  renderLoopIconStrip,
  computeLoopIconStripWidth,
  type LoopRotationPeriod,
  type LoopInversionPeriod,
  type LoopReflectionAxis,
} from "./loop-icons.js";
import { drawMonochromeImage } from "./tinted-image.js";

export interface HeaderOptions {
  canvasWidth: number;
  headerHeight: number;
  word: string;
  /** Overrides the shared badge/icon diameter ratio for a specific surface. */
  indicatorSizeScale?: number;
  difficultyLevel?: number;
  showDifficultyBadge?: boolean;
  loopComponents?: Set<LOOPComponentId>;
  /** When rotated is active, picks fa-arrows-spin (quartered) vs fa-rotate (halved) */
  rotationPeriod?: LoopRotationPeriod;
  /** When inverted is active, picks checkerboard circle (quartered) vs circle-half-stroke (halved) */
  inversionPeriod?: LoopInversionPeriod;
  /** Exact reflection axis for the shared Reflection glyph. */
  reflectionAxis?: LoopReflectionAxis;
  /**
   * Components rendered LAST in the icon strip, after one faded separator
   * dot — same segment grammar as the word display's group-dot. Absent or
   * empty renders pixel-identical to before this option existed.
   */
  overlayComponents?: Set<LOOPComponentId>;
  darkMode?: boolean;
  letterStyles?: LetterStyle[];
  /** Override header background color */
  backgroundColor?: string;
  /** Override header border color */
  borderColor?: string;
  /** Elemental accent hex color — auto-tinted for bg/border when no explicit overrides */
  accentColor?: string;
  /** CIELAB-tuned tint opacity (0–1) for accent background; overrides default "18" hex */
  accentTintOpacity?: number;
  /** When present, word slot renders glyph images instead of Georgia text */
  glyphImages?: Map<string, GlyphImageData>;
  /** Skip browser-only canvas filters when glyph bitmaps are already theme-colored */
  glyphImagesAreThemeColored?: boolean;
  /** When present, renders compressed segments with bracket notation */
  compressedSegments?: CompressedSegment[];
}

const LETTER_GAP_RATIO = 0.04; // gap between letters as fraction of headerHeight
const GLYPH_HEIGHT_RATIO = 0.65; // glyph height as fraction of headerHeight
// Dash overlay constants in SVG coordinate units (from Dash.svelte)
const DASH_W_SVG = 70;
const DASH_H_SVG = 20;
const DASH_GAP_SVG = 10;
const DASH_RADIUS_SVG = 9.5;
const ALPHA_BASELINE_SHIFT = 0.1;

interface WordHorizontalBounds {
  left: number;
  right: number;
}

export interface HeaderWordSideInsetOptions {
  headerHeight: number;
  indicatorSizeScale?: number;
  showDifficultyBadge?: boolean;
  loopComponents?: Set<LOOPComponentId>;
  overlayComponents?: Set<LOOPComponentId>;
}

/**
 * Reserve equal space around the centered word using the wider of the level
 * badge and LOOP strip. Long names then scale down before either neighbor can
 * make the header feel pinched.
 */
export function calculateHeaderWordSideInset(
  options: HeaderWordSideInsetOptions
): number {
  const {
    headerHeight,
    indicatorSizeScale = BADGE_SIZE_SCALE,
    showDifficultyBadge = true,
    loopComponents,
    overlayComponents,
  } = options;
  const badgeSize = headerHeight * indicatorSizeScale;
  const badgePadding = headerHeight * BADGE_PADDING_SCALE;
  const leftIndicatorZone = showDifficultyBadge ? badgePadding + badgeSize : 0;

  let rightIndicatorZone = 0;
  if (loopComponents && loopComponents.size > 0) {
    const iconSize = badgeSize * LOOP_ICON_SIZE_SCALE;
    rightIndicatorZone =
      badgePadding +
      iconSize * LOOP_ICON_STRIP_OFFSET_SCALE +
      computeLoopIconStripWidth(loopComponents, iconSize, overlayComponents);
  }

  return (
    Math.max(leftIndicatorZone, rightIndicatorZone) +
    headerHeight * HEADER_WORD_BREATHING_GAP_SCALE
  );
}

function fitWordToBounds(
  totalWidth: number,
  canvasWidth: number,
  bounds: WordHorizontalBounds
): { scale: number; cursorX: number } {
  const availableWidth = Math.max(0, bounds.right - bounds.left);
  if (totalWidth <= 0 || totalWidth <= availableWidth) {
    return { scale: 1, cursorX: canvasWidth / 2 - totalWidth / 2 };
  }

  const scale = availableWidth / totalWidth;
  const fittedWidth = totalWidth * scale;
  return {
    scale,
    cursorX: bounds.left + (availableWidth - fittedWidth) / 2,
  };
}

function isAlphaToken(token: string): boolean {
  return token === "α";
}

function renderGlyphWord(
  ctx: CanvasRenderingContext2D,
  word: string,
  glyphImages: Map<string, GlyphImageData>,
  canvasWidth: number,
  headerHeight: number,
  horizontalBounds: WordHorizontalBounds,
  darkMode: boolean,
  glyphImagesAreThemeColored: boolean
): void {
  if (!word?.trim()) return;

  const availableH = headerHeight * GLYPH_HEIGHT_RATIO;
  const letterGap = headerHeight * LETTER_GAP_RATIO;
  const verticalCenter = headerHeight / 2;

  const tokens = tokenizeGlyphWord(word);

  // First pass: compute total row width for centering
  let totalWidth = 0;
  for (const token of tokens) {
    const data = glyphImages.get(token);
    if (!data) continue;
    const scale = availableH / data.naturalHeight;
    const glyphW = data.naturalWidth * scale;
    totalWidth += glyphW;
    if (data.isDash) {
      totalWidth += DASH_GAP_SVG * scale + DASH_W_SVG * scale;
    }
    totalWidth += letterGap;
  }
  // Remove trailing gap (guard on totalWidth, not tokens.length, to handle all-missing case)
  if (totalWidth > 0) totalWidth -= letterGap;

  // Second pass: draw
  const widthFit = fitWordToBounds(totalWidth, canvasWidth, horizontalBounds);
  const fittedGlyphHeight = availableH * widthFit.scale;
  const fittedLetterGap = letterGap * widthFit.scale;
  let cursorX = widthFit.cursorX;
  // Applied directly — no parent CSS invert filter in canvas context unlike TKAGlyph.svelte
  const dashColor = darkMode ? "#ffffff" : "#231f20";

  for (const token of tokens) {
    const data = glyphImages.get(token);
    if (!data) continue;
    const scale = (availableH / data.naturalHeight) * widthFit.scale;
    const glyphW = data.naturalWidth * scale;
    const baseGlyphY = verticalCenter - fittedGlyphHeight / 2;
    const glyphY =
      baseGlyphY +
      (isAlphaToken(token) ? fittedGlyphHeight * ALPHA_BASELINE_SHIFT : 0);

    drawMonochromeImage(
      ctx,
      data.image,
      cursorX,
      glyphY,
      glyphW,
      fittedGlyphHeight,
      darkMode,
      glyphImagesAreThemeColored
    );

    if (data.isDash) {
      const dashW = DASH_W_SVG * scale;
      const dashH = DASH_H_SVG * scale;
      const dashGap = DASH_GAP_SVG * scale;
      const dashX = cursorX + glyphW + dashGap;
      const dashY = verticalCenter - dashH / 2;
      ctx.beginPath();
      ctx.roundRect(dashX, dashY, dashW, dashH, DASH_RADIUS_SVG * scale);
      ctx.fillStyle = dashColor;
      ctx.fill();
      cursorX += glyphW + dashGap + dashW + fittedLetterGap;
    } else {
      cursorX += glyphW + fittedLetterGap;
    }
  }
}

const DOT_SIZE_SCALE = 0.15;
const DOT_OPACITY = 0.4;
const GROUP_GAP_SCALE = 0.35;

function renderCompressedGlyphWord(
  ctx: CanvasRenderingContext2D,
  segments: CompressedSegment[],
  glyphImages: Map<string, GlyphImageData>,
  canvasWidth: number,
  headerHeight: number,
  horizontalBounds: WordHorizontalBounds,
  darkMode: boolean,
  glyphImagesAreThemeColored: boolean
): void {
  const availableH = headerHeight * GLYPH_HEIGHT_RATIO;
  const letterGap = headerHeight * LETTER_GAP_RATIO;
  const verticalCenter = headerHeight / 2;
  const dashColor = darkMode ? "#ffffff" : "#231f20";
  const dotColor = darkMode ? "#ffffff" : "#1f2937";
  const dotRadius = (headerHeight * DOT_SIZE_SCALE) / 2;
  const groupGap = headerHeight * GROUP_GAP_SCALE;

  // First pass: compute total width
  let totalWidth = 0;
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]!;
    if (si > 0) {
      totalWidth += groupGap;
    }
    for (const token of seg.tokens) {
      const data = glyphImages.get(token);
      if (!data) continue;
      const scale = availableH / data.naturalHeight;
      totalWidth += data.naturalWidth * scale;
      if (data.isDash) {
        totalWidth += DASH_GAP_SVG * scale + DASH_W_SVG * scale;
      }
      totalWidth += letterGap;
    }
    if (seg.tokens.length > 0) totalWidth -= letterGap;
  }

  // Second pass: draw
  const widthFit = fitWordToBounds(totalWidth, canvasWidth, horizontalBounds);
  const fittedGlyphHeight = availableH * widthFit.scale;
  const fittedLetterGap = letterGap * widthFit.scale;
  const fittedGroupGap = groupGap * widthFit.scale;
  const fittedDotRadius = dotRadius * widthFit.scale;
  let cursorX = widthFit.cursorX;

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]!;

    if (si > 0) {
      const dotX = cursorX + fittedGroupGap / 2;
      ctx.save();
      ctx.globalAlpha = DOT_OPACITY;
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(dotX, verticalCenter, fittedDotRadius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
      cursorX += fittedGroupGap;
    }

    for (let ti = 0; ti < seg.tokens.length; ti++) {
      const token = seg.tokens[ti]!;
      const data = glyphImages.get(token);
      if (!data) continue;
      const scale = (availableH / data.naturalHeight) * widthFit.scale;
      const glyphW = data.naturalWidth * scale;
      const baseGlyphY = verticalCenter - fittedGlyphHeight / 2;
      const glyphY =
        baseGlyphY +
        (isAlphaToken(token) ? fittedGlyphHeight * ALPHA_BASELINE_SHIFT : 0);

      drawMonochromeImage(
        ctx,
        data.image,
        cursorX,
        glyphY,
        glyphW,
        fittedGlyphHeight,
        darkMode,
        glyphImagesAreThemeColored
      );

      if (data.isDash) {
        const dashW = DASH_W_SVG * scale;
        const dashH = DASH_H_SVG * scale;
        const dashGap = DASH_GAP_SVG * scale;
        const dashX = cursorX + glyphW + dashGap;
        const dashY = verticalCenter - dashH / 2;
        ctx.beginPath();
        ctx.roundRect(dashX, dashY, dashW, dashH, DASH_RADIUS_SVG * scale);
        ctx.fillStyle = dashColor;
        ctx.fill();
        cursorX += glyphW + dashGap + dashW;
      } else {
        cursorX += glyphW;
      }

      if (ti < seg.tokens.length - 1) cursorX += fittedLetterGap;
    }
  }
}

export function renderHeader(
  ctx: CanvasRenderingContext2D,
  options: HeaderOptions
): void {
  const {
    canvasWidth,
    headerHeight,
    word,
    indicatorSizeScale = BADGE_SIZE_SCALE,
    difficultyLevel = 1,
    showDifficultyBadge = true,
    loopComponents,
    rotationPeriod,
    inversionPeriod,
    reflectionAxis,
    overlayComponents,
    darkMode = true,
    letterStyles,
    backgroundColor,
    borderColor,
    accentColor,
    accentTintOpacity,
    glyphImages,
    glyphImagesAreThemeColored = false,
    compressedSegments,
  } = options;

  const accent = !backgroundColor && !darkMode ? accentColor : undefined;
  let headerBg: string;
  if (backgroundColor) {
    headerBg = backgroundColor;
  } else if (accent) {
    const alphaHex = accentTintOpacity
      ? Math.round(accentTintOpacity * 255)
          .toString(16)
          .padStart(2, "0")
      : "18";
    headerBg = accent + alphaHex;
  } else {
    headerBg = darkMode
      ? "rgba(10, 10, 15, 0.98)"
      : "rgba(245, 245, 245, 0.98)";
  }
  ctx.fillStyle = headerBg;
  ctx.fillRect(0, 0, canvasWidth, headerHeight);

  // Bottom border — skip when accent tint is active so header bleeds into content
  if (!accent) {
    ctx.strokeStyle =
      borderColor ??
      (darkMode ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.1)");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight - 0.5);
    ctx.lineTo(canvasWidth, headerHeight - 0.5);
    ctx.stroke();
  }

  const badgeSize = headerHeight * indicatorSizeScale;
  const badgePadding = headerHeight * BADGE_PADDING_SCALE;

  // Difficulty badge (left)
  if (showDifficultyBadge) {
    renderLevelBadge(
      ctx,
      difficultyLevel,
      badgePadding,
      (headerHeight - badgeSize) / 2,
      badgeSize
    );
  }

  // LOOP icon strip (right)
  const hasLoop = loopComponents && loopComponents.size > 0;
  if (hasLoop) {
    const iconSize = badgeSize * LOOP_ICON_SIZE_SCALE;
    const stripWidth = computeLoopIconStripWidth(
      loopComponents,
      iconSize,
      overlayComponents
    );
    const rightEdge = canvasWidth - badgePadding;
    const stripCenterX =
      rightEdge - stripWidth / 2 - iconSize * LOOP_ICON_STRIP_OFFSET_SCALE;
    renderLoopIconStrip(
      ctx,
      loopComponents,
      stripCenterX,
      headerHeight / 2,
      iconSize,
      darkMode,
      false,
      rotationPeriod,
      inversionPeriod,
      overlayComponents,
      reflectionAxis
    );
  }

  const wordSideInset = Math.min(
    canvasWidth / 2,
    calculateHeaderWordSideInset({
      headerHeight,
      indicatorSizeScale,
      showDifficultyBadge,
      loopComponents,
      overlayComponents,
    })
  );
  const wordHorizontalBounds = {
    left: wordSideInset,
    right: canvasWidth - wordSideInset,
  };

  // Word text (center)
  const finalFontSize = Math.max(
    10,
    Math.floor(headerHeight * HEADER_WORD_FONT_SCALE)
  );
  const textColor = darkMode ? "#ffffff" : "#1f2937";
  const dimmedColor = darkMode ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  ctx.font = `700 ${finalFontSize}px Gelasio, Georgia, serif`;
  ctx.textBaseline = "middle";

  if (!glyphImages?.size && word?.trim()) {
    const availableWidth = Math.max(
      0,
      wordHorizontalBounds.right - wordHorizontalBounds.left
    );
    const measuredWidth = ctx.measureText(word).width;
    if (measuredWidth > availableWidth && measuredWidth > 0) {
      const fittedFontSize = Math.max(
        10,
        Math.floor(finalFontSize * (availableWidth / measuredWidth))
      );
      ctx.font = `700 ${fittedFontSize}px Gelasio, Georgia, serif`;
    }
  }

  // Word: compressed glyphs → flat glyphs → styled text → plain text
  if (word?.trim()) {
    if (compressedSegments && (compressedSegments.length > 1 || compressedSegments.some((s) => s.repeat > 1)) && glyphImages && glyphImages.size > 0) {
      renderCompressedGlyphWord(
        ctx,
        compressedSegments!,
        glyphImages,
        canvasWidth,
        headerHeight,
        wordHorizontalBounds,
        darkMode,
        glyphImagesAreThemeColored
      );
    } else if (glyphImages && glyphImages.size > 0) {
      renderGlyphWord(
        ctx,
        word,
        glyphImages,
        canvasWidth,
        headerHeight,
        wordHorizontalBounds,
        darkMode,
        glyphImagesAreThemeColored
      );
    } else if (letterStyles && letterStyles.length > 0) {
      // Per-letter with dimming for bridge/derived letters
      const totalWidth = ctx.measureText(word).width;
      let cursorX = canvasWidth / 2 - totalWidth / 2;
      ctx.textAlign = "left";
      for (let i = 0; i < word.length; i++) {
        const char = word[i]!;
        const style = letterStyles[i];
        ctx.fillStyle = style?.dimmed ? dimmedColor : textColor;
        ctx.fillText(char, cursorX, headerHeight / 2);
        cursorX += ctx.measureText(char).width;
      }
    } else {
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.fillText(word, canvasWidth / 2, headerHeight / 2);
    }
  }
}

function renderLevelBadge(
  ctx: CanvasRenderingContext2D,
  level: number,
  x: number,
  y: number,
  size: number
): void {
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const radius = size / 2;

  // Linear gradient (top-left to bottom-right) — matches app's TextRenderer
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  const style = DIFFICULTY_LEVELS[level] ?? DEFAULT_DIFFICULTY_STYLE;
  applyGradientStops(gradient, style.stops);

  // Circle with gradient fill
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Border
  const borderWidth = Math.max(
    1,
    Math.floor(size / BADGE_BORDER_WIDTH_DIVISOR)
  );
  ctx.strokeStyle = style.border;
  ctx.lineWidth = borderWidth;
  ctx.stroke();

  // Level number
  const fontSize = Math.floor(size * BADGE_NUMBER_FONT_SCALE);
  ctx.fillStyle = style.text;
  ctx.font = `bold ${fontSize}px ${DIFFICULTY_FONT_FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(level.toString(), centerX, centerY);
}
