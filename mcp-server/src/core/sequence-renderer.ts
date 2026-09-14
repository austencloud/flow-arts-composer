/**
 * Sequence Renderer for MCP Server
 *
 * Composites multiple pictographs into a single "choreo card" image.
 * Uses the app's shared composition primitives for:
 * - Canonical TKA glyph headers and difficulty badges
 * - Footer styling
 * - Step labels overlaid on pictographs
 * - Smart cell borders and layout geometry
 */

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
  calculateHeaderHeight,
  calculateFooterHeight,
  LOOPComponent,
  type UserExportInfo,
  type LetterStyle,
} from "./text-renderer.js";
import {
  getLayout,
  renderSmartBorders,
  renderStepNumber,
} from "@tka/render-composition";

// Re-export LOOPComponent for consumers
export { LOOPComponent };
import { calculateDifficultyLevel } from "./difficulty-calculator.js";

/**
 * Legacy fallback for callers whose steps do not yet carry turn data.
 */
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
  // New options for visual parity
  showDifficulty?: boolean;
  userName?: string;
  notes?: string;
  birthday?: Date;
  // Difficulty level (for badge display and orientation calculation)
  level?: number;
  // Legacy turn fallback, indexed by step number - 1. Canonical turn values on
  // each motion always win so LOOP-derived steps keep the seed transformation.
  turnAllocation?: TurnAllocation;
  // LOOP components for the pie chart glyph (top-right corner)
  loopComponents?: LOOPComponent[];
  // LOOP period as integer (2 = halved, 4 = quartered) — rendered as badge on each icon
  period?: number;
  // Show reversal indicators (direction change dots on left edge)
  showReversals?: boolean;
  // LOOP sequence info - which steps are derived (transformed) vs seed (original)
  // Used for header text styling only - pictographs are not dimmed
  derivedStepIndices?: number[];
  // Original seed word for LOOP sequences (displayed prominently in header)
  seedWord?: string;
  // Prop artwork for both hands. Null/undefined keeps the staff default.
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

/**
 * Get start orientation based on difficulty level.
 * - Level 1-2: "in" (radial)
 * - Level 3: "clock" (non-radial)
 */
function getStartOrientationForLevel(level: number): string {
  return level === 3 ? "clock" : "in";
}

/**
 * Resolve the exact turn tuple sent to the pictograph renderer.
 *
 * Generated sequence steps are authoritative. The optional allocation exists
 * only for older callers that still provide steps without embedded turn data.
 */
export function resolveRenderedTurns(
  step: SequenceStep,
  turnAllocation?: TurnAllocation
): { left: number | "fl"; right: number | "fl" } {
  if (step.stepNumber === 0) {
    return { left: 0, right: 0 };
  }

  const allocationIndex = step.stepNumber - 1;
  return {
    left: step.leftMotion.turns ?? turnAllocation?.left[allocationIndex] ?? 0,
    right:
      step.rightMotion.turns ?? turnAllocation?.right[allocationIndex] ?? 0,
  };
}

/**
 * Resolve the header from the steps that are actually rendered.
 *
 * A generated word can gain bridge steps, so the requested input is not a
 * faithful label for the resulting sequence. LOOP cards are the exception:
 * their explicit seed word remains the compact header contract.
 */
