/**
 * Phase1OverlayRenderer - Hand position visualization overlay
 *
 * Draws detection results from Phase 1 (MediaPipe hand tracking) onto
 * a canvas overlay positioned over the source video frame:
 *
 * - Left/right circles at detected hand positions
 * - Confidence-based color coding (green/amber/red rings)
 * - Grid location labels (N, NE, E, etc.)
 * - Crosshair grid showing the 8 cardinal/intercardinal positions
 * - Beat boundary indicator bar
 */

import type { OverlayRenderContext } from "./types";
import type { DetectedBeat } from "../domain/models";

/** Grid location to normalized position mapping (0-1 range) */
const GRID_PLACEMENTS: Record<string, { x: number; y: number }> = {
  n: { x: 0.5, y: 0.15 },
  ne: { x: 0.8, y: 0.2 },
  e: { x: 0.85, y: 0.5 },
  se: { x: 0.8, y: 0.8 },
  s: { x: 0.5, y: 0.85 },
  sw: { x: 0.2, y: 0.8 },
  w: { x: 0.15, y: 0.5 },
  nw: { x: 0.2, y: 0.2 },
  c: { x: 0.5, y: 0.5 },
};

const HAND_CIRCLE_RADIUS = 12;
const CONFIDENCE_RING_WIDTH = 3;
const GRID_LABEL_FONT_SIZE = 11;
const CROSSHAIR_OPACITY = 0.15;

export class Phase1OverlayRenderer {
  readonly name = "Phase 1: Hand Positions";
  readonly phase = 1;

  render(context: OverlayRenderContext): void {
    const { ctx, width, height, frame, beats, timestamp } = context;

    ctx.clearRect(0, 0, width, height);

    this.drawCrosshairGrid(ctx, width, height);
    this.drawGridLabels(ctx, width, height);

    if (frame) {
      if (frame.left) {
        this.drawHandMarker(
          ctx,
          width,
          height,
          frame.left.rawPosition,
          frame.left.confidence,
          frame.left.quadrant,
          "#3b82f6",
          "B"
        );
      }

      if (frame.right) {
        this.drawHandMarker(
          ctx,
          width,
          height,
          frame.right.rawPosition,
          frame.right.confidence,
          frame.right.quadrant,
          "#ef4444",
          "R"
        );
      }
    }

    this.drawStepIndicator(ctx, width, height, beats, timestamp);
  }

  /** Draw the crosshair grid showing all 8+center grid positions */
  private drawCrosshairGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${CROSSHAIR_OPACITY})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Vertical center line
    ctx.beginPath();
    ctx.moveTo(width * 0.5, 0);
    ctx.lineTo(width * 0.5, height);
    ctx.stroke();

    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, height * 0.5);
    ctx.lineTo(width, height * 0.5);
    ctx.stroke();

    // Diagonal lines (NW-SE, NE-SW)
    ctx.beginPath();
    ctx.moveTo(width * 0.15, height * 0.15);
    ctx.lineTo(width * 0.85, height * 0.85);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width * 0.85, height * 0.15);
    ctx.lineTo(width * 0.15, height * 0.85);
    ctx.stroke();

    ctx.restore();
  }

  /** Draw small labels at each grid position */
  private drawGridLabels(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    ctx.save();
    ctx.font = `${GRID_LABEL_FONT_SIZE}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const [label, pos] of Object.entries(GRID_PLACEMENTS)) {
      const x = pos.x * width;
      const y = pos.y * height;

      // Background pill
      const textWidth = ctx.measureText(label.toUpperCase()).width;
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.beginPath();
      ctx.roundRect(
        x - textWidth / 2 - 4,
        y - GRID_LABEL_FONT_SIZE / 2 - 2,
        textWidth + 8,
        GRID_LABEL_FONT_SIZE + 4,
        3
      );
      ctx.fill();

      // Label text
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.fillText(label.toUpperCase(), x, y);
    }

    ctx.restore();
  }

  /** Draw a hand marker at the detected position */
  private drawHandMarker(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    rawPosition: { x: number; y: number },
    confidence: number,
    quadrant: string,
    color: string,
    label: string
  ): void {
    // MediaPipe rawPosition is in normalized coordinates (0-1)
    const x = rawPosition.x * width;
    const y = rawPosition.y * height;

    ctx.save();

    // Confidence ring (color-coded)
    const ringColor = this.confidenceColor(confidence);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = CONFIDENCE_RING_WIDTH;
    ctx.beginPath();
    ctx.arc(x, y, HAND_CIRCLE_RADIUS + 2, 0, Math.PI * 2);
    ctx.stroke();

    // Hand circle
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(x, y, HAND_CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Hand label (B or R)
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);

    // Grid location + confidence below the circle
    const infoText = `${quadrant.toUpperCase()} ${Math.round(confidence * 100)}%`;
    ctx.font = `${GRID_LABEL_FONT_SIZE}px monospace`;
    const textWidth = ctx.measureText(infoText).width;

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.roundRect(
      x - textWidth / 2 - 3,
      y + HAND_CIRCLE_RADIUS + 4,
      textWidth + 6,
      GRID_LABEL_FONT_SIZE + 4,
      3
    );
    ctx.fill();

    // Text
    ctx.fillStyle = color;
    ctx.fillText(infoText, x, y + HAND_CIRCLE_RADIUS + 4 + GRID_LABEL_FONT_SIZE / 2 + 2);

    ctx.restore();
  }

  /** Draw a thin bar at the bottom indicating which beat we're in */
  private drawStepIndicator(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    beats: DetectedBeat[],
    timestamp: number
  ): void {
    if (beats.length === 0) return;

    const barHeight = 6;
    const barY = height - barHeight - 2;
    const lastStep = beats[beats.length - 1];
    if (!lastStep) return;
    const totalDuration = lastStep.endTime;

    if (totalDuration <= 0) return;

    ctx.save();

    // Beat segments
    for (const step of beats) {
      const x1 = (step.startTime / totalDuration) * width;
      const x2 = (step.endTime / totalDuration) * width;
      const isActive = timestamp >= step.startTime && timestamp <= step.endTime;

      ctx.fillStyle = isActive
        ? "rgba(59, 130, 246, 0.8)"
        : "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(x1, barY, x2 - x1 - 1, barHeight);
    }

    // Current position marker
    const posX = (timestamp / totalDuration) * width;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(posX - 1, barY - 2, 2, barHeight + 4);

    ctx.restore();
  }

  /** Map confidence to a traffic-light color */
  private confidenceColor(confidence: number): string {
    if (confidence >= 0.8) return "#22c55e";
    if (confidence >= 0.6) return "#f59e0b";
    return "#ef4444";
  }
}
