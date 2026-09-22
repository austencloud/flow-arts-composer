/**
 * Canvas Renderer for animation visualization
 * Based on the exact implementation from standalone_animator.html
 */

import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import {
  simplifyRepeatedWord,
  compressWord,
} from "$lib/shared/foundation/utils/word-simplifier";
import {
  renderHeader,
  type LOOPComponentId,
  type LoopReflectionAxis,
} from "@tka/render-composition";
import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { textRenderer } from "$lib/shared/render/services/text-renderer";

// Constants from standalone_animator.html
// Using "strict" hand point offset (actual hand position, further from center)
// From gridCoordinates.ts: n_diamond_hand_point_strict at (475, 325.0) = 152px from center
const GRID_HALFWAY_POINT_OFFSET = 150;

/**
 * Render the complete animation scene
 * @param leftPropViewBoxDimensions - ViewBox dimensions from the left prop SVG (default: staff 252.8 x 77.8)
 * @param rightPropViewBoxDimensions - ViewBox dimensions from the right prop SVG (default: staff 252.8 x 77.8)
 */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  gridVisible: boolean,
  gridImage: HTMLImageElement | ImageBitmap | null,
  leftStaffImage: HTMLImageElement | ImageBitmap | null,
  rightStaffImage: HTMLImageElement | ImageBitmap | null,
  leftProp: PropState | null,
  rightProp: PropState | null,
  leftPropViewBoxDimensions: { width: number; height: number } = {
    width: 252.8,
    height: 77.8,
  },
  rightPropViewBoxDimensions: { width: number; height: number } = {
    width: 252.8,
    height: 77.8,
  }
): void {
  // Clear canvas exactly as in standalone
  ctx.clearRect(0, 0, canvasSize, canvasSize);

  // Draw white background (required for GIF export)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  // Draw grid exactly as in standalone
  drawGrid(ctx, canvasSize, gridVisible, gridImage);

  // Draw props with their viewBox dimensions (only if both image and prop state are available)
  if (leftStaffImage && leftProp) {
    drawStaff(
      ctx,
      canvasSize,
      leftProp,
      leftStaffImage,
      leftPropViewBoxDimensions
    );
  }

  if (rightStaffImage && rightProp) {
    drawStaff(
      ctx,
      canvasSize,
      rightProp,
      rightStaffImage,
      rightPropViewBoxDimensions
    );
  }
}

/**
 * Render a letter glyph onto the canvas at the standard position
 * This is called separately during GIF export to overlay the glyph
 */
export function renderLetterToCanvas(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  letterImage: HTMLImageElement,
  letterViewBoxDimensions: { width: number; height: number },
  opacity: number = 1
): void {
  drawLetter(ctx, canvasSize, letterImage, letterViewBoxDimensions, opacity);
}

/**
 * Render a beat number onto the canvas at the standard position (top-left)
 * Matches StepNumber.svelte positioning: x=50, y=50 in 950px viewBox
 */
export function renderStepNumberToCanvas(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  stepNumber: number | null,
  opacity: number = 1,
  darkMode: boolean = false
): void {
  drawStepNumber(ctx, canvasSize, stepNumber, opacity, darkMode);
}

/**
 * Render a word/sequence header onto the canvas at the top center
 * Matches WordHeader.svelte styling: semi-transparent background, centered Georgia Bold text
 * Supports letter highlighting during animation playback
 */
export function renderWordHeaderToCanvas(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  word: string | null,
  darkMode: boolean = false,
  activeStepNumber: number | null = null,
  difficultyLevel: number | null = null,
  loopComponents: Set<string> | null = null,
  rotationPeriod?: Period,
  inversionPeriod?: Period,
  overlayComponents: Set<string> | null = null,
  reflectionAxis?: LoopReflectionAxis
): void {
  drawWordHeader(
    ctx,
    canvasSize,
    word,
    darkMode,
    activeStepNumber,
    difficultyLevel,
    loopComponents,
    rotationPeriod,
    inversionPeriod,
    overlayComponents,
    reflectionAxis
  );
}

/**
 * Render a segmented progress bar
 * Ports the minimal variant from SegmentedSequenceProgressBar.svelte
 */
