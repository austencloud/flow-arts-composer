/**
 * Animal portrait. The creature the head has drawn, newest first: a lead-in
 * from the upper right into a coil the body wraps around, the tail leaving to
 * the left. The body is the renderer's own chain (its `bodyWidth` profile and
 * `resampleAlongPath`), so short creatures make a hook, medium ones a C, and
 * the longest close the loop with the neck passing over the coil, redrawn in
 * depth order inside a clipped disc. Species details follow the renderer:
 * snakes flick a forked tongue, dragons wear a crest, horns and lagging
 * whiskers, caterpillars get legs, bands and antennae. Widths are boosted for
 * the tile (SCALE) while body length stretches only enough for the long
 * presets to close the coil, and intensity gets a visibility floor so a wisp
 * is not a thread. Shadow palettes sit on a lit ground. Ported from the
 * approved reference page (spec reference/animal-draw.js).
 */
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import {
  type AnimalPalette,
  resolveAnimalPalette,
} from "#lib/shared/effects/domain/animal-palettes.js";
import {
  bodyWidth,
  resampleAlongPath,
} from "#lib/shared/effects/renderers/animal-2d-renderer.js";
import {
  traceBackward,
  traceForward,
} from "#lib/shared/effects/renderers/ribbon-trace.js";
import { TILE_H, TILE_W, blob, css, ground, hexToRgb, mix } from "./tile-paint";

export type AnimalIntent = EffectConfigMap["animal"];

type Vec2 = { x: number; y: number };

const TAU = Math.PI * 2;
/** Tile boost for width, head, ornaments and wave amplitude. */
const SCALE = 2.8;
/** Body length boost: just enough for the long presets to close the coil. */
const LENGTH_SCALE = 1.35;
/** Renderer segmentCount. */
const SEGMENTS = 56;
const WAVENUMBER = 0.045;
const SLITHER_SPEED = 3.2;
const WHISKER_NODES = 6;
const AURA_STRIDE = 8;
/** Frozen wave clock. */
const TIME = 2.35;
/** Of the 0.5 s flick: tongue nearly fully out. */
const TONGUE_PHASE = 0.27;

/** Visibility floor: at tile size a 0.42 wisp would be a thread. */
const vis = (i: number): number => Math.max(i, 0.62);

/**
 * The figure the head has drawn, newest first: a lead-in from the upper
 * right into a coil, the tail leaving to the left.
 */
const KNOTS: ReadonlyArray<readonly [number, number]> = (() => {
  const k: [number, number][] = [
    [612, 72],
    [548, 50],
    [478, 60],
    [422, 102],
  ];
  const cx = 456;
  const cy = 170;
  const r = 58;
  for (let a = 150; a <= 150 + 360 + 10; a += 45) {
    const t = (a * Math.PI) / 180;
    k.push([cx + r * Math.cos(t), cy - r * Math.sin(t)]);
  }
  k.push([330, 172], [250, 206], [178, 190], [128, 130]);
  return k;
})();

function mixHex(a: string, b: string, t: number): string {
  return css(mix(hexToRgb(a), hexToRgb(b), t), 1);
}

/** Dense Catmull-Rom polyline through the knots, newest first. */
function densePath(): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < KNOTS.length - 1; i++) {
    const p0 = KNOTS[Math.max(0, i - 1)]!;
    const p1 = KNOTS[i]!;
    const p2 = KNOTS[i + 1]!;
    const p3 = KNOTS[Math.min(KNOTS.length - 1, i + 2)]!;
    for (let k = 0; k < 24; k++) {
      const t = k / 24;
      const t2 = t * t;
      const t3 = t2 * t;
      pts.push({
        x:
          0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        y:
          0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      });
    }
  }
  const last = KNOTS[KNOTS.length - 1]!;
  pts.push({ x: last[0], y: last[1] });
  return pts;
}

