/**
 * Zap portrait. Every mark comes from the preset's own numbers: style picks
 * the silhouette, jitter roughens the path, branching adds forks, frequency
 * adds ghost strikes, glow widens the halo, intensity sets brightness.
 * Ported from the approved reference page (spec reference/zap.html).
 */
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import {
  TILE_H,
  type Point,
  blob,
  glowStroke,
  ground,
  hexToRgb,
  lcg,
  terminal,
} from "./tile-paint";

export type ZapIntent = EffectConfigMap["zap"];
export const ZAP_TILE_SEED = 0x2a17;

type Rand = () => number;

/** 720 wide tile vs the renderer's reference frame. */
const SCALE = 2.4;
/** Cross-prop edges of the Web mesh, the renderer's violet. */
const CROSS = "#9d7bff";

/** Midpoint-displacement jag between A and B, the renderer's jag(), seeded. */
function jag(A: Point, B: Point, amp: number, rand: Rand, depth = 5): Point[] {
  let pts: Point[] = [A, B];
  let a = amp;
  for (let d = 0; d < depth; d += 1) {
    const next: Point[] = [pts[0]!];
    for (let i = 1; i < pts.length; i += 1) {
      const p = pts[i - 1]!;
      const q = pts[i]!;
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const off = (rand() - 0.5) * 2 * a;
      next.push({ x: mx - (dy / len) * off, y: my + (dx / len) * off }, q);
    }
    pts = next;
    a *= 0.55;
  }
  return pts;
}

