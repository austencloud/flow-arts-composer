export function getProgressBarHeight(canvasSize: number): number {
  return canvasSize * 0.04;
}

/**
 * Draw a segmented progress bar.
 * Ports the "minimal" variant from SegmentedSequenceProgressBar.svelte.
 */
export function renderProgressBarToCanvas(
  ctx: CanvasRenderingContext2D,
  canvasSize: number,
  y: number,
  totalSteps: number,
  currentStep: number,
  stepDurations: readonly number[],
  darkMode: boolean,
  normalizedProgress?: number
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
  const durations = Array.from(
    { length: totalSteps },
    (_, index) => stepDurations[index] ?? 1
  );
  const totalDuration = durations.reduce((sum, d) => sum + d, 0);
  if (totalDuration <= 0) {
    ctx.restore();
    return;
  }

  // currentStep is 0-based float: 0.0 = beat 0 start, 1.5 = beat 1 halfway
  const stepIndex = Math.floor(currentStep);
  const progressWithinStep = currentStep - stepIndex;

  let completedDuration = 0;
  for (let i = 0; i < Math.min(stepIndex, totalSteps); i++) {
    completedDuration += durations[i] ?? 1;
  }
  if (stepIndex < totalSteps) {
    completedDuration += (durations[stepIndex] ?? 1) * progressWithinStep;
  }

  const progressPercent = Math.max(
    0,
    Math.min(1, normalizedProgress ?? completedDuration / totalDuration)
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
    cumulativeDuration += durations[i] ?? 1;
    const dividerX = (cumulativeDuration / totalDuration) * canvasSize;
    ctx.beginPath();
    ctx.moveTo(dividerX, trackY);
    ctx.lineTo(dividerX, trackY + trackHeight);
    ctx.stroke();
  }

  ctx.restore();
}
