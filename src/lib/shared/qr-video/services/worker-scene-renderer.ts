import type { FramePropState } from "../domain/qr-video-types";

const GRID_HALFWAY_POINT_OFFSET = 150;
const VIEWBOX_SIZE = 950;

const DARK_BG = "#0a0a0f";
const STEP_NUM_COLOR = "#ffffff";
const STEP_NUM_FONT = "bold 100px Georgia";
const START_FONT = "bold 80px Georgia";
const STEP_NUM_X = 65;
const STEP_NUM_Y = 50;

const GLYPH_X = 50;
const GLYPH_Y = 770;
const GLYPH_MAX_SIZE = 130;

const CROSSFADE_FRAMES = 6;

const TRAIL_COLOR_BLUE = "#3575E2";
const TRAIL_COLOR_RED = "#ED1C24";
const TRAIL_MAX_POINTS = 30;
const TRAIL_BASE_WIDTH = 5;
const TRAIL_MIN_WIDTH_RATIO = 0.3;
const TRAIL_GLOW_BLUR = 12;
const TRAIL_MIN_OPACITY = 0.15;
const TRAIL_MAX_OPACITY = 0.85;

interface Point2D {
  x: number;
  y: number;
}

function catmullRomSmooth(points: Point2D[], subdivisions = 4): Point2D[] {
  if (points.length < 2) return [...points];
  if (points.length === 2) {
    const result: Point2D[] = [];
    for (let i = 0; i <= subdivisions; i++) {
      const t = i / subdivisions;
      result.push({
        x: points[0]!.x + (points[1]!.x - points[0]!.x) * t,
        y: points[0]!.y + (points[1]!.y - points[0]!.y) * t,
      });
    }
    return result;
  }

  const result: Point2D[] = [{ ...points[0]! }];
  const alpha = 0.5;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1]! : points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = i < points.length - 2 ? points[i + 2]! : points[i + 1]!;

    const eps = 1e-6;
    const dist = (a: Point2D, b: Point2D) =>
      Math.max(eps, Math.pow(Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2), alpha));
    const t0 = 0;
    const t1 = t0 + dist(p0, p1);
    const t2 = t1 + dist(p1, p2);
    const t3 = t2 + dist(p2, p3);

    const lerp = (a: Point2D, b: Point2D, t: number): Point2D => ({
      x: a.x + (b.x - a.x) * Math.max(0, Math.min(1, t)),
      y: a.y + (b.y - a.y) * Math.max(0, Math.min(1, t)),
    });
    const safe = (n: number, d: number) => (d === 0 ? 0 : n / d);

    for (let j = 1; j <= subdivisions; j++) {
      const t = t1 + (j / subdivisions) * (t2 - t1);
      const a1 = lerp(p0, p1, safe(t - t0, t1 - t0));
      const a2 = lerp(p1, p2, safe(t - t1, t2 - t1));
      const a3 = lerp(p2, p3, safe(t - t2, t3 - t2));
      const b1 = lerp(a1, a2, safe(t - t0, t2 - t0));
      const b2 = lerp(a2, a3, safe(t - t1, t3 - t1));
      result.push(lerp(b1, b2, safe(t - t1, t2 - t1)));
    }
  }

  return result;
}