/** Renderer whisker lag chains, replayed along the path so they trail the way they would in motion. */
function whiskersAlong(path: Vec2[], headR: number): Vec2[][] {
  const segLenW = headR * 0.55;
  const tail = path[path.length - 1]!;
  const pair: Vec2[][] = [[], []];
  for (let w = 0; w < 2; w++) {
    for (let i = 0; i < WHISKER_NODES; i++)
      pair[w]!.push({ x: tail.x, y: tail.y });
  }
  for (let k = path.length - 2; k >= 0; k--) {
    const head = path[k]!;
    const prev = path[k + 1]!;
    let hx = head.x - prev.x;
    let hy = head.y - prev.y;
    const hl = Math.hypot(hx, hy) || 1;
    hx /= hl;
    hy /= hl;
    const perpX = -hy;
    const perpY = hx;
    for (let w = 0; w < 2; w++) {
      const side = w === 0 ? -1 : 1;
      const whisk = pair[w]!;
      whisk[0]!.x = head.x + hx * headR * 1.0 + perpX * side * headR * 0.5;
      whisk[0]!.y = head.y + hy * headR * 1.0 + perpY * side * headR * 0.5;
      for (let i = 1; i < WHISKER_NODES; i++) {
        const p = whisk[i - 1]!;
        const c = whisk[i]!;
        const dx = c.x - p.x;
        const dy = c.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.0001) {
          const kk = segLenW / d;
          c.x = p.x + dx * kk;
          c.y = p.y + dy * kk;
        } else {
          c.x = p.x - hx * segLenW;
          c.y = p.y - hy * segLenW;
        }
      }
    }
  }
  return pair;
}

interface Geometry {
  N: number;
  baseHalf: number;
  cx: number[];
  cy: number[];
  nx: number[];
  ny: number[];
  hw: number[];
  leftX: number[];
  leftY: number[];
  rightX: number[];
  rightY: number[];
  litX: number[];
  litY: number[];
  shadeX: number[];
  shadeY: number[];
}

function geometry(p: AnimalIntent, chain: Vec2[], scale: number): Geometry {
  const N = chain.length;
  const build =
    p.creature === "caterpillar" ? 1.55 : p.creature === "dragon" ? 1.15 : 1;
  const baseHalf = (2.5 + p.width * 13) * scale * vis(p.intensity) * build;
  // The coil is staged at renderer scale while widths are boosted, so the
  // wave amplitude takes only half the boost or the tail kinks on the loop.
  const ampPx = p.slither * 20 * (1 + (scale - 1) * 0.5);
  const s: number[] = [0];
  for (let i = 1; i < N; i++) {
    const a = chain[i]!;
    const b = chain[i - 1]!;
    s[i] = s[i - 1]! + Math.hypot(a.x - b.x, a.y - b.y);
  }
  const cx: number[] = [];
  const cy: number[] = [];
  for (let i = 0; i < N; i++) {
    const prev = chain[Math.max(0, i - 1)]!;
    const next = chain[Math.min(N - 1, i + 1)]!;
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const ramp = Math.pow(i / (N - 1), 1.3);
    const phase = WAVENUMBER * s[i]! - SLITHER_SPEED * TIME;
    const wave =
      (Math.sin(phase) + 0.22 * Math.sin(phase * 2.1 + 0.7)) * ampPx * ramp;
    cx[i] = chain[i]!.x + -ty * wave;
    cy[i] = chain[i]!.y + tx * wave;
  }
  const leftX: number[] = [];
  const leftY: number[] = [];
  const rightX: number[] = [];
  const rightY: number[] = [];
  const nx: number[] = [];
  const ny: number[] = [];
  const hw: number[] = [];
  const litX: number[] = [];
  const litY: number[] = [];
  const shadeX: number[] = [];
  const shadeY: number[] = [];
  for (let i = 0; i < N; i++) {
    let tx = cx[Math.min(N - 1, i + 1)]! - cx[Math.max(0, i - 1)]!;
    let ty = cy[Math.min(N - 1, i + 1)]! - cy[Math.max(0, i - 1)]!;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const half = baseHalf * bodyWidth(i / (N - 1), p.creature);
    nx[i] = -ty;
    ny[i] = tx;
    hw[i] = half;
    leftX[i] = cx[i]! + nx[i]! * half;
    leftY[i] = cy[i]! + ny[i]! * half;
    rightX[i] = cx[i]! - nx[i]! * half;
    rightY[i] = cy[i]! - ny[i]! * half;
    litX[i] = cx[i]! + nx[i]! * half * 0.42;
    litY[i] = cy[i]! + ny[i]! * half * 0.42;
    shadeX[i] = cx[i]! - nx[i]! * half * 0.5;
    shadeY[i] = cy[i]! - ny[i]! * half * 0.5;
  }
  return {
    N,
    baseHalf,
    cx,
    cy,
    nx,
    ny,
    hw,
    leftX,
    leftY,
    rightX,
    rightY,
    litX,
    litY,
    shadeX,
    shadeY,
  };
}

