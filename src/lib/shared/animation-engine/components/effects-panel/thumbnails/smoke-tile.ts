/**
 * Smoke portrait. A column rising from where the tip stopped, leaning and
 * kinking through the renderer's own curl field, plus a thinner trail along
 * the short sweep that led there. Every mark comes from the preset's numbers
 * folded through the palette's lifetime, curl and rise biases: curl billows
 * the column, rise makes it tall and narrow, intensity sets puff size and
 * density, ambient feeds the column and motion the trail. Dark palettes
 * (Cursed) sit on a lit ground so the smoke reads as a shadow, matching the
 * renderer's lit-ground behavior. Ported from the approved reference page
 * (spec reference/smoke3.html).
 */
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import {
  type SmokePalette,
  resolveSmokePalette,
} from "#lib/shared/effects/domain/smoke-palettes.js";
import { curl2D } from "#lib/shared/3d/effects/smoke/smoke-curl-field.js";
import { blob, css, ground, hexToRgb, lcg } from "./tile-paint";

export type SmokeIntent = EffectConfigMap["smoke"];
export const SMOKE_TILE_SEED = 0x5d0c;

type Rand = () => number;

const TAU = Math.PI * 2;
/** Renderer constants: puff growth over life, alpha hold, rise speed scale. */
const GROWTH = 2.4;
const HOLD = 0.4;
const RISE_BASE_PX = 280;
const LARGE_EDDY_SCALE = 0.003;
const SMALL_EDDY_SCALE = 0.012;
const LARGE_STRENGTH = 140;
const SMALL_STRENGTH = 45;
/** A fixed moment in the curl field so the portrait never changes. */
const CLOCK = 11.0;
const SOURCE = { x: 390, y: 236 };
/** The short sweep in from the left that ended at the source. */
const ARC = { x0: 120, y0: 250, cx: 250, cy: 205, x1: SOURCE.x, y1: SOURCE.y };

function arcAt(t: number): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * ARC.x0 + 2 * u * t * ARC.cx + t * t * ARC.x1,
    y: u * u * ARC.y0 + 2 * u * t * ARC.cy + t * t * ARC.y1,
  };
}

function gauss(rand: Rand): number {
  return (rand() + rand() + rand() - 1.5) / 1.5;
}

/** Renderer alpha curve: hold for 40% of life, then linear fade. */
function lifeAlpha(lifeT: number): number {
  return lifeT > HOLD ? Math.max(0, (1 - lifeT) / (1 - HOLD)) : 1;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  alpha: number;
  order: number;
  angle: number;
  stretch: number;
}

