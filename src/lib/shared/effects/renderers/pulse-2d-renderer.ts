import type { Pulse2DParams } from "../translators/canvas2d-types";
import {
  resolvePulseRingColor,
  resolvePulseWakeColor,
} from "../domain/pulse-palettes";
import {
  PulseBeatClock,
  PulseTipMotion,
  pulseAccentThreshold,
  pulseCharge,
  pulseOvertoneGap,
  pulseRingLife,
  smoothstep,
} from "../domain/pulse-rhythm";

export interface PulseTipInput {
  x: number;
  y: number;
  /** base blue=0, red=1; tunnel layer li blue=2+2*li, red=3+2*li. */
  propIndex: number;
  /** Position in this frame's tip list. */
  tipIndex: number;
  /** Which end of the prop (0 or 1); absent for a prop-center fallback. */
  end?: number;
  /** Resolved prop color (base trail color or tunnel spectrum) for "prop-matched". */
  color: string;
}

type Rgb = [number, number, number];

interface PulseRing {
  active: boolean;
  /** Birth point, canvas px. */
  x: number;
  y: number;
  /** Momentum the ring inherits from its tip, canvas px/s. */
  vx: number;
  vy: number;
  /** Seconds over which that momentum dies out. */
  drag: number;
  /** Seconds since birth; negative while an overtone waits its turn. */
  age: number;
  life: number;
  /** 0-1 tip energy at birth. */
  energy: number;
  /** 1 for the ring a trigger fires, less for overtones and ripples. */
  amp: number;
  /** Rings a trigger fires carry the birth flash; overtones do not. */
  primary: boolean;
  /** Travel direction at birth, radians. */
  heading: number;
  ring: Rgb;
  wake: Rgb;
  hot: Rgb;
  warm: Rgb;
  cool: Rgb;
}

interface ChargeTip {
  x: number;
  y: number;
  ring: Rgb;
  hot: Rgb;
}

const TAU = Math.PI * 2;
/** Tip jumps larger than this many stage units in one frame are seeks or loop seams. */
const TELEPORT = 90;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(p: number): number {
  const q = 1 - p;
  return 1 - q * q * q;
}

/**
 * Beat-locked shockwave rings for the Canvas2D backend.
 *
 * Each beat a ring bursts from every tracked tip: a white-hot flash, then a
 * shock front that races out and slows, trailing a colored wake that widens
 * as it travels. Rings inherit the tip's momentum and burn brighter on the
 * leading side. Between beats the next ring gathers at the tip: a ring
 * closes in and the core swells, so the eye can feel the beat coming.
 *
 * Timing is musical (see pulse-rhythm.ts): lifetime counts beats and energy
 * is travel per beat, so every playback speed draws the same picture.
 *
 * PERF: never set `shadowBlur`. Softness comes from radial gradients on
 * annuli and stacked additive arcs.
 */
export class Pulse2DRenderer {
  private static readonly POOL_SIZE = 256;
  private readonly pool: PulseRing[];
  private nextSlot = 0;
  private ringCount = 0;
  private clock = 0;
  private readonly beat = new PulseBeatClock();
  private readonly motion = new Map<number, PulseTipMotion>();
  private readonly lastPosition = new Map<number, { x: number; y: number }>();
  private readonly charging: ChargeTip[] = [];
  private readonly rgbCache = new Map<string, Rgb>();

