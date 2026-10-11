/**
 * Zap 2D renderer: lightning between the props.
 *
 * Three discharge characters, all driven by the shared model in
 * `zap-lightning.ts` and timed in seconds:
 *
 * - "branching" (Storm): forking bolts between each blue tip and the red tip
 *   at the same end. Strikes arrive irregularly, flash, re-flash on their
 *   return strokes, and fade through a colored afterglow.
 * - "plasma" (Tesla): several thin filaments that crawl and writhe between
 *   the tips like a plasma globe. Each strike snaps one filament to a new path
 *   and throws sparks.
 * - "web": a strike-lit mesh across every tip of a performer, with a charge
 *   bead racing along each fresh bolt.
 *
 * Every tip carries a corona and a crackle of tiny arcs, so the props look
 * charged between strikes. The glow is layered additive strokes, not
 * shadowBlur, which cost a full blur pass per stroke.
 */
import type { Zap2DParams } from "../translators/canvas2d-types";
import { emitterId, type EmitterTip } from "./emitter-tip";
import {
  clamp01,
  DischargeChannel,
  PLASMA_POINTS,
  strikeLight,
  writePlasmaFilament,
  type BoltStroke,
  type ChannelShape,
  type Strike,
} from "./zap-lightning";
import {
  mulberry32,
  SeededNoise,
} from "#lib/shared/3d/procedural-engine/generation/seed-generator.js";

/** Reference-size px per second treated as a full-energy swing. */
const REF_SPEED = 900;
/** Seconds for the motion energy to follow a change in speed. */
const ENERGY_LAG = 0.12;
/** Seconds between re-cuts of the tip crackle. */
const CRACKLE_PERIOD = 1 / 20;
const MAX_SPARKS = 240;
/** Stroke width and opacity by depth: main channel, fork, twig. */
const DEPTH_WIDTH = [1, 0.62, 0.4] as const;
const DEPTH_ALPHA = [1, 0.8, 0.6] as const;

interface TipMotion {
  x: number;
  y: number;
  energy: number;
  seen: number;
}

interface PlasmaFilament {
  seed: number;
  flash: number;
}

interface PlasmaPair {
  filaments: PlasmaFilament[];
  untilSnap: number;
  seen: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  color: string;
}

interface Endpoint {
  tip: EmitterTip;
  key: string;
  color: string;
}

export class Zap2DRenderer {
  private readonly rng = mulberry32(0x2a9f13);
  private readonly noise = new SeededNoise(0x51ac);
  private readonly motion = new Map<string, TipMotion>();
  private readonly channels = new Map<string, DischargeChannel>();
  private readonly channelSeen = new Map<string, number>();
  private readonly plasma = new Map<string, PlasmaPair>();
  /** Per tip: pixel offsets of its crackle arcs, 4 points (8 numbers) each. */
  private readonly crackles = new Map<string, number[]>();
  private readonly tipLight = new Map<string, number>();
  private readonly filamentBuffer = new Float32Array(PLASMA_POINTS * 3);
  private sparks: Spark[] = [];
  private frame = 0;
  private plasmaPhase = 0;
  private crackleClock = 0;