export function renderProgressBarToCanvas(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  y: number,
  totalSteps: number,
  currentStep: number,
  stepDurations: number[],
  darkMode: boolean
): void {
  drawProgressBar(
    ctx,
    canvasSize,
    y,
    totalSteps,
    currentStep,
    stepDurations,
    darkMode
  );
}

/**
 * Get the progress bar height for a given canvas size
 */
export function getProgressBarHeight(canvasSize: number): number {
  // Padding (top + bottom) + track height, proportional to canvas.
  // Matches in-app SegmentedSequenceProgressBar: ~24px container with 6px track
  return canvasSize * 0.04;
}

/**
 * Get the header height for a given canvas size
 * Used by VideoExportOrchestrator to calculate total canvas dimensions
 */
export function getHeaderHeight(canvasSize: number): number {
  return canvasSize * 0.07;
}

/**
 * Draw grid exactly as in standalone_animator.html
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  gridVisible: boolean,
  gridImage: HTMLImageElement | ImageBitmap | null
): void {
  if (!gridVisible || !gridImage) return;
  ctx.drawImage(gridImage, 0, 0, canvasSize, canvasSize);
}

/**
 * Draw prop with proper aspect ratio preservation
 * The prop's length (height in viewBox) is constrained to fit between center and outer point,
 * and the width is scaled proportionally to preserve the aspect ratio.
 *
 * For dash motions, uses pre-calculated Cartesian x,y coordinates for straight-line movement.
 * For other motions, calculates position from angle using polar coordinates.
 */
function drawStaff(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  propState: PropState,
  staffImage: HTMLImageElement | ImageBitmap,
  viewBoxDimensions: { width: number; height: number }
): void {
  // Calculate position
  const centerX = canvasSize / 2;
  const centerY = canvasSize / 2;
  const inwardFactor = 0.95;
  const gridScaleFactor = canvasSize / 950; // 950 is the viewBox size
  const scaledHalfwayRadius = GRID_HALFWAY_POINT_OFFSET * gridScaleFactor;

  // Use pre-calculated x,y if provided (dash motions), otherwise calculate from angle
  let x: number, y: number;
  if (propState.x !== undefined && propState.y !== undefined) {
    // Dash motion: use Cartesian coordinates directly (already in unit circle space)
    x = centerX + propState.x * scaledHalfwayRadius * inwardFactor;
    y = centerY + propState.y * scaledHalfwayRadius * inwardFactor;
  } else {
    // Regular motion: calculate from angle using polar coordinates
    x =
      centerX +
      Math.cos(propState.centerPathAngle) * scaledHalfwayRadius * inwardFactor;
    y =
      centerY +
      Math.sin(propState.centerPathAngle) * scaledHalfwayRadius * inwardFactor;
  }

  // Scale the prop dimensions from viewBox coordinate space to canvas pixels
  // This preserves the aspect ratio of the prop
  const propWidth = viewBoxDimensions.width * gridScaleFactor;
  const propHeight = viewBoxDimensions.height * gridScaleFactor;

  const propCenterX = viewBoxDimensions.width / 2;
  const propCenterY = viewBoxDimensions.height / 2;

  // Draw the prop
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(propState.staffRotationAngle);
  ctx.drawImage(
    staffImage,
    -propCenterX * gridScaleFactor,
    -propCenterY * gridScaleFactor,
    propWidth,
    propHeight
  );
  ctx.restore();
}

/**
 * Draw letter glyph in the bottom-left area of the canvas
 * Position matches the SVG overlay positioning: x=50, y=800 in 952px viewBox
 */
function drawLetter(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  letterImage: HTMLImageElement,
  letterViewBoxDimensions: { width: number; height: number },
  opacity: number = 1
): void {
  const gridScaleFactor = canvasSize / 950; // 950 is the viewBox size

  // Position matches TKAGlyph.svelte defaults: x=50, y=800 in 952px viewBox
  const x = 50 * gridScaleFactor;
  const y = 800 * gridScaleFactor;

  // Scale letter to match canvas size relative to 952px viewBox (same as props and grid)
  // All SVGs are designed relative to the 950×950 viewBox, so we use gridScaleFactor consistently
  const scaledWidth = letterViewBoxDimensions.width * gridScaleFactor;
  const scaledHeight = letterViewBoxDimensions.height * gridScaleFactor;

  // Apply opacity for crossfade effects
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(letterImage, x, y, scaledWidth, scaledHeight);
  ctx.restore();
}

