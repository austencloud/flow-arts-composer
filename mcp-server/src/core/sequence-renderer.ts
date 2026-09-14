/** MCP adapter for the platform-neutral choreo card composition pipeline. */
import {
  createCanvas,
  type Canvas,
  type CanvasRenderingContext2D,
} from "canvas";
import {
  getStandaloneRenderer,
  type PictographInput,
  type RenderVisibilityOptions,
} from "./standalone-renderer.js";
import {
  detectReversals,
  type SequenceStep,
} from "./sequence-builder-adapter.js";
import {
  renderWordHeader,
  renderUserInfo,
  LOOPComponent,
  type UserExportInfo,
  type LetterStyle,
} from "./text-renderer.js";
import {
  composeSequenceCard,
  type SequenceCardHeader,
} from "@tka/render-composition";
import { calculateDifficultyLevel } from "./difficulty-calculator.js";

export { LOOPComponent };

export interface TurnAllocation {
  left: (number | "fl")[];
  right: (number | "fl")[];
}
export interface HeaderDisplay {
  word: string;
  letterStyles: LetterStyle[];
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
  period?: number;
  showReversals?: boolean;
  derivedStepIndices?: number[];
  seedWord?: string;
  leftPropType?: string | null;
  rightPropType?: string | null;
}
const DEFAULT_OPTIONS: SequenceRenderOptions = {
  layout: "grid",
  cellSize: 900,
  padding: 8,
  showStepNumbers: true,
  showWord: true,
  darkMode: true,
  showDifficulty: true,
  level: 1,
  showReversals: true,
};

/** Legacy fallback for callers whose steps do not yet carry turn data. */
export function resolveRenderedTurns(
  step: SequenceStep,
  turnAllocation?: TurnAllocation,
): { left: number | "fl"; right: number | "fl" } {
  if (step.stepNumber === 0) return { left: 0, right: 0 };
  const allocationIndex = step.stepNumber - 1;
  return {
    left: step.leftMotion.turns ?? turnAllocation?.left[allocationIndex] ?? 0,
    right:
      step.rightMotion.turns ?? turnAllocation?.right[allocationIndex] ?? 0,
  };
}

export function resolveHeaderDisplay(
  steps: SequenceStep[],
  requestedWord: string,
  seedWord?: string,
  derivedStepIndices: number[] = [],
): HeaderDisplay {
  const stepSteps = steps.filter((step) => step.stepNumber > 0);
  if (seedWord) {
    const seedSteps = stepSteps.filter(
      (step) => !step.isBridge && !derivedStepIndices.includes(step.stepNumber),
    );
    return {
      word: seedWord,
      letterStyles: seedSteps.map((step) => ({
        letter: step.letter,
        isBridge: false,
        isDerived: false,
      })),
    };
  }
  return {
    word: stepSteps.length
      ? stepSteps.map((step) => step.letter).join("")
      : requestedWord,
    letterStyles: stepSteps.map((step) => ({
      letter: step.letter,
      isBridge: !!step.isBridge,
      isDerived: false,
    })),
  };
}

export async function renderSequenceToImage(
  steps: SequenceStep[],
  word: string,
  options: Partial<SequenceRenderOptions> = {},
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const renderer = getStandaloneRenderer();
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
  };
  return composeSequenceCard<SequenceStep, Canvas>({
    steps,
    word,
    options: {
      ...opts,
      showDifficulty: opts.showDifficulty ?? true,
      showReversals: opts.showReversals ?? false,
    },
    createCanvas,
    getContext: (canvas) =>
      canvas.getContext("2d") as unknown as globalThis.CanvasRenderingContext2D,
    toPng: (canvas) => canvas.toBuffer("image/png"),
    getStepNumber: (step) => step.stepNumber,
    applyReversals: detectReversals,
    calculateDifficultyLevel: (renderedSteps) =>
      opts.level ?? calculateDifficultyLevel(renderedSteps),
    renderPictograph: async (ctx, step, cell) => {
      const turns = resolveRenderedTurns(step, opts.turnAllocation);
      const pictograph: PictographInput = {
        letter: step.letter,
        startPosition: step.startPosition,
        endPosition: step.endPosition,
        leftMotion: {
          ...step.leftMotion,
          rotationDirection: step.leftMotion.rotationDirection || "no_rotation",
          hand: "left",
          turns: turns.left,
          startOrientation:
            step.leftMotion.startOrientation || cell.baseOrientation,
        },
        rightMotion: {
          ...step.rightMotion,
          rotationDirection:
            step.rightMotion.rotationDirection || "no_rotation",
          hand: "right",
          turns: turns.right,
          startOrientation:
            step.rightMotion.startOrientation || cell.baseOrientation,
        },
        leftReversal: step.leftReversal,
        rightReversal: step.rightReversal,
      };
      const png = await renderer.renderToPng(pictograph, visibilityOptions);
      const { loadImage } = await import("canvas");
      ctx.drawImage(
        (await loadImage(png)) as unknown as CanvasImageSource,
        cell.x,
        cell.y,
        cell.cellSize,
        cell.cellSize,
      );
    },
    buildHeader: (renderedSteps, requestedWord) => ({
      ...resolveHeaderDisplay(
        renderedSteps,
        requestedWord,
        opts.seedWord,
        opts.derivedStepIndices,
      ),
    }),
    renderHeader: async (ctx, header, layout, difficultyLevel) => {
      const display = header as SequenceCardHeader & HeaderDisplay;
      await renderWordHeader(
        ctx as unknown as CanvasRenderingContext2D,
        opts.showWord ? display.word : "",
        layout.width,
        layout.headerHeight,
        difficultyLevel,
        opts.showDifficulty ?? true,
        opts.darkMode,
        display.letterStyles.length ? display.letterStyles : undefined,
        opts.loopComponents,
      );
    },
    renderFooter: (ctx, layout) => {
      renderUserInfo(
        ctx as unknown as CanvasRenderingContext2D,
        {
          userName: opts.userName,
          notes: opts.notes,
          birthday: opts.birthday,
          word,
        } satisfies UserExportInfo,
        layout.width,
        layout.height,
        layout.footerHeight,
        opts.darkMode,
      );
    },
  });
}
