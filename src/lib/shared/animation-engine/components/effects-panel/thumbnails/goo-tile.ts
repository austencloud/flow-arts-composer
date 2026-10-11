/**
 * Goo portrait. A rope of liquid along the sweep the tip just made, necking
 * from a fat head to a thin tail, with drips hanging below it. Every mark
 * comes from the preset's numbers: motion sets the rope's thickness and
 * length, ambient adds drips, surface tension lumps the beads and stretches
 * the drips, viscosity shortens them, clarity darkens the interior, intensity
 * brightens the glints. The body is the renderer's own recipe: blurred discs
 * snapped to a hard edge by a contrast filter, three nested thresholds.
 * Ported from the approved reference page (spec reference/goo.html).
 */
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { resolveWaterPalette } from "#lib/shared/effects/domain/water-palettes.js";
import {
  TILE_H,
  TILE_W,
  type Rgb,
  blob,
  ground,
  hexToRgb,
  lcg,
  mix,
} from "./tile-paint";

export type GooIntent = EffectConfigMap["goo"];
export const GOO_TILE_SEED = 0x6007;

type Rand = () => number;

interface Bead {
  x: number;
  y: number;
  r: number;
  body: boolean;
}

/** The sweep: tail lower-left, head (tip now) upper-right. */
const ARC = { x0: 110, y0: 190, cx: 330, cy: 20, x1: 600, y1: 120 };

function arcAt(t: number): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * ARC.x0 + 2 * u * t * ARC.cx + t * t * ARC.x1,
    y: u * u * ARC.y0 + 2 * u * t * ARC.cy + t * t * ARC.y1,
  };
}

/** Beads: the body rope along the path plus drips hanging below it. */
function beads(p: GooIntent, rand: Rand): Bead[] {
  const out: Bead[] = [];
  // Head radius, and the fraction of the arc the body spans.
  const thick = 14 + p.motionEmission * 24;
  const tailLen = 0.55 + p.motionEmission * 0.4;
  const N = 70;
  for (let i = 0; i <= N; i += 1) {
    const t = 1 - (i / N) * tailLen; // 1 = head
    const age = i / N;
    const pos = arcAt(t);
    // Taper: fat head necking to a thin tail; surface tension keeps beads
    // rounder, which reads as lumpier.
    const r =
      thick *
      (0.25 + 0.75 * Math.pow(1 - age, 0.9)) *
      (1 + (rand() - 0.5) * 0.3 * p.surfaceTension);
    out.push({ x: pos.x, y: pos.y, r, body: true });
  }
  // Drips: ambient ooze lets beads leave the rope; viscosity and surface
  // tension stretch them into teardrops.
  const drips = Math.round(p.ambientEmission * 9);
  for (let d = 0; d < drips; d += 1) {
    const t = 0.15 + rand() * 0.8;
    const pos = arcAt(1 - (1 - t) * tailLen);
    const fall = 20 + rand() * 70 * (1 - p.viscosity * 0.6);
    const neck = 1 + p.surfaceTension * 2.2 + p.viscosity * 1.5;
    const r = Math.max(9, thick * (0.3 + rand() * 0.25));
    // A teardrop is a chain of shrinking beads from the body down to the drop.
    for (let k = 0; k <= 6; k += 1) {
      const u = k / 6;
      out.push({
        x: pos.x + (rand() - 0.5) * 2,
        y: pos.y + fall * u,
        r: k === 6 ? r : r * (0.45 + 0.35 * (1 - u)) * Math.min(1.2, neck * 0.45),
        body: false,
      });
    }
  }
  return out;
}

function scratchCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE_W;
  c.height = TILE_H;
  return c;
}

/**
 * The renderer's recipe runs on an opaque black field: blur bridges the
 * beads, contrast snaps the result to a hard edge. Brightness becomes alpha.
 */
function fieldPass(
  ctx: CanvasRenderingContext2D,
  bs: readonly Bead[],
  blurPx: number,
  brightness: number,
  color: Rgb
): void {
  const work = scratchCanvas();
  const w = work.getContext("2d");
  const thr = scratchCanvas();
  const t = thr.getContext("2d");
  if (!w || !t) return;
  w.fillStyle = "#000";
  w.fillRect(0, 0, TILE_W, TILE_H);
  w.fillStyle = "#fff";
  for (const b of bs) {
    w.beginPath();
    w.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    w.fill();
  }
  t.filter = `blur(${blurPx}px) brightness(${brightness}) contrast(14)`;
  t.drawImage(work, 0, 0);
  t.filter = "none";
  const img = t.getImageData(0, 0, TILE_W, TILE_H);
  const d = img.data;
  const r = Math.round(color[0] * 255);
  const g = Math.round(color[1] * 255);
  const bl = Math.round(color[2] * 255);
  for (let i = 0; i < d.length; i += 4) {
    d[i + 3] = d[i]!;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = bl;
  }
  t.putImageData(img, 0, 0);
  ctx.drawImage(thr, 0, 0);
}

export function paintGooTile(
  ctx: CanvasRenderingContext2D,
  intent: GooIntent
): void {
  const rand = lcg(GOO_TILE_SEED);
  const pal = resolveWaterPalette(intent);
  const core = hexToRgb(pal.core);
  const edge = hexToRgb(pal.edge);
  const puddle = hexToRgb(pal.puddleTint);
  const hi = hexToRgb(pal.highlight);

  ground(ctx, [0.03, 0.03, 0.05]);
  const bs = beads(intent, rand);

  // Glow under the body.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of bs) {
    if (b.body) {
      blob(ctx, b.x, b.y, b.r * 3.2, b.r * 3.2, edge, 0.05 * intent.intensity);
    }
  }
  ctx.restore();

  // Three nested thresholds: rim band (edge), body (core), deep interior
  // (darker as clarity drops).
  fieldPass(ctx, bs, 10, 1.0, edge);
  fieldPass(ctx, bs, 10, 0.8, core);
  fieldPass(ctx, bs, 10, 0.62, mix(core, puddle, (1 - intent.clarity) * 0.7));

  // Wet specular glints: same offset on every bead, sparse.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of bs) {
    if (b.body && b.r > 6 && rand() < 0.12) {
      const k = 0.35 + rand() * 0.4;
      blob(
        ctx,
        b.x - b.r * 0.35,
        b.y - b.r * 0.4,
        b.r * k,
        b.r * k * 0.7,
        hi,
        (0.6 + rand() * 0.4) * intent.intensity
      );
    }
  }
  for (const b of bs) {
    if (!b.body && b.r > 7) {
      blob(
        ctx,
        b.x - b.r * 0.3,
        b.y - b.r * 0.35,
        b.r * 0.35,
        b.r * 0.28,
        hi,
        0.8 * intent.intensity
      );
    }
  }
  ctx.restore();
}
