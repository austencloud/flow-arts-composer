import { drawPathCommands, parsePathData } from "./svg-path-painter.js";
import {
  DARK_HAND_COLORS,
  LIGHT_HAND_COLORS,
  type HandColorPair,
} from "./hand-colors.js";

const PI = Math.PI;
const TWO_PI = PI * 2;
const GRID_RADIUS = 80;
const ENGINE_GRID_RADIUS = 150;
const TIP_OFFSET = 120;
const SAMPLES_PER_BEAT = 64;

const LOCATION_ANGLES: Record<string, number> = {
  e: 0,
  se: PI / 4,
  s: PI / 2,
  sw: (3 * PI) / 4,
  w: PI,
  nw: (3 * PI) / 2,
  n: -PI / 2,
  ne: -PI / 4,
  c: 0,
  center: 0,
};

const CLOCKWISE_INDEX: Record<string, number> = {
  n: 0,
  ne: 1,
  e: 2,
  se: 3,
  s: 4,
  sw: 5,
  w: 6,
  nw: 7,
};

const RADIAL_ORIENTATIONS = [
  "in",
  "clockIn",
  "clock",
  "clockOut",
  "out",
  "counterOut",
  "counter",
  "counterIn",
] as const;

export interface CardMandalaMotion {
  motionType: string;
  rotationDirection?: string;
  startLocation: string;
  endLocation: string;
  startOrientation?: string;
  endOrientation?: string;
  turns?: number | "fl";
  handPath?: string | null;
  isVisible?: boolean;
}

export interface CardMandalaStep {
  stepNumber: number;
  leftMotion: CardMandalaMotion;
  rightMotion: CardMandalaMotion;
}

export interface CardMandalaPaths {
  left: string[];
  right: string[];
}

export interface CardMandalaPlacement {
  col: number;
  row: number;
  x: number;
  y: number;
  cellSize: number;
  variant: "left" | "right" | "full";
}

export interface CardMandalaTurnAllocation {
  left: readonly (number | "fl")[];
  right: readonly (number | "fl")[];
}

interface Point {
  x: number;
  y: number;
}

interface MotionEndpoints {
  startCenterAngle: number;
  targetCenterAngle: number;
  centerRotationDelta: number;
  startStaffAngle: number;
  staffRotationDelta: number;
}

function normalizePositive(angle: number): number {
  const normalized = angle % TWO_PI;
  return normalized < 0 ? normalized + TWO_PI : normalized;
}

function normalizeSigned(angle: number): number {
  const normalized = normalizePositive(angle);
  return normalized > PI ? normalized - TWO_PI : normalized;
}

function locationAngle(location: string): number {
  return LOCATION_ANGLES[location.toLowerCase()] ?? 0;
}

function orientationAngle(
  orientation: string | undefined,
  centerAngle: number
): number {
  const index = RADIAL_ORIENTATIONS.indexOf(
    (orientation ?? "out") as (typeof RADIAL_ORIENTATIONS)[number]
  );
  return index < 0
    ? centerAngle
    : normalizePositive(centerAngle + PI - index * (PI / 4));
}

function handArcDirection(motion: CardMandalaMotion): "cw" | "ccw" | null {
  if (motion.handPath === "cw" || motion.handPath === "ccw") {
    return motion.handPath;
  }
  if (
    motion.handPath === "dash" ||
    motion.handPath === "static" ||
    motion.handPath === "hashIn" ||
    motion.handPath === "hashOut"
  ) {
    return null;
  }

  const start = CLOCKWISE_INDEX[motion.startLocation.toLowerCase()];
  const end = CLOCKWISE_INDEX[motion.endLocation.toLowerCase()];
  if (start === undefined || end === undefined) return null;
  const clockwiseSteps = (end - start + 8) % 8;
  if (clockwiseSteps === 0 || clockwiseSteps === 4) return null;
  return clockwiseSteps < 4 ? "cw" : "ccw";
}

function centerRotationDelta(
  motion: CardMandalaMotion,
  startAngle: number,
  endAngle: number
): number {
  const direction = handArcDirection(motion);
  if (direction === "cw") return normalizePositive(endAngle - startAngle);
  if (direction === "ccw") return -normalizePositive(startAngle - endAngle);
  return normalizeSigned(endAngle - startAngle);
}

