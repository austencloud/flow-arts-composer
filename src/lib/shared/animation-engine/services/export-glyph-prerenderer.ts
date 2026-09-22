/**
 * Export Glyph Prerenderer
 *
 * Pre-renders complete TKA glyphs (letter + dash + skew braces + turns
 * column) as composite HTMLImageElements before the export frame loop. Each
 * unique combination of letter, turns tuple, turn colors, and skewed-frame
 * membership produces one cached image.
 *
 * This ensures the exported video matches the live canvas exactly - the live
 * canvas renders TKAGlyph + Dash + SkewBraces + TurnsColumn as SVG overlays;
 * without pre-rendering, the export would only show a bare letter SVG.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { SvgImageConverter } from '$lib/shared/foundation/services/svg-image-converter'
import {
  type ElementalType,
  getElementImagePath,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import {
  getLetterType,
  type Letter,
} from "$lib/shared/foundation/domain/models/letter";
import { LetterType } from "$lib/shared/foundation/domain/models/letter-type";
import {
  getSvgImageCache,
  type DrawableImage,
} from "$lib/shared/render/services/svg-image-cache";

export interface GlyphAsset {
  image: HTMLImageElement;
  dimensions: { width: number; height: number };
  /** Pixels the image extends above the standard glyph origin (50, 800).
   *  When turns are present, the top turn number sits above the letter. */
  yOffset: number;
}

export interface ElementalGlyphAsset {
  image: DrawableImage;
  sourceWidth: number;
  sourceHeight: number;
}
import { TurnsTupleGenerator } from "$lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator";
import { interpretTurnColors } from "$lib/shared/pictograph/tka-glyph/services/turn-color-interpreter";
import {
  getLetterImagePath,
  isDashLetter,
} from "$lib/shared/pictograph/tka-glyph/utils/letter-image-getter";
import {
  parseTurnsTuple,
  shouldDisplayTurn,
  getTurnNumberImagePath,
  getTurnNumberWidth,
  HALF_MARK_IMAGE_PATH,
  getHalfMarkWidth,
  MARK_GAP,
  getSlotUnitWidth,
  getSlotOffsetX,
} from "$lib/shared/pictograph/tka-glyph/utils/turn-tuple-parser";
import {
  calculateTurnPositions,
  getTurnsColumnRightExtent,
} from "$lib/shared/pictograph/tka-glyph/utils/turn-position-calculator";
import { getSkewBraceLayout } from "$lib/shared/pictograph/tka-glyph/utils/skew-brace-layout";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { isSkewedFrameBeat } from "$lib/shared/foundation/services/skewed-frame";
import {
  SKEW_BRACE_FILL_DARK,
  SKEW_BRACE_FILL_LIGHT,
  SKEW_BRACE_FONT_FAMILY,
  SKEW_BRACE_FONT_WEIGHT,
} from "$lib/shared/render/utils/draw-skew-braces";

// Constants matching Dash.svelte
const DASH_WIDTH = 70;
const DASH_HEIGHT = 20;
const DASH_GAP = 10;
const DASH_FILL = "#231f20";

// Turn number height (constant across all number SVGs)
const NUMBER_HEIGHT = 45;

// Padding above the letter origin to accommodate the top turn number
const TURN_Y_PADDING = 5;

// Mode-specific colors for turn numbers.
// Must match TurnsColumn.svelte STATIC_COLORS and MOTION_COLOR_MAP in svg-color-utils.ts.
const TURN_COLORS = {
  dark: { left: "#3575E2", right: "#ED1C24" },
  light: { left: "#3D44B8", right: "#DC2626" },
} as const;

// TurnColorInterpreter always returns "dark" mode hex values.
// Use these to identify which hand (blue vs red) a returned color represents.
const INTERPRETER_BLUE_HEX = "#3575E2";

interface GlyphBuildData {
  letter: string;
  turnsTuple: string;
  topColor: string;
  bottomColor: string;
  step: StepData;
}

