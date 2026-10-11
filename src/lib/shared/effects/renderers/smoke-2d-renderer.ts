import type { Smoke2DParams } from "../translators/canvas2d-types";
import { curl2D } from "#lib/shared/3d/effects/smoke/smoke-curl-field.js";
import type { EmitterTip } from "./emitter-tip";
import { emitterId } from "./emitter-tip";

/**
 * A single live puff particle.
 *
 * Motion integrates a multi-octave curl-noise flow field (sampled at the
 * puff's own position - no per-particle phase offset, so neighbouring
 * puffs move as coherent sheets) with a Boussinesq buoyancy force scaled
 * by per-particle temperature that cools exponentially.
 */
interface SmokePuff {
  x: number;
  y: number;
  /** Horizontal velocity (px/s). Linear-drag advected toward flow. */
  vx: number;
  /** Vertical velocity (px/s). Negative = rising (screen-up). */
  vy: number;
  /** Seconds since spawn. */
  age: number;
  /** Total lifetime (seconds). */
  maxAge: number;
  /** Radius at spawn (px). */
  r0: number;
  /** Max radius at end of life (px). Puff grows linearly across life. */
  r1: number;
  /** Base alpha at peak (0-1). */
  peakAlpha: number;
  /** Temperature 0-1. Decays exponentially; drives buoyancy. */
  temperature: number;
  /** Current draw rotation (radians). */
  angle: number;
  /** Rotation rate (radians/sec). Derived from curl rotation at spawn. */
  angularVel: number;
  /** Per-puff silhouette stretch (1 = round). Breaks identical-blob look. */
  stretch: number;
}

const TAU = Math.PI * 2;
const FADE_IN_DURATION = 0.3; // seconds - soft birth
// Full-life fade curve: hold HOLD_FRACTION of life, decay across remainder.
const HOLD_FRACTION = 0.4;

// --- Flow field tuning (Bridson 2007 curl-noise + Schechter/Bridson fBm) ---
// Two octaves. Large eddies carry the billow; small eddies add wispy
// detail. Sampled at the puff's actual world position (no per-particle
// phase offset) so nearby puffs share a flow → coherent sheets of motion
// instead of independent jitter.
const LARGE_EDDY_SCALE = 0.003; // 1/px - ~330px per eddy
const SMALL_EDDY_SCALE = 0.012; // 1/px - ~80px wisps
const LARGE_STRENGTH = 140; // px/s - dominant billow motion
const SMALL_STRENGTH = 45; // px/s - detail turbulence

// Thermal model (Boussinesq).
// Puffs spawn hot (temp=1), cool exponentially. Buoyancy is proportional
// to temperature, so fresh puffs lift fast and older ones settle. This is
// what produces mushroom-cap expansion without additional forces: young
// hot puffs overtake older cool ones below them.
const COOLING = 0.35; // 1/s - halves temperature every ~2 s

// Linear drag toward flow velocity. DRAG of 0.6 /s means the time
// constant is ~1.7 s - gentle, lets momentum carry across curls
// instead of being snuffed out within a quarter second like the old
// exponential `0.4^dt` drag.
const DRAG = 0.6; // 1/s

/**
 * Canvas2D smoke renderer - per-tip curl-noise puff emitter with
 * continuous analytical flow field + Boussinesq buoyancy.
 *
 * Designed against Bridson 2007 "Curl-Noise for Procedural Fluid Flow" and
 * Schechter/Bridson 2008 "Evolving Sub-Grid Turbulence" - the parts that
 * translate to a particle system without a grid solver. Each puff samples
 * two octaves of curl at its own position (no per-particle phase offset,
 * which was the previous coherence-breaker), gets an upward target
 * velocity from temperature, and advects its velocity toward
 * `flow + buoyancy` with linear drag.
 */
export class Smoke2DRenderer {
  private puffs: SmokePuff[] = [];
  private lastTipPos = new Map<string, { x: number; y: number }>();
  private smoothedVelocity = new Map<string, { vx: number; vy: number }>();
  private clock = 0;

