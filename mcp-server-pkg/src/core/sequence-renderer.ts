/** Packaged-MCP adapter for the shared choreo card composition pipeline. */
import {
  createCanvas,
  loadImage,
  type Canvas,
} from "@napi-rs/canvas/node-canvas.js";
import {
  getStandaloneRenderer,
  type PictographInput,
  type RenderVisibilityOptions,
} from "./standalone-renderer.js";
import type { SequenceStep } from "./sequence-builder.js";
import { applyCanonicalReversals } from "./card-reversals.js";
import { renderCardQrCode } from "./qr-code-renderer.js";
import {
  COMPOSER_CARD_EXPORT_PROFILE_V1,
  DARK_HAND_COLORS,
  LIGHT_HAND_COLORS,
  calculateCardMandalaPaths,
  composeSequenceCard,
  renderFooter,
  renderCardMandala,
  renderHeader,
  resolveHandColorPair,
  type HandColorPair,
  type LOOPComponentId,
  type LetterStyle,
  type SequenceCardHeader,
  type CompressedSegment,
  type LoopInversionPeriod,
  type LoopReflectionAxis,
  type LoopRotationPeriod,
  compressWord,
  simplifyRepeatedWord,
} from "@tka/render-composition";
import { loadTkaWordGlyphs } from "./tka-glyph-loader.js";
import { calculateDifficultyLevel } from "./difficulty-calculator.js";
import { ensureGelasioRegistered } from "./gelasio-fonts.js";

export const LOOPComponent = {
  ROTATED: "rotated",
  MIRRORED: "mirrored",
  FLIPPED: "flipped",
  SWAPPED: "swapped",
  INVERTED: "inverted",
  REWOUND: "rewound",
} as const;
export type LOOPComponent = LOOPComponentId;
export interface TurnAllocation {
  left: (number | "fl")[];
  right: (number | "fl")[];
}
export interface SequenceRenderOptions {
  layout: "grid" | "strip";
  cellSize: number;
  padding: number;
  showStepNumbers: boolean;
  showWord: boolean;
  darkMode: boolean;
  showDifficulty?: boolean;
  userName?: string;
  notes?: string;
  birthday?: Date;
  level?: number;
  /** Generation input only; the badge is always derived from rendered motions. */
  turnAllocation?: TurnAllocation;
  loopComponents?: LOOPComponent[];
  rotationPeriod?: LoopRotationPeriod;
  inversionPeriod?: LoopInversionPeriod;
  reflectionAxis?: LoopReflectionAxis;
  overlayComponents?: LOOPComponent[];
  compressedSegments?: CompressedSegment[];
  displayWord?: string;
  exportProfile?: "composer" | "print";
  columnCount?: number;
  frame?: {
    canvasWidth?: number;
    canvasHeight?: number;
    bleedPx?: number;
    accent: string;
    dark: string;
    palette?: readonly string[];
  };
  showLoopGlyph?: boolean;
  period?: number;
  showReversals?: boolean;
  derivedBeatIndices?: number[];
  seedWord?: string;
  startPositionLayout?: "row" | "column";
  showFooter?: boolean;
  showMandala?: boolean;
  primaryPropColors?: HandColorPair | null;
  leftPropType?: string | null;
  rightPropType?: string | null;
  fanAppearance?: {
    build?: "pictograph" | "fire" | "flat-grip" | "lotus" | "day" | "moon";
    frameColor?: "black" | "white";
    cover?: "bare" | "covered";
  } | null;
  /** Published player link; when set the card carries the Composer's QR slot. */
  qrUrl?: string;
  /** Opt out of the QR cell even when `qrUrl` is known. */
  showQRCode?: boolean;
  /** TnD accent tint (header, footer, and print side bands). */
  accentColor?: string;
  /** 0–1 alpha for the accent tint; omit for the Composer default. */
  accentTintOpacity?: number;
}
const DEFAULT_OPTIONS = {
  ...COMPOSER_CARD_EXPORT_PROFILE_V1,
} satisfies SequenceRenderOptions;

