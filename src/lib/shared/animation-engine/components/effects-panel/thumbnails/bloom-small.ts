/**
 * Bloom's small pictures (tile and chip): a lens-flare poster. Each light is a
 * wide soft halo in its own colour, a hot white core, a ring of the colour just
 * outside the core, and tapered spikes (thick at the core, running to a point).
 * Painted on a canvas so the unit test can reach it; the card stays in
 * BloomThumbnail.svelte.
 *
 * The rule the card keeps holds here: every mark comes from the preset's own
 * parameters. `colorMode` gives the colours, `spikes` the spike length and
 * count, `streak` and `afterglow` the horizontal smear, `falloff` the halo,
 * `coreStrength` the core. Nothing is keyed off a preset id.
 */
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { withAlpha } from "./tile-paint";
import { type Box, type TileFormat, frame, smallTable } from "./tile-format";

export type BloomIntent = typeof DEFAULT_EFFECTS_CONFIG.bloom;

const WIDTH = 720;
const HEIGHT = 270;

const BLUE = DEFAULT_EFFECTS_CONFIG.trails.leftColor;
const RED = DEFAULT_EFFECTS_CONFIG.trails.rightColor;

/** The colours a look lights its flares with. */
export function bloomLightColors(intent: BloomIntent): string[] {
  switch (intent.colorMode) {
    case "prop-matched":
      return [BLUE, RED];
    case "palette":
      return intent.palette.length ? intent.palette.slice(0, 3) : [intent.color];
    case "rainbow":
      return [
        "hsl(350, 85%, 62%)",
        "hsl(45, 90%, 60%)",
        "hsl(195, 85%, 60%)",
      ];
    case "solid":
    default:
      return [intent.color];
  }
}

/** Lift the floor so a dim preset still reads, without flattening the range. */
export function bloomExposure(intensity: number): number {
  return 0.55 + 0.45 * Math.min(1, Math.max(0, intensity));
}

/** Presets live roughly in 20-90; map that onto the tile generously. */
export function bloomNormRadius(radius: number): number {
  return Math.min(1, Math.max(0, (radius - 20) / 70));
}

const VIEWS: Record<"tile" | "chip", Box> = {
  tile: { x: 107, y: 40, w: 506, h: 190 },
  chip: { x: 217.5, y: 40, w: 285, h: 190 },
};

/**
 * The composition. Halos reach most of the frame's height, the cores are about
 * a quarter of it (kept small: bigger white discs with rings read as two
 * headlights at 52 wide), and the spikes taper to a point.
 */
const LOOK = {
  /** The light's own halo, as a share of the frame height, and its strength. */
  halo: 0.7,
  haloAlpha: 0.5,
  /** A softer, wider halo behind the stars, so the frame's sides are not empty. */
  wide: 1.05,
  wideAlpha: 0.32,
  core: 0.13,
  ring: 1.22,
  ringAlpha: 0.55,
  /** Spike half-width at the core, in card units. */
  spikeW: 10,
  /** Horizontal spike length: this share of the frame height, plus 0.9 more with full streak or afterglow. */
  spikeH: 0.8,
  /** Vertical spike length: runs to the frame's edge. */
  spikeV: 0.5,
  /** Diagonals appear only when `spikes` is at least this, at this share of the vertical. */
  diag: 0.75,
  diagL: 1.05,
  /** Distance between two lights, in card units. */
  spread: 92,
} as const;