/** First self-crossing of the centreline: segment indices (i, j) and the point. */
function findCrossing(
  cx: number[],
  cy: number[]
): { i: number; j: number; x: number; y: number } | null {
  const N = cx.length;
  for (let i = 0; i < N - 1; i++) {
    for (let j = i + 4; j < N - 1; j++) {
      const ax = cx[i]!;
      const ay = cy[i]!;
      const bx = cx[i + 1]!;
      const by = cy[i + 1]!;
      const cxx = cx[j]!;
      const cyy = cy[j]!;
      const dx = cx[j + 1]!;
      const dy = cy[j + 1]!;
      const den = (bx - ax) * (dy - cyy) - (by - ay) * (dx - cxx);
      if (Math.abs(den) < 1e-6) continue;
      const t = ((cxx - ax) * (dy - cyy) - (cyy - ay) * (dx - cxx)) / den;
      const u = ((cxx - ax) * (by - ay) - (cyy - ay) * (bx - ax)) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return { i, j, x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
      }
    }
  }
  return null;
}

function drawCrest(
  ctx: CanvasRenderingContext2D,
  p: AnimalIntent,
  pal: AnimalPalette,
  { N, cx, cy, nx, ny, hw }: Geometry,
  a: number,
  b: number
): void {
  ctx.globalAlpha = 0.9 * vis(p.intensity);
  ctx.fillStyle = pal.edge;
  const stride = Math.max(2, Math.round(N / 14));
  for (let i = stride; i < N - 2; i += stride) {
    if (i < a || i > b) continue;
    const h = hw[i]!;
    if (h < 1) continue;
    const spikeH = h * 1.3;
    ctx.beginPath();
    ctx.moveTo(
      cx[i - 1]! + nx[i - 1]! * hw[i - 1]!,
      cy[i - 1]! + ny[i - 1]! * hw[i - 1]!
    );
    ctx.lineTo(cx[i]! + nx[i]! * (h + spikeH), cy[i]! + ny[i]! * (h + spikeH));
    ctx.lineTo(
      cx[i + 1]! + nx[i + 1]! * hw[i + 1]!,
      cy[i + 1]! + ny[i + 1]! * hw[i + 1]!
    );
    ctx.closePath();
    ctx.fill();
  }
}

function drawLegs(
  ctx: CanvasRenderingContext2D,
  p: AnimalIntent,
  pal: AnimalPalette,
  { N, cx, cy, nx, ny, hw }: Geometry,
  a: number,
  b: number
): void {
  ctx.globalAlpha = 0.85 * vis(p.intensity);
  ctx.strokeStyle = pal.edge;
  ctx.lineCap = "round";
  const stride = Math.max(2, Math.round(N / 11));
  for (let i = stride; i < N - 2; i += stride) {
    if (i < a || i > b) continue;
    const h = hw[i]!;
    if (h < 1.5) continue;
    const legLen = h * 0.9;
    const swing = Math.sin(TIME * 6 + i * 0.9) * 0.35;
    ctx.lineWidth = Math.max(1, h * 0.22);
    const tx = cx[Math.min(N - 1, i + 1)]! - cx[Math.max(0, i - 1)]!;
    const ty = cy[Math.min(N - 1, i + 1)]! - cy[Math.max(0, i - 1)]!;
    const tl = Math.hypot(tx, ty) || 1;
    for (const side of [-1, 1]) {
      const bx = cx[i]! + nx[i]! * side * h;
      const by = cy[i]! + ny[i]! * side * h;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(
        bx + nx[i]! * side * legLen + (tx / tl) * legLen * swing,
        by + ny[i]! * side * legLen + (ty / tl) * legLen * swing
      );
      ctx.stroke();
    }
  }
}