  render(
    ctx: CanvasRenderingContext2D,
    params: Smoke2DParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number = 1,
  ): void {
    this.clock += dt;
    const palette = params.resolvedPalette;
    const baseRadius = params.baseRadius * scale * (0.7 + 0.9 * params.intensity);
    const poolCap = Math.min(params.poolSize ?? 1024, 4096);

    // 1. Per-emitter velocity smoothing + spawn. Covers base props and every
    //    tunnel kaleidoscope layer (propIndex >= 2).
    const seen = new Set<string>();
    for (const e of emitters) {
      if (!this.isEndEnabled(e.end, params)) continue;
      const id = emitterId(e.propIndex, e.tipIndex);
      seen.add(id);
      const last = this.lastTipPos.get(id);
      let vx = 0;
      let vy = 0;
      if (last && dt > 0) {
        vx = (e.x - last.x) / dt;
        vy = (e.y - last.y) / dt;
      }
      const prev = this.smoothedVelocity.get(id);
      const alpha = 1 - Math.pow(0.6, dt * 60);
      const svx = prev ? prev.vx + (vx - prev.vx) * alpha : vx;
      const svy = prev ? prev.vy + (vy - prev.vy) * alpha : vy;
      let sv: { vx: number; vy: number };
      if (prev) { prev.vx = svx; prev.vy = svy; sv = prev; } else { sv = { vx: svx, vy: svy }; this.smoothedVelocity.set(id, sv); }
      const speedPx = Math.hypot(svx, svy);
      this.spawnPuffs(
        params,
        e,
        sv,
        speedPx,
        dt,
        scale,
        baseRadius,
        poolCap,
      );
      if (last) { last.x = e.x; last.y = e.y; } else { this.lastTipPos.set(id, { x: e.x, y: e.y }); }
    }
    // Prune state for emitters not present this frame (a layer toggled off or a
    // tip turned off by tracking-mode) so the Maps don't grow unbounded.
    for (const id of this.lastTipPos.keys()) if (!seen.has(id)) this.lastTipPos.delete(id);
    for (const id of this.smoothedVelocity.keys()) if (!seen.has(id)) this.smoothedVelocity.delete(id);

    // 2. Integrate + age + cull.
    this.integratePuffs(dt, params);

    if (this.puffs.length === 0) return;

    // 3. Draw.
    this.drawPuffs(ctx, palette);
  }

  private spawnPuffs(
    params: Smoke2DParams,
    tip: { x: number; y: number },
    tipVel: { vx: number; vy: number },
    speedPx: number,
    dt: number,
    scale: number,
    baseRadius: number,
    poolCap: number,
  ): void {
    if (this.puffs.length >= poolCap) return;
    const PX_PER_WORLD = 60;
    const refSpeed = params.motionReferenceSpeed * PX_PER_WORLD * scale;
    const speedScalar = refSpeed > 0 ? Math.min(1, speedPx / refSpeed) : 0;
    const ambient = params.ambientEmission * params.ambientSpawnRate;
    const motion = params.motionEmission * speedScalar * params.motionSpawnRate;
    const expected = (ambient + motion) * dt;
    let n = Math.floor(expected);
    if (Math.random() < expected - n) n++;
    const slots = poolCap - this.puffs.length;
    if (n > slots) n = slots;
    if (n <= 0) return;

    const lifetime = params.lifetimeSeconds;
    // Puffs grow 2.4x over life. Combined with exponential thermal cooling
    // you get the mushroom-cap read: hot fresh puffs are small+fast, old
    // cool puffs are large+slow, so fresh ones overtake older ones below.
    const growthRatio = 2.4;

    for (let i = 0; i < n; i++) {
      const jitter = 0.8 + Math.random() * 0.4;
      const r0 = baseRadius * jitter;
      const r1 = r0 * growthRatio * (0.85 + Math.random() * 0.3);
      // Tighten spawn spread vs 8×6 old value - reads as entrainment
      // from a narrower source.
      const ox = (Math.random() - 0.5) * 4 * scale;
      const oy = (Math.random() - 0.5) * 3 * scale;
      const lifeJitter = 0.8 + Math.random() * 0.4;
      // Smoke is translucent - range 0.12-0.37 peak instead of 0.25-0.70.
      const peakAlpha = 0.12 + 0.25 * params.intensity;

      const px = tip.x + ox;
      const py = tip.y + oy;

      // Seed angular velocity from the curl sampled at spawn. Scaling by
      // the difference of curl components gives each puff a rotation tied
      // to the local vorticity rather than random spin.
      const c = curl2D(px * LARGE_EDDY_SCALE, py * LARGE_EDDY_SCALE, this.clock);
      const angularVel = (c.vx - c.vy) * 0.8;

      // Inherit a fraction of tip velocity - gives fast tip motion a
      // visible "ejected plume" direction without overpowering buoyancy.
      const INHERIT = 0.35;

      this.puffs.push({
        x: px,
        y: py,
        vx: tipVel.vx * INHERIT,
        vy: tipVel.vy * INHERIT,
        age: 0,
        maxAge: lifetime * lifeJitter,
        r0,
        r1,
        peakAlpha,
        temperature: 0.85 + Math.random() * 0.3,
        angle: Math.random() * TAU,
        angularVel,
        stretch: 0.85 + Math.random() * 0.3,
      });
    }
  }