export function resolveHeaderDisplay(
  steps: SequenceStep[],
  requestedWord: string,
  seedWord?: string,
  derivedStepIndices: number[] = []
): HeaderDisplay {
  const stepSteps = steps.filter((step) => step.stepNumber > 0);

  if (seedWord) {
    const seedSteps = stepSteps.filter(
      (step) => !step.isBridge && !derivedStepIndices.includes(step.stepNumber)
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
    word:
      stepSteps.length > 0
        ? stepSteps.map((step) => step.letter).join("")
        : requestedWord,
    letterStyles: stepSteps.map((step) => ({
      letter: step.letter,
      isBridge: !!step.isBridge,
      isDerived: false,
    })),
  };
}

/**
 * Render a sequence as a composite image.
 * Returns a PNG buffer.
 */
export async function renderSequenceToImage(
  steps: SequenceStep[],
  word: string,
  options: Partial<SequenceRenderOptions> = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const renderer = getStandaloneRenderer();

  // Include all steps (including step 0 start position)
  // Apply reversal detection if showReversals is enabled
  const letterSteps = opts.showReversals ? detectReversals(steps) : steps;

  if (letterSteps.length === 0) {
    throw new Error("No steps to render");
  }

  // Use provided level for difficulty badge
  const difficultyLevel = opts.level ?? 1;

  // Get base orientation based on level
  const baseOrientation = getStartOrientationForLevel(difficultyLevel);

  // Turn allocation (per step, per color)
  const turnAllocation = opts.turnAllocation;

  // Check if we need header and footer
  const hasHeader = !!(opts.showWord || opts.showDifficulty);
  // Footer always shows (with defaults) - "The Kinetic Alphabet" center text is always present
  const hasFooter = true;

  // Calculate layout dimensions
  const {
    width,
    height,
    columns,
    rows,
    headerHeight,
    footerHeight,
    gridStartY,
  } = calculateLayout(letterSteps.length, opts, hasHeader, hasFooter);

  // Create main canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Fill background for grid area
  ctx.fillStyle = opts.darkMode ? "#0a0a0f" : "#ffffff";
  ctx.fillRect(0, headerHeight, width, height - headerHeight - footerHeight);

  // Render each pictograph
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

  for (let i = 0; i < letterSteps.length; i++) {
    const step = letterSteps[i];
    if (!step) continue;

    // Calculate cell position using the offset layout
    const { row, col } = calculateStepPosition(i, columns);
    const x = col * opts.cellSize;
    const y = gridStartY + row * opts.cellSize;

    // Convert step to pictograph input format. LOOP-expanded steps already
    // contain the transformed turn tuple; never replace it during rendering.
    const stepNum = step.stepNumber;
    const { left: leftTurns, right: rightTurns } = resolveRenderedTurns(
      step,
      turnAllocation
    );

    const pictographInput: PictographInput = {
      letter: step.letter,
      startPosition: step.startPosition,
      endPosition: step.endPosition,
      leftMotion: {
        motionType: step.leftMotion.motionType,
        rotationDirection: step.leftMotion.rotationDirection || "no_rotation",
        startLocation: step.leftMotion.startLocation,
        endLocation: step.leftMotion.endLocation,
        hand: "left",
        turns: leftTurns,
        startOrientation: step.leftMotion.startOrientation || baseOrientation,
      },
      rightMotion: {
        motionType: step.rightMotion.motionType,
        rotationDirection: step.rightMotion.rotationDirection || "no_rotation",
        startLocation: step.rightMotion.startLocation,
        endLocation: step.rightMotion.endLocation,
        hand: "right",
        turns: rightTurns,
        startOrientation: step.rightMotion.startOrientation || baseOrientation,
      },
      // Reversal indicators (if detected)
      leftReversal: step.leftReversal,
      rightReversal: step.rightReversal,
    };

    try {
      // Render individual pictograph
      const pngBuffer = await renderer.renderToPng(
        pictographInput,
        visibilityOptions
      );

      // Load and draw onto composite canvas
      const { loadImage } = await import("canvas");
      const img = await loadImage(pngBuffer);
      ctx.drawImage(img, x, y, opts.cellSize, opts.cellSize);

      // Note: Derived steps in LOOP sequences are distinguished in the header text
      // (smaller font, secondary color) but the pictographs themselves are NOT dimmed
      // to maintain readability

      // Draw step number overlaid on pictograph (top-left corner)
      if (opts.showStepNumbers) {
        renderStepNumber(
          ctx as unknown as globalThis.CanvasRenderingContext2D,
          stepNum,
          x,
          y,
          opts.cellSize,
          opts.darkMode
        );
      }
    } catch (error) {
      // Draw error placeholder
      ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
      ctx.fillRect(x, y, opts.cellSize, opts.cellSize);
      ctx.fillStyle = opts.darkMode ? "#ff6b6b" : "#dc3545";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Error", x + opts.cellSize / 2, y + opts.cellSize / 2);
    }
  }

  const occupiedCells = new Set<string>();
  for (let index = 0; index < letterSteps.length; index++) {
    const { row, col } = calculateStepPosition(index, columns);
    occupiedCells.add(`${col},${row}`);
  }
  renderSmartBorders(ctx as unknown as globalThis.CanvasRenderingContext2D, {
    columns,
    rows,
    cellSize: opts.cellSize,
    offsetY: gridStartY,
    occupiedCells,
    darkMode: opts.darkMode,
  });

  // Draw word header if enabled
  if (hasHeader && headerHeight > 0) {
    const headerDisplay = resolveHeaderDisplay(
      letterSteps,
      word,
      opts.seedWord,
      opts.derivedStepIndices
    );

    await renderWordHeader(
      ctx,
      opts.showWord ? headerDisplay.word : "",
      width,
      headerHeight,
      difficultyLevel,
      opts.showDifficulty ?? true,
      opts.darkMode,
      headerDisplay.letterStyles.length > 0
        ? headerDisplay.letterStyles
        : undefined,
      opts.loopComponents
    );
  }

  // Draw user info footer (always shown with defaults)
  if (hasFooter && footerHeight > 0) {
    const userInfo: UserExportInfo = {
      userName: opts.userName,
      notes: opts.notes,
      birthday: opts.birthday,
      word, // Pass word for contextual captions
    };
    renderUserInfo(ctx, userInfo, width, height, footerHeight, opts.darkMode);
  }

  return canvas.toBuffer("image/png");
}

/**
 * Calculate grid position for a step, accounting for start position offset.
 *
 * Layout pattern:
 * Row 1: [start] [1] [2] [3] ...
 * Row 2:    -    [4] [5] [6] ...  (empty cell in column 0)
 * Row 3:    -    [7] [8] [9] ...
 *
 * @param stepIndex - Index in the steps array (0 = start position)
 * @param totalColumns - Total columns in the grid
 * @returns { row, col } position
 */
function calculateStepPosition(
  stepIndex: number,
  totalColumns: number
): { row: number; col: number } {
  if (stepIndex === 0) {
    // Start position is always at (0, 0)
    return { row: 0, col: 0 };
  }

  // Letter steps: account for start position taking column 0 of row 0
  // stepColumns = totalColumns - 1 (columns available for steps per row after the start column)
  const stepColumns = totalColumns - 1;
  const stepNumber = stepIndex - 1; // 0-based index among letter steps

  if (stepNumber < stepColumns) {
    // First row: steps go after the start position
    return { row: 0, col: stepNumber + 1 };
  }

  // Subsequent rows: start at column 1 (column 0 is empty)
  const adjustedIndex = stepNumber - stepColumns; // Index relative to row 2+
  const row = Math.floor(adjustedIndex / stepColumns) + 1;
  const col = (adjustedIndex % stepColumns) + 1;

  return { row, col };
}

function calculateLayout(
  stepCount: number,
  opts: SequenceRenderOptions,
  hasHeader: boolean,
  hasFooter: boolean
): {
  width: number;
  height: number;
  columns: number;
  rows: number;
  headerHeight: number;
  footerHeight: number;
  gridStartY: number;
} {
  // Calculate header and footer heights based on cell size (matching app proportions)
  const headerHeight = hasHeader ? calculateHeaderHeight(opts.cellSize) : 0;
  const footerHeight = hasFooter ? calculateFooterHeight(opts.cellSize) : 0;

  if (opts.layout === "strip") {
    // Single row layout - all steps in one row
    const columns = stepCount;
    const rows = 1;
    const width = columns * opts.cellSize;
    const height = headerHeight + opts.cellSize + footerHeight;
    return {
      width,
      height,
      columns,
      rows,
      headerHeight,
      footerHeight,
      gridStartY: headerHeight,
    };
  }

  const letterCount = stepCount - 1; // Exclude start position
  const [totalColumns, rows] = getLayout(letterCount, "column");

  const width = totalColumns * opts.cellSize;
  const height = headerHeight + rows * opts.cellSize + footerHeight;

  return {
    width,
    height,
    columns: totalColumns,
    rows,
    headerHeight,
    footerHeight,
    gridStartY: headerHeight,
  };
}