function drawBands(
  ctx: CanvasRenderingContext2D,
  p: AnimalIntent,
  pal: AnimalPalette,
  { N, cx, cy, nx, ny, hw }: Geometry,
  a: number,
  b: number
): void {
  ctx.globalAlpha = 0.28 * vis(p.intensity);
  ctx.strokeStyle = pal.edge;
  ctx.lineCap = "round";
  const stride = Math.max(2, Math.round(N / 11));
  for (let i = stride; i < N - 2; i += stride) {
    if (i < a || i > b) continue;
    const h = hw[i]!;
    if (h < 1) continue;
    ctx.lineWidth = Math.max(1, h * 0.4);
    ctx.beginPath();
    ctx.moveTo(cx[i]! + nx[i]! * h, cy[i]! + ny[i]! * h);
    ctx.lineTo(cx[i]! - nx[i]! * h, cy[i]! - ny[i]! * h);
    ctx.stroke();
  }
}

/** Body layers (ornaments under the fill, shadow, fill, cylinder shading, chevrons, sheen) over chain range [a, b]. */
function drawBody(
  ctx: CanvasRenderingContext2D,
  p: AnimalIntent,
  pal: AnimalPalette,
  g: Geometry,
  a: number,
  b: number,
  scale: number
): void {
  const {
    N,
    baseHalf,
    cx,
    cy,
    nx,
    ny,
    hw,
    leftX,
    leftY,
    rightX,
    rightY,
    litX,
    litY,
    shadeX,
    shadeY,
  } = g;
  const I = vis(p.intensity);
  const outline = () => {
    ctx.beginPath();
    traceForward(ctx, leftX, leftY, a, b, N);
    traceBackward(ctx, rightX, rightY, a, b, N);
    ctx.closePath();
  };

  if (p.creature === "caterpillar") drawLegs(ctx, p, pal, g, a, b);
  if (p.creature === "dragon") drawCrest(ctx, p, pal, g, a, b);

  if (pal.emissive) {
    ctx.globalAlpha = 0.1 * I;
    for (let i = a; i <= b; i += AURA_STRIDE) {
      const r = hw[i]! * 2.2 + 1.5 * scale;
      const grad = ctx.createRadialGradient(
        cx[i]!,
        cy[i]!,
        0,
        cx[i]!,
        cy[i]!,
        r
      );
      grad.addColorStop(0, pal.edge);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.arc(cx[i]!, cy[i]!, r, 0, TAU);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  } else {
    ctx.save();
    ctx.translate(2.5 * scale, 3.5 * scale);
    ctx.globalAlpha = 0.22 * I;
    ctx.fillStyle = "#000";
    outline();
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 0.94 * I;
  if (pal.hueShift && pal.bodyAlt) {
    const grad = ctx.createLinearGradient(
      cx[0]!,
      cy[0]!,
      cx[N - 1]!,
      cy[N - 1]!
    );
    grad.addColorStop(0, pal.body);
    grad.addColorStop(1, pal.bodyAlt);
    ctx.fillStyle = grad;
  } else ctx.fillStyle = pal.body;
  outline();
  ctx.fill();

  ctx.save();
  outline();
  ctx.clip();
  ctx.globalAlpha = 0.34 * I;
  ctx.strokeStyle = mixHex(pal.body, "#000000", 0.62);
  ctx.lineWidth = baseHalf * 1.1;
  ctx.beginPath();
  traceForward(ctx, shadeX, shadeY, a, b, N);
  ctx.stroke();
  ctx.globalAlpha = 0.22 * I;
  ctx.strokeStyle = mixHex(pal.body, "#ffffff", 0.55);
  ctx.lineWidth = baseHalf * 0.7;
  ctx.beginPath();
  traceForward(ctx, litX, litY, a, b, N);
  ctx.stroke();
  if (p.creature !== "caterpillar") {
    ctx.globalAlpha = 0.14 * I;
    ctx.strokeStyle = mixHex(pal.edge, "#ffffff", 0.2);
    ctx.lineWidth = Math.max(0.6, baseHalf * 0.16);
    for (let i = Math.max(2, a); i < Math.min(N - 2, b + 1); i += 2) {
      const h = hw[i]!;
      if (h < 1) continue;
      ctx.beginPath();
      ctx.moveTo(cx[i]! + nx[i]! * h * 0.9, cy[i]! + ny[i]! * h * 0.9);
      ctx.quadraticCurveTo(
        cx[i - 1]!,
        cy[i - 1]!,
        cx[i]! - nx[i]! * h * 0.9,
        cy[i]! - ny[i]! * h * 0.9
      );
      ctx.stroke();
    }
  }
  ctx.restore();

  const sheen = ctx.createLinearGradient(
    cx[0]!,
    cy[0]!,
    cx[N - 1]!,
    cy[N - 1]!
  );
  const sheenColor = mixHex(pal.edge, "#ffffff", 0.35);
  sheen.addColorStop(0, sheenColor);
  sheen.addColorStop(0.7, sheenColor);
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalAlpha = 0.4 * I;
  ctx.strokeStyle = sheen;
  ctx.lineWidth = Math.max(0.8, baseHalf * 0.2);
  ctx.beginPath();
  traceForward(ctx, leftX, leftY, a, b, N);
  ctx.stroke();

  if (p.creature === "caterpillar") drawBands(ctx, p, pal, g, a, b);
}

function drawWhiskers(
  ctx: CanvasRenderingContext2D,
  p: AnimalIntent,
  pal: AnimalPalette,
  path: Vec2[],
  baseHalf: number,
  scale: number
): void {
  const headR = baseHalf * 1.5 + 2 * scale;
  const pair = whiskersAlong(path, headR);
  ctx.globalAlpha = 0.85 * vis(p.intensity);
  ctx.strokeStyle = pal.edge;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, headR * 0.16);
  for (const whisk of pair) {
    ctx.beginPath();
    ctx.moveTo(whisk[0]!.x, whisk[0]!.y);
    for (let i = 1; i < WHISKER_NODES; i++)
      ctx.lineTo(whisk[i]!.x, whisk[i]!.y);
    ctx.stroke();
  }
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  p: AnimalIntent,
  pal: AnimalPalette,
  { cx, cy, baseHalf }: Geometry,
  scale: number
): void {
  const I = vis(p.intensity);
  let hx = cx[0]! - cx[1]!;
  let hy = cy[0]! - cy[1]!;
  const hl = Math.hypot(hx, hy) || 1;
  hx /= hl;
  hy /= hl;
  const perpX = -hy;
  const perpY = hx;
  const headR = baseHalf * 1.15 + 1.2 * scale;
  const headCx = cx[0]! + hx * headR * 0.25;
  const headCy = cy[0]! + hy * headR * 0.25;

  if (p.creature === "dragon") {
    ctx.globalAlpha = 0.95 * I;
    ctx.strokeStyle = pal.edge;
    ctx.lineCap = "round";
    ctx.lineWidth = headR * 0.5;
    for (const side of [-1, 1]) {
      const bx = headCx - hx * headR * 0.3 + perpX * side * headR * 0.55;
      const by = headCy - hy * headR * 0.3 + perpY * side * headR * 0.55;
      const mx = bx - hx * headR * 0.7 + perpX * side * headR * 0.2;
      const my = by - hy * headR * 0.7 + perpY * side * headR * 0.2;
      const ex = bx - hx * headR * 1.5 + perpX * side * headR * 0.7;
      const ey = by - hy * headR * 1.5 + perpY * side * headR * 0.7;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
    }
  }
  if (p.creature === "caterpillar") {
    ctx.globalAlpha = 0.9 * I;
    ctx.strokeStyle = pal.edge;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, headR * 0.18);
    for (const side of [-1, 1]) {
      const bx = headCx + hx * headR * 0.4 + perpX * side * headR * 0.35;
      const by = headCy + hy * headR * 0.4 + perpY * side * headR * 0.35;
      const ex = bx + hx * headR * 1.1 + perpX * side * headR * 0.6;
      const ey = by + hy * headR * 1.1 + perpY * side * headR * 0.6;
      const cxp = bx + hx * headR * 0.6 + perpX * side * headR * 0.9;
      const cyp = by + hy * headR * 0.6 + perpY * side * headR * 0.9;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(cxp, cyp, ex, ey);
      ctx.stroke();
      ctx.fillStyle = pal.edge;
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1.2, headR * 0.16), 0, TAU);
      ctx.fill();
    }
  }
  const heading = Math.atan2(hy, hx);
  ctx.globalAlpha = 0.96 * I;
  ctx.save();
  ctx.translate(headCx, headCy);
  ctx.rotate(heading);
  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.ellipse(0, 0, headR * 1.45, headR * 0.92, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.3 * I;
  ctx.fillStyle = mixHex(pal.body, "#000000", 0.6);
  ctx.beginPath();
  ctx.ellipse(
    -headR * 0.05,
    headR * 0.36,
    headR * 1.15,
    headR * 0.5,
    0,
    0,
    TAU
  );
  ctx.fill();
  ctx.globalAlpha = 0.26 * I;
  ctx.fillStyle = mixHex(pal.edge, "#ffffff", 0.4);
  ctx.beginPath();
  ctx.ellipse(
    headR * 0.18,
    -headR * 0.34,
    headR * 0.75,
    headR * 0.28,
    0,
    0,
    TAU
  );
  ctx.fill();
  ctx.restore();

  ctx.globalAlpha = 1;
  const eyeFwd = headR * 0.5;
  const eyePerp = headR * 0.46;
  const eyeR = headR * (p.creature === "caterpillar" ? 0.24 : 0.2);
  const irisColor =
    p.creature === "dragon"
      ? mixHex(pal.edge, "#ffd27f", 0.5)
      : mixHex(pal.edge, "#ffffff", 0.25);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(
      headCx + hx * eyeFwd + perpX * side * eyePerp,
      headCy + hy * eyeFwd + perpY * side * eyePerp
    );
    ctx.rotate(heading);
    ctx.fillStyle = mixHex(pal.body, "#000000", 0.75);
    ctx.beginPath();
    ctx.ellipse(0, 0, eyeR * 1.5, eyeR * 1.0, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = irisColor;
    ctx.beginPath();
    ctx.ellipse(eyeR * 0.12, 0, eyeR * 1.0, eyeR * 0.66, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#0a0a0f";
    ctx.beginPath();
    if (p.creature === "caterpillar") {
      ctx.ellipse(eyeR * 0.15, 0, eyeR * 0.38, eyeR * 0.38, 0, 0, TAU);
    } else ctx.ellipse(eyeR * 0.15, 0, eyeR * 0.16, eyeR * 0.58, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(eyeR * 0.55, -eyeR * 0.3, Math.max(0.5, eyeR * 0.18), 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  if (p.creature === "snake") {
    const ext = Math.sin((TONGUE_PHASE / 0.5) * Math.PI) * headR * 2.0;
    const rootX = headCx + hx * headR * 1.15;
    const rootY = headCy + hy * headR * 1.15;
    const forkX = rootX + hx * ext * 0.65;
    const forkY = rootY + hy * ext * 0.65;
    const tipX = rootX + hx * ext;
    const tipY = rootY + hy * ext;
    const spread = headR * 0.4;
    ctx.globalAlpha = 0.95 * I;
    ctx.strokeStyle = "#e0306a";
    ctx.lineWidth = Math.max(1.2, headR * 0.18);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.lineTo(forkX, forkY);
    ctx.moveTo(forkX, forkY);
    ctx.lineTo(tipX + perpX * spread, tipY + perpY * spread);
    ctx.moveTo(forkX, forkY);
    ctx.lineTo(tipX - perpX * spread, tipY - perpY * spread);
    ctx.stroke();
  }
}

function drawCreature(
  ctx: CanvasRenderingContext2D,
  p: AnimalIntent,
  pal: AnimalPalette,
  chain: Vec2[],
  path: Vec2[],
  scale: number
): void {
  const g = geometry(p, chain, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawBody(ctx, p, pal, g, 0, g.N - 1, scale);

  // Where the neck passes over the coil, redraw that patch in depth order:
  // the coil first, then the neck on top. Clipping to a disc around the
  // crossing keeps every edge outside it identical to the single pass.
  const x = findCrossing(g.cx, g.cy);
  if (x) {
    const mid = Math.round((x.i + x.j) / 2);
    const R = Math.max(g.hw[x.i]!, g.hw[x.j]!) * 3.2 + 6 * scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x.x, x.y, R, 0, TAU);
    ctx.clip();
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(x.x - R - 1, x.y - R - 1, R * 2 + 2, R * 2 + 2);
    ctx.globalCompositeOperation = "source-over";
    drawBody(ctx, p, pal, g, mid, g.N - 1, scale);
    drawBody(ctx, p, pal, g, 0, mid, scale);
    ctx.restore();
  }

  if (p.creature === "dragon")
    drawWhiskers(ctx, p, pal, path, g.baseHalf, scale);
  drawHead(ctx, p, pal, g, scale);
  ctx.globalAlpha = 1;
}

/** Stage the creature: body resampled along the figure, then centered and fitted in the frame. */
function stage(p: AnimalIntent): { chain: Vec2[]; path: Vec2[]; zoom: number } {
  const path = densePath();
  const bodyLen = (160 + p.bodyLength * 440) * LENGTH_SCALE;
  const chain: Vec2[] = Array.from({ length: SEGMENTS }, () => ({
    x: 0,
    y: 0,
  }));
  resampleAlongPath(path, chain, bodyLen / (SEGMENTS - 1));
  let acc = 0;
  let cut = path.length;
  for (let i = 1; i < path.length; i++) {
    const a = path[i]!;
    const b = path[i - 1]!;
    acc += Math.hypot(a.x - b.x, a.y - b.y);
    if (acc > bodyLen) {
      cut = i + 1;
      break;
    }
  }
  path.length = Math.min(path.length, cut);
  const g = geometry(p, chain, SCALE);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < g.N; i++) {
    minX = Math.min(minX, g.leftX[i]!, g.rightX[i]!);
    maxX = Math.max(maxX, g.leftX[i]!, g.rightX[i]!);
    minY = Math.min(minY, g.leftY[i]!, g.rightY[i]!);
    maxY = Math.max(maxY, g.leftY[i]!, g.rightY[i]!);
  }
  const dx = TILE_W / 2 - (minX + maxX) / 2;
  const dy = TILE_H / 2 - (minY + maxY) / 2;
  // Fit: zoom the whole figure (widths included) so a short hook does not
  // sit as a small mark in a wide frame; capped so creatures still differ.
  const zoom = Math.min(
    1.45,
    (TILE_H * 0.8) / (maxY - minY),
    (TILE_W * 0.9) / (maxX - minX)
  );
  const fit = (q: Vec2) => {
    q.x = TILE_W / 2 + (q.x + dx - TILE_W / 2) * zoom;
    q.y = TILE_H / 2 + (q.y + dy - TILE_H / 2) * zoom;
  };
  for (const c of chain) fit(c);
  for (const q of path) fit(q);
  return { chain, path, zoom };
}

export function paintAnimalTile(
  ctx: CanvasRenderingContext2D,
  intent: AnimalIntent
): void {
  const pal = resolveAnimalPalette(intent);
  const body = hexToRgb(pal.body);
  const edge = hexToRgb(pal.edge);
  const lum = 0.2126 * body[0] + 0.7152 * body[1] + 0.0722 * body[2];
  const dark = !pal.emissive && lum < 0.08;
  ground(ctx, dark ? [0.3, 0.29, 0.34] : [0.03, 0.03, 0.045]);
  if (dark) blob(ctx, 380, 120, 400, 220, [0.68, 0.66, 0.74], 0.8);
  else
    blob(
      ctx,
      360,
      140,
      360,
      200,
      edge,
      pal.emissive ? 0.14 : 0.06 + 0.04 * intent.intensity
    );

  const { chain, path, zoom } = stage(intent);
  const layer = document.createElement("canvas");
  layer.width = TILE_W;
  layer.height = TILE_H;
  const lctx = layer.getContext("2d")!;
  drawCreature(lctx, intent, pal, chain, path, SCALE * zoom);
  ctx.globalCompositeOperation = pal.emissive ? "lighter" : "source-over";
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}
