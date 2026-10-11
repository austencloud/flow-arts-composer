/**
 * Bubbles portrait. A field of clear bubbles rising off the sweep the tip
 * just made, big ones in front, a few mid-pop. Every mark comes from the
 * preset's numbers: intensity sets size and life, sizeJitter the spread of
 * sizes, buoyancy how far they have risen, ambient and motion the count.
 * Each bubble is the renderer's film: clear middle, bright band at the edge,
 * hairline rim, thin-film sheen on the shadowed arc, specular up-left and a
 * bounce down-right. Ported from the approved reference page
 * (spec reference/bubbles.html).
 */
import type { EffectConfigMap } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import {
  type BubblePalette,
  oilIridescentRim,
  resolveBubblePalette,
} from "#lib/shared/effects/domain/bubble-palettes.js";
import {
  type Rgb,
  blob,
  css,
  ground,
  hexToRgb,
  lcg,
} from "./tile-paint";

export type BubblesIntent = EffectConfigMap["bubbles"];
export const BUBBLES_TILE_SEED = 0xb0b5;

type Rand = () => number;

/** 720 wide tile vs the renderer's reference frame. */
const SCALE = 2.4;
const TAU = Math.PI * 2;

/**
 * The sweep the tip just made: tail lower-left, head upper-right. Lower in
 * the frame than the other tiles so the field has room to rise.
 */
const ARC = { x0: 70, y0: 240, cx: 330, cy: 150, x1: 650, y1: 215 };

function arcAt(t: number): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * ARC.x0 + 2 * u * t * ARC.cx + t * t * ARC.x1,
    y: u * u * ARC.y0 + 2 * u * t * ARC.cy + t * t * ARC.y1,
  };
}

interface Film {
  rgb: Rgb;
  /** 0..255 channels for the gradient stops, matching the renderer's strings. */
  bytes: [number, number, number];
  alpha: number;
}

/** The palette's interior tint is an rgba string; the tile needs its parts. */
function filmOf(pal: BubblePalette): Film {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/.exec(
    pal.fill
  );
  if (!m) {
    const rgb = hexToRgb(pal.rim);
    return {
      rgb,
      bytes: [
        Math.round(rgb[0] * 255),
        Math.round(rgb[1] * 255),
        Math.round(rgb[2] * 255),
      ],
      alpha: 0.2,
    };
  }
  const bytes: [number, number, number] = [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
  ];
  return {
    rgb: [bytes[0] / 255, bytes[1] / 255, bytes[2] / 255],
    bytes,
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  };
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  lifeT: number;
  alpha: number;
  filmPhase: number;
  popping: boolean;
  popT: number;
}