  constructor() {
    this.pool = Array.from({ length: Pulse2DRenderer.POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      drag: 0.1,
      age: 0,
      life: 1,
      energy: 0,
      amp: 1,
      primary: true,
      heading: 0,
      ring: [255, 255, 255],
      wake: [0, 0, 0],
      hot: [255, 255, 255],
      warm: [255, 255, 255],
      cool: [255, 255, 255],
    }));
  }

  render(
    ctx: CanvasRenderingContext2D,
    params: Pulse2DParams,
    tips: PulseTipInput[],
    currentStep: number,
    dt: number,
    scale: number = 1,
  ): void {
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.25) : 0;
    this.clock += step;
    const ringBeat = this.beat.advance(currentStep, step, params.beatInterval);
    const beatSeconds = this.beat.beatSeconds;
    const unit = scale > 0 ? scale : 1;
    const charge = pulseCharge(this.beat.phase);
    const showCharge =
      params.trigger === "beat" && params.charge > 0.01 && charge.strength > 0.004;
    this.charging.length = 0;

    for (const tip of tips) {
      if (!isTracked(params.trackingMode, tip.end)) continue;
      const key = tip.end === undefined ? 100000 + tip.tipIndex : tip.propIndex * 2 + tip.end;
      const motion = this.track(key, tip, step, unit, beatSeconds);
      const ringHex = resolvePulseRingColor(params, tip.color, tip.tipIndex, this.clock);

      switch (params.trigger) {
        case "beat":
          if (ringBeat) this.fire(params, tip, motion, motion.energy, ringHex, beatSeconds, unit);
          break;
        case "velocity":
          if (motion.accent(pulseAccentThreshold(params.velocityThreshold), this.clock, beatSeconds)) {
            this.fire(params, tip, motion, motion.peak, ringHex, beatSeconds, unit);
          }
          break;
        case "continuous": {
          if (ringBeat) this.fire(params, tip, motion, motion.energy, ringHex, beatSeconds, unit);
          const owed = motion.continuous(step, beatSeconds);
          for (let i = 0; i < owed; i++) {
            this.spawn(params, tip, motion, motion.energy, ringHex, 0.3 + 0.3 * motion.energy, false, 0, beatSeconds, unit);
          }
          break;
        }
      }

      if (showCharge) {
        const ring = this.rgb(ringHex);
        this.charging.push({ x: tip.x, y: tip.y, ring, hot: mix(ring, WHITE, 0.7) });
      }
    }

    if (this.ringCount === 0 && this.charging.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = params.blendMode;
    ctx.lineCap = "round";

    for (let i = 0; i < Pulse2DRenderer.POOL_SIZE; i++) {
      const ring = this.pool[i]!;
      if (!ring.active) continue;
      ring.age += step;
      if (ring.age >= ring.life) {
        ring.active = false;
        this.ringCount--;
        continue;
      }
      if (ring.age <= 0) continue;
      this.drawRing(ctx, ring, params, unit);
    }

    for (const tip of this.charging) this.drawCharge(ctx, tip, params, charge, unit);

    ctx.restore();
  }

  dispose(): void {
    for (const ring of this.pool) ring.active = false;
    this.motion.clear();
    this.lastPosition.clear();
    this.charging.length = 0;
    this.clock = 0;
    this.ringCount = 0;
    this.nextSlot = 0;
  }

  /** Feed one tip's position into its smoothed motion; velocity in stage units/s. */
  private track(
    key: number,
    tip: PulseTipInput,
    dt: number,
    unit: number,
    beatSeconds: number,
  ): PulseTipMotion {
    let motion = this.motion.get(key);
    if (!motion) {
      motion = new PulseTipMotion();
      this.motion.set(key, motion);
    }
    const last = this.lastPosition.get(key);
    if (last && dt > 0) {
      const dx = (tip.x - last.x) / unit;
      const dy = (tip.y - last.y) / unit;
      if (Math.hypot(dx, dy) <= TELEPORT) motion.feed(dx / dt, dy / dt, 0, dt, beatSeconds);
    }
    if (last) {
      last.x = tip.x;
      last.y = tip.y;
    } else {
      this.lastPosition.set(key, { x: tip.x, y: tip.y });
    }
    return motion;
  }

  /** A triggered ring plus the overtones that follow it. */
  private fire(
    params: Pulse2DParams,
    tip: PulseTipInput,
    motion: PulseTipMotion,
    energy: number,
    ringHex: string,
    beatSeconds: number,
    unit: number,
  ): void {
    this.spawn(params, tip, motion, energy, ringHex, 1, true, 0, beatSeconds, unit);
    const overtones = Math.round(params.harmonics * 3);
    const gap = pulseOvertoneGap(beatSeconds);
    for (let i = 1; i <= overtones; i++) {
      this.spawn(params, tip, motion, energy, ringHex, Math.max(0.2, 1 - i * 0.24), false, i * gap, beatSeconds, unit);
    }
  }

  private spawn(
    params: Pulse2DParams,
    tip: PulseTipInput,
    motion: PulseTipMotion,
    energy: number,
    ringHex: string,
    amp: number,
    primary: boolean,
    delay: number,
    beatSeconds: number,
    unit: number,
  ): void {
    const ring = this.pool[this.nextSlot]!;
    this.nextSlot = (this.nextSlot + 1) % Pulse2DRenderer.POOL_SIZE;
    if (!ring.active) this.ringCount++;
    const life = pulseRingLife(params.lifetime, beatSeconds, amp);
    const carry = params.asymmetry * 0.85;
    const base = this.rgb(ringHex);
    ring.active = true;
    ring.x = tip.x;
    ring.y = tip.y;
    ring.vx = motion.vx * unit * carry;
    ring.vy = motion.vy * unit * carry;
    ring.drag = 0.14 * life;
    ring.age = -delay;
    ring.life = life;
    ring.energy = clamp01(energy);
    ring.amp = amp;
    ring.primary = primary;
    ring.heading = Math.atan2(motion.vy, motion.vx);
    ring.ring = base;
    ring.wake = this.rgb(resolvePulseWakeColor(params, ringHex));
    ring.hot = mix(base, WHITE, 0.72);
    ring.warm = rotateHue(base, 38);
    ring.cool = rotateHue(base, -38);
  }

  private drawRing(
    ctx: CanvasRenderingContext2D,
    r: PulseRing,
    params: Pulse2DParams,
    unit: number,
  ): void {
    const p = r.age / r.life;
    // velocityScale 0: every ring full size. 1: size follows birth energy.
    const size = 1 - params.velocityScale * (1 - r.energy);
    const emissive = params.colorMode === "solid" && params.resolvedPalette.emissive ? 1.15 : 1;
    const A =
      params.intensity *
      emissive *
      r.amp *
      (0.6 + 0.4 * size) *
      smoothstep(0, 0.035, p) *
      Math.pow(1 - p, 1.5);
    if (A < 0.004) return;

    const reach = params.maxRadius * unit * (0.4 + 0.6 * size) * (0.3 + 0.7 * r.amp);
    const R = 2 * unit + (reach - 2 * unit) * easeOutCubic(p);
    const drift = r.drag * (1 - Math.exp(-r.age / r.drag));
    const cx = r.x + r.vx * drift;
    const cy = r.y + r.vy * drift;
    const body =
      params.resolvedPalette.hueShift && params.colorMode === "solid" ? mix(r.ring, r.wake, p) : r.ring;
    const front = mix(r.hot, body, smoothstep(0.05, 0.55, p));
    const frontWidth = Math.max(1, (1 + 2.4 * params.thickness) * unit * (1 - 0.45 * p));

    if (params.style === "glow") {
      // Wake: a soft annulus that trails inside the front and widens as it travels.
      const band = params.ringWidth * unit * (0.9 + 0.9 * p);
      const inner = Math.max(0, R - band * 2.4);
      const outer = R + band * 0.45;
      const at = (R - inner) / (outer - inner);
      const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
      g.addColorStop(0, rgba(r.wake, 0));
      g.addColorStop(at * 0.55, rgba(r.wake, A * 0.3));
      g.addColorStop(at * 0.9, rgba(body, A * 0.55));
      g.addColorStop(at, rgba(body, A * 0.8));
      g.addColorStop(at + (1 - at) * 0.5, rgba(body, A * 0.16));
      g.addColorStop(1, rgba(body, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, outer, 0, TAU);
      if (inner > 0.5) {
        ctx.moveTo(cx + inner, cy);
        ctx.arc(cx, cy, inner, 0, TAU);
      }
      ctx.fill("evenodd");

      ctx.lineWidth = frontWidth;
      ctx.strokeStyle = rgba(front, Math.min(1, A * 1.15));
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
    } else {
      ctx.lineWidth = Math.max(1, params.ringWidth * unit * (1 - 0.4 * p));
      ctx.strokeStyle = rgba(body, Math.min(1, A));
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = Math.max(0.75, frontWidth * 0.5);
      ctx.strokeStyle = rgba(front, Math.min(1, A * 0.8));
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
    }

    // Leading edge: stacked additive arcs burn brightest where the tip was heading.
    const lead = params.asymmetry * (0.15 + 0.85 * r.energy) * r.amp;
    if (lead > 0.04 && r.energy > 0.05) {
      ctx.lineWidth = frontWidth * 1.8;
      ctx.strokeStyle = rgba(r.hot, Math.min(1, A * lead * 0.4));
      for (const span of LEAD_SPANS) {
        ctx.beginPath();
        ctx.arc(cx, cy, R, r.heading - span, r.heading + span);
        ctx.stroke();
      }
    }

    // Chromatic fringe: warm just outside the front, cool just inside.
    const chroma = params.chromatic * (0.35 + 0.65 * r.energy);
    if (chroma > 0.03) {
      const off = (1.2 + 5 * p) * unit * (0.5 + chroma);
      const alpha = Math.min(1, A * chroma * 0.55);
      ctx.lineWidth = Math.max(1, frontWidth * 0.9);
      ctx.strokeStyle = rgba(r.warm, alpha);
      ctx.beginPath();
      ctx.arc(cx, cy, R + off, 0, TAU);
      ctx.stroke();
      if (R - off > 1) {
        ctx.strokeStyle = rgba(r.cool, alpha);
        ctx.beginPath();
        ctx.arc(cx, cy, R - off, 0, TAU);
        ctx.stroke();
      }
    }

    if (r.primary && params.flash > 0.01) this.drawFlash(ctx, r, params, size, unit);
  }

  /** Birth flash: a white-hot burst and a four-point glint at the origin. */
  private drawFlash(
    ctx: CanvasRenderingContext2D,
    r: PulseRing,
    params: Pulse2DParams,
    size: number,
    unit: number,
  ): void {
    const span = Math.min(Math.max(r.life * 0.16, 0.09), 0.4);
    if (r.age >= span) return;
    const k = r.age / span;
    const alpha = clamp01(params.flash * params.intensity * 1.5 * (1 - k) * (1 - k) * (0.6 + 0.4 * size));
    if (alpha < 0.004) return;
    const radius = (9 + 30 * params.flash) * unit * (0.6 + 0.4 * size) * (0.7 + 0.5 * easeOutCubic(k));
    const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, radius);
    g.addColorStop(0, rgba(r.hot, alpha));
    g.addColorStop(0.22, rgba(r.hot, alpha * 0.85));
    g.addColorStop(0.55, rgba(r.ring, alpha * 0.4));
    g.addColorStop(1, rgba(r.ring, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(r.x, r.y, radius, 0, TAU);
    ctx.fill();

    const glint = clamp01((params.flash - 0.3) / 0.7);
    if (glint <= 0) return;
    const length = radius * 2.6 * (1 - 0.5 * k);
    ctx.lineWidth = 1.3 * unit;
    for (const turn of GLINT_TURNS) {
      const a = r.heading + turn;
      const ux = Math.cos(a) * length;
      const uy = Math.sin(a) * length;
      const lg = ctx.createLinearGradient(r.x - ux, r.y - uy, r.x + ux, r.y + uy);
      lg.addColorStop(0, rgba(r.hot, 0));
      lg.addColorStop(0.5, rgba(r.hot, alpha * glint * 0.8));
      lg.addColorStop(1, rgba(r.hot, 0));
      ctx.strokeStyle = lg;
      ctx.beginPath();
      ctx.moveTo(r.x - ux, r.y - uy);
      ctx.lineTo(r.x + ux, r.y + uy);
      ctx.stroke();
    }
  }

  /** The build-up before a beat: a ring closing in on the tip and a swelling core. */
  private drawCharge(
    ctx: CanvasRenderingContext2D,
    tip: ChargeTip,
    params: Pulse2DParams,
    charge: { shape: number; strength: number },
    unit: number,
  ): void {
    const strength = charge.strength * params.charge * params.intensity;
    if (strength < 0.004) return;
    const shape = charge.shape;
    const closing = params.maxRadius * unit * 0.5 * (1 - shape * shape) + 3 * unit;
    ctx.lineWidth = (0.8 + 1.6 * shape) * unit;
    ctx.strokeStyle = rgba(tip.ring, Math.min(1, strength * 0.7 * shape));
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, closing, 0, TAU);
    ctx.stroke();

    const core = (4 + 14 * shape) * unit;
    const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, core);
    g.addColorStop(0, rgba(tip.hot, Math.min(1, strength * 0.9)));
    g.addColorStop(0.35, rgba(tip.ring, Math.min(1, strength * 0.5)));
    g.addColorStop(1, rgba(tip.ring, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, core, 0, TAU);
    ctx.fill();
  }

  private rgb(color: string): Rgb {
    let value = this.rgbCache.get(color);
    if (!value) {
      value = parseRgb(color);
      if (this.rgbCache.size > 512) this.rgbCache.clear();
      this.rgbCache.set(color, value);
    }
    return value;
  }
}