  render(
    ctx: CanvasRenderingContext2D,
    params: Zap2DParams,
    emitters: EmitterTip[],
    dt = 1 / 60,
    scale = 1
  ): void {
    this.frame++;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    this.trackMotion(emitters, step, scale);
    this.tipLight.clear();
    if (emitters.length === 0) {
      this.forgetStale();
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const used = new Set<string>();
    if (params.style === "plasma") {
      this.drawPlasma(ctx, params, emitters, step, scale, used);
    } else if (params.style === "web") {
      this.drawWeb(ctx, params, emitters, step, scale, used);
    } else {
      this.drawStorm(ctx, params, emitters, step, scale, used);
    }
    this.stepSparks(ctx, step, scale);
    this.drawTerminals(ctx, params, emitters, step, scale, used);

    ctx.restore();
    this.forgetStale();
  }

  dispose(): void {
    this.motion.clear();
    this.channels.clear();
    this.channelSeen.clear();
    this.plasma.clear();
    this.crackles.clear();
    this.tipLight.clear();
    this.sparks = [];
    this.plasmaPhase = 0;
    this.crackleClock = 0;
  }

  // ── Shared plumbing ────────────────────────────────────────────────

  private colorOf(tip: EmitterTip, params: Zap2DParams): string {
    const custom =
      tip.propIndex % 2 === 0 ? params.leftColor : params.rightColor;
    return params.colorMode === "custom" ? custom : tip.color || custom;
  }

  private trackMotion(emitters: EmitterTip[], dt: number, scale: number): void {
    const follow = dt > 0 ? 1 - Math.exp(-dt / ENERGY_LAG) : 0;
    const norm = scale > 0 ? scale : 1;
    for (const tip of emitters) {
      const key = emitterId(tip.propIndex, tip.tipIndex);
      const prev = this.motion.get(key);
      if (!prev) {
        this.motion.set(key, {
          x: tip.x,
          y: tip.y,
          energy: 0,
          seen: this.frame,
        });
        continue;
      }
      if (dt > 0) {
        const speed = Math.hypot(tip.x - prev.x, tip.y - prev.y) / dt / norm;
        prev.energy += (clamp01(speed / REF_SPEED) - prev.energy) * follow;
      }
      prev.x = tip.x;
      prev.y = tip.y;
      prev.seen = this.frame;
    }
  }

  private energyOf(endpoint: Endpoint): number {
    return this.motion.get(endpoint.key)?.energy ?? 0;
  }

  private channel(key: string): DischargeChannel {
    let channel = this.channels.get(key);
    if (!channel) {
      channel = new DischargeChannel((this.rng() * 4294967296) >>> 0);
      this.channels.set(key, channel);
    }
    this.channelSeen.set(key, this.frame);
    return channel;
  }

  private forgetStale(): void {
    for (const [key, seen] of this.channelSeen) {
      if (seen !== this.frame) {
        this.channelSeen.delete(key);
        this.channels.delete(key);
      }
    }
    for (const [key, pair] of this.plasma) {
      if (pair.seen !== this.frame) this.plasma.delete(key);
    }
    for (const [key, motion] of this.motion) {
      if (this.frame - motion.seen > 30) {
        this.motion.delete(key);
        this.crackles.delete(key);
      }
    }
  }

  private lightTip(key: string, light: number): void {
    this.tipLight.set(key, Math.max(this.tipLight.get(key) ?? 0, light));
  }

  private endpoint(tip: EmitterTip, params: Zap2DParams): Endpoint {
    return {
      tip,
      key: emitterId(tip.propIndex, tip.tipIndex),
      color: this.colorOf(tip, params),
    };
  }

  /** Each blue-family tip with its red partner at the same end. */
  private pairs(
    emitters: EmitterTip[],
    params: Zap2DParams
  ): [Endpoint, Endpoint][] {
    const byKey = new Map<string, EmitterTip>();
    for (const tip of emitters)
      byKey.set(emitterId(tip.propIndex, tip.tipIndex), tip);
    const out: [Endpoint, Endpoint][] = [];
    for (const tip of emitters) {
      if (tip.propIndex % 2 !== 0) continue;
      const partner = byKey.get(emitterId(tip.propIndex + 1, tip.tipIndex));
      if (partner)
        out.push([this.endpoint(tip, params), this.endpoint(partner, params)]);
    }
    return out;
  }

  private gradient(
    ctx: CanvasRenderingContext2D,
    a: Endpoint,
    b: Endpoint
  ): string | CanvasGradient {
    if (a.color.toLowerCase() === b.color.toLowerCase()) return a.color;
    const g = ctx.createLinearGradient(a.tip.x, a.tip.y, b.tip.x, b.tip.y);
    g.addColorStop(0, a.color);
    g.addColorStop(1, b.color);
    return g;
  }

  /** Trace every stroke of one depth, mapped onto the current endpoints. */
  private traceDepth(
    ctx: CanvasRenderingContext2D,
    strokes: readonly BoltStroke[],
    depth: number,
    a: EmitterTip,
    b: EmitterTip
  ): boolean {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    let any = false;
    ctx.beginPath();
    for (const stroke of strokes) {
      if (stroke.depth !== depth) continue;
      const pts = stroke.points;
      for (let i = 0; i < pts.length; i += 3) {
        const u = pts[i]!;
        const v = pts[i + 1]!;
        const x = a.x + u * ex - v * ey;
        const y = a.y + u * ey + v * ex;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      any = true;
    }
    return any;
  }

  /**
   * One strike in three additive passes: a wide colored halo, a tight colored
   * sheath, and a white-hot core that dies before the color does.
   */
  private drawStrike(
    ctx: CanvasRenderingContext2D,
    params: Zap2DParams,
    strike: Strike,
    a: EmitterTip,
    b: EmitterTip,
    color: string | CanvasGradient,
    scale: number,
    weight = 1
  ): void {
    const light = strikeLight(strike);
    const halo = light.halo * params.brightness * weight;
    const core = light.core * params.brightness * weight;
    if (halo < 0.01 && core < 0.01) return;
    for (let depth = 0; depth <= 2; depth++) {
      if (!this.traceDepth(ctx, strike.strokes, depth, a, b)) continue;
      const width = DEPTH_WIDTH[depth]!;
      const fade = DEPTH_ALPHA[depth]!;
      ctx.strokeStyle = color;
      if (depth < 2) {
        ctx.globalAlpha = Math.min(1, halo * params.haloAlpha * fade);
        ctx.lineWidth = params.haloWidth * width * scale;
        ctx.stroke();
      }
      ctx.globalAlpha = Math.min(1, halo * 0.55 * fade);
      ctx.lineWidth = params.coreWidth * 2.6 * width * scale;
      ctx.stroke();
      if (core > 0.01) {
        ctx.strokeStyle = "#ffffff";
        ctx.globalAlpha = Math.min(1, core * fade);
        ctx.lineWidth = params.coreWidth * width * scale;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Storm ──────────────────────────────────────────────────────────

  private drawStorm(
    ctx: CanvasRenderingContext2D,
    params: Zap2DParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number,
    used: Set<string>
  ): void {
    for (const [a, b] of this.pairs(emitters, params)) {
      used.add(a.key);
      used.add(b.key);
      const energy = (this.energyOf(a) + this.energyOf(b)) / 2;
      const channel = this.channel(`storm|${a.key}|${b.key}`);
      const shape: ChannelShape = {
        jitter: params.jitter,
        branching: params.branching,
        energy,
        depthAxis: false,
      };
      channel.step(
        dt,
        params.frequency * (0.7 + energy * 0.9),
        shape,
        params.intensity
      );
      const dist = Math.hypot(b.tip.x - a.tip.x, b.tip.y - a.tip.y);
      if (dist < 2 * scale) continue;
      const color = this.gradient(ctx, a, b);
      let brightest = 0;
      for (const strike of channel.strikes) {
        const light = strikeLight(strike);
        brightest = Math.max(brightest, light.halo);
        // A fresh strike lights the air around it.
        if (light.core > 0.25) {
          const mx = (a.tip.x + b.tip.x) / 2;
          const my = (a.tip.y + b.tip.y) / 2;
          const r = dist * 0.6 + 20 * scale;
          const g = ctx.createRadialGradient(mx, my, 0, mx, my, r);
          g.addColorStop(0, a.color);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.globalAlpha = light.core * 0.09 * params.brightness;
          ctx.beginPath();
          ctx.arc(mx, my, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        this.drawStrike(ctx, params, strike, a.tip, b.tip, color, scale);
      }
      this.lightTip(a.key, brightest);
      this.lightTip(b.key, brightest);
    }
  }

  // ── Web ────────────────────────────────────────────────────────────

  private drawWeb(
    ctx: CanvasRenderingContext2D,
    params: Zap2DParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number,
    used: Set<string>
  ): void {
    // One mesh per performer: the base props, then each tunnel layer.
    const groups = new Map<number, Endpoint[]>();
    for (const tip of emitters) {
      const group = Math.floor(tip.propIndex / 2);
      const nodes = groups.get(group) ?? [];
      nodes.push(this.endpoint(tip, params));
      groups.set(group, nodes);
    }
    for (const nodes of groups.values()) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]!;
          const b = nodes[j]!;
          used.add(a.key);
          used.add(b.key);
          const energy = (this.energyOf(a) + this.energyOf(b)) / 2;
          const channel = this.channel(`web|${a.key}|${b.key}`);
          channel.step(
            dt,
            params.frequency * 0.45 * (0.7 + energy * 0.9),
            {
              jitter: params.jitter * 0.8,
              branching: params.branching * 0.5,
              energy: energy * 0.5,
              depthAxis: false,
            },
            params.intensity * 0.5
          );
          const color = this.gradient(ctx, a, b);
          // The standing thread keeps the mesh readable between strikes.
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.08 * params.brightness;
          ctx.lineWidth = params.coreWidth * 1.4 * scale;
          ctx.beginPath();
          ctx.moveTo(a.tip.x, a.tip.y);
          ctx.lineTo(b.tip.x, b.tip.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
          let brightest = 0;
          for (const strike of channel.strikes) {
            brightest = Math.max(brightest, strikeLight(strike).halo);
            this.drawStrike(
              ctx,
              params,
              strike,
              a.tip,
              b.tip,
              color,
              scale,
              0.85
            );
            this.drawChargeBead(ctx, params, strike, a, b, scale);
          }
          this.lightTip(a.key, brightest * 0.8);
          this.lightTip(b.key, brightest * 0.8);
        }
      }
    }
  }

  /** A bright bead that races down a fresh bolt's main channel. */
  private drawChargeBead(
    ctx: CanvasRenderingContext2D,
    params: Zap2DParams,
    strike: Strike,
    a: Endpoint,
    b: Endpoint,
    scale: number
  ): void {
    const t = strike.age / Math.max(0.05, strike.life * 0.6);
    if (t >= 1) return;
    const main = strike.strokes[0]!.points;
    const count = main.length / 3;
    const index = Math.min(count - 1, Math.floor(t * (count - 1)));
    const u = main[index * 3]!;
    const v = main[index * 3 + 1]!;
    const ex = b.tip.x - a.tip.x;
    const ey = b.tip.y - a.tip.y;
    const x = a.tip.x + u * ex - v * ey;
    const y = a.tip.y + u * ey + v * ex;
    const r = (7 + params.intensity * 7) * scale;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, u < 0.5 ? a.color : b.color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.globalAlpha = (1 - t) * params.brightness;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── Plasma ─────────────────────────────────────────────────────────

  private drawPlasma(
    ctx: CanvasRenderingContext2D,
    params: Zap2DParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number,
    used: Set<string>
  ): void {
    // Wobble Rate sets how fast the filaments writhe, in noise units per second.
    this.plasmaPhase += dt * (0.25 + params.wobbleRate * 4.5);
    for (const [a, b] of this.pairs(emitters, params)) {
      used.add(a.key);
      used.add(b.key);
      const energy = (this.energyOf(a) + this.energyOf(b)) / 2;
      const key = `${a.key}|${b.key}`;
      let pair = this.plasma.get(key);
      if (!pair) {
        pair = { filaments: [], untilSnap: 0, seen: this.frame };
        this.plasma.set(key, pair);
      }
      pair.seen = this.frame;
      const want = Math.max(
        2,
        Math.min(6, Math.round(2 + params.intensity * 2 + energy * 2))
      );
      while (pair.filaments.length < want) {
        pair.filaments.push({ seed: this.rng() * 100, flash: 0.6 });
      }
      pair.filaments.length = want;

      // A strike snaps one filament onto a new path and throws sparks off it.
      pair.untilSnap -= dt;
      let guard = 0;
      while (pair.untilSnap <= 0 && guard++ < 3) {
        const filament = pair.filaments[Math.floor(this.rng() * want)]!;
        filament.seed = this.rng() * 100;
        filament.flash = 1;
        this.throwSparks(a, b, filament, params, energy, scale);
        pair.untilSnap +=
          (0.45 + this.rng() * 1.1) /
          Math.max(0.5, params.frequency * (0.6 + energy));
      }

      const ex = b.tip.x - a.tip.x;
      const ey = b.tip.y - a.tip.y;
      if (Math.hypot(ex, ey) < 2 * scale) continue;
      const color = this.gradient(ctx, a, b);
      let brightest = 0;
      for (const filament of pair.filaments) {
        if (dt > 0) filament.flash *= Math.exp(-dt / 0.09);
        this.writeFilament(params, filament.seed);
        const shimmer =
          0.5 +
          0.3 * this.noise.noise3D(filament.seed, this.plasmaPhase * 1.7, 3.3);
        const light = clamp01(shimmer + filament.flash * 0.7);
        brightest = Math.max(brightest, light);
        const pts = this.filamentBuffer;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 3) {
          const u = pts[i]!;
          const v = pts[i + 1]!;
          const x = a.tip.x + u * ex - v * ey;
          const y = a.tip.y + u * ey + v * ex;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color;
        ctx.globalAlpha = Math.min(
          1,
          light * params.haloAlpha * 0.8 * params.brightness
        );
        ctx.lineWidth = params.haloWidth * 0.75 * scale;
        ctx.stroke();
        ctx.globalAlpha = Math.min(1, light * 0.5 * params.brightness);
        ctx.lineWidth = params.coreWidth * 2.2 * scale;
        ctx.stroke();
        ctx.strokeStyle = "#ffffff";
        ctx.globalAlpha = Math.min(
          1,
          (0.25 + filament.flash * 0.75) * light * params.brightness
        );
        ctx.lineWidth = params.coreWidth * 0.8 * scale;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      this.lightTip(a.key, brightest);
      this.lightTip(b.key, brightest);
    }
  }

  private writeFilament(params: Zap2DParams, seed: number): void {
    writePlasmaFilament(
      this.filamentBuffer,
      this.noise,
      seed,
      this.plasmaPhase,
      {
        sway: params.wobbleAmount,
        crawl: params.jitter,
        depthAxis: false,
      }
    );
  }

  private throwSparks(
    a: Endpoint,
    b: Endpoint,
    filament: PlasmaFilament,
    params: Zap2DParams,
    energy: number,
    scale: number
  ): void {
    this.writeFilament(params, filament.seed);
    const count =
      3 + Math.floor(this.rng() * (3 + params.intensity * 4 + energy * 4));
    const ex = b.tip.x - a.tip.x;
    const ey = b.tip.y - a.tip.y;
    for (let k = 0; k < count && this.sparks.length < MAX_SPARKS; k++) {
      const i = Math.floor(this.rng() * PLASMA_POINTS);
      const u = this.filamentBuffer[i * 3]!;
      const v = this.filamentBuffer[i * 3 + 1]!;
      const angle = this.rng() * Math.PI * 2;
      const speed = (60 + this.rng() * 160) * scale;
      this.sparks.push({
        x: a.tip.x + u * ex - v * ey,
        y: a.tip.y + u * ey + v * ex,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.25 + this.rng() * 0.35,
        age: 0,
        color: u < 0.5 ? a.color : b.color,
      });
    }
  }

  private stepSparks(
    ctx: CanvasRenderingContext2D,
    dt: number,
    scale: number
  ): void {
    if (this.sparks.length === 0) return;
    const drag = dt > 0 ? Math.exp(-dt * 3.5) : 1;
    const alive: Spark[] = [];
    ctx.lineWidth = 1.3 * scale;
    for (const spark of this.sparks) {
      spark.age += dt;
      if (spark.age >= spark.life) continue;
      spark.vx *= drag;
      spark.vy = spark.vy * drag + 220 * scale * dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      const fade = 1 - spark.age / spark.life;
      ctx.strokeStyle = fade > 0.6 ? "#ffffff" : spark.color;
      ctx.globalAlpha = fade;
      ctx.beginPath();
      ctx.moveTo(spark.x, spark.y);
      ctx.lineTo(spark.x - spark.vx * 0.025, spark.y - spark.vy * 0.025);
      ctx.stroke();
      alive.push(spark);
    }
    ctx.globalAlpha = 1;
    this.sparks = alive;
  }

  // ── Terminals ──────────────────────────────────────────────────────

  /**
   * Every zapped tip glows and crackles. A tip with no partner (one prop in
   * hand, or a lone end) is all crackle, so it still looks charged.
   */
  private drawTerminals(
    ctx: CanvasRenderingContext2D,
    params: Zap2DParams,
    emitters: EmitterTip[],
    dt: number,
    scale: number,
    used: Set<string>
  ): void {
    this.crackleClock += dt;
    const recut = this.crackleClock >= CRACKLE_PERIOD;
    if (recut) this.crackleClock %= CRACKLE_PERIOD;
    for (const tip of emitters) {
      const key = emitterId(tip.propIndex, tip.tipIndex);
      const lone = !used.has(key);
      const light = lone ? 0.55 : (this.tipLight.get(key) ?? 0);
      const color = this.colorOf(tip, params);
      const radius =
        (6 + params.intensity * 7 + params.glow * 7) *
        scale *
        (0.75 + light * 0.6);
      const g = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, radius);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.22, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.globalAlpha = (0.35 + light * 0.65) * params.brightness;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, radius, 0, Math.PI * 2);
      ctx.fill();

      let arcs = this.crackles.get(key);
      if (!arcs || recut) {
        arcs = this.cutCrackle(params, scale, lone);
        this.crackles.set(key, arcs);
      }
      ctx.beginPath();
      for (let i = 0; i < arcs.length; i += 8) {
        ctx.moveTo(tip.x + arcs[i]!, tip.y + arcs[i + 1]!);
        ctx.lineTo(tip.x + arcs[i + 2]!, tip.y + arcs[i + 3]!);
        ctx.lineTo(tip.x + arcs[i + 4]!, tip.y + arcs[i + 5]!);
        ctx.lineTo(tip.x + arcs[i + 6]!, tip.y + arcs[i + 7]!);
      }
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.45 * params.brightness;
      ctx.lineWidth = params.coreWidth * 2 * scale;
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.7 * params.brightness;
      ctx.lineWidth = params.coreWidth * 0.6 * scale;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private cutCrackle(
    params: Zap2DParams,
    scale: number,
    lone: boolean
  ): number[] {
    const arcs: number[] = [];
    const count = lone ? 3 : 2;
    const reach = (lone ? 14 : 8) * scale * (0.6 + params.intensity * 0.6);
    for (let k = 0; k < count; k++) {
      const angle = this.rng() * Math.PI * 2;
      const length = reach * (0.5 + this.rng() * 0.7);
      const cx = Math.cos(angle);
      const cy = Math.sin(angle);
      arcs.push(0, 0);
      for (let s = 1; s <= 3; s++) {
        const along = (length * s) / 3;
        const side = (this.rng() * 2 - 1) * length * 0.3 * (s < 3 ? 1 : 0.4);
        arcs.push(cx * along - cy * side, cy * along + cx * side);
      }
    }
    return arcs;
  }
}