  private integratePuffs(dt: number, params: Smoke2DParams): void {
    const curlStrength = params.resolvedCurlStrength;
    const buoyancyTarget = -params.resolvedRiseSpeed;
    const coolingFactor = Math.exp(-COOLING * dt);
    const dragStep = DRAG * dt;

    let writeIdx = 0;
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i]!;
      p.age += dt;
      if (p.age >= p.maxAge) continue;

      p.temperature *= coolingFactor;

      const c1 = curl2D(
        p.x * LARGE_EDDY_SCALE,
        p.y * LARGE_EDDY_SCALE,
        this.clock,
      );
      const c2 = curl2D(
        p.x * SMALL_EDDY_SCALE,
        p.y * SMALL_EDDY_SCALE,
        this.clock * 1.7,
      );
      const flowVx =
        (c1.vx * LARGE_STRENGTH + c2.vx * SMALL_STRENGTH) * curlStrength;
      const flowVy =
        (c1.vy * LARGE_STRENGTH + c2.vy * SMALL_STRENGTH) * curlStrength;

      const targetVx = flowVx;
      const targetVy = flowVy + buoyancyTarget * p.temperature;

      p.vx += (targetVx - p.vx) * dragStep;
      p.vy += (targetVy - p.vy) * dragStep;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      p.angle += p.angularVel * dt;

      if (i !== writeIdx) this.puffs[writeIdx] = p;
      writeIdx++;
    }
    this.puffs.length = writeIdx;
  }

  private drawPuffs(
    ctx: CanvasRenderingContext2D,
    palette: { core: string; edge: string; hueShift?: boolean },
  ): void {
    const prevAlpha = ctx.globalAlpha;
    const prevComposite = ctx.globalCompositeOperation;
    const savedTransform = ctx.getTransform();
    try {
      ctx.globalCompositeOperation = "source-over";
      const { r: cr, g: cg, b: cb } = hexToRgb(palette.core);
      const { r: er, g: eg, b: eb } = hexToRgb(palette.edge);
      // Unit-radius gradient reused for every puff. Canvas2D applies the
      // CTM at paint time, so setTransform scales it per puff - zero
      // per-particle gradient allocation.
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.0);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},1)`);
      grad.addColorStop(0.55, `rgba(${er},${eg},${eb},0.55)`);
      grad.addColorStop(1, `rgba(${er},${eg},${eb},0)`);
      ctx.fillStyle = grad;
      for (const p of this.puffs) {
        const lifeT = p.age / p.maxAge;
        const fadeIn = p.age < FADE_IN_DURATION ? p.age / FADE_IN_DURATION : 1;
        const fadeOut =
          lifeT > HOLD_FRACTION
            ? Math.max(0, (1 - lifeT) / (1 - HOLD_FRACTION))
            : 1;
        const alpha = Math.max(0, fadeIn * fadeOut * p.peakAlpha);
        if (alpha <= 0.02) continue;

        const radius = p.r0 + (p.r1 - p.r0) * lifeT;

        const cos = Math.cos(p.angle);
        const sin = Math.sin(p.angle);
        const sx = p.stretch * radius;
        const sy = radius / p.stretch;
        ctx.setTransform(sx * cos, sx * sin, -sy * sin, sy * cos, p.x, p.y);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(0, 0, 1.0, 0, TAU);
        ctx.fill();
      }
    } finally {
      ctx.setTransform(savedTransform);
      ctx.globalAlpha = prevAlpha;
      ctx.globalCompositeOperation = prevComposite;
    }
  }

  private isEndEnabled(end: "A" | "B", params: Smoke2DParams): boolean {
    if (params.trackingMode === "both_ends") return true;
    return params.trackingMode === "left_end" ? end === "A" : end === "B";
  }

  dispose(): void {
    this.puffs = [];
    this.lastTipPos.clear();
    this.smoothedVelocity.clear();
    this.clock = 0;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const s = hex.trim().replace(/^#/, "");
  const norm =
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s.length >= 6
        ? s.slice(0, 6)
        : "d8d8d8";
  return {
    r: parseInt(norm.slice(0, 2), 16),
    g: parseInt(norm.slice(2, 4), 16),
    b: parseInt(norm.slice(4, 6), 16),
  };
}
