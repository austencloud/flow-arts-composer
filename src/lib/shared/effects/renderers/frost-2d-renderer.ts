import type { Frost2DParams } from "../translators/canvas2d-types";
import type { EmitterTip } from "./emitter-tip";
import { emitterId, tipWearsEffect } from "./emitter-tip";


interface FrostParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  radius: number;
  peakAlpha: number;
  angle: number;
  angularVel: number;
  kind: 0 | 1; // 0 = aura glow, 1 = bright sparkle
}


interface FrostCrystal {
  x: number;
  y: number;
  angle: number;
  age: number;
  maxAge: number;
  maxSize: number;
  growDur: number;
  shapeTier: 0 | 1 | 2; // hex plate, faceted star, dendrite snowflake
}


interface TrailSample {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;
const FADE_IN = 0.15;
const HOLD_FRACTION = 0.25;
const HEX_SIDES = 6;
const MAX_TRAIL_SAMPLES = 200;
const CRYSTAL_FADE_OUT = 0.8;

export class Frost2DRenderer {
  // Aura particles
  private particles: FrostParticle[] = [];
  private lastTipPos = new Map<string, { x: number; y: number }>();
  private smoothedVelocity = new Map<string, { vx: number; vy: number }>();

  // Crystal system
  private crystals: FrostCrystal[] = [];
  private tipTrails = new Map<string, TrailSample[]>();
  private tipTrailDist = new Map<string, number>();

  render(
    ctx: CanvasRenderingContext2D,
    params: Frost2DParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number = 1,
  ): void {
    const baseRadius = params.baseRadius * scale * (0.6 + 0.8 * params.intensity);
    const poolCap = Math.min(params.auraPoolSize ?? 2048, 6144);
    const crystalCap = Math.min(params.crystalPoolSize ?? 256, 1024);
    const auraOnly = params.resolvedPalette.auraOnly === true;

    // Per-emitter: smooth velocity + spawn aura/crystals. Covers base props and
    // every tunnel kaleidoscope layer (propIndex >= 2).
    const seen = new Set<string>();
    for (const e of emitters) {
      if (!tipWearsEffect(e, params.trackingMode)) continue;
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
      if (prev) { prev.vx = svx; prev.vy = svy; } else { this.smoothedVelocity.set(id, { vx: svx, vy: svy }); }
      const speedPx = Math.hypot(svx, svy);
      this.spawnAuraParticles(params, e, speedPx, dt, scale, baseRadius, poolCap);

      // Track trail path for crystal growth
      if (!auraOnly) {
        this.updateTrailPath(id, e, params, scale, crystalCap);
      }

      if (last) { last.x = e.x; last.y = e.y; } else { this.lastTipPos.set(id, { x: e.x, y: e.y }); }
    }
    // Prune state for emitters not present this frame (layer toggled off or a
    // tip disabled by tracking-mode) so the Maps don't grow unbounded.
    for (const id of this.lastTipPos.keys()) if (!seen.has(id)) this.lastTipPos.delete(id);
    for (const id of this.smoothedVelocity.keys()) if (!seen.has(id)) this.smoothedVelocity.delete(id);
    for (const id of this.tipTrails.keys()) if (!seen.has(id)) this.tipTrails.delete(id);
    for (const id of this.tipTrailDist.keys()) if (!seen.has(id)) this.tipTrailDist.delete(id);

    this.integrateParticles(dt);
    this.integrateCrystals(dt);

    // Draw crystals behind aura
    if (this.crystals.length > 0) {
      this.drawCrystals(ctx, params, scale);
    }
    if (this.particles.length > 0) {
      this.drawAuraParticles(ctx, params);
    }
  }