function field(p: BubblesIntent, rand: Rand): Bubble[] {
  // The tile reads 2.4x smaller than drawn.
  const baseR = 6 * SCALE * (0.7 + 0.9 * p.intensity) * 1.35;
  const spread = 0.42 + p.sizeJitter * 1.55;
  const lifeMult =
    p.palette === "champagne" || p.palette === "acid" ? 0.55 : 1.0;
  const life = (1.0 + p.intensity * 2.0) * lifeMult;
  const count = Math.round(
    14 + p.ambientEmission * 30 + p.motionEmission * 26
  );
  const pops = Math.round(1 + (1 - lifeMult) * 3 + p.ambientEmission * 2);
  const out: Bubble[] = [];
  for (let i = 0; i < count + pops; i += 1) {
    const popping = i >= count;
    const sizeMul = 0.34 + Math.pow(rand(), 2.0) * spread;
    const r = baseR * sizeMul;
    const t = 0.08 + rand() * 0.9; // where along the sweep it was born
    const o = arcAt(t);
    const lifeT = popping ? 1 : rand(); // 0 just born at the tip, 1 about to pop
    const age = lifeT * life * (0.7 + rand() * 0.6);
    const up = (16 + p.buoyancy * 92) * (0.55 + sizeMul * 0.75) * SCALE * 0.5;
    const wobble =
      Math.sin(age * (1.4 + rand() * 1.9) + rand() * TAU) *
      (1.6 + rand() * 2.6) *
      SCALE *
      (1.3 - sizeMul * 0.5);
    const drift = (rand() - 0.5) * 22 * SCALE * 0.5 * Math.min(1, age);
    const fadeIn = lifeT < 0.12 ? lifeT / 0.12 : 1;
    const fadeOut = lifeT > 0.8 ? 1 - (lifeT - 0.8) / 0.2 : 1;
    out.push({
      x: o.x + wobble + drift,
      y: Math.max(36, o.y - up * age),
      r: r * (1 + 0.08 * lifeT * lifeT),
      lifeT,
      alpha: (popping ? 1 : fadeIn * fadeOut) * 0.92,
      filmPhase: rand(),
      popping,
      popT: popping ? 0.35 + rand() * 0.4 : 0,
    });
  }
  // Big ones in front: draw small first.
  out.sort((a, b) => a.r - b.r);
  return out;
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  b: Bubble,
  pal: BubblePalette,
  film: Film
): void {
  const { x, y, r, alpha } = b;
  const rim = pal.iridescent ? oilIridescentRim(b.lifeT) : pal.rim;
  const rimWidth =
    Math.min(1.9, Math.max(0.65, (r * 0.055) / SCALE)) * SCALE * 0.8;
  ctx.lineCap = "round";

  if (b.popping) {
    // The film relaxing into a flattened ring, slivers flying off.
    const t = b.popT;
    ctx.globalAlpha = alpha * Math.pow(1 - t, 1.6);
    ctx.lineWidth = rimWidth * 1.45;
    ctx.strokeStyle = rim;
    const pr = r * (1 + 0.18 * (1 - Math.pow(1 - t, 2)));
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      pr * (1 + t * 0.12),
      pr * Math.max(0.16, 1 - t * 0.84),
      0,
      0,
      TAU
    );
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = pal.iridescent ? oilIridescentRim(b.lifeT) : pal.popBurst;
    const n = 6;
    const sizeK = Math.min(2, r / (6 * SCALE));
    for (let i = 0; i < n; i += 1) {
      const th = (i / n) * TAU + b.filmPhase * 0.4;
      const mag = r * (0.9 + (((i * 7) % 5) / 5) * 0.9) * (0.6 + sizeK * 0.5);
      const fr =
        (0.6 + (((i * 3) % 4) / 4) * 0.7) * (0.5 + sizeK) * SCALE * 0.9;
      ctx.globalAlpha = alpha * (1 - t) * 0.9;
      ctx.beginPath();
      ctx.ellipse(
        x + Math.cos(th) * mag,
        y + Math.sin(th) * mag,
        fr * 1.65,
        fr * 0.34,
        th + b.filmPhase * 5,
        0,
        TAU
      );
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (r > 5 * SCALE) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    blob(ctx, x, y, r * 1.6, r * 1.6, film.rgb, 0.1 * alpha);
    ctx.restore();
  }

  // Interior film: clear through the middle, brightening into a band at the edge.
  const [fr, fg, fb] = film.bytes;
  const fa = film.alpha;
  const body = ctx.createRadialGradient(x, y, 0, x, y, r);
  body.addColorStop(0, `rgba(${fr},${fg},${fb},0)`);
  body.addColorStop(0.6, `rgba(${fr},${fg},${fb},${fa * 0.1})`);
  body.addColorStop(0.9, `rgba(${fr},${fg},${fb},${Math.min(1, fa * 1.1)})`);
  body.addColorStop(1, `rgba(${fr},${fg},${fb},${fa * 0.18})`);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();

  // Hairline rim.
  ctx.lineWidth = rimWidth;
  ctx.strokeStyle = rim;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();

  // Thin-film sheen on the shadowed arc, opposite the specular.
  if (r > 2 * SCALE) {
    const sheenT = (b.filmPhase + b.lifeT * 0.35) % 1;
    ctx.globalAlpha = alpha * (pal.iridescent ? 0.65 : 0.3);
    ctx.lineWidth = rimWidth * 1.5;
    ctx.strokeStyle = oilIridescentRim(sheenT);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.92, TAU * 0.06, TAU * 0.42);
    ctx.stroke();
  }

  // Specular up-left, bounce down-right.
  const hi = hexToRgb(pal.highlight);
  const sx = x - r * 0.4;
  const sy = y - r * 0.44;
  const spec = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.2);
  spec.addColorStop(0, css(hi, 1));
  spec.addColorStop(0.45, css(hi, 0.55));
  spec.addColorStop(1, css(hi, 0));
  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.2, 0, TAU);
  ctx.fill();
  if (r > 3 * SCALE) {
    const bx = x + r * 0.36;
    const by = y + r * 0.42;
    const bo = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.3);
    bo.addColorStop(0, css(hi, 0.4));
    bo.addColorStop(1, css(hi, 0));
    ctx.globalAlpha = alpha * 0.32;
    ctx.fillStyle = bo;
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.3, 0, TAU);
    ctx.fill();
  }
}

export function paintBubblesTile(
  ctx: CanvasRenderingContext2D,
  intent: BubblesIntent
): void {
  const rand = lcg(BUBBLES_TILE_SEED);
  const pal = resolveBubblePalette(intent);
  const film = filmOf(pal);
  ground(ctx, [0.03, 0.03, 0.055]);
  // A soft wash in the film color where the field is densest, so the clear
  // bubbles have something to catch.
  const head = arcAt(0.85);
  const wash = 0.6 + intent.intensity;
  blob(ctx, head.x - 80, head.y - 70, 340, 170, film.rgb, 0.16 * wash);
  blob(ctx, 200, 170, 280, 140, film.rgb, 0.1 * wash);
  ctx.save();
  for (const b of field(intent, rand)) drawBubble(ctx, b, pal, film);
  ctx.restore();
}