function drawTrail(
  ctx: OffscreenCanvasRenderingContext2D,
  history: Point2D[],
  color: string,
  scale: number
): void {
  if (history.length < 2) return;

  const smooth = catmullRomSmooth(history, 4);
  if (smooth.length < 2) return;

  ctx.save();
  ctx.shadowBlur = TRAIL_GLOW_BLUR * scale;
  ctx.shadowColor = color;
  ctx.fillStyle = color;

  for (let i = 0; i < smooth.length - 1; i++) {
    const progress = i / (smooth.length - 1);
    const opacity =
      TRAIL_MIN_OPACITY + progress * (TRAIL_MAX_OPACITY - TRAIL_MIN_OPACITY);
    const halfW =
      (TRAIL_BASE_WIDTH *
        (TRAIL_MIN_WIDTH_RATIO + (1 - TRAIL_MIN_WIDTH_RATIO) * progress) *
        scale) /
      2;

    const curr = smooth[i]!;
    const next = smooth[i + 1]!;
    let dx: number, dy: number;
    if (i === 0) {
      dx = next.x - curr.x;
      dy = next.y - curr.y;
    } else {
      const prev = smooth[i - 1]!;
      dx = next.x - prev.x;
      dy = next.y - prev.y;
    }
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len;
    const py = dx / len;

    const nextProgress = (i + 1) / (smooth.length - 1);
    const nextHalfW =
      (TRAIL_BASE_WIDTH *
        (TRAIL_MIN_WIDTH_RATIO + (1 - TRAIL_MIN_WIDTH_RATIO) * nextProgress) *
        scale) /
      2;
    const ndx = i + 1 < smooth.length - 1 ? smooth[i + 2]!.x - curr.x : dx;
    const ndy = i + 1 < smooth.length - 1 ? smooth[i + 2]!.y - curr.y : dy;
    const nlen = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
    const npx = -ndy / nlen;
    const npy = ndx / nlen;

    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.moveTo(curr.x + px * halfW, curr.y + py * halfW);
    ctx.lineTo(next.x + npx * nextHalfW, next.y + npy * nextHalfW);
    ctx.lineTo(next.x - npx * nextHalfW, next.y - npy * nextHalfW);
    ctx.lineTo(curr.x - px * halfW, curr.y - py * halfW);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawProp(
  ctx: OffscreenCanvasRenderingContext2D,
  canvasSize: number,
  propState: FramePropState,
  propImage: ImageBitmap,
  viewBoxDimensions: { width: number; height: number }
): void {
  const centerX = canvasSize / 2;
  const centerY = canvasSize / 2;
  const inwardFactor = 0.95;
  const gridScaleFactor = canvasSize / VIEWBOX_SIZE;
  const scaledHalfwayRadius = GRID_HALFWAY_POINT_OFFSET * gridScaleFactor;

  let x: number, y: number;
  if (propState.x !== undefined && propState.y !== undefined) {
    x = centerX + propState.x * scaledHalfwayRadius * inwardFactor;
    y = centerY + propState.y * scaledHalfwayRadius * inwardFactor;
  } else {
    x =
      centerX +
      Math.cos(propState.centerPathAngle) * scaledHalfwayRadius * inwardFactor;
    y =
      centerY +
      Math.sin(propState.centerPathAngle) * scaledHalfwayRadius * inwardFactor;
  }

  const propWidth = viewBoxDimensions.width * gridScaleFactor;
  const propHeight = viewBoxDimensions.height * gridScaleFactor;
  const propCenterX = viewBoxDimensions.width / 2;
  const propCenterY = viewBoxDimensions.height / 2;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(propState.staffRotationAngle);
  ctx.drawImage(
    propImage,
    -propCenterX * gridScaleFactor,
    -propCenterY * gridScaleFactor,
    propWidth,
    propHeight
  );
  ctx.restore();
}

function getPropCenter(
  canvasSize: number,
  propState: FramePropState
): Point2D {
  const centerX = canvasSize / 2;
  const centerY = canvasSize / 2;
  const inwardFactor = 0.95;
  const gridScaleFactor = canvasSize / VIEWBOX_SIZE;
  const scaledHalfwayRadius = GRID_HALFWAY_POINT_OFFSET * gridScaleFactor;

  if (propState.x !== undefined && propState.y !== undefined) {
    return {
      x: centerX + propState.x * scaledHalfwayRadius * inwardFactor,
      y: centerY + propState.y * scaledHalfwayRadius * inwardFactor,
    };
  }
  return {
    x:
      centerX +
      Math.cos(propState.centerPathAngle) * scaledHalfwayRadius * inwardFactor,
    y:
      centerY +
      Math.sin(propState.centerPathAngle) * scaledHalfwayRadius * inwardFactor,
  };
}

function drawGlyph(
  ctx: OffscreenCanvasRenderingContext2D,
  glyph: ImageBitmap,
  alpha: number
): void {
  if (alpha <= 0) return;
  const aspect = glyph.width / glyph.height;
  const drawW = aspect >= 1 ? GLYPH_MAX_SIZE : GLYPH_MAX_SIZE * aspect;
  const drawH = aspect >= 1 ? GLYPH_MAX_SIZE / aspect : GLYPH_MAX_SIZE;
  ctx.globalAlpha = alpha;
  ctx.drawImage(glyph, GLYPH_X, GLYPH_Y, drawW, drawH);
  ctx.globalAlpha = 1;
}

export interface SceneOverlay {
  stepIndex: number;
  isStartPlacement: boolean;
  letterGlyphs: ImageBitmap[];
  startPlacementGlyph: ImageBitmap | null;
}

export interface RenderState {
  prevStepIndex: number;
  prevIsStart: boolean;
  crossfadeProgress: number;
  leftTrailHistory: Point2D[];
  rightTrailHistory: Point2D[];
}

export function createRenderState(): RenderState {
  return {
    prevStepIndex: -999,
    prevIsStart: true,
    crossfadeProgress: 1,
    leftTrailHistory: [],
    rightTrailHistory: [],
  };
}

export function renderScene(
  ctx: OffscreenCanvasRenderingContext2D,
  canvasSize: number,
  gridImage: ImageBitmap,
  leftPropImage: ImageBitmap,
  rightPropImage: ImageBitmap,
  leftProp: FramePropState | null,
  rightProp: FramePropState | null,
  leftPropViewBox: { width: number; height: number },
  rightPropViewBox: { width: number; height: number },
  overlay?: SceneOverlay,
  renderState?: RenderState
): void {
  const scale = canvasSize / VIEWBOX_SIZE;

  ctx.clearRect(0, 0, canvasSize, canvasSize);
  ctx.fillStyle = DARK_BG;
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  ctx.drawImage(gridImage, 0, 0, canvasSize, canvasSize);

  if (renderState) {
    if (leftProp) {
      const pos = getPropCenter(canvasSize, leftProp);
      renderState.leftTrailHistory.push(pos);
      if (renderState.leftTrailHistory.length > TRAIL_MAX_POINTS) {
        renderState.leftTrailHistory.shift();
      }
    }
    if (rightProp) {
      const pos = getPropCenter(canvasSize, rightProp);
      renderState.rightTrailHistory.push(pos);
      if (renderState.rightTrailHistory.length > TRAIL_MAX_POINTS) {
        renderState.rightTrailHistory.shift();
      }
    }

    drawTrail(ctx, renderState.leftTrailHistory, TRAIL_COLOR_BLUE, scale);
    drawTrail(ctx, renderState.rightTrailHistory, TRAIL_COLOR_RED, scale);
  }

  if (leftProp) {
    drawProp(ctx, canvasSize, leftProp, leftPropImage, leftPropViewBox);
  }
  if (rightProp) {
    drawProp(ctx, canvasSize, rightProp, rightPropImage, rightPropViewBox);
  }

  if (!overlay) return;

  const { stepIndex, isStartPlacement, letterGlyphs, startPlacementGlyph } =
    overlay;

  if (renderState) {
    const stepChanged =
      stepIndex !== renderState.prevStepIndex ||
      isStartPlacement !== renderState.prevIsStart;
    if (stepChanged) {
      renderState.crossfadeProgress = 0;
      renderState.prevStepIndex = stepIndex;
      renderState.prevIsStart = isStartPlacement;
    }
    if (renderState.crossfadeProgress < 1) {
      renderState.crossfadeProgress = Math.min(
        1,
        renderState.crossfadeProgress + 1 / CROSSFADE_FRAMES
      );
    }
  }

  const fadeIn = renderState ? renderState.crossfadeProgress : 1;

  ctx.save();
  ctx.scale(scale, scale);

  const stepNumber = isStartPlacement ? 0 : stepIndex + 1;
  ctx.fillStyle = STEP_NUM_COLOR;
  ctx.font = stepNumber === 0 ? START_FONT : STEP_NUM_FONT;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.globalAlpha = fadeIn;
  ctx.fillText(
    stepNumber === 0 ? "Start" : String(stepNumber),
    STEP_NUM_X,
    STEP_NUM_Y
  );
  ctx.globalAlpha = 1;

  if (isStartPlacement && startPlacementGlyph) {
    drawGlyph(ctx, startPlacementGlyph, fadeIn);
  } else if (stepIndex >= 0 && stepIndex < letterGlyphs.length) {
    drawGlyph(ctx, letterGlyphs[stepIndex]!, fadeIn);
  }

  ctx.restore();
}