interface PackagedHeader extends SequenceCardHeader {
  letterStyles: LetterStyle[];
}

export async function renderSequenceToImage(
  steps: SequenceStep[],
  word: string,
  options: Partial<SequenceRenderOptions> = {}
): Promise<Buffer> {
  ensureGelasioRegistered();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const showDifficulty =
    options.showDifficulty ??
    (options.exportProfile === "print" ||
      COMPOSER_CARD_EXPORT_PROFILE_V1.showDifficulty);
  const primaryPropColors = opts.primaryPropColors
    ? resolveHandColorPair(
        opts.primaryPropColors,
        opts.darkMode ? DARK_HAND_COLORS : LIGHT_HAND_COLORS
      )
    : null;
  const renderer = getStandaloneRenderer();
  const isLoop = !!opts.loopComponents?.length;
  const visibilityOptions: RenderVisibilityOptions = {
    darkMode: opts.darkMode,
    size: opts.cellSize,
    showTKA: true,
    showGrid: true,
    showLeftMotion: true,
    showRightMotion: true,
    showTND: false,
    showPositions: false,
    showReversals: opts.showReversals ?? false,
    showNonRadialPoints: false,
    leftPropType: opts.leftPropType,
    rightPropType: opts.rightPropType,
    fanAppearance: opts.fanAppearance ?? {
      build: "fire",
      frameColor: "black",
      cover: "bare",
    },
    primaryPropColors,
  };
  return composeSequenceCard<SequenceStep, Canvas>({
    steps,
    word,
    options: {
      ...opts,
      showDifficulty,
      showFooter: opts.showFooter ?? false,
      showReversals: opts.showReversals ?? false,
      startPositionLayout: opts.startPositionLayout ?? "row",
      showLoopGlyph:
        opts.showLoopGlyph !== false && !!opts.loopComponents?.length,
      showQRCode: !!opts.qrUrl && opts.showQRCode !== false,
    },
    createCanvas,
    getContext: (canvas) =>
      canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
    toPng: (canvas) => canvas.toBuffer("image/png"),
    getStepNumber: (step) => step.stepNumber,
    getStepDuration: (step) => step.duration,
    applyReversals: (source) => applyCanonicalReversals(source, isLoop),
    renderQRCode: opts.qrUrl
      ? (ctx, cell) => renderCardQrCode(ctx, cell, opts.qrUrl!, opts.darkMode)
      : undefined,
    calculateDifficultyLevel: (renderedSteps) =>
      calculateDifficultyLevel(renderedSteps, opts.turnAllocation),
    renderPictograph: async (ctx, step, cell) => {
      const allocationIndex = step.stepNumber - 1;
      const leftTurns =
        step.stepNumber === 0
          ? 0
          : (step.leftMotion.turns ??
            opts.turnAllocation?.left[allocationIndex] ??
            0);
      const rightTurns =
        step.stepNumber === 0
          ? 0
          : (step.rightMotion.turns ??
            opts.turnAllocation?.right[allocationIndex] ??
            0);
      const pictograph: PictographInput = {
        letter: step.letter,
        startPosition: step.startPosition,
        endPosition: step.endPosition,
        leftMotion: {
          ...step.leftMotion,
          rotationDirection: step.leftMotion.rotationDirection || "no_rotation",
          hand: "left",
          turns: leftTurns,
          startOrientation:
            step.leftMotion.startOrientation || cell.baseOrientation,
        },
        rightMotion: {
          ...step.rightMotion,
          rotationDirection:
            step.rightMotion.rotationDirection || "no_rotation",
          hand: "right",
          turns: rightTurns,
          startOrientation:
            step.rightMotion.startOrientation || cell.baseOrientation,
        },
        leftReversal: step.leftReversal,
        rightReversal: step.rightReversal,
      };
      ctx.drawImage(
        (await loadImage(
          await renderer.renderToPng(pictograph, { ...visibilityOptions, size: cell.cellSize })
        )) as unknown as CanvasImageSource,
        cell.x,
        cell.y,
        cell.cellSize,
        cell.cellSize
      );
    },
    renderMandala: opts.showMandala
      ? (ctx, renderedSteps, placements) => {
          const paths = calculateCardMandalaPaths(
            renderedSteps.map((step) => ({
              stepNumber: step.stepNumber,
              leftMotion: step.leftMotion,
              rightMotion: step.rightMotion,
            })),
            opts.turnAllocation
          );
          for (const placement of placements) {
            renderCardMandala(
              ctx,
              paths,
              placement,
              opts.darkMode,
              primaryPropColors
            );
          }
        }
      : undefined,
    buildHeader: (renderedSteps, requestedWord): PackagedHeader => {
      const headerWord = simplifyRepeatedWord(
        opts.displayWord ?? opts.seedWord ?? requestedWord
      );
      const seedLetters =
        (opts.displayWord ?? opts.seedWord)
          ? renderedSteps.filter(
              (step) =>
                step.stepNumber > 0 &&
                !opts.derivedBeatIndices?.includes(step.stepNumber)
            )
          : renderedSteps.filter((step) => step.stepNumber > 0);
      return {
        word: headerWord,
        letterStyles: opts.showWord
          ? seedLetters
              .filter((step) => !step.isBridge)
              .map((step) => ({ letter: step.letter, dimmed: false }))
          : [],
      };
    },
    renderHeader: async (ctx, header, layout, difficultyLevel) => {
      const display = header as PackagedHeader;
      const compressedSegments = opts.compressedSegments ?? compressWord(display.word);
      const loopPeriod =
        opts.period === 4
          ? "quartered"
          : opts.period === 2
            ? "halved"
            : undefined;
      const glyphImages = opts.showWord
        ? await loadTkaWordGlyphs(
            display.word,
            async (source) =>
              (await loadImage(
                source
              )) as unknown as CanvasImageSource,
            opts.darkMode
          )
        : undefined;
      renderHeader(ctx, {
        canvasWidth: layout.width,
        headerHeight: layout.headerHeight,
        indicatorSizeScale: layout.indicatorSizeScale,
        word: opts.showWord ? display.word : "",
        difficultyLevel,
        showDifficultyBadge: showDifficulty,
        darkMode: opts.darkMode,
        letterStyles: display.letterStyles.length
          ? display.letterStyles
          : undefined,
        loopComponents:
          opts.showLoopGlyph === false
            ? undefined
            : opts.loopComponents
              ? new Set(opts.loopComponents)
              : undefined,
        rotationPeriod:
          opts.rotationPeriod ??
          (opts.loopComponents?.includes(LOOPComponent.ROTATED)
            ? loopPeriod
            : undefined),
        inversionPeriod:
          opts.inversionPeriod ??
          (opts.loopComponents?.includes(LOOPComponent.INVERTED)
            ? loopPeriod
            : undefined),
        reflectionAxis: opts.reflectionAxis,
        overlayComponents: opts.overlayComponents
          ? new Set(opts.overlayComponents)
          : undefined,
        compressedSegments: compressedSegments.some(
          (segment) => segment.repeat > 1
        )
          ? compressedSegments
          : undefined,
        glyphImages,
        glyphImagesAreThemeColored: !!glyphImages?.size,
        accentColor: opts.accentColor,
        accentTintOpacity: opts.accentTintOpacity,
      });
    },
    renderFooter: opts.showFooter
      ? (ctx, layout) =>
          renderFooter(ctx, {
            canvasWidth: layout.width,
            canvasHeight: layout.height,
            footerHeight: layout.footerHeight,
            notes: opts.notes,
            darkMode: opts.darkMode,
            accentColor: opts.accentColor,
            accentTintOpacity: opts.accentTintOpacity,
          })
      : undefined,
  });
}
