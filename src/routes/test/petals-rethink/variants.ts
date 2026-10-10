/**
 * Petals rethink — comparison harness variants.
 *
 * Four motion models, one shared silhouette kernel (the real
 * `drawPetalSilhouette` + palettes from production). Each variant only
 * differs in how a petal MOVES once shed from a prop tip. The baseline
 * wraps the real production `Petals2DRenderer` unchanged so the comparison
 * is honest.
 *
 * This file lives under /routes/test and is disposable — nothing in the
 * app imports it. It exists to let Austen pick a motion model by eye.
 */

import {
  drawPetalSilhouette,
  pickPetalSprite,
  pickPetalTint,
  resolvePetalSize,
  type PetalPalette,
  type PetalSpriteShape,
} from "#lib/shared/effects/domain/petal-palettes.js";
import { Petals2DRenderer } from "#lib/shared/effects/renderers/petals-2d-renderer.js";
import { resolvePetals2D } from "#lib/shared/effects/translators/canvas2d-translator.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";

const TAU = Math.PI * 2;

export type TipKey = "blueA" | "blueB" | "redA" | "redB";
export type TipMap = Record<TipKey, { x: number; y: number } | null>;
const KEYS: TipKey[] = ["blueA", "blueB", "redA", "redB"];

export interface VariantOpts {
  /** Petal half-size in px (slider). */
  baseSize: number;
  /** Spawn-density multiplier (slider). */
  density: number;
  /** Resolved palette. */
  palette: PetalPalette;
  /** Canvas dims in CSS px (for ambient seeding + culling). */
  width: number;
  height: number;
  /** Airstream only: fraction of tip velocity inherited at birth (0..1). */
  carry?: number;
  /** Airstream only: streak length — higher = inherited motion lingers (0..1). */
  streak?: number;
}

export interface PetalVariant {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  render(
    ctx: CanvasRenderingContext2D,
    tips: TipMap,
    dt: number,
    opts: VariantOpts
  ): void;
  count(): number;
  dispose(): void;
}

/*                       Shared base for the 3 new models                  */

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  size: number;
  shape: PetalSpriteShape;
  tint: string;
  rot: number;
  rotVel: number;
  /** Individual flutter frequency (rad/s) — kills global sync. */
  freq: number;
  /** Individual phase. */
  phase: number;
}

const FADE_IN = 0.12;
const FADE_OUT_FRAC = 0.25;
const POOL_CAP = 1400;
const REF_SPEED = 650; // px/s tip speed → full motion scalar

abstract class BaseVariant implements PetalVariant {
  abstract readonly id: string;
  abstract readonly title: string;
  abstract readonly blurb: string;

  protected pool: P[] = [];
  protected last: Partial<Record<TipKey, { x: number; y: number }>> = {};
  protected sv: Partial<Record<TipKey, { vx: number; vy: number }>> = {};
  protected clock = 0;
  /** Live tip snapshots for wake-aware variants. */
  protected tipCache: Array<{ x: number; y: number; sp: number }> = [];

  /** Continuous spawn at rest. */
  protected ambientRate = 4;
  /** Velocity-reactive spawn. */
  protected motionRate = 26;
  /** Lifetime seconds at the base. */
  protected lifeBase = 3.2;
  /** Seed ambient petals across the whole canvas, not just at the tip. */
  protected ambientFromArea = false;

  /** Initial velocity for a freshly shed petal given smoothed tip velocity. */
  protected abstract initVelocity(
    svx: number,
    svy: number,
    opts: VariantOpts
  ): { vx: number; vy: number };

  /** Per-frame motion integration (mutates p.x/p.y/p.vx/p.vy/p.rot). */
  protected abstract integrate(p: P, dt: number, opts: VariantOpts): void;