  private updateTrailPath(
    id: string,
    tip: { x: number; y: number },
    params: Frost2DParams,
    scale: number,
    crystalCap: number,
  ): void {
    let trail = this.tipTrails.get(id);
    if (!trail) {
      trail = [];
      this.tipTrails.set(id, trail);
      this.tipTrailDist.set(id, 0);
    }

    const last = trail.length > 0 ? trail[trail.length - 1]! : null;
    const dx = last ? tip.x - last.x : 0;
    const dy = last ? tip.y - last.y : 0;
    const dist = Math.hypot(dx, dy);

    const minSampleDist = 3 * scale;
    if (!last || dist >= minSampleDist) {
      trail.push({ x: tip.x, y: tip.y });
      if (trail.length > MAX_TRAIL_SAMPLES) {
        trail.shift();
      }
      this.tipTrailDist.set(id, (this.tipTrailDist.get(id) ?? 0) + dist);
    }

    // Spawn crystals along trail at spacing intervals
    const spacing = (params.crystalSpacing ?? 18) * scale;
    const accDist = this.tipTrailDist.get(id) ?? 0;

    if (accDist >= spacing && this.crystals.length < crystalCap && trail.length >= 2) {
      this.tipTrailDist.set(id, accDist - spacing);
      this.spawnCrystalAlongTrail(trail, params, scale);
    }
  }

  private spawnCrystalAlongTrail(
    trail: TrailSample[],
    params: Frost2DParams,
    scale: number,
  ): void {
    const spreadFrac = params.spreadRate;
    const maxLookback = Math.max(2, Math.floor(trail.length * (0.1 + 0.9 * spreadFrac)));
    const idx = trail.length - 1 - Math.floor(Math.random() * maxLookback);
    const clamped = Math.max(1, Math.min(trail.length - 1, idx));
    const sample = trail[clamped]!;
    const prev = trail[clamped - 1]!;

    const tangentX = sample.x - prev.x;
    const tangentY = sample.y - prev.y;
    const tangentLen = Math.hypot(tangentX, tangentY);
    const perpAngle = tangentLen > 0.01
      ? Math.atan2(tangentY, tangentX) + Math.PI / 2
      : Math.random() * TAU;

    // Offset to one side of trail
    const side = Math.random() < 0.5 ? 1 : -1;
    const offsetDist = (4 + Math.random() * 8) * scale;

    const crystalSize = (4 + params.crystallinity * 16 + Math.random() * 6) * scale;
    const shapeTier = this.pickShapeTier(params.crystallinity);

    const baseLife = 1.5 + params.spreadRate * 4.0;
    this.crystals.push({
      x: sample.x + Math.cos(perpAngle) * offsetDist * side,
      y: sample.y + Math.sin(perpAngle) * offsetDist * side,
      angle: perpAngle + (Math.random() - 0.5) * 0.4,
      age: 0,
      maxAge: baseLife + Math.random() * (baseLife * 0.4),
      maxSize: crystalSize,
      growDur: params.crystalGrowDuration ?? 0.6,
      shapeTier,
    });
  }

  private pickShapeTier(_crystallinity: number): 0 | 1 | 2 {
    return 2;
  }


  private spawnAuraParticles(
    params: Frost2DParams,
    tip: { x: number; y: number },
    speedPx: number,
    dt: number,
    scale: number,
    baseRadius: number,
    poolCap: number,
  ): void {
    if (this.particles.length >= poolCap) return;
    const PX_PER_WORLD = 60;
    const refSpeed = params.motionReferenceSpeed * PX_PER_WORLD * scale;
    const speedScalar = refSpeed > 0 ? Math.min(1, speedPx / refSpeed) : 0;
    const ambient = params.ambientEmission * params.ambientSpawnRate;
    const motion = params.motionEmission * speedScalar * params.motionSpawnRate;
    const expected = (ambient + motion) * dt;
    let n = Math.floor(expected);
    if (Math.random() < expected - n) n++;
    const slots = poolCap - this.particles.length;
    if (n > slots) n = slots;
    if (n <= 0) return;

    for (let i = 0; i < n; i++) {
      const angle = Math.random() * TAU;
      const spread = (6 + Math.random() * 14) * scale;
      const ox = Math.cos(angle) * spread;
      const oy = Math.sin(angle) * spread;
      const driftSpeed = (5 + Math.random() * 10) * scale;
      const driftAngle = Math.random() * TAU;
      const lifetime = params.lifetimeMin + Math.random() * (params.lifetimeMax - params.lifetimeMin);

      const isSparkle = Math.random() < 0.15;
      const r = isSparkle
        ? baseRadius * (0.15 + Math.random() * 0.25)
        : baseRadius * (0.5 + Math.random() * 1.0);

      this.particles.push({
        x: tip.x + ox,
        y: tip.y + oy,
        vx: Math.cos(driftAngle) * driftSpeed,
        vy: Math.sin(driftAngle) * driftSpeed,
        age: 0,
        maxAge: lifetime,
        radius: r,
        peakAlpha: isSparkle
          ? 0.7 + 0.3 * params.intensity
          : 0.25 + 0.45 * params.intensity,
        angle: Math.random() * TAU,
        angularVel: (Math.random() - 0.5) * 0.8,
        kind: isSparkle ? 1 : 0,
      });
    }
  }


