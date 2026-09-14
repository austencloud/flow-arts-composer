/**
 * Sequence Renderer for MCP Server
 *
 * Composites multiple pictographs into a single "choreo card" image.
 * Matches the app's ImageComposer output with:
 * - Header with word text and difficulty badge (Georgia Bold)
 * - Footer with username, notes, and birthday
 * - Step numbers overlaid on pictographs (top-left corner)
 * - Smart cell borders between occupied cells
 */

import {
  getStandaloneRenderer,
  type PictographInput,
  type RenderVisibilityOptions,
} from "./standalone-renderer.js";

// canvas is an optional dependency - dynamically import to avoid crash if not installed
let canvasModule: typeof import("canvas") | null = null;
async function getCanvas() {
  if (!canvasModule) {
    try {
      canvasModule = await import("canvas");
    } catch {
      throw new Error(
        "The 'canvas' package is required for sequence rendering but is not installed. " +
          "Install it with: npm install canvas"
      );
    }
  }
  return canvasModule;
}
import { detectReversals, type SequenceStep } from "./sequence-builder.js";
import {
  calculateFooterHeight,
  calculateHeaderHeight,
  getLayout,
  renderFooter,
  renderHeader,
  renderSmartBorders,
  renderStepNumber,
  type LOOPComponentId,
  type LetterStyle,
} from "@tka/render-composition";
import { loadTkaWordGlyphs } from "./tka-glyph-loader.js";

// Re-export LOOPComponent for consumers
export const LOOPComponent = {
  ROTATED: "rotated",
  MIRRORED: "mirrored",
  FLIPPED: "flipped",
  SWAPPED: "swapped",
  INVERTED: "inverted",
  REWOUND: "rewound",
} as const;
export type LOOPComponent = LOOPComponentId;
import { calculateDifficultyLevel } from "./difficulty-calculator.js";


/**
 * Turn allocation per step (left and right get independent values)
 */
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
  // New options for visual parity
  showDifficulty?: boolean;
  userName?: string;
  notes?: string;
  birthday?: Date;
  // Difficulty level (for badge display and orientation calculation)
  level?: number;
  // Turn allocations per step (indexed by step number - 1, since step 0 is start position)
  // Each motion gets its own random turn value
  turnAllocation?: TurnAllocation;
  // LOOP components for the pie chart glyph (top-right corner)
  loopComponents?: LOOPComponent[];
  // Show reversal indicators (direction change dots on left edge)
  showReversals?: boolean;
  // LOOP sequence info - which beats are derived (transformed) vs seed (original)
  // Used for header text styling only - pictographs are not dimmed
  derivedBeatIndices?: number[];
  // Original seed word for LOOP sequences (displayed prominently in header)
  seedWord?: string;
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
 * - Level 1-2: "in" (radial)
 * - Level 3: "clock" (non-radial)
 */
function getStartOrientationForLevel(level: number): string {
  return level === 3 ? "clock" : "in";
}