  render(
    ctx: CanvasRenderingContext2D,
    tips: TipMap,
    dt: number,
    opts: VariantOpts
  ): void {
    this.clock += dt;
    const tipsArr: Array<{ x: number; y: number; sp: number }> = [];

    for (const key of KEYS) {
      const tip = tips[key];
      if (!tip) {
        delete this.last[key];
        delete this.sv[key];
        continue;
      }
      const last = this.last[key];
      let vx = 0;
      let vy = 0;
      if (last && dt > 0) {
        vx = (tip.x - last.x) / dt;
        vy = (tip.y - last.y) / dt;
      }
      const prev = this.sv[key];
      const a = 1 - Math.pow(0.6, dt * 60);
      const svx = prev ? prev.vx + (vx - prev.vx) * a : vx;
      const svy = prev ? prev.vy + (vy - prev.vy) * a : vy;
      if (prev) {
        prev.vx = svx;
        prev.vy = svy;
      } else {
        this.sv[key] = { vx: svx, vy: svy };
      }
      const sp = Math.hypot(svx, svy);
      tipsArr.push({ x: tip.x, y: tip.y, sp });
      this.spawn(tip, sp, svx, svy, dt, opts);
      if (last) {
        last.x = tip.x;
        last.y = tip.y;
      } else {
        this.last[key] = { x: tip.x, y: tip.y };
      }
    }
    this.tipCache = tipsArr;

    // Integrate + age + cull.
    let w = 0;
    const cullY = opts.height + 60;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!;
      p.age += dt;
      if (p.age >= p.maxAge || p.y > cullY) continue;
      this.integrate(p, dt, opts);
      if (i !== w) this.pool[w] = p;
      w++;
    }
    this.pool.length = w;

    this.draw(ctx, opts);
  }

  private spawn(
    tip: { x: number; y: number },
    sp: number,
    svx: number,
    svy: number,
    dt: number,
    opts: VariantOpts
  ): void {
    if (this.pool.length >= POOL_CAP) return;
    const scalar = Math.min(1, sp / REF_SPEED);
    const expected =
      (this.ambientRate + this.motionRate * scalar) * opts.density * dt;
    let n = Math.floor(expected);
    if (Math.random() < expected - n) n++;
    const slots = POOL_CAP - this.pool.length;
    if (n > slots) n = slots;
    if (n <= 0) return;

    for (let i = 0; i < n; i++) {
      const shape = pickPetalSprite(opts.palette);
      const size = resolvePetalSize(opts.baseSize, 0.5, shape);
      const v = this.initVelocity(svx, svy, opts);
      const sx = this.ambientFromArea ? Math.random() * opts.width : tip.x;
      const sy = this.ambientFromArea
        ? Math.random() * opts.height * 0.5
        : tip.y;
      this.pool.push({
        x: sx + (Math.random() - 0.5) * 8,
        y: sy + (Math.random() - 0.5) * 6,
        vx: v.vx,
        vy: v.vy,
        age: 0,
        maxAge: this.lifeBase * (0.8 + Math.random() * 0.5),
        size,
        shape,
        tint: pickPetalTint(opts.palette),
        rot: Math.random() * TAU,
        rotVel: (Math.random() - 0.5) * 0.04,
        freq: 1.4 + Math.random() * 2.6,
        phase: Math.random() * TAU,
      });
    }
  }

  private draw(ctx: CanvasRenderingContext2D, _opts: VariantOpts): void {
    if (this.pool.length === 0) return;
    const prevAlpha = ctx.globalAlpha;
    const saved = ctx.getTransform();
    try {
      ctx.globalCompositeOperation = "source-over";
      for (const p of this.pool) {
        const lifeT = p.age / p.maxAge;
        const fIn = p.age < FADE_IN ? p.age / FADE_IN : 1;
        const fOut =
          lifeT > 1 - FADE_OUT_FRAC ? (1 - lifeT) / FADE_OUT_FRAC : 1;
        const alpha = Math.max(0, fIn * fOut);
        if (alpha <= 0.02) continue;
        const cos = Math.cos(p.rot);
        const sin = Math.sin(p.rot);
        ctx.setTransform(cos, sin, -sin, cos, p.x, p.y);
        ctx.globalAlpha = alpha;
        drawPetalSilhouette(ctx, p.shape, p.size, p.tint);
      }
    } finally {
      ctx.setTransform(saved);
      ctx.globalAlpha = prevAlpha;
    }
  }

  count(): number {
    return this.pool.length;
  }

  dispose(): void {
    this.pool = [];
    this.last = {};
    this.sv = {};
    this.tipCache = [];
    this.clock = 0;
  }
}