  private integrateParticles(dt: number): void {
    const drag = 0.94;
    let writeIdx = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      p.age += dt;
      if (p.age >= p.maxAge) continue;
      p.vx *= Math.pow(drag, dt * 60);
      p.vy *= Math.pow(drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.angularVel * dt;
      if (i !== writeIdx) this.particles[writeIdx] = p;
      writeIdx++;
    }
    this.particles.length = writeIdx;
  }

  private integrateCrystals(dt: number): void {
    let writeIdx = 0;
    for (let i = 0; i < this.crystals.length; i++) {
      const c = this.crystals[i]!;
      c.age += dt;
      if (c.age >= c.maxAge) continue;
      if (i !== writeIdx) this.crystals[writeIdx] = c;
      writeIdx++;
    }
    this.crystals.length = writeIdx;
  }

  // ── Drawing: aura particles ─────────────────────────────────────────

  private drawAuraParticles(ctx: CanvasRenderingContext2D, params: Frost2DParams): void {
    const prevAlpha = ctx.globalAlpha;
    const prevComposite = ctx.globalCompositeOperation;
    try {
      ctx.globalCompositeOperation = params.blendMode ?? "screen";
      const auraHex = params.resolvedPalette.aura;
      const sparkleHex = params.resolvedPalette.sparkle;
      const { r, g, b, a: baseA } = hexToRgba(auraHex);
      const sk = hexToRgba(sparkleHex);

      for (const p of this.particles) {
        const lifeT = p.age / p.maxAge;
        const fadeIn = p.age < FADE_IN ? p.age / FADE_IN : 1;
        const fadeOut = lifeT > HOLD_FRACTION
          ? Math.max(0, (1 - lifeT) / (1 - HOLD_FRACTION))
          : 1;
        const alpha = fadeIn * fadeOut * p.peakAlpha * baseA;
        if (alpha <= 0.01) continue;

        if (p.kind === 1) {
          ctx.globalAlpha = Math.min(1, alpha * 2);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, TAU);
          ctx.fillStyle = `rgba(${sk.r},${sk.g},${sk.b},1)`;
          ctx.fill();
          continue;
        }

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.6})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, TAU);
        ctx.fillStyle = grad;
        ctx.fill();

