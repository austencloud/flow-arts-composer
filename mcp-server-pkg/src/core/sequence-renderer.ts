/** Packaged-MCP adapter for the shared choreo card composition pipeline. */
import {
  getStandaloneRenderer,
  type PictographInput,
  type RenderVisibilityOptions,
} from "./standalone-renderer.js";
import { detectReversals, type SequenceStep } from "./sequence-builder.js";
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
} from "@tka/render-composition";
import { loadTkaWordGlyphs } from "./tka-glyph-loader.js";
import { calculateDifficultyLevel } from "./difficulty-calculator.js";

let canvasModule: typeof import("canvas") | null = null;
async function getCanvas() {
  if (!canvasModule) {
    try {
      canvasModule = await import("canvas");
    } catch {
      throw new Error(
        "The 'canvas' package is required for sequence rendering but is not installed. Install it with: npm install canvas"
      );
    }
  }
  return canvasModule;
}

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
  turnAllocation?: TurnAllocation;
  loopComponents?: LOOPComponent[];
  showReversals?: boolean;
  derivedBeatIndices?: number[];
  seedWord?: string;
  startPositionLayout?: "row" | "column";
  showFooter?: boolean;
  showMandala?: boolean;
  primaryPropColors?: HandColorPair | null;
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
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const primaryPropColors = opts.primaryPropColors
    ? resolveHandColorPair(
        opts.primaryPropColors,
        opts.darkMode ? DARK_HAND_COLORS : LIGHT_HAND_COLORS
      )
    : null;
  const renderer = getStandaloneRenderer();
  const canvasApi = await getCanvas();
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
    primaryPropColors,
  };
  return composeSequenceCard<SequenceStep, import("canvas").Canvas>({
    steps,
    word,
    options: {
      ...opts,
      showDifficulty: opts.showDifficulty ?? true,
      showFooter: opts.showFooter ?? false,
      showReversals: opts.showReversals ?? false,
      startPositionLayout: opts.startPositionLayout ?? "row",
    },
    createCanvas: canvasApi.createCanvas,
    getContext: (canvas) =>
      canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
    toPng: (canvas) => canvas.toBuffer("image/png"),
    getStepNumber: (step) => step.stepNumber,
    applyReversals: (source) => detectReversals(source, isLoop),
    calculateDifficultyLevel: (renderedSteps) =>
      opts.level ?? calculateDifficultyLevel(renderedSteps),
    renderPictograph: async (ctx, step, cell) => {
      const allocationIndex = step.stepNumber - 1;
      const leftTurns =
        step.stepNumber === 0
          ? 0
          : (opts.turnAllocation?.left[allocationIndex] ?? 0);
      const rightTurns =
        step.stepNumber === 0
          ? 0
          : (opts.turnAllocation?.right[allocationIndex] ?? 0);
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
        (await canvasApi.loadImage(
          await renderer.renderToPng(pictograph, visibilityOptions)
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
      const headerWord = opts.seedWord ?? requestedWord;
      const seedLetters = opts.seedWord
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
      const glyphImages = opts.showWord
        ? await loadTkaWordGlyphs(
            display.word,
            async (source) =>
              (await canvasApi.loadImage(
                source
              )) as unknown as CanvasImageSource,
            opts.darkMode
          )
        : undefined;
      renderHeader(ctx, {
        canvasWidth: layout.width,
        headerHeight: layout.headerHeight,
        word: opts.showWord ? display.word : "",
        difficultyLevel,
        showDifficultyBadge: opts.showDifficulty ?? true,
        darkMode: opts.darkMode,
        letterStyles: display.letterStyles.length
          ? display.letterStyles
          : undefined,
        loopComponents: opts.loopComponents
          ? new Set(opts.loopComponents)
          : undefined,
        glyphImages,
        glyphImagesAreThemeColored: !!glyphImages?.size,
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
          })
      : undefined,
  });
}