/*  A — Airstream inheritance: petal is born with the tip's velocity and    */
/*      decays into a settle. The prop carves a ribbon through the air.      */

class AirstreamVariant extends BaseVariant {
  readonly id = "airstream";
  readonly title = "A · Airstream";
  readonly blurb =
    "Born with the prop's velocity, decays into a fall. Fast arcs fling streaks; slow drags ease off.";

  protected override ambientRate = 2;
  protected override motionRate = 34;

  protected initVelocity(
    svx: number,
    svy: number,
    opts: VariantOpts
  ): { vx: number; vy: number } {
    // Inherit a fraction of the tip's instantaneous velocity, plus spread.
    const carry = opts.carry ?? 0.55;
    return {
      vx: svx * carry + (Math.random() - 0.5) * 40,
      vy: svy * carry + 10 + Math.random() * 20,
    };
  }

  protected integrate(p: P, dt: number, opts: VariantOpts): void {
    // Horizontal inherited motion bleeds off (air drag). Higher streak =
    // decay base closer to 1 = motion lingers longer = longer ribbon.
    const decayBase = 0.02 + (opts.streak ?? 0.4) * 0.5;
    p.vx *= Math.pow(decayBase, dt);
    // Vertical eases toward terminal fall.
    const terminal = 70 + opts.baseSize * 4;
    p.vy += (terminal - p.vy) * (1 - Math.pow(0.25, dt));
    // Individual flutter so streaks don't read as rigid lines.
    const flut = Math.sin(this.clock * p.freq + p.phase) * 16;
    p.x += (p.vx + flut) * dt;
    p.y += p.vy * dt;
    // Tumble follows the motion it's actually doing.
    p.rot += (p.vx * 0.0016 + flut * 0.02) * dt * 60;
  }
}

/*  B — Turbulence wake: petals float ambiently; the prop stirs a curl +     */
/*      orbital wake that sweeps the ones nearby. You see the disturbance.    */

function curl(x: number, y: number, t: number): { x: number; y: number } {
  const a = Math.sin(x * 1.3 + t) + Math.cos(y * 1.7 - t * 0.8);
  const b = Math.cos(x * 1.1 - t * 1.2) + Math.sin(y * 0.9 + t);
  return { x: Math.cos(a * Math.PI), y: Math.sin(b * Math.PI) };
}

class TurbulenceVariant extends BaseVariant {
  readonly id = "turbulence";
  readonly title = "B · Turbulence wake";
  readonly blurb =
    "Petals float; the prop stirs a swirling wake that sweeps the ones nearby. You see the disturbance, not a stream.";

  protected override ambientRate = 16;
  protected override motionRate = 8;
  protected override lifeBase = 5.0;
  protected override ambientFromArea = true;

  protected initVelocity(): { vx: number; vy: number } {
    return {
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12,
    };
  }

  protected integrate(p: P, dt: number, _opts: VariantOpts): void {
    // Light buoyant gravity.
    p.vy += (32 - p.vy) * (1 - Math.pow(0.5, dt));
    // Curl-noise drift for ambient swirl.
    const n = curl(p.x * 0.01, p.y * 0.01, this.clock * 0.3);
    p.vx += n.x * 50 * dt;
    p.vy += n.y * 22 * dt;
    // Orbital wake around each live tip, scaled by tip speed.
    for (const t of this.tipCache) {
      const dx = p.x - t.x;
      const dy = p.y - t.y;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) + 1;
      const falloff = 1 / (1 + d2 / (140 * 140));
      const strength = t.sp * 0.9 * falloff;
      // Tangential (perpendicular) — orbit the tip.
      p.vx += (-dy / d) * strength * dt;
      p.vy += (dx / d) * strength * dt;
      // Slight outward push so they don't collapse into the center.
      p.vx += (dx / d) * strength * 0.25 * dt;
      p.vy += (dy / d) * strength * 0.25 * dt;
    }
    // Damp so nothing runs away.
    p.vx *= Math.pow(0.5, dt);
    p.vy *= Math.pow(0.7, dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += (p.vx * 0.004 + p.rotVel) * dt * 60;
  }
}