function grad(
  ctx: CanvasRenderingContext2D,
  A: Point,
  B: Point,
  a: string,
  b: string
): CanvasGradient {
  const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

function drawStorm(
  ctx: CanvasRenderingContext2D,
  p: ZapIntent,
  rand: Rand
): void {
  const A: Point = { x: 150, y: 140 };
  const B: Point = { x: 570, y: 130 };
  const width = 2 * SCALE;
  const glow = 12 * SCALE * (0.5 + p.glow);
  const jf = 0.35 + p.jitter * 1.3;
  const amp = Math.min(420 * 0.18, 34 * SCALE) * jf;
  // Ghost strikes: the multi-strike flicker, one faint earlier path per ~6 strikes/s.
  const ghosts = Math.round(p.frequency / 6);
  for (let g = 0; g < ghosts; g += 1) {
    const pts = jag(A, B, amp * 1.2, rand);
    glowStroke(
      ctx,
      pts,
      width * 0.6,
      p.leftColor,
      glow * 0.6,
      p.intensity * 0.22,
      "#fff",
      grad(ctx, A, B, p.leftColor, p.rightColor)
    );
  }
  const main = jag(A, B, amp, rand);
  // Forks: count and reach scale with branching. Each fork leaves the main
  // bolt as a real limb, thick at the root, forking once itself, not a wisp.
  const forks = Math.round(1 + p.branching * 7);
  for (let f = 0; f < forks; f += 1) {
    const i = 4 + Math.floor(rand() * (main.length - 8));
    const o = main[i]!;
    const ang = (rand() - 0.5) * 2.2 + (rand() < 0.5 ? -0.9 : 0.9);
    let len = (60 + rand() * 110) * (0.5 + p.branching) * SCALE * 0.5;
    // Forks stay inside the tile: a bolt that leaves the frame reads as cropped.
    const yEnd = o.y + Math.sin(ang) * len;
    if (yEnd < 28) len *= (o.y - 28) / (o.y - yEnd);
    if (yEnd > TILE_H - 28) len *= (TILE_H - 28 - o.y) / (yEnd - o.y);
    const tip: Point = {
      x: o.x + Math.cos(ang) * len,
      y: o.y + Math.sin(ang) * len,
    };
    const col = i < main.length / 2 ? p.leftColor : p.rightColor;
    const limb = jag(o, tip, amp * 0.4, rand, 3);
    glowStroke(ctx, limb, width * 0.75, col, glow * 0.8, p.intensity * 0.85);
    // Secondary fork off the limb.
    const k = Math.floor(limb.length * (0.35 + rand() * 0.3));
    const s = limb[k]!;
    const ang2 = ang + (rand() < 0.5 ? -0.8 : 0.8);
    const len2 = len * (0.35 + rand() * 0.3);
    glowStroke(
      ctx,
      jag(
        s,
        { x: s.x + Math.cos(ang2) * len2, y: s.y + Math.sin(ang2) * len2 },
        amp * 0.25,
        rand,
        2
      ),
      width * 0.45,
      col,
      glow * 0.6,
      p.intensity * 0.6
    );
  }
  // Main bolt: a wide colored corona, then the stepped-leader core drawn twice
  // so it burns white at picker size.
  const g = grad(ctx, A, B, p.leftColor, p.rightColor);
  glowStroke(
    ctx,
    main,
    width * 1.5,
    p.leftColor,
    glow * 1.6,
    p.intensity * 0.5,
    p.leftColor,
    g
  );
  glowStroke(ctx, main, width * 1.1, p.leftColor, glow, p.intensity, "#fff", g);
  glowStroke(
    ctx,
    main,
    width * 0.6,
    "#ffffff",
    glow * 0.3,
    p.intensity,
    "#fff",
    "#ffffff"
  );
  terminal(ctx, A.x, A.y, 22 * SCALE, p.leftColor, p.intensity);
  terminal(ctx, B.x, B.y, 22 * SCALE, p.rightColor, p.intensity);
}

function drawPlasma(
  ctx: CanvasRenderingContext2D,
  p: ZapIntent,
  rand: Rand
): void {
  const A: Point = { x: 150, y: 140 };
  const B: Point = { x: 570, y: 130 };
  const width = 5 * SCALE;
  const glow = 20 * SCALE * (0.5 + p.glow);
  // A sustained wobbling conduit: sine wobble plus a little jitter, no forks.
  const N = 48;
  const pts: Point[] = [];
  const wob = p.wobbleAmount * 26 * SCALE * 0.5;
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    const x = A.x + (B.x - A.x) * t;
    const y = A.y + (B.y - A.y) * t;
    const env = Math.sin(t * Math.PI);
    const off =
      Math.sin(t * 9.5 + 0.8) * wob * env +
      (rand() - 0.5) * p.jitter * 10 * env;
    pts.push({ x, y: y + off });
  }
  const g = grad(ctx, A, B, p.leftColor, p.rightColor);
  glowStroke(
    ctx,
    pts,
    width * 1.6,
    p.leftColor,
    glow * 1.4,
    p.intensity * 0.35,
    p.leftColor,
    g
  );
  glowStroke(ctx, pts, width, p.leftColor, glow, p.intensity, "#fff", g);
  // Sputter sparks shedding off the arc: count follows frequency.
  const sparks = Math.round(p.frequency * 2.2);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let s = 0; s < sparks; s += 1) {
    const i = Math.floor(rand() * pts.length);
    const o = pts[i]!;
    const d = (6 + rand() * 40) * SCALE * 0.5;
    const a = rand() * Math.PI * 2;
    const col = i < pts.length / 2 ? p.leftColor : p.rightColor;
    const r = (1 + rand() * 1.4) * SCALE * 0.7;
    ctx.shadowBlur = 8 * SCALE;
    ctx.shadowColor = col;
    ctx.fillStyle = col;
    ctx.globalAlpha = p.intensity * (0.4 + rand() * 0.6);
    ctx.beginPath();
    ctx.arc(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  terminal(ctx, A.x, A.y, 26 * SCALE, p.leftColor, p.intensity);
  terminal(ctx, B.x, B.y, 26 * SCALE, p.rightColor, p.intensity);
}

interface WebNode extends Point {
  left: boolean;
}

function drawWeb(
  ctx: CanvasRenderingContext2D,
  p: ZapIntent,
  rand: Rand
): void {
  // Four tips: both ends of each prop, so the mesh has same-prop and cross-prop edges.
  const nodes: WebNode[] = [
    { x: 170, y: 72, left: true },
    { x: 140, y: 205, left: true },
    { x: 555, y: 65, left: false },
    { x: 585, y: 198, left: false },
  ];
  const jf = 0.35 + p.jitter * 1.3;
  const glow = 12 * SCALE * (0.5 + p.glow);
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const A = nodes[i]!;
      const B = nodes[j]!;
      const same = A.left === B.left;
      const col = same ? (A.left ? p.leftColor : p.rightColor) : CROSS;
      const dist = Math.hypot(B.x - A.x, B.y - A.y);
      const pts = jag(
        A,
        B,
        Math.min(dist * 0.18, 34 * SCALE) * jf * 0.5,
        rand,
        4
      );
      const width = 2 * SCALE * (same ? 0.8 : 0.55);
      glowStroke(ctx, pts, width, col, glow, p.intensity * (same ? 0.8 : 0.5));
      // A charge pulse travelling the edge.
      const t = 0.25 + rand() * 0.5;
      const k = Math.floor(t * (pts.length - 1));
      const q = pts[k]!;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.shadowBlur = 12 * SCALE;
      ctx.shadowColor = col;
      ctx.fillStyle = "#fff";
      ctx.globalAlpha = p.intensity;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 2.4 * SCALE, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  for (const n of nodes) {
    terminal(
      ctx,
      n.x,
      n.y,
      18 * SCALE,
      n.left ? p.leftColor : p.rightColor,
      p.intensity
    );
  }
}

export function paintZapTile(
  ctx: CanvasRenderingContext2D,
  intent: ZapIntent
): void {
  const rand = lcg(ZAP_TILE_SEED);
  ground(ctx, [0.03, 0.03, 0.06]);
  // Faint ambient wash in the prop colors so the bolt sits in its own light.
  blob(ctx, 150, 140, 150, 110, hexToRgb(intent.leftColor), 0.12);
  blob(ctx, 570, 130, 150, 110, hexToRgb(intent.rightColor), 0.12);
  switch (intent.style) {
    case "plasma":
      drawPlasma(ctx, intent, rand);
      break;
    case "web":
      drawWeb(ctx, intent, rand);
      break;
    default:
      drawStorm(ctx, intent, rand);
  }
}