/**
 * Draw beat number in the top-left area of the canvas
 * Position matches StepNumber.svelte: x=50, y=50 in 950px viewBox
 * Style matches: Georgia serif, bold, fill only (no stroke) with dark mode support
 */
function drawStepNumber(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  stepNumber: number | null,
  opacity: number = 1,
  darkMode: boolean = false
): void {
  if (stepNumber === null) return;

  const gridScaleFactor = canvasSize / 950;

  // Position matches StepNumber.svelte: x=50, y=50 in 950px viewBox
  const x = 50 * gridScaleFactor;
  const y = 50 * gridScaleFactor;

  // Font size matches StepNumber.svelte: 100 for numbers, 80 for "Start"
  const isStart = stepNumber === 0;
  const fontSize = (isStart ? 80 : 100) * gridScaleFactor;
  const displayText = isStart ? "Start" : stepNumber.toString();

  ctx.save();

  // Apply opacity for crossfade effects
  ctx.globalAlpha = opacity;

  // Set font style to match StepNumber.svelte
  ctx.font = `bold ${fontSize}px Georgia, serif`;
  ctx.textBaseline = "hanging";
  ctx.textAlign = "start";

  // Fill color based on dark mode (matches StepNumber.svelte)
  // Dark mode: white (#ffffff), Light mode: dark gray (#231f20)
  ctx.fillStyle = darkMode ? "#ffffff" : "#231f20";
  ctx.fillText(displayText, x, y);

  ctx.restore();
}

/**
 * Draw word header as a full-width bar at the top of the canvas
 * Style matches WordHeader.svelte: full-width gradient background, centered Georgia Bold text
 * Supports letter highlighting during animation playback.
 *
 * Uses simplifyAndTruncate(word, 12) to match WordHeader.svelte display.
 */
function drawWordHeader(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  word: string | null,
  darkMode: boolean,
  activeStepNumber: number | null,
  difficultyLevel: number | null,
  loopComponents: Set<string> | null,
  rotationPeriod: Period | undefined,
  inversionPeriod: Period | undefined,
  overlayComponents: Set<string> | null = null,
  reflectionAxis?: LoopReflectionAxis
): void {
  if (!word || word.trim() === "") return;

  const displayText = simplifyRepeatedWord(word);

  const headerHeight = canvasSize * 0.07;

  // Build per-character letterStyles only when highlighting is active.
  // The canvas-native renderer indexes letterStyles by character (not letter-unit);
  // parseLetterUnits gives us the unit count and which unit index is active,
  // and we expand that into a per-character style array matching displayText.
  let letterStyles: Array<{ letter: string; dimmed: boolean }> | undefined;
  const letterUnits = parseLetterUnits(displayText);
  const hasHighlighting =
    activeStepNumber !== null &&
    activeStepNumber >= 1 &&
    letterUnits.length > 0;
  if (hasHighlighting) {
    const activeIndex = (activeStepNumber! - 1) % letterUnits.length;
    letterStyles = [];
    let charIndex = 0;
    for (let unitIdx = 0; unitIdx < letterUnits.length; unitIdx++) {
      const unit = letterUnits[unitIdx]!;
      const dimmed = unitIdx !== activeIndex;
      for (const ch of unit) {
        letterStyles.push({ letter: displayText[charIndex] ?? ch, dimmed });
        charIndex++;
      }
    }
  }

  // Map the app's Period enum values to the package's string literal.
  // The enum values line up ("halved" / "quartered"), but typing the
  // handoff explicitly keeps the package independent of the app enum.
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

  const glyphImages = textRenderer.buildGlyphMap(displayText);
  const segments = compressWord(displayText);
  const hasCompression = segments.some((s: { repeat: number }) => s.repeat > 1);

  renderHeader(ctx, {
    canvasWidth: canvasSize,
    headerHeight,
    word: displayText,
    difficultyLevel: difficultyLevel ?? undefined,
    showDifficultyBadge: difficultyLevel != null,
    loopComponents: (loopComponents ?? undefined) as
      | Set<LOOPComponentId>
      | undefined,
    rotationPeriod: periodForRender,
    inversionPeriod: inversionForRender,
    reflectionAxis,
    overlayComponents: (overlayComponents ?? undefined) as
      | Set<LOOPComponentId>
      | undefined,
    darkMode,
    letterStyles,
    glyphImages: glyphImages.size > 0 ? glyphImages : undefined,
    compressedSegments: hasCompression ? segments : undefined,
  });
}