/*  C — Gentle settle: today's falling feel, but every petal flutters on its  */
/*      OWN frequency (no global sine), smaller, with leaf-like autorotation.  */

class SettleVariant extends BaseVariant {
  readonly id = "settle";
  readonly title = "C · Gentle settle";
  readonly blurb =
    "Refined fall. Per-petal flutter instead of a shared wobble, smaller sprites, leaf-like tumble. Calm, not noisy.";

  protected override ambientRate = 6;
  protected override motionRate = 22;

  protected initVelocity(): { vx: number; vy: number } {
    return {
      vx: (Math.random() - 0.5) * 22,
      vy: 60 + Math.random() * 30,
    };
  }

  protected integrate(p: P, dt: number, _opts: VariantOpts): void {
    // Each petal sways on its own frequency — no synchronized field.
    const sway = Math.sin(this.clock * p.freq + p.phase) * 24;
    p.x += (p.vx + sway) * dt;
    p.y += p.vy * dt;
    // Leaf autorotation: tumble tied to the petal's own flutter.
    p.rot += (sway * 0.03 + p.rotVel) * dt * 60;
  }
}

/*  Baseline — wraps the real production renderer, unchanged.               */

class BaselineVariant implements PetalVariant {
  readonly id = "baseline";
  readonly title = "Production · Airstream";
  readonly blurb =
    "The production airstream model with smaller tiered silhouettes, individual flutter, and quieter ambient particles.";

  private r = new Petals2DRenderer();

  render(
    ctx: CanvasRenderingContext2D,
    tips: TipMap,
    dt: number,
    opts: VariantOpts
  ): void {
    const params = resolvePetals2D(
      {
        ambientEmission: 0.6,
        motionEmission: 1,
        intensity: 0.5,
        palette: "blossom",
        customColor: "#ffb0c8",
        swayAmplitude: 1,
        carry: opts.carry ?? 0.55,
        streakLength: opts.streak ?? 0.4,
        fallSpeed: 0.6,
        trackingMode: "both_ends",
      },
      {
        resolvedPalette: opts.palette,
        poolSize: POOL_CAP,
        baseSize: opts.baseSize,
        ambientSpawnRate: 2 * opts.density,
        motionSpawnRate: 34 * opts.density,
      }
    );
    const emitters: EmitterTip[] = [
      tips.blueA && {
        ...tips.blueA,
        propIndex: 0,
        tipIndex: 0,
        end: "A" as const,
        color: "#ffb0c8",
      },
      tips.blueB && {
        ...tips.blueB,
        propIndex: 0,
        tipIndex: 1,
        end: "B" as const,
        color: "#ffb0c8",
      },
      tips.redA && {
        ...tips.redA,
        propIndex: 1,
        tipIndex: 0,
        end: "A" as const,
        color: "#ffb0c8",
      },
      tips.redB && {
        ...tips.redB,
        propIndex: 1,
        tipIndex: 1,
        end: "B" as const,
        color: "#ffb0c8",
      },
    ].filter(Boolean) as EmitterTip[];
    this.r.render(ctx, params, emitters, dt, 1);
  }

  count(): number {
    return -1; // production renderer doesn't expose its pool size
  }

  dispose(): void {
    this.r.dispose();
  }
}

export function createVariants(): PetalVariant[] {
  return [
    new BaselineVariant(),
    new AirstreamVariant(),
    new TurbulenceVariant(),
    new SettleVariant(),
  ];
}