export class ExportGlyphPrerenderer {
  private cache = new Map<string, GlyphAsset>();
  private stepKeyMap = new Map<number, string>();
  private elementalCache = new Map<ElementalType, ElementalGlyphAsset>();
  private stepElementMap = new Map<number, ElementalType>();
  private tupleGenerator = new TurnsTupleGenerator();

  constructor(private readonly svgImageConverter: SvgImageConverter) {}

  async prerenderGlyphs(
    steps: readonly StepData[],
    isDarkMode: boolean
  ): Promise<void> {
    this.clear();

    // Phase 1: Compute cache keys for each step, collect unique glyph specs
    const uniqueGlyphs = new Map<string, GlyphBuildData>();

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      if (!step.letter) continue;

      const turnsTuple = this.tupleGenerator.generateTurnsTuple(step);
      const interpreterColors = interpretTurnColors(
        step.letter,
        step
      );

      // Map interpreter colors (always dark mode) to the correct export colors
      const topColor = this.resolveExportColor(
        interpreterColors.top,
        isDarkMode
      );
      const bottomColor = this.resolveExportColor(
        interpreterColors.bottom,
        isDarkMode
      );

      // A skewed-frame beat wears braces a non-skewed beat of the same
      // letter/turns/colors does not, so the flag must be part of the key -
      // otherwise the two would collide on one cached image.
      const skewed = this.isSkewedStep(step);
      const key = `${step.letter}|${turnsTuple}|${topColor}|${bottomColor}|${skewed ? "skew" : "plain"}`;
      this.stepKeyMap.set(i, key);

      if (!uniqueGlyphs.has(key)) {
        uniqueGlyphs.set(key, {
          letter: step.letter,
          turnsTuple,
          topColor,
          bottomColor,
          step,
        });
      }
    }

    // Phase 2: Fetch all unique SVG resources in parallel
    const svgTextCache = new Map<string, string>();
    const svgDimsCache = new Map<
      string,
      { minX: number; minY: number; width: number; height: number }
    >();

    const uniqueLetters = new Set<string>();
    const uniqueTurnPaths = new Set<string>();

    for (const { letter, turnsTuple } of uniqueGlyphs.values()) {
      uniqueLetters.add(letter);
      const parsed = parseTurnsTuple(turnsTuple);
      if (shouldDisplayTurn(parsed.top))
        uniqueTurnPaths.add(getTurnNumberImagePath(parsed.top));
      if (shouldDisplayTurn(parsed.bottom))
        uniqueTurnPaths.add(getTurnNumberImagePath(parsed.bottom));
      if (parsed.topHalved || parsed.bottomHalved)
        uniqueTurnPaths.add(HALF_MARK_IMAGE_PATH);
    }

    const fetchPromises: Promise<void>[] = [];

    for (const letter of uniqueLetters) {
      const path = getLetterImagePath(letter as Letter);
      fetchPromises.push(
        this.fetchAndCacheSvg(path, svgTextCache, svgDimsCache)
      );
    }

    for (const turnPath of uniqueTurnPaths) {
      if (!turnPath) continue;
      fetchPromises.push(
        this.fetchAndCacheSvg(turnPath, svgTextCache, svgDimsCache)
      );
    }

    await Promise.all(fetchPromises);

    // Phase 3: Build composite SVGs and convert to images
    const renderPromises: Promise<void>[] = [];

    for (const [key, data] of uniqueGlyphs) {
      renderPromises.push(
        this.buildAndCacheGlyph(
          key,
          data,
          isDarkMode,
          svgTextCache,
          svgDimsCache
        )
      );
    }