/**
 * Parse a display string into TKA letter units.
 * Dash-letters (e.g., "W-", "Φ-") count as one unit.
 * Matches WordHeader.svelte parsedLetters logic.
 */
function parseLetterUnits(text: string): string[] {
  const units: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const next = text[i + 1];
    if (next === "-") {
      units.push(char + "-");
      i++;
    } else {
      units.push(char);
    }
  }
  return units;
}

/**
 * Draw a segmented progress bar.
 * Ports the "minimal" variant from SegmentedSequenceProgressBar.svelte.
 */
function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  y: number,
  totalSteps: number,
  currentStep: number,
  stepDurations: number[],
  darkMode: boolean
): void {
  if (totalSteps <= 0) return;

  const barHeight = getProgressBarHeight(canvasSize);
  const trackHeight = barHeight * 0.35; // Match in-app track proportion
  const trackY = y + (barHeight - trackHeight) / 2; // vertically centered

  ctx.save();

  // Background gradient (matches word header / progress bar container)
  const bgGradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
  if (darkMode) {
    bgGradient.addColorStop(0, "rgba(15, 15, 20, 0.98)");
    bgGradient.addColorStop(1, "rgba(10, 10, 15, 0.98)");
  } else {
    bgGradient.addColorStop(0, "rgba(248, 248, 248, 0.98)");
    bgGradient.addColorStop(1, "rgba(240, 240, 240, 0.98)");
  }
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, y, canvasSize, barHeight);

  // Track background
  ctx.fillStyle = darkMode
    ? "rgba(255, 255, 255, 0.08)"
    : "rgba(0, 0, 0, 0.08)";
  ctx.fillRect(0, trackY, canvasSize, trackHeight);

  // Calculate duration-aware progress
  const totalDuration = stepDurations.reduce((sum, d) => sum + d, 0);
  if (totalDuration <= 0) {
    ctx.restore();
    return;
  }

  // currentStep is 0-based float: 0.0 = beat 0 start, 1.5 = beat 1 halfway
  const stepIndex = Math.floor(currentStep);
  const progressWithinStep = currentStep - stepIndex;

  let completedDuration = 0;
  for (let i = 0; i < Math.min(stepIndex, totalSteps); i++) {
    completedDuration += stepDurations[i] ?? 1;
  }
  if (stepIndex < totalSteps) {
    completedDuration += (stepDurations[stepIndex] ?? 1) * progressWithinStep;
  }

  const progressPercent = Math.max(
    0,
    Math.min(1, completedDuration / totalDuration)
  );

  // Progress fill gradient
  const fillWidth = canvasSize * progressPercent;
  if (fillWidth > 0) {
    const fillGradient = ctx.createLinearGradient(0, trackY, fillWidth, trackY);
    if (darkMode) {
      fillGradient.addColorStop(0, "#00b8b8");
      fillGradient.addColorStop(0.5, "#00e5e5");
      fillGradient.addColorStop(1, "#00b8b8");
    } else {
      fillGradient.addColorStop(0, "#3b82f6");
      fillGradient.addColorStop(0.5, "#60a5fa");
      fillGradient.addColorStop(1, "#3b82f6");
    }
    ctx.fillStyle = fillGradient;
    ctx.fillRect(0, trackY, fillWidth, trackHeight);
  }

  // Segment dividers (tick marks between beats)
  let cumulativeDuration = 0;
  ctx.strokeStyle = darkMode
    ? "rgba(255, 255, 255, 0.45)"
    : "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i < totalSteps - 1; i++) {
    cumulativeDuration += stepDurations[i] ?? 1;
    const dividerX = (cumulativeDuration / totalDuration) * canvasSize;
    ctx.beginPath();
    ctx.moveTo(dividerX, trackY);
    ctx.lineTo(dividerX, trackY + trackHeight);
    ctx.stroke();
  }

  ctx.restore();
}