function halo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
  falloff: string
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  if (falloff === "sharp") {
    g.addColorStop(0, withAlpha(color, alpha));
    g.addColorStop(0.12, withAlpha(color, alpha * 0.72));
    g.addColorStop(0.45, withAlpha(color, alpha * 0.28));
  } else {
    g.addColorStop(0, withAlpha(color, alpha));
    g.addColorStop(0.35, withAlpha(color, alpha * 0.64));
    g.addColorStop(0.7, withAlpha(color, alpha * 0.26));
  }
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** A tapered spike: thick at the light, a point at `len`. */
function spike(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  len: number,
  w: number,
  color: string,
  alpha: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(0.3, withAlpha(color, alpha * 0.8));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -w);
  ctx.lineTo(len, 0);
  ctx.lineTo(0, w);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function paintBloomSmall(
  ctx: CanvasRenderingContext2D,
  preset: Partial<BloomIntent>,
  format: Exclude<TileFormat, "card">
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const view = VIEWS[smallTable(format)];
  frame(ctx, format, view, 0);
  const look = LOOK;
  const intent = { ...DEFAULT_EFFECTS_CONFIG.bloom, ...preset };
  const colors = bloomLightColors(intent);
  const alpha = bloomExposure(intent.intensity);
  const reach = Math.min(1, intent.streak * 0.6 + intent.afterglow * 0.6);

  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  background.addColorStop(0, "#090b16");
  background.addColorStop(0.58, "#050712");
  background.addColorStop(1, "#020309");
  ctx.fillStyle = background;
  ctx.fillRect(-WIDTH, -HEIGHT, WIDTH * 3, HEIGHT * 3);

  const isChip = smallTable(format) === "chip";
  // The chip frame is narrower, so the same halos would fill it edge to edge.
  const dim = isChip ? 0.6 : 1;
  const maxLights = isChip ? 2 : 3;
  const lit = colors.slice(0, maxLights);
  const spread = lit.length === 1 ? 0 : look.spread * (lit.length === 3 ? 0.9 : 1);
  const H = view.h;
  const cy = view.y + H / 2;
  const cxMid = view.x + view.w / 2;
  const haloR = H * look.halo * (0.85 + 0.3 * bloomNormRadius(intent.radius));
  const coreR =
    H *
    look.core *
    (0.62 + 0.38 * Math.min(1, intent.coreStrength + (intent.spikes > 0 ? 0.6 : 0)));
  // A single streaked light sits right of centre so its tail has room.
  const lead = lit.length === 1 ? reach * 56 : 0;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  lit.forEach((color, i) => {
    const x = cxMid + (lit.length === 1 ? 0 : (i - (lit.length - 1) / 2) * spread) + lead;
    halo(ctx, x, cy, H * look.wide, color, alpha * look.wideAlpha * dim, "smooth");
    halo(ctx, x, cy, haloR, color, alpha * look.haloAlpha * (isChip ? 1.12 : 1), intent.falloff);

    if (reach > 0.02) {
      // The horizontal smear: a soft long exposure running away to the left. It is
      // a row of round, feathered blobs, so brightness falls smoothly along the
      // length to nothing and fades across the width, with no edge or step.
      const len = view.w * (0.16 + 0.4 * reach);
      const N = 90;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const bx = x - t * len;
        const r = H * (0.3 - 0.12 * t);
        const fade = Math.pow(1 - t, 1.1);
        const a = alpha * 0.075 * fade;
        const g = ctx.createRadialGradient(bx, cy, 0, bx, cy, r);
        g.addColorStop(0, withAlpha(color, a));
        g.addColorStop(0.4, withAlpha(color, a * 0.55));
        g.addColorStop(0.75, withAlpha(color, a * 0.14));
        g.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(bx - r, cy - r, r * 2, r * 2);
      }
      // A narrower, hotter thread down the middle of the smear.
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const bx = x - t * len * 0.9;
        const r = H * 0.09;
        const a = alpha * 0.13 * Math.pow(1 - t, 1.6);
        const g = ctx.createRadialGradient(bx, cy, 0, bx, cy, r);
        g.addColorStop(0, withAlpha(color, a));
        g.addColorStop(0.5, withAlpha(color, a * 0.4));
        g.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(bx - r, cy - r, r * 2, r * 2);
      }
    }

    if (intent.spikes > 0) {
      const k = 0.55 + 0.45 * intent.spikes;
      const sa = Math.min(1, 0.7 + intent.spikes * 0.3) * alpha;
      const lenH = H * (look.spikeH + 0.9 * reach) * k;
      const lenV = H * look.spikeV * (0.8 + 0.2 * k);
      for (const dir of [0, Math.PI])
        spike(ctx, x, cy, dir, lenH, look.spikeW, color, sa);
      for (const dir of [Math.PI / 2, -Math.PI / 2])
        spike(ctx, x, cy, dir, lenV, look.spikeW * 0.9, color, sa);
      if (intent.spikes >= look.diag) {
        for (const dir of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4])
          spike(ctx, x, cy, dir, lenV * look.diagL, look.spikeW * 0.7, color, sa * 0.55);
      }
    }

    if (intent.spikes > 0) {
      // The ring of the light's colour just outside the core.
      ctx.strokeStyle = withAlpha(color, alpha * look.ringAlpha);
      ctx.lineWidth = Math.max(3.5, coreR * 0.2);
      ctx.beginPath();
      ctx.arc(x, cy, coreR * look.ring, 0, Math.PI * 2);
      ctx.stroke();

      // The hot core.
      const cr = coreR * 1.35;
      const g = ctx.createRadialGradient(x, cy, 0, x, cy, cr);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.55, "rgba(255,255,255,0.92)");
      g.addColorStop(0.8, withAlpha(color, 0.5));
      g.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - cr, cy - cr, cr * 2, cr * 2);
    } else {
      // A light with no spikes is a soft glow: no ring, and a core that is white
      // in the middle and melts into the light's colour and the halo around it.
      const cr = coreR * 1.7;
      const g = ctx.createRadialGradient(x, cy, 0, x, cy, cr);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.3, "rgba(255,255,255,0.88)");
      g.addColorStop(0.5, "rgba(255,255,255,0.45)");
      g.addColorStop(0.62, withAlpha(color, 0.5));
      g.addColorStop(0.82, withAlpha(color, 0.16));
      g.addColorStop(1, withAlpha(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - cr, cy - cr, cr * 2, cr * 2);
    }
  });

  ctx.restore();
}