    await Promise.all(renderPromises);
  }

  /** Decode each elemental WebP once before entering the deterministic frame loop. */
  async prerenderElementalGlyphs(steps: readonly StepData[]): Promise<void> {
    this.elementalCache.clear();
    this.stepElementMap.clear();

    const uniqueTypes = new Set<ElementalType>();
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      if (!step.letter || getLetterType(step.letter) !== LetterType.TYPE1) continue;

      const elementalType = deriveTnDFromPictograph(step).elementalType;
      if (!elementalType) continue;

      this.stepElementMap.set(i, elementalType);
      uniqueTypes.add(elementalType);
    }

    await Promise.all(
      [...uniqueTypes].map(async (elementalType) => {
        const image = await getSvgImageCache().getImageFromUrl(
          getElementImagePath(elementalType),
        );
        const sourceWidth = "naturalWidth" in image
          ? image.naturalWidth
          : image.width;
        const sourceHeight = "naturalHeight" in image
          ? image.naturalHeight
          : image.height;

        if (sourceWidth <= 0 || sourceHeight <= 0) {
          throw new Error(`Elemental glyph has no intrinsic size: ${elementalType}`);
        }

        this.elementalCache.set(elementalType, {
          image,
          sourceWidth,
          sourceHeight,
        });
      }),
    );
  }

  getGlyph(cacheKey: string): GlyphAsset | null {
    return this.cache.get(cacheKey) ?? null;
  }

  getCacheKeyForStep(stepIndex: number): string {
    return this.stepKeyMap.get(stepIndex) ?? "";
  }

  getElementalGlyphForStep(stepIndex: number): ElementalGlyphAsset | null {
    const elementalType = this.stepElementMap.get(stepIndex);
    return elementalType
      ? (this.elementalCache.get(elementalType) ?? null)
      : null;
  }

  clear(): void {
    this.cache.clear();
    this.stepKeyMap.clear();
    this.elementalCache.clear();
    this.stepElementMap.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * True when a step's beat wears skew braces - both hands present (not an
   * invisible placeholder) and one hand's start or end location is cardinal
   * while the other's is intercardinal. Matches PictographRenderer.svelte's
   * own skewedFrame gate and the three canvas renderers' isSkewedFrameBeat
   * check, so this composite agrees with every other render path.
   */
  private isSkewedStep(step: StepData): boolean {
    const left = step.motions?.left;
    const right = step.motions?.right;
    return (
      isVisibleMotion(left) && isVisibleMotion(right) && isSkewedFrameBeat(left, right)
    );
  }

  /**
   * Map TurnColorInterpreter output (always dark-mode hex) to the correct
   * export color based on the actual dark/light mode.
   */
  private resolveExportColor(
    interpreterColor: string,
    isDarkMode: boolean
  ): string {
    const isBlue =
      interpreterColor.toLowerCase() === INTERPRETER_BLUE_HEX.toLowerCase();
    const palette = isDarkMode ? TURN_COLORS.dark : TURN_COLORS.light;
    return isBlue ? palette.left : palette.right;
  }

  /**
   * Fetch an SVG file and cache its text + viewBox dimensions.
   */
  private async fetchAndCacheSvg(
    path: string,
    textCache: Map<string, string>,
    dimsCache: Map<
      string,
      { minX: number; minY: number; width: number; height: number }
    >
  ): Promise<void> {
    if (textCache.has(path)) return;
    try {
      const response = await fetch(path);
      if (!response.ok) return;
      const text = await response.text();
      textCache.set(path, text);

      const match = text.match(
        /viewBox\s*=\s*"([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)"/i
      );
      dimsCache.set(path, {
        minX: match ? parseFloat(match[1]!) : 0,
        minY: match ? parseFloat(match[2]!) : 0,
        width: match ? parseFloat(match[3]!) : 100,
        height: match ? parseFloat(match[4]!) : 100,
      });
    } catch {
      // Silently skip – missing SVGs will just not render
    }
  }

  /**
   * Build a composite SVG string for one glyph variant and convert to an image.
   */
  private async buildAndCacheGlyph(
    key: string,
    data: GlyphBuildData,
    isDarkMode: boolean,
    svgTextCache: Map<string, string>,
    svgDimsCache: Map<
      string,
      { minX: number; minY: number; width: number; height: number }
    >
  ): Promise<void> {
    const letterPath = getLetterImagePath(data.letter as Letter);
    const letterSvg = svgTextCache.get(letterPath);
    if (!letterSvg) return;

    const letterViewBox = svgDimsCache.get(letterPath) ?? {
      minX: 0,
      minY: 0,
      width: 100,
      height: 100,
    };
    const letterDims = {
      width: letterViewBox.width,
      height: letterViewBox.height,
    };

    const parsed = parseTurnsTuple(data.turnsTuple);
    const hasDash = isDashLetter(data.letter);

    // Skew braces ("{" / "}") around the letter of a skewed-frame beat - the
    // composite-SVG mirror of SkewBraces.svelte, gated the same way
    // PictographRenderer.svelte gates the DOM component. rightExtent reuses
    // the same getTurnsColumnRightExtent the live turns column and the three
    // canvas renderers use, so the closing brace clears whatever the turns
    // column below is about to paint.
    const skewed = this.isSkewedStep(data.step);
    const braceLayout = skewed
      ? getSkewBraceLayout(data.letter, letterDims, {
          rightExtent: getTurnsColumnRightExtent(parsed),
        })
      : null;

    // A slot shows if it has a displayable number OR is halved - a halved
    // 0-turn motion shows the mark alone (matches TurnsColumn.svelte and
    // canvas-2d-glyph-renderer.ts's showTop/showBottom).
    const showTopNumber = shouldDisplayTurn(parsed.top);
    const showBottomNumber = shouldDisplayTurn(parsed.bottom);
    const showTop = showTopNumber || parsed.topHalved;
    const showBottom = showBottomNumber || parsed.bottomHalved;
    const hasTurns = showTop || showBottom;

    // Turn positions (relative to letter origin)
    const turnPositions = hasTurns
      ? calculateTurnPositions(letterDims, NUMBER_HEIGHT, hasDash)
      : null;

    // Own (number-only) width per slot, plus each slot's full unit (number,
    // or number+gap+mark when halved) via the shared getSlotUnitWidth -
    // single source of truth with TurnsColumn.svelte and
    // canvas-2d-glyph-renderer.ts, so all three render paths agree on layout.
    const topOwnWidth = getTurnNumberWidth(parsed.top);
    const bottomOwnWidth = getTurnNumberWidth(parsed.bottom);
    const topWidth = showTop ? getSlotUnitWidth(topOwnWidth, parsed.topHalved) : 0;
    const bottomWidth = showBottom ? getSlotUnitWidth(bottomOwnWidth, parsed.bottomHalved) : 0;
    const columnWidth = Math.max(topWidth, bottomWidth);

    // Compute composite bounds
    let maxRight = letterDims.width;
    if (hasDash) maxRight = letterDims.width + DASH_GAP + DASH_WIDTH;
    if (hasTurns && turnPositions) {
      maxRight = Math.max(maxRight, turnPositions.top.x + columnWidth);
    }
    // A skewed beat's closing brace can extend past the turns column. Pad the
    // right edge by one full font-size beyond closeX: a glyph's advance width
    // can never exceed its own em box, so this is a deterministic upper bound
    // that needs no synchronous text-measurement API (not reliably available
    // in every context this composite gets built in).
    if (braceLayout) {
      maxRight = Math.max(maxRight, braceLayout.closeX + braceLayout.fontSize);
    }

    // A skewed beat's opening brace sits left of the letter's own x=0 origin
    // (openX is negative) - shift the whole composite right by that amount so
    // nothing paints outside the SVG viewBox on the left edge either.
    const xPadLeft = braceLayout ? Math.max(0, Math.ceil(-braceLayout.openX)) : 0;

    const yPadTop = hasTurns ? TURN_Y_PADDING : 0;
    const yPadBottom = hasTurns ? TURN_Y_PADDING : 0;
    const totalWidth = Math.ceil(maxRight) + xPadLeft;
    const totalHeight = Math.ceil(letterDims.height + yPadTop + yPadBottom);

    // -- Build composite SVG --------------------------------------------------

    const parts: string[] = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
        `viewBox="0 0 ${totalWidth} ${totalHeight}" ` +
        `width="${totalWidth}" height="${totalHeight}">`
    );

    // Color filter definitions for turn numbers
    if (hasTurns) {
      parts.push("<defs>");
      parts.push(this.buildFeFloodFilter("top-color", data.topColor));
      parts.push(this.buildFeFloodFilter("bottom-color", data.bottomColor));
      parts.push("</defs>");
    }

    // --- Letter + Dash group (optionally inverted for dark mode) ---
    const invertAttr = isDarkMode ? ' style="filter: invert(0.9)"' : "";
    parts.push(`<g transform="translate(${xPadLeft}, ${yPadTop})"${invertAttr}>`);

    // Inline the letter SVG content
    const letterContent = this.extractSvgInnerContent(letterSvg);
    // Account for non-zero viewBox origin
    const originTranslate =
      letterViewBox.minX !== 0 || letterViewBox.minY !== 0
        ? ` transform="translate(${-letterViewBox.minX}, ${-letterViewBox.minY})"`
        : "";
    parts.push(`<g${originTranslate}>${letterContent}</g>`);

    // Dash rect for Type3/Type5 letters
    if (hasDash) {
      const dashX = letterDims.width + DASH_GAP;
      const dashY = (letterDims.height - DASH_HEIGHT) / 2;
      parts.push(
        `<rect x="${dashX}" y="${dashY}" width="${DASH_WIDTH}" ` +
          `height="${DASH_HEIGHT}" rx="9.5" ry="9.5" fill="${DASH_FILL}"/>`
      );
    }

    parts.push("</g>"); // End letter+dash group

    // --- Skew braces (NOT inside the dark-mode-inverted group - unlike the
    // dash's fixed color, which the CSS invert flips into a dark-mode
    // approximation, these use SkewBraces.svelte's exact dark/light hex so
    // there is no drift from an inverted #231f20 not quite matching #d9d9d9) ---
    if (braceLayout) {
      const braceFill = isDarkMode ? SKEW_BRACE_FILL_DARK : SKEW_BRACE_FILL_LIGHT;
      const braceY = braceLayout.y + yPadTop;
      const braceAttrs =
        `font-family="${SKEW_BRACE_FONT_FAMILY}" font-weight="${SKEW_BRACE_FONT_WEIGHT}" ` +
        `font-size="${braceLayout.fontSize}" fill="${braceFill}"`;
      parts.push(
        `<text x="${braceLayout.openX + xPadLeft}" y="${braceY}" ` +
          `text-anchor="end" dominant-baseline="central" ${braceAttrs}>{</text>`
      );
      parts.push(
        `<text x="${braceLayout.closeX + xPadLeft}" y="${braceY}" ` +
          `text-anchor="start" dominant-baseline="central" ${braceAttrs}>}</text>`
      );
    }

    // --- Turn numbers + halved-motion marks (NOT inside the dark-mode-inverted group) ---
    if (hasTurns && turnPositions) {
      if (showTop) {
        const topOffsetX = getSlotOffsetX(columnWidth, topOwnWidth, parsed.topHalved);
        if (showTopNumber) {
          this.appendTurnNumber(
            parts,
            parsed.top,
            turnPositions.top.x + topOffsetX + xPadLeft,
            turnPositions.top.y + yPadTop,
            "top-color",
            svgTextCache,
            svgDimsCache
          );
        }
        if (parsed.topHalved) {
          this.appendHalfMark(
            parts,
            turnPositions.top.x + topOffsetX + topOwnWidth + MARK_GAP + xPadLeft,
            turnPositions.top.y + yPadTop,
            "top-color",
            svgTextCache,
            svgDimsCache
          );
        }
      }
      if (showBottom) {
        const bottomOffsetX = getSlotOffsetX(columnWidth, bottomOwnWidth, parsed.bottomHalved);
        if (showBottomNumber) {
          this.appendTurnNumber(
            parts,
            parsed.bottom,
            turnPositions.bottom.x + bottomOffsetX + xPadLeft,
            turnPositions.bottom.y + yPadTop,
            "bottom-color",
            svgTextCache,
            svgDimsCache
          );
        }
        if (parsed.bottomHalved) {
          this.appendHalfMark(
            parts,
            turnPositions.bottom.x + bottomOffsetX + bottomOwnWidth + MARK_GAP + xPadLeft,
            turnPositions.bottom.y + yPadTop,
            "bottom-color",
            svgTextCache,
            svgDimsCache
          );
        }
      }
    }

    parts.push("</svg>");

    const compositeSvg = parts.join("");

    try {
      const image = await this.svgImageConverter.convertSvgStringToImage(
        compositeSvg,
        totalWidth,
        totalHeight
      );
      this.cache.set(key, {
        image,
        dimensions: { width: totalWidth, height: totalHeight },
        yOffset: yPadTop,
      });
    } catch (err) {
      console.error(`Failed to prerender glyph for "${data.letter}":`, err);
    }
  }

  /**
   * Append an inlined turn number SVG element to the composite parts array.
   * Uses a feFlood color filter. `x` is the already-offset absolute position
   * (see getSlotOffsetX at the call site) - this method no longer re-centers,
   * so halved and unhalved slots share one offset computation.
   */
  private appendTurnNumber(
    parts: string[],
    turnValue: number | "fl",
    x: number,
    y: number,
    filterId: string,
    svgTextCache: Map<string, string>,
    svgDimsCache: Map<
      string,
      { minX: number; minY: number; width: number; height: number }
    >
  ): void {
    const path = getTurnNumberImagePath(turnValue);
    const svg = svgTextCache.get(path);
    if (!svg) return;

    const viewBox = svgDimsCache.get(path) ?? {
      minX: 0,
      minY: 0,
      width: 30,
      height: 45,
    };
    const content = this.extractSvgInnerContent(svg);

    const originTranslate =
      viewBox.minX !== 0 || viewBox.minY !== 0
        ? `translate(${-viewBox.minX}, ${-viewBox.minY}) `
        : "";

    parts.push(
      `<g transform="translate(${x}, ${y})" filter="url(#${filterId})">`
    );
    parts.push(`<g${originTranslate ? ` transform="${originTranslate.trim()}"` : ""}>`);
    parts.push(content);
    parts.push("</g></g>");
  }

  /**
   * Append the inlined halved-motion mark (static/images/numbers/half.svg,
   * HALF_MARK_IMAGE_PATH) to the composite parts array. Same feFlood-filter
   * recoloring as appendTurnNumber, sharing the slot's own filter id so the
   * mark always tints with its slot's motion color, matching TurnsColumn.svelte.
   */
  private appendHalfMark(
    parts: string[],
    x: number,
    y: number,
    filterId: string,
    svgTextCache: Map<string, string>,
    svgDimsCache: Map<
      string,
      { minX: number; minY: number; width: number; height: number }
    >
  ): void {
    const svg = svgTextCache.get(HALF_MARK_IMAGE_PATH);
    if (!svg) return;

    const viewBox = svgDimsCache.get(HALF_MARK_IMAGE_PATH) ?? {
      minX: 0,
      minY: 0,
      width: getHalfMarkWidth(),
      height: NUMBER_HEIGHT,
    };
    const content = this.extractSvgInnerContent(svg);

    const originTranslate =
      viewBox.minX !== 0 || viewBox.minY !== 0
        ? `translate(${-viewBox.minX}, ${-viewBox.minY}) `
        : "";

    parts.push(
      `<g transform="translate(${x}, ${y})" filter="url(#${filterId})">`
    );
    parts.push(`<g${originTranslate ? ` transform="${originTranslate.trim()}"` : ""}>`);
    parts.push(content);
    parts.push("</g></g>");
  }

  /**
   * Build an SVG feFlood color filter that recolors content to a solid color.
   * Extracts the alpha channel and fills with the target color.
   */
  private buildFeFloodFilter(id: string, color: string): string {
    return (
      `<filter id="${id}" color-interpolation-filters="sRGB">` +
      `<feColorMatrix type="matrix" ` +
      `values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="a"/>` +
      `<feFlood flood-color="${color}" result="c"/>` +
      `<feComposite in="c" in2="a" operator="in"/>` +
      `</filter>`
    );
  }

  /**
   * Extract the inner content of an SVG document (everything inside <svg>...</svg>),
   * stripping the XML declaration and DOCTYPE if present.
   */
  private extractSvgInnerContent(svgText: string): string {
    const text = svgText
      .replace(/<\?xml[^?]*\?>\s*/gi, "")
      .replace(/<!DOCTYPE[^>]*>\s*/gi, "");
    const match = text.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    return match ? match[1]!.trim() : "";
  }
}