        if (p.radius > 4) {
          const innerR = p.radius * 0.35;
          ctx.globalAlpha = alpha * 0.8;
          ctx.beginPath();
          for (let s = 0; s < HEX_SIDES; s++) {
            const a = p.angle + (TAU / HEX_SIDES) * s;
            const px = p.x + Math.cos(a) * innerR;
            const py = p.y + Math.sin(a) * innerR;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = `rgba(${sk.r},${sk.g},${sk.b},1)`;
          ctx.fill();
        }
      }
    } finally {
      ctx.globalAlpha = prevAlpha;
      ctx.globalCompositeOperation = prevComposite;
    }
  }

  // ── Drawing: crystals ───────────────────────────────────────────────

  private drawCrystals(ctx: CanvasRenderingContext2D, params: Frost2DParams, scale: number): void {
    const prevAlpha = ctx.globalAlpha;
    const prevComposite = ctx.globalCompositeOperation;
    try {
      ctx.globalCompositeOperation = params.blendMode ?? "screen";
      const pal = params.resolvedPalette;
      const crystalRgb = hexToRgba(pal.crystal);
      const rimRgb = hexToRgba(pal.rim);
      const sparkleRgb = hexToRgba(pal.sparkle);

      for (const c of this.crystals) {
        const growT = Math.min(1, c.age / c.growDur);
        const size = c.maxSize * easeOutBack(growT);
        if (size < 0.5) continue;

        const lifeT = c.age / c.maxAge;
        const fadeOut = lifeT > CRYSTAL_FADE_OUT
          ? Math.max(0, (1 - lifeT) / (1 - CRYSTAL_FADE_OUT))
          : 1;
        const alpha = fadeOut * (0.6 + 0.4 * params.intensity);
        if (alpha <= 0.01) continue;

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.angle);

        if (c.shapeTier === 0) {
          this.drawHexPlate(ctx, size, alpha, crystalRgb, rimRgb);
        } else if (c.shapeTier === 1) {
          this.drawFacetedStar(ctx, size, alpha, crystalRgb, rimRgb, sparkleRgb);
        } else {
          this.drawDendrite(ctx, size, alpha, crystalRgb, rimRgb, sparkleRgb, scale);
        }

        ctx.restore();
      }
    } finally {
      ctx.globalAlpha = prevAlpha;
      ctx.globalCompositeOperation = prevComposite;
    }
  }

  private drawHexPlate(
    ctx: CanvasRenderingContext2D,
    size: number,
    alpha: number,
    crystal: Rgba,
    rim: Rgba,
  ): void {
    // Soft glow behind
    ctx.globalAlpha = alpha * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.3, 0, TAU);
    ctx.fillStyle = `rgba(${crystal.r},${crystal.g},${crystal.b},0.3)`;
    ctx.fill();

    // Hexagonal plate
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let s = 0; s < HEX_SIDES; s++) {
      const a = (TAU / HEX_SIDES) * s - Math.PI / 2;
      const px = Math.cos(a) * size;
      const py = Math.sin(a) * size;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${crystal.r},${crystal.g},${crystal.b},0.4)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${rim.r},${rim.g},${rim.b},0.8)`;
    ctx.lineWidth = Math.max(0.5, size / 8);
    ctx.stroke();
  }

  private drawFacetedStar(
    ctx: CanvasRenderingContext2D,
    size: number,
    alpha: number,
    crystal: Rgba,
    rim: Rgba,
    sparkle: Rgba,
  ): void {
    // Soft glow
    ctx.globalAlpha = alpha * 0.25;
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.4, 0, TAU);
    ctx.fillStyle = `rgba(${crystal.r},${crystal.g},${crystal.b},0.25)`;
    ctx.fill();

    // Outer hexagon
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let s = 0; s < HEX_SIDES; s++) {
      const a = (TAU / HEX_SIDES) * s - Math.PI / 2;
      const px = Math.cos(a) * size;
      const py = Math.sin(a) * size;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${crystal.r},${crystal.g},${crystal.b},0.3)`;
    ctx.fill();

    // Inner star - alternating deep and shallow vertices
    ctx.beginPath();
    for (let s = 0; s < 12; s++) {
      const a = (TAU / 12) * s - Math.PI / 2;
      const r = s % 2 === 0 ? size * 0.9 : size * 0.4;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${crystal.r},${crystal.g},${crystal.b},0.25)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${rim.r},${rim.g},${rim.b},0.7)`;
    ctx.lineWidth = Math.max(0.5, size / 10);
    ctx.stroke();

    // Internal spokes
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = `rgba(${sparkle.r},${sparkle.g},${sparkle.b},0.5)`;
    ctx.lineWidth = Math.max(0.3, size / 14);
    for (let s = 0; s < HEX_SIDES; s++) {
      const a = (TAU / HEX_SIDES) * s - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * size * 0.85, Math.sin(a) * size * 0.85);
      ctx.stroke();
    }

    // Center bright dot
    ctx.globalAlpha = alpha * 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.12, 0, TAU);
    ctx.fillStyle = `rgba(${sparkle.r},${sparkle.g},${sparkle.b},1)`;
    ctx.fill();
  }

  private drawDendrite(
    ctx: CanvasRenderingContext2D,
    size: number,
    alpha: number,
    crystal: Rgba,
    rim: Rgba,
    sparkle: Rgba,
    scale: number,
  ): void {
    // Soft glow
    ctx.globalAlpha = alpha * 0.2;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.5);
    grad.addColorStop(0, `rgba(${crystal.r},${crystal.g},${crystal.b},0.3)`);
    grad.addColorStop(1, `rgba(${crystal.r},${crystal.g},${crystal.b},0)`);
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.5, 0, TAU);
    ctx.fillStyle = grad;
    ctx.fill();

    // 6 main arms with branches
    ctx.globalAlpha = alpha;
    const mainWidth = Math.max(0.8, size / 6);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let arm = 0; arm < 6; arm++) {
      const armAngle = (TAU / 6) * arm - Math.PI / 2;
      const tipX = Math.cos(armAngle) * size;
      const tipY = Math.sin(armAngle) * size;

      // Main arm stroke
      ctx.strokeStyle = `rgba(${rim.r},${rim.g},${rim.b},0.85)`;
      ctx.lineWidth = mainWidth;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // Secondary branches at 33% and 60%
      const branchWidth = mainWidth * 0.6;
      ctx.lineWidth = branchWidth;
      ctx.strokeStyle = `rgba(${crystal.r},${crystal.g},${crystal.b},0.75)`;

      for (const frac of [0.33, 0.6]) {
        const bx = Math.cos(armAngle) * size * frac;
        const by = Math.sin(armAngle) * size * frac;
        const branchLen = size * 0.38 * (1 - frac * 0.4);
        for (const sign of [-1, 1]) {
          const branchAngle = armAngle + sign * (Math.PI / 3);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(
            bx + Math.cos(branchAngle) * branchLen,
            by + Math.sin(branchAngle) * branchLen,
          );
          ctx.stroke();

          // Tertiary branches at high crystallinity (tiny sub-branches)
          if (size > 8 * scale) {
            const tbx = bx + Math.cos(branchAngle) * branchLen * 0.5;
            const tby = by + Math.sin(branchAngle) * branchLen * 0.5;
            const tLen = branchLen * 0.35;
            ctx.lineWidth = branchWidth * 0.5;
            ctx.beginPath();
            ctx.moveTo(tbx, tby);
            ctx.lineTo(
              tbx + Math.cos(branchAngle + sign * (Math.PI / 4)) * tLen,
              tby + Math.sin(branchAngle + sign * (Math.PI / 4)) * tLen,
            );
            ctx.stroke();
            ctx.lineWidth = branchWidth;
          }
        }
      }
    }

    // Center bright core
    ctx.globalAlpha = alpha * 0.95;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.1, 0, TAU);
    ctx.fillStyle = `rgba(${sparkle.r},${sparkle.g},${sparkle.b},1)`;
    ctx.fill();

    // Arm tips - tiny bright dots
    ctx.globalAlpha = alpha * 0.8;
    for (let arm = 0; arm < 6; arm++) {
      const a = (TAU / 6) * arm - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * size * 0.95, Math.sin(a) * size * 0.95, size * 0.06, 0, TAU);
      ctx.fill();
    }
  }


  dispose(): void {
    this.particles = [];
    this.crystals = [];
    this.lastTipPos.clear();
    this.smoothedVelocity.clear();
    this.tipTrails.clear();
    this.tipTrailDist.clear();
  }
}

// ── Utilities ───────────────────────────────────────────────────────────

function easeOutBack(t: number): number {
  const c = 1.3;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

interface Rgba { r: number; g: number; b: number; a: number }

function hexToRgba(hex: string): Rgba {
  const s = hex.trim().replace(/^#/, "");
  if (s.length === 8) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
      a: parseInt(s.slice(6, 8), 16) / 255,
    };
  }
  const norm = s.length === 3
    ? s.split("").map((c) => c + c).join("")
    : s.length >= 6 ? s.slice(0, 6) : "a0d8ff";
  return {
    r: parseInt(norm.slice(0, 2), 16),
    g: parseInt(norm.slice(2, 4), 16),
    b: parseInt(norm.slice(4, 6), 16),
    a: 1,
  };
}
