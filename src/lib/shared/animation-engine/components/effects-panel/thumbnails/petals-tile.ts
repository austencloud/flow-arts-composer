/**
 * Petals portrait. A ribbon of leaves shed along the sweep the tip just
 * made, thrown forward by carry, bleeding off speed by streakLength, settling
 * at fallSpeed, scattered by sway. Every silhouette is the renderer's own
 * petal sprite in the palette's own tints, with the ash palette's ember rim
 * on the newest leaves. Ported from the approved reference page
 * (spec reference/petals.html).
 */
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import {
  type PetalPalette,
  type PetalSpriteShape,
  drawPetalEmberRim,
  drawPetalSilhouette,
  pickPetalSprite,
  pickPetalTint,
  resolvePetalOpacity,
  resolvePetalPalette,
  resolvePetalSize,
  rollEmberFlag,
} from "#lib/shared/effects/domain/petal-palettes.js";
import { blob, ground, hexToRgb, lcg } from "./tile-paint";

export type PetalsIntent = EffectConfigMap["petals"];
export const PETALS_TILE_SEED = 0x9e7a;

type Rand = () => number;

/** 720 wide tile vs the renderer's reference frame. */
const SCALE = 2.4;
const TAU = Math.PI * 2;
/** Leaves are 2-4 px at picker size otherwise. */
const TILE_BOOST = 2.3;
/** The sweep: tail lower-left, head (tip now) upper-right. */
const ARC = { x0: 90, y0: 150, cx: 330, cy: -10, x1: 620, y1: 95 };
/** How long the tip took to draw the arc. */
const SWEEP_SECONDS = 2.6;
/** px/s along the arc, tile units. */
const TIP_SPEED = 600 / SWEEP_SECONDS;

function arcAt(t: number): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * ARC.x0 + 2 * u * t * ARC.cx + t * t * ARC.x1,
    y: u * u * ARC.y0 + 2 * u * t * ARC.cy + t * t * ARC.y1,
  };
}

function tangentAt(t: number): { x: number; y: number } {
  const dx = 2 * (1 - t) * (ARC.cx - ARC.x0) + 2 * t * (ARC.x1 - ARC.cx);
  const dy = 2 * (1 - t) * (ARC.cy - ARC.y0) + 2 * t * (ARC.y1 - ARC.cy);
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

interface Leaf {
  x: number;
  y: number;
  size: number;
  shape: PetalSpriteShape;
  tint: string;
  rot: number;
  face: number;
  alpha: number;
  ember: boolean;
  age: number;
}

function petals(p: PetalsIntent, pal: PetalPalette, rand: Rand): Leaf[] {
  const baseSize = 8 * SCALE * TILE_BOOST;
  const lifeBase = 2.2 + p.intensity * 1.2;
  const ambientRate = p.ambientEmission * 2;
  const motionRate = p.motionEmission * 34;
  const ambientShare = ambientRate / (ambientRate + motionRate);
  const count = Math.round(12 + (ambientRate + motionRate) * 1.8);
  const decayBase = 0.02 + p.streakLength * 0.5; // per second
  const fall = 100 * (0.3 + 0.7 * p.fallSpeed) * SCALE * 0.5; // terminal fall, px/s
  const lnD = Math.log(decayBase);
  const lnF = Math.log(0.25);
  const out: Leaf[] = [];
  for (let i = 0; i < count; i += 1) {
    // Born somewhere along the sweep; the tip was there `age` seconds ago.
    const t = rand();
    const age = (1 - t) * SWEEP_SECONDS + rand() * 0.6;
    const maxAge = lifeBase * (0.8 + rand() * 0.4);
    // Strong carry throws the whole stream right; slide the sweep left to
    // keep it in frame.
    const o = arcAt(t);
    const tg = tangentAt(t);
    o.x -= p.carry * 110;
    const shape = pickPetalSprite(pal, rand);
    const size = resolvePetalSize(baseSize, p.intensity, shape, rand);
    const isAmbient = rand() < ambientShare;
    const spread = (rand() - 0.5) * 40 * SCALE * 0.5;
    // Airstream: inherit carry x tip velocity, bleed off at decayBase^t.
    const vx0 = tg.x * TIP_SPEED * p.carry + spread;
    const vy0 = tg.y * TIP_SPEED * p.carry + (10 + rand() * 20) * SCALE * 0.5;
    const dx = (vx0 * (Math.pow(decayBase, age) - 1)) / lnD;
    // Vertical eases toward terminal fall at 0.25^t.
    const dy = fall * age + ((vy0 - fall) * (Math.pow(0.25, age) - 1)) / lnF;
    const flutter =
      Math.sin(age * (1.1 + rand() * 2.2) + rand() * TAU) *
      3.4 *
      SCALE *
      (0.55 + p.swayAmplitude * 0.45) *
      Math.min(1, age);
    // The shared air field scatters older leaves; sway sets how far.
    const airX = (rand() - 0.5) * 2 * 14 * age * (0.5 + p.swayAmplitude);
    const airY = (rand() - 0.5) * 2 * 10 * age * (0.5 + p.swayAmplitude);
    const lifeT = Math.min(1, age / maxAge);
    const fadeIn = age < 0.12 ? age / 0.12 : 1;
    const fadeOut = lifeT > 0.8 ? (1 - lifeT) / 0.2 : 1;
    const face = 0.32 + Math.abs(Math.sin(rand() * TAU)) * 0.68;
    out.push({
      x: o.x + dx + flutter + airX,
      y: o.y + dy + airY,
      size,
      shape,
      tint: pickPetalTint(pal, rand),
      rot: rand() * TAU + dx * 0.012 * Math.min(1, age),
      face,
      alpha: Math.max(0, fadeIn * fadeOut * resolvePetalOpacity(shape, isAmbient)),
      ember: rollEmberFlag(pal, rand),
      age,
    });
  }
  return out;
}

export function paintPetalsTile(
  ctx: CanvasRenderingContext2D,
  intent: PetalsIntent
): void {
  const rand = lcg(PETALS_TILE_SEED);
  const pal = resolvePetalPalette(intent);
  const leaves = petals(intent, pal, rand);
  const tint = hexToRgb(pal.tints[0] ?? "#ffffff");
  ground(ctx, [0.035, 0.03, 0.04]);
  // Soft wash in the palette's lead tint along the sweep, and a warm pool
  // under the head where the newest leaves are.
  blob(ctx, 300, 110, 330, 150, tint, 0.09);
  const head = arcAt(1);
  blob(
    ctx,
    head.x - 40 - intent.carry * 110,
    head.y + 10,
    150,
    110,
    tint,
    0.14
  );
  for (const q of leaves) {
    if (q.alpha <= 0.02) continue;
    const cos = Math.cos(q.rot);
    const sin = Math.sin(q.rot);
    ctx.setTransform(cos * q.face, sin * q.face, -sin, cos, q.x, q.y);
    ctx.globalAlpha = q.alpha;
    drawPetalSilhouette(ctx, q.shape, q.size, q.tint);
    if (q.ember && pal.emberEdge && q.age < 1.35) {
      const emberAlpha = (1 - q.age / 1.35) * q.alpha * 1.15;
      if (emberAlpha > 0.02) {
        drawPetalEmberRim(ctx, q.shape, q.size, pal.emberEdge.color, emberAlpha);
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}