function numericTurns(value: number | "fl" | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function motionEndpoints(
  motion: CardMandalaMotion,
  turns: number
): MotionEndpoints {
  const startCenterAngle = locationAngle(motion.startLocation);
  const targetCenterAngle = locationAngle(motion.endLocation);
  const centerDelta = centerRotationDelta(
    motion,
    startCenterAngle,
    targetCenterAngle
  );
  const startStaffAngle = orientationAngle(
    motion.startOrientation,
    startCenterAngle
  );
  const targetStaffAngle = orientationAngle(
    motion.endOrientation,
    targetCenterAngle
  );
  const rotationDirection = motion.rotationDirection;
  const direction =
    rotationDirection === "ccw" || rotationDirection === "counter_clockwise"
      ? -1
      : 1;
  const noRotation =
    rotationDirection === "noRotation" || rotationDirection === "no_rotation";
  let staffRotationDelta = 0;

  if (motion.motionType === "pro") {
    staffRotationDelta = centerDelta + direction * turns * PI;
  } else if (motion.motionType === "anti") {
    staffRotationDelta = -centerDelta + direction * turns * PI;
  } else if (motion.motionType === "static") {
    staffRotationDelta =
      turns > 0 && !noRotation
        ? direction * turns * PI
        : normalizeSigned(targetStaffAngle - startStaffAngle);
  } else if (motion.motionType === "dash") {
    staffRotationDelta =
      turns > 0
        ? direction * turns * PI
        : normalizeSigned(targetStaffAngle - startStaffAngle);
  }

  return {
    startCenterAngle,
    targetCenterAngle,
    centerRotationDelta: centerDelta,
    startStaffAngle,
    staffRotationDelta,
  };
}

function pathPoints(
  steps: readonly CardMandalaStep[],
  hand: "left" | "right",
  tipOffset: number,
  allocation?: CardMandalaTurnAllocation
): Point[] {
  const points: Point[] = [];
  let previousEndStaffAngle: number | null = null;

  for (const step of steps) {
    if (step.stepNumber <= 0) continue;
    const motion = hand === "left" ? step.leftMotion : step.rightMotion;
    if (motion.isVisible === false) continue;
    const allocated = allocation?.[hand][step.stepNumber - 1];
    const turns = numericTurns(allocated ?? motion.turns);
    const endpoints = motionEndpoints(motion, turns);

    if (previousEndStaffAngle !== null) {
      const originalEnd = normalizePositive(
        endpoints.startStaffAngle + endpoints.staffRotationDelta
      );
      endpoints.startStaffAngle = previousEndStaffAngle;
      endpoints.staffRotationDelta =
        motion.motionType === "float"
          ? 0
          : turns > 0
            ? (motion.rotationDirection === "ccw" ||
              motion.rotationDirection === "counter_clockwise"
                ? -1
                : 1) *
                turns *
                PI +
              (motion.motionType === "pro"
                ? endpoints.centerRotationDelta
                : motion.motionType === "anti"
                  ? -endpoints.centerRotationDelta
                  : 0)
            : normalizeSigned(originalEnd - previousEndStaffAngle);
    }

    previousEndStaffAngle = normalizePositive(
      endpoints.startStaffAngle + endpoints.staffRotationDelta
    );
    const sampleCount = Math.max(
      SAMPLES_PER_BEAT,
      SAMPLES_PER_BEAT * Math.ceil(Math.max(1, turns))
    );

    for (let sample = 0; sample <= sampleCount; sample++) {
      const progress = sample / sampleCount;
      const staffAngle = normalizePositive(
        endpoints.startStaffAngle + endpoints.staffRotationDelta * progress
      );
      let handX: number;
      let handY: number;

      if (motion.motionType === "dash") {
        const startX = Math.cos(endpoints.startCenterAngle);
        const startY = Math.sin(endpoints.startCenterAngle);
        handX =
          startX + (Math.cos(endpoints.targetCenterAngle) - startX) * progress;
        handY =
          startY + (Math.sin(endpoints.targetCenterAngle) - startY) * progress;
      } else if (motion.motionType === "static") {
        handX = Math.cos(endpoints.startCenterAngle);
        handY = Math.sin(endpoints.startCenterAngle);
      } else {
        const centerAngle = normalizePositive(
          endpoints.startCenterAngle + endpoints.centerRotationDelta * progress
        );
        handX = Math.cos(centerAngle);
        handY = Math.sin(centerAngle);
      }

      const scaledTip = (tipOffset * GRID_RADIUS) / ENGINE_GRID_RADIUS;
      points.push({
        x: handX * GRID_RADIUS + scaledTip * Math.cos(staffAngle),
        y: handY * GRID_RADIUS + scaledTip * Math.sin(staffAngle),
      });
    }
  }

  return points;
}

function pointsToPath(points: readonly Point[]): string {
  if (points.length < 2) return "";
  let path = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index++) {
    const previous = points[Math.max(0, index - 1)]!;
    const current = points[index]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const after = points[Math.min(points.length - 1, index + 2)]!;
    path +=
      ` C ${(current.x + (next.x - previous.x) / 6).toFixed(2)}` +
      ` ${(current.y + (next.y - previous.y) / 6).toFixed(2)},` +
      ` ${(next.x - (after.x - current.x) / 6).toFixed(2)}` +
      ` ${(next.y - (after.y - current.y) / 6).toFixed(2)},` +
      ` ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }
  return path;
}

export function calculateCardMandalaPaths(
  steps: readonly CardMandalaStep[],
  allocation?: CardMandalaTurnAllocation
): CardMandalaPaths {
  const buildHand = (hand: "left" | "right") =>
    [-TIP_OFFSET, TIP_OFFSET]
      .map((tip) => pointsToPath(pathPoints(steps, hand, tip, allocation)))
      .filter(Boolean);

  return { left: buildHand("left"), right: buildHand("right") };
}

export function renderCardMandala(
  ctx: CanvasRenderingContext2D,
  paths: CardMandalaPaths,
  placement: CardMandalaPlacement,
  darkMode: boolean,
  customColors?: HandColorPair | null
): void {
  const size = Math.floor(placement.cellSize * 0.85);
  const padding = (placement.cellSize - size) / 2;
  const center = size / 2;
  const extent = GRID_RADIUS + (TIP_OFFSET * GRID_RADIUS) / ENGINE_GRID_RADIUS;
  const scale = center / (extent * 1.05);
  const visible =
    placement.variant === "full"
      ? (["left", "right"] as const)
      : ([placement.variant] as const);
  const colors =
    customColors ?? (darkMode ? DARK_HAND_COLORS : LIGHT_HAND_COLORS);

  ctx.save();
  ctx.translate(placement.x + padding + center, placement.y + padding + center);
  ctx.scale(scale, scale);
  ctx.lineCap = "round";
  // Canvas applies the active transform to stroke widths. Keep this in the
  // mandala's local units so a smaller physical-print cell gets the same
  // proportionally lighter line that ImageComposer renders.
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.9;

  for (const hand of visible) {
    ctx.strokeStyle = colors[hand];
    for (const path of paths[hand]) {
      drawPathCommands(ctx, parsePathData(path));
      ctx.stroke();
    }
  }
  ctx.restore();
}