/**
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
  const isLoop = !!(opts.loopComponents && opts.loopComponents.length > 0);
  const letterSteps = opts.showReversals
    ? detectReversals(steps, isLoop)
    : steps;

  if (letterSteps.length === 0) {
    throw new Error("No steps to render");
  }

  // Use provided level for difficulty badge
  const difficultyLevel = opts.level ?? 1;

  // Get base orientation based on level
  const baseOrientation = getStartOrientationForLevel(difficultyLevel);

  // Turn allocation (per step, per hand)
  const turnAllocation = opts.turnAllocation;

  // Check if we need header and footer
  const hasHeader = !!(opts.showWord || opts.showDifficulty);
  // Footer always shows (with defaults) - "Created with Flow Arts Composer" center text is always present
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
  const { createCanvas } = await getCanvas();
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
  };

  for (let i = 0; i < letterSteps.length; i++) {
    const step = letterSteps[i];
    if (!step) continue;

    // Calculate cell position using the offset layout
    const { row, col } = calculateStepPosition(i, columns);
    const x = col * opts.cellSize;
    const y = gridStartY + row * opts.cellSize;

    // Convert step to pictograph input format
    // Step 0 is start position (always 0 turns)
    // Other steps get their turns from the allocation array (indexed by stepNumber - 1)
    const allocationIndex = step.stepNumber - 1;
    const leftTurns =
      step.stepNumber === 0 ? 0 : (turnAllocation?.left[allocationIndex] ?? 0);
    const rightTurns =
      step.stepNumber === 0 ? 0 : (turnAllocation?.right[allocationIndex] ?? 0);

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
      const { loadImage } = await getCanvas();
      const img = await loadImage(pngBuffer);
      ctx.drawImage(img, x, y, opts.cellSize, opts.cellSize);

      // Note: Derived beats in LOOP sequences are distinguished in the header text
      // (smaller font, secondary color) but the pictographs themselves are NOT dimmed
      // to maintain readability

      // Draw step number overlaid on pictograph (top-left corner)
      if (opts.showStepNumbers) {
        renderStepNumber(
          ctx as unknown as CanvasRenderingContext2D,
          step.stepNumber,
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

  // Draw smart cell borders between occupied cells
  const occupiedCells = new Set<string>();
  for (let i = 0; i < letterSteps.length; i++) {
    const { row, col } = calculateStepPosition(i, columns);
    occupiedCells.add(`${col},${row}`);
  }
  renderSmartBorders(ctx as unknown as CanvasRenderingContext2D, {
    columns,
    rows,
    cellSize: opts.cellSize,
    offsetY: gridStartY,
    occupiedCells,
    darkMode: opts.darkMode,
  });

  // Draw word header if enabled
  if (hasHeader && headerHeight > 0) {
    // For LOOP sequences, use the seedWord (original word) for the header display
    // instead of the full loopWord (which includes derived/transformed letters)
    const headerWord = opts.seedWord ?? word;

    // Build letter styles from seed word only (for LOOP sequences)
    // This shows ONLY the original letters, not the transformed portion
    const seedLetters = opts.seedWord
      ? letterSteps.filter(
          (s) =>
            s.stepNumber > 0 && !opts.derivedBeatIndices?.includes(s.stepNumber)
        )
      : letterSteps.filter((s) => s.stepNumber > 0);

    // Filter out bridge letters from styles since they aren't displayed in the header.
    // Without this, bridge styles (dimmed) get applied to the wrong header characters
    // because the styles array is longer than the displayed word.
    const letterStyles: LetterStyle[] = opts.showWord
      ? seedLetters
          .filter((s) => !s.isBridge)
          .map((s) => ({
            letter: s.letter,
            dimmed: false,
          }))
      : [];

    const { loadImage } = await getCanvas();
    const glyphImages = opts.showWord
      ? await loadTkaWordGlyphs(
          headerWord,
          async (source) => (await loadImage(source)) as unknown as CanvasImageSource,
          opts.darkMode
        )
      : undefined;
    renderHeader(ctx as unknown as CanvasRenderingContext2D, {
      canvasWidth: width,
      headerHeight,
      word: opts.showWord ? headerWord : "",
      difficultyLevel,
      showDifficultyBadge: opts.showDifficulty ?? true,
      darkMode: opts.darkMode,
      letterStyles: letterStyles.length > 0 ? letterStyles : undefined,
      loopComponents: opts.loopComponents ? new Set(opts.loopComponents) : undefined,
      glyphImages,
      glyphImagesAreThemeColored: !!glyphImages?.size,
    });
  }

  // The current app footer intentionally carries only its shared center label.
  // userName and birthday remain accepted above for tool-call compatibility.
  if (hasFooter && footerHeight > 0) {
    renderFooter(ctx as unknown as CanvasRenderingContext2D, {
      canvasWidth: width,
      canvasHeight: height,
      footerHeight,
      notes: opts.notes,
      darkMode: opts.darkMode,
    });
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
  // beatColumns = totalColumns - 1 (columns available for beats per row after the start column)
  const beatColumns = totalColumns - 1;
  const stepNumber = stepIndex - 1; // 0-based index among letter steps

  if (stepNumber < beatColumns) {
    // First row: steps go after the start position
    return { row: 0, col: stepNumber + 1 };
  }

  // Subsequent rows: start at column 1 (column 0 is empty)
  const adjustedIndex = stepNumber - beatColumns; // Index relative to row 2+
  const row = Math.floor(adjustedIndex / beatColumns) + 1;
  const col = (adjustedIndex % beatColumns) + 1;

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

  // Grid layout using the same layout table as the app
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