function build(p: SmokeIntent, pal: SmokePalette, rand: Rand): Puff[] {
  const curl = p.curlStrength * pal.curlBias; // 0..1
  const rise = p.riseSpeed * pal.riseBias; // 0..1
  const risePx = rise * RISE_BASE_PX; // px/s before cooling
  const baseRadius = 14 * (0.7 + 0.9 * p.intensity);
  const peakAlpha = 0.12 + 0.25 * p.intensity;
  // How tall the column gets before its puffs have faded: speed x life, cooled.
  const height = Math.max(95, Math.min(250, risePx * pal.lifetime * 0.7));
  // Lateral spread per unit height: curl billows it, slow rise lets it pool
  // sideways.
  const spread = 0.14 + curl * 0.32 + (1 - rise) * 0.3;

  // Spine: integrate the curl field upward so the column leans and kinks like
  // the renderer's flow.
  const SEG = 40;
  const spine: { x: number; y: number }[] = [];
  let sx = SOURCE.x;
  let sy = SOURCE.y;
  for (let i = 0; i <= SEG; i += 1) {
    spine.push({ x: sx, y: sy });
    const c1 = curl2D(sx * LARGE_EDDY_SCALE, sy * LARGE_EDDY_SCALE, CLOCK);
    const c2 = curl2D(
      sx * SMALL_EDDY_SCALE,
      sy * SMALL_EDDY_SCALE,
      CLOCK * 1.7
    );
    const flow = (c1.vx * LARGE_STRENGTH + c2.vx * SMALL_STRENGTH) * curl;
    const dy = height / SEG;
    sx +=
      Math.tanh(flow / (risePx + 80)) * dy * 0.7 +
      Math.sin(i * 0.5 + CLOCK) * curl * 1.2;
    sy -= dy;
  }
  const spineAt = (s: number): { x: number; y: number } => {
    const f = s * SEG;
    const i = Math.min(SEG - 1, Math.floor(f));
    const k = f - i;
    const a = spine[i]!;
    const b = spine[i + 1]!;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };
  const tangentAt = (s: number): number => {
    const a = spineAt(Math.max(0, s - 0.03));
    const b = spineAt(Math.min(1, s + 0.03));
    return Math.atan2(b.y - a.y, b.x - a.x);
  };

  const puffs: Puff[] = [];
  // Column: fed by ambient emission (plus a floor so every preset has a body).
  const columnCount = Math.round(
    220 + p.ambientEmission * 160 + p.intensity * 60
  );
  for (let i = 0; i < columnCount; i += 1) {
    const s = Math.pow(rand(), 0.9); // slightly denser near the source
    const o = spineAt(s);
    const w = baseRadius * 0.5 + height * Math.pow(s, 0.8) * spread;
    const lifeT = s * 0.95;
    const wisp = rand() < 0.25;
    const r =
      baseRadius *
      (0.7 + rand() * 0.5) *
      (1 + (GROWTH - 1) * lifeT) *
      (wisp ? 0.7 : 0.85);
    const lateral = rand() < 0.7 ? gauss(rand) * w : (rand() - 0.5) * 2 * w;
    const c = curl2D(
      o.x * SMALL_EDDY_SCALE,
      o.y * SMALL_EDDY_SCALE,
      CLOCK * 1.7
    );
    const fadeIn = Math.min(1, s / 0.12);
    puffs.push({
      x: o.x + lateral,
      y: o.y + gauss(rand) * r * 0.6,
      r,
      alpha:
        peakAlpha *
        lifeAlpha(lifeT) *
        fadeIn *
        (wisp ? 0.3 : 0.42) *
        (0.55 + 0.45 * (1 - s)),
      order: s,
      angle: wisp ? tangentAt(s) + c.vx * 1.2 * curl : rand() * TAU,
      stretch: wisp ? 2.2 + rand() * 1.8 : 0.85 + rand() * 0.3,
    });
  }
  // Trail: motion emission left puffs along the sweep; they are older the
  // farther back they are.
  const trailCount = Math.round(60 + p.motionEmission * 220);
  for (let i = 0; i < trailCount; i += 1) {
    const t = rand(); // 1 = head
    const o = arcAt(t);
    const age = (1 - t) * 1.4 + rand() * 0.3; // seconds since the tip passed
    const lifeT = Math.min(0.95, age / pal.lifetime + 0.15);
    const r =
      baseRadius *
      (0.7 + rand() * 0.5) *
      (1 + (GROWTH - 1) * lifeT) *
      (0.9 + age * 0.35);
    const lift = risePx * age * 0.4;
    const c = curl2D(o.x * LARGE_EDDY_SCALE, o.y * LARGE_EDDY_SCALE, CLOCK);
    puffs.push({
      x:
        o.x +
        c.vx * LARGE_STRENGTH * curl * age * 0.5 +
        gauss(rand) * (8 + age * 12),
      y: o.y - lift + gauss(rand) * (10 + age * 26),
      r,
      alpha: peakAlpha * lifeAlpha(lifeT) * 0.3 * (0.35 + 0.65 * t),
      order: 1 + age,
      angle: rand() * TAU,
      stretch: 1 + curl * 0.4 + rand() * 0.3,
    });
  }
  puffs.sort((a, b) => b.order - a.order);
  return puffs;
}

export function paintSmokeTile(
  ctx: CanvasRenderingContext2D,
  intent: SmokeIntent
): void {
  const rand = lcg(SMOKE_TILE_SEED);
  const pal = resolveSmokePalette(intent);
  const puffs = build(intent, pal, rand);
  const core = hexToRgb(pal.core);
  const edge = hexToRgb(pal.edge);
  const dark = 0.2126 * edge[0] + 0.7152 * edge[1] + 0.0722 * edge[2] < 0.45;
  ground(ctx, dark ? [0.27, 0.26, 0.31] : [0.03, 0.03, 0.045]);
  if (dark) {
    blob(ctx, 390, 120, 380, 230, [0.62, 0.6, 0.68], 0.75);
  } else {
    blob(ctx, SOURCE.x, 150, 300, 200, edge, 0.05 + 0.05 * intent.intensity);
  }
  // One unit-radius gradient, scaled per puff through the transform.
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0, css(core, 0.8));
  grad.addColorStop(0.5, css(edge, 0.38));
  grad.addColorStop(1, css(edge, 0));
  ctx.fillStyle = grad;
  const boost = dark ? 1.7 : 0.8;
  for (const q of puffs) {
    const alpha = q.alpha * boost;
    if (alpha <= 0.015) continue;
    const cos = Math.cos(q.angle);
    const sin = Math.sin(q.angle);
    const sx = q.stretch * q.r;
    const sy = q.r / q.stretch;
    ctx.setTransform(sx * cos, sx * sin, -sy * sin, sy * cos, q.x, q.y);
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}