const WHITE: Rgb = [255, 255, 255];
const LEAD_SPANS = [0.35, 0.75, 1.2];
const GLINT_TURNS = [0, Math.PI / 2];

function isTracked(mode: Pulse2DParams["trackingMode"], end: number | undefined): boolean {
  if (end === undefined || mode === "both_ends") return true;
  return mode === "left_end" ? end === 0 : end === 1;
}

function rgba(c: Rgb, alpha: number): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha < 0 ? 0 : alpha > 1 ? 1 : alpha})`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Rotate a color's hue around the gray axis, keeping its lightness close. */
function rotateHue(c: Rgb, degrees: number): Rgb {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const k = (1 - cos) / 3;
  const s = Math.sqrt(1 / 3) * Math.sin(a);
  const m0 = cos + k;
  const m1 = k - s;
  const m2 = k + s;
  const channel = (x: number, y: number, z: number) =>
    Math.max(0, Math.min(255, Math.round(x * m0 + y * m1 + z * m2)));
  return [channel(c[0], c[1], c[2]), channel(c[1], c[2], c[0]), channel(c[2], c[0], c[1])];
}

/** Parse #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() and hsl()/hsla(); anything else is white. */
function parseRgb(color: string): Rgb {
  const s = color.trim();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      h = h
        .slice(0, 3)
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const n = parseInt(h.slice(0, 6), 16);
    if (h.length >= 6 && Number.isFinite(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return [...WHITE];
  }
  const nums = s.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  if (s.startsWith("rgb") && nums.length >= 3) {
    return [nums[0]!, nums[1]!, nums[2]!].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as Rgb;
  }
  if (s.startsWith("hsl") && nums.length >= 3) {
    const h = ((((nums[0]! % 360) + 360) % 360) / 360) * 6;
    const sat = clamp01(nums[1]! / 100);
    const l = clamp01(nums[2]! / 100);
    const c = (1 - Math.abs(2 * l - 1)) * sat;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] =
      h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  return [...WHITE];
}
