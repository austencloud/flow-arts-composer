import type { SequenceData } from "../../foundation/domain/models/sequence-data";
import type { SequenceExportOptions } from "../domain/models/sequence-export-options";
import type { PictographVisibilityOptions } from "../utils/pictograph-to-svg";
import type {
  RenderCanvas,
  LayerRenderOptions,
  LayerVisibility,
} from "./types";
import type { TextRenderer } from "./text-renderer";
import type { QRCodeGenerator } from "../../qr/services/qr-code-generator";
import { calculateLayout } from "./layout-calculator";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { drawSmartCellBorders } from "./cell-border-renderer";
import { parseLoopComponents } from "$lib/shared/create/services/loop-type-utils";
import { tryGetLoopDisplayResolver } from "$lib/shared/loop-labeler/get-loop-display-resolver";
import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import {
  RESERVED_ORIENTATION_PRIMITIVES,
  LOOPComponent,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import {
  calculateCardSurface,
  CARD_FRONT_INDICATOR_SIZE_SCALE,
} from "@tka/render-composition";
import { calculateDifficultyLevel as calculateSequenceDifficultyLevel } from "$lib/shared/browse/services/sequence-difficulty-calculator";
// TEMP assembly profiler — header/footer/border phase timing for the cold-deck profiler.

const DECK_HEADER_BG = "rgba(245, 245, 245, 0.98)";
const DECK_BORDER_COLOR = "rgba(0, 0, 0, 0.1)";

/**
 * Layout geometry + derived metadata for a choreo-card front, computed once and
 * shared by both the main-thread composer and any parallel render path. Pure
 * data — no canvas, no mutation of inputs.
 */
export interface CardFrontLayout {
  columns: number;
  rows: number;
  stepSize: number;
  canvasWidth: number;
  canvasHeight: number;
  headerHeight: number;
  footerHeight: number;
  gridOffsetX: number;
  gridOffsetY: number;
  isDarkMode: boolean;
  derivedWord: string;
  startColumn: number;
  startRow: number;
  stepsPerRow: number;
  hasStartPosition: boolean;
}

/**
 * Layout math extracted verbatim from ImageComposer.composeSequenceImage. Does
 * NOT mutate `options` or `visibility`. The header/footer height for the
 * non-deckCard branch reuses the same shared @tka/render-composition helpers the
 * composer used (via its private calculateHeaderHeight/calculateFooterHeight).
 */
export function computeCardFrontLayout(
  sequence: SequenceData,
  options: Partial<SequenceExportOptions>,
  visibility: PictographVisibilityOptions
): CardFrontLayout {
  const stepCount = sequence.steps.length;
  let columns: number;
  let rows: number;
  if (options.columnCount != null && options.columnCount > 0) {
    columns = options.columnCount;
    const includesStart = options.includeStartPosition ?? false;
    const startPositionLayout = options.startPositionLayout ?? "row";
    if (includesStart && startPositionLayout === "row") {
      rows = 1 + Math.ceil(stepCount / columns);
    } else {
      const startColumns =
        includesStart && startPositionLayout === "column" ? 1 : 0;
      const stepsPerRowLocal = Math.max(1, columns - startColumns);
      rows = Math.max(1, Math.ceil(stepCount / stepsPerRowLocal));
    }
  } else {
    [columns, rows] = calculateLayout(
      stepCount,
      options.includeStartPosition ?? false,
      options.startPositionLayout ?? "row"
    );
  }

  const rawWord =
    sequence.word ||
    sequence.steps
      .filter((step) => step.letter)
      .map((step) => step.letter)
      .join("");

  const derivedWord = simplifyRepeatedWord(rawWord);

  const earlyLoopType = options.loopType ?? sequence.loopType;
  const earlyShowLoopGlyph = options.showLoopGlyph !== false && !!earlyLoopType;
  const showHeaderForLayout =
    (options.addWord && (derivedWord || options.customName)) ||
    options.addDifficultyLevel ||
    earlyShowLoopGlyph;

  const showNotes = options.showNotes ?? options.addUserInfo;
  const hasAnyFooterContent = Boolean(
    showNotes || options.leftLabel || options.rightLabel || options.iconPath
  );

  const surface = calculateCardSurface({
    columns,
    rows,
    cellSize: Math.floor((options.stepSize || 120) * (options.stepScale || 1)),
    showHeader: !!showHeaderForLayout && stepCount > 0,
    showFooter: hasAnyFooterContent,
    deckCard: options.deckCard,
    gridCentering: options.gridCentering,
  });
  const {
    cellSize: stepSize,
    width: canvasWidth,
    height: canvasHeight,
    headerHeight,
    footerHeight,
    gridStartX: gridOffsetX,
    gridStartY: gridOffsetY,
  } = surface;
  const isDarkMode = visibility.darkMode ?? false;

  const layoutMode = options.startPositionLayout ?? "row";
  const useColumnMode = layoutMode === "column" && options.includeStartPosition;
  const startRow = !useColumnMode && options.includeStartPosition ? 1 : 0;
  const startColumn = useColumnMode ? 1 : 0;
  const stepsPerRow = columns - startColumn;

  // hasStartPosition mirrors composeSequenceImage: a start position exists when
  // includeStartPosition is set AND there is an effective start position
  // (explicit on the sequence, or derivable from the first step).
  const hasStartPosition = !!(
    options.includeStartPosition &&
    (sequence.startPosition || (sequence.steps[0] ? true : false))
  );

  return {
    columns,
    rows,
    stepSize,
    canvasWidth,
    canvasHeight,
    headerHeight,
    footerHeight,
    gridOffsetX,
    gridOffsetY,
    isDarkMode,
    derivedWord,
    startColumn,
    startRow,
    stepsPerRow,
    hasStartPosition,
  };
}

/**
 * Paints the card-front background fill + deckCard content rect + accent-tint
 * side fills. Extracted verbatim from composeSequenceImage (the block that ran
 * right after grid-offset computation).
 */
export function paintCardFrontBackground(
  ctx: CanvasRenderingContext2D,
  layout: CardFrontLayout,
  options: Partial<SequenceExportOptions>
): void {
  const {
    isDarkMode,
    canvasWidth,
    canvasHeight,
    headerHeight,
    footerHeight,
    columns,
    rows,
    stepSize,
    gridOffsetX,
  } = layout;

  ctx.fillStyle = isDarkMode ? "#0a0a0f" : "white";

  const gridHeight = rows * stepSize;
  const gridWidth = columns * stepSize;

  if (options.deckCard) {
    ctx.fillRect(
      0,
      headerHeight,
      canvasWidth,
      canvasHeight - headerHeight - footerHeight
    );

    if (!isDarkMode && options.accentColor && gridOffsetX > 0) {
      const contentTop = headerHeight;
      const contentH = canvasHeight - headerHeight - footerHeight;
      const alphaHex = options.accentTintOpacity
        ? Math.round(options.accentTintOpacity * 255)
            .toString(16)
            .padStart(2, "0")
        : "18";
      ctx.fillStyle = options.accentColor + alphaHex;
      ctx.fillRect(0, contentTop, gridOffsetX, contentH);
      ctx.fillRect(
        gridOffsetX + gridWidth,
        contentTop,
        canvasWidth - gridOffsetX - gridWidth,
        contentH
      );
      ctx.fillStyle = isDarkMode ? "#0a0a0f" : "white";
    }
  } else {
    ctx.fillRect(0, headerHeight, canvasWidth, gridHeight);
  }
}

/**
 * Builds the per-cell LayerCompositor options + visibility, mirroring the
 * option-building in ImageComposer.renderPictographWithLayerCompositor. The cell
 * render loop stays inline in composeSequenceImage; this helper exists so the
 * future parallel path can reproduce the exact same per-cell options.
 */
export function buildCellLayerOptions(
  stepSize: number,
  visibility: PictographVisibilityOptions
): { options: LayerRenderOptions; visibility: LayerVisibility } {
  const rawHandVisibility = visibility.handPointVisibility ?? "all";
  const handVisibility: "all" | "active" =
    rawHandVisibility === "none" ? "active" : rawHandVisibility;

  const options: LayerRenderOptions = {
    fanAppearance: visibility.fanAppearance,
    size: stepSize,
    darkMode: visibility.darkMode ?? false,
    showNonRadialPoints: visibility.showNonRadialPoints ?? false,
    showGrid: visibility.showGrid ?? true,
    handPointVisibility: handVisibility,
    leftPropType: visibility.leftPropType,
    rightPropType: visibility.rightPropType,
    leftBuugengFlipped: visibility.leftBuugengFlipped,
    rightBuugengFlipped: visibility.rightBuugengFlipped,
    showLeftMotion: visibility.showLeftMotion,
    showRightMotion: visibility.showRightMotion,
    showPositions: visibility.showPositions ?? false,
    showHandColorKey: visibility.showHandColorKey ?? true,
    showPropTnD: visibility.showPropTnD ?? false,
    handPathMode: visibility.handPathMode ?? false,
  };

  const layerVisibility: LayerVisibility = {
    showTKA: visibility.showTKA ?? true,
    showReversals: visibility.showReversals ?? true,
  };

  return { options, visibility: layerVisibility };
}

/**
 * Dependencies the chrome painter needs from the owning ImageComposer instance.
 * Mandala + QR are passed as pre-bound closures so the assembler stays free of
 * the composer's prop-type / instance state.
 */
export interface CardFrontChromeDeps {
  textRenderer: TextRenderer;
  qrCodeGenerator?: QRCodeGenerator;
  renderMandalas: (ctx: CanvasRenderingContext2D) => Promise<void>;
  renderQRCode: (ctx: CanvasRenderingContext2D) => Promise<void>;
}

/**
 * Paints all post-cell "chrome": smart cell borders, QR code, mandalas,
 * loop-component resolution, and the word header + footer. Extracted verbatim
 * from composeSequenceImage (everything after the cell render loop). The header
 * renders TKA letter glyphs and MUST stay pixel-identical to the prior inline
 * path.
 */
export async function paintCardFrontChrome(
  canvas: RenderCanvas,
  ctx: CanvasRenderingContext2D,
  layout: CardFrontLayout,
  sequence: SequenceData,
  options: Partial<SequenceExportOptions>,
  visibility: PictographVisibilityOptions,
  deps: CardFrontChromeDeps
): Promise<void> {
  const {
    columns,
    rows,
    stepSize,
    gridOffsetY,
    gridOffsetX,
    isDarkMode,
    headerHeight,
    footerHeight,
    derivedWord,
  } = layout;

  // Draw the QR when we can produce one: either a generator (main thread) OR a
  // pre-rendered bitmap transferred in (the worker has no generator).
  if (
    options.visibilityOverrides?.showQRCode &&
    (deps.qrCodeGenerator || options.qrImageBitmap)
  ) {
    await deps.renderQRCode(ctx);
  }

  // The live ChoreoCard can draw a path mandala for any renderable sequence.
  // Keep baked gallery/export images in parity instead of dropping the mandala
  // just because the sequence is not classified as a LOOP.
  if (options.visibilityOverrides?.showMandala) {
    await deps.renderMandalas(ctx);
  }

  drawSmartCellBorders(
    ctx,
    columns,
    rows,
    stepSize,
    sequence,
    options,
    gridOffsetY,
    isDarkMode,
    gridOffsetX
  );

  const loopTypeOverride = options.loopType;
  let loopComponents: Set<LOOPComponent> | undefined;
  // Only the resolver branch (`display`) carries overlay-mode info — a bare
  // LOOPType shortcode (the fallback branch below, used when the resolver
  // hasn't been registered, e.g. inside composition.worker.ts) has no way to
  // recover which components are overlay vs expand. Degraded, not wrong: the
  // icon strip just omits the separator dot in that case.
  let overlayComponents: Set<LOOPComponent> | undefined;

  const resolver = tryGetLoopDisplayResolver();
  const display = resolver?.(sequence);
  let rotationPeriod = display?.rotationPeriod;
  let inversionPeriod = display?.inversionPeriod;
  const reflectionAxis = display?.reflectionAxis;
  let loopPeriod = display?.period ?? 1;

  if (display && display.components.size > 0) {
    loopComponents = display.components;
    overlayComponents = display.overlayComponents;
  } else if (loopTypeOverride) {
    const parsed = parseLoopComponents(loopTypeOverride);
    const filtered = new Set<LOOPComponent>();
    for (const c of parsed) {
      if (!RESERVED_ORIENTATION_PRIMITIVES.has(c)) filtered.add(c);
    }
    loopComponents = filtered.size > 0 ? filtered : undefined;

    if (loopComponents && loopPeriod <= 1) {
      const seqPeriod =
        sequence.period ?? (sequence.orientationCycleCount === 4 ? 4 : 2);
      loopPeriod = seqPeriod;
      if (loopComponents.has(LOOPComponent.ROTATED)) {
        rotationPeriod = seqPeriod === 4 ? Period.QUARTERED : Period.HALVED;
      }
      if (loopComponents.has(LOOPComponent.INVERTED)) {
        inversionPeriod = seqPeriod === 4 ? Period.QUARTERED : Period.HALVED;
      }
    }
  }

  // Filter LOOP components by view mode:
  // - Swapped requires two hands (meaningless for single-hand view)
  // - Inverted requires props (meaningless in hand-path mode)
  if (loopComponents) {
    const isHandPath = visibility.handPathMode ?? false;
    const isSolo =
      visibility.showLeftMotion === false ||
      visibility.showRightMotion === false;
    if (isHandPath || isSolo) {
      const filtered = new Set(loopComponents);
      if (isSolo) filtered.delete(LOOPComponent.SWAPPED);
      if (isHandPath) filtered.delete(LOOPComponent.INVERTED);
      loopComponents = filtered.size > 0 ? filtered : undefined;
    }
  }
  const showLoopGlyph =
    options.showLoopGlyph !== false &&
    loopComponents &&
    loopComponents.size > 0;

  const showHeader =
    (options.addWord && (derivedWord || options.customName)) ||
    options.addDifficultyLevel ||
    showLoopGlyph;
  if (showHeader && headerHeight > 0) {
    const difficultyLevel = getDifficultyLevel(sequence);
    const displayName = options.addWord
      ? options.customName || derivedWord
      : "";
    const periodForRender =
      rotationPeriod === Period.QUARTERED
        ? "quartered"
        : rotationPeriod === Period.HALVED
          ? "halved"
          : undefined;

    const inversionForRender =
      inversionPeriod === Period.QUARTERED
        ? "quartered"
        : inversionPeriod === Period.HALVED
          ? "halved"
          : undefined;

    deps.textRenderer.renderWordHeader({
      canvas,
      word: displayName,
      headerHeight,
      indicatorSizeScale:
        options.cardMode || options.deckCard
          ? CARD_FRONT_INDICATOR_SIZE_SCALE
          : undefined,
      difficultyLevel,
      showDifficultyBadge: options.addDifficultyLevel,
      darkMode: isDarkMode,
      loopComponents: showLoopGlyph ? loopComponents : undefined,
      backgroundColor:
        options.deckCard && !options.accentColor ? DECK_HEADER_BG : undefined,
      borderColor:
        options.deckCard && !options.accentColor
          ? DECK_BORDER_COLOR
          : undefined,
      rotationPeriod: showLoopGlyph ? periodForRender : undefined,
      inversionPeriod: showLoopGlyph ? inversionForRender : undefined,
      reflectionAxis: showLoopGlyph ? reflectionAxis : undefined,
      overlayComponents: showLoopGlyph ? overlayComponents : undefined,
      accentColor: options.accentColor,
      accentTintOpacity: options.accentTintOpacity,
      renderAsText: options.renderWordAsText,
    });
  }

  const showNotes = options.showNotes ?? options.addUserInfo;
  const hasAnyFooterContent = Boolean(
    showNotes || options.leftLabel || options.rightLabel || options.iconPath
  );

  if (hasAnyFooterContent && footerHeight > 0) {
    await deps.textRenderer.renderCardFooter({
      canvas,
      notes: options.notes || "",
      footerHeight,
      darkMode: isDarkMode,
      showNotes,
      customNotesText: options.customNotesText,
      backgroundColor:
        options.deckCard && !options.accentColor ? DECK_HEADER_BG : undefined,
      borderColor:
        options.deckCard && !options.accentColor
          ? DECK_BORDER_COLOR
          : undefined,
      leftLabel: options.leftLabel,
      rightLabel: options.rightLabel,
      iconPath: options.iconPath,
      accentColor: options.accentColor,
      accentTintOpacity: options.accentTintOpacity,
    });
  }
}

// Mirrors ImageComposer.getDifficultyLevel (private). Kept local so the chrome
// painter has no dependency on the composer instance.
function getDifficultyLevel(sequence: SequenceData): number {
  if (sequence.steps && sequence.steps.length > 0) {
    return calculateSequenceDifficultyLevel([...sequence.steps]);
  }

  if (typeof sequence.level === "number" && sequence.level > 0) {
    return sequence.level;
  }

  return 1;
}
