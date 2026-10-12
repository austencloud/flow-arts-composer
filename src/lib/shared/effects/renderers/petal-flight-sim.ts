/**
 * Petal flight for the Canvas2D backend.
 *
 * A prop sheds petals along the path its tips travel: a set number per
 * distance travelled, spread along each frame's stretch of the path, so a fast
 * swing leaves as even a ribbon as a slow one. A petal leaves with part of the
 * tip's velocity (`carry`), but its light body loses that within a fraction of
 * a second (`streakLength` sets how long), so shed petals stay on the arc they
 * came from instead of being thrown across the stage. While it is still moving
 * faster than the air it points along its flight and spins.
 *
 * Then it falls like a petal. Most glide from side to side, tilting into each
 * swing and slowing at its ends, each at its own rate and phase so the field
 * never sways in step. About a third tumble over and over and drift to one
 * side. All of them ride the shared air field and the props' wake.
 *
 * Depth is one number per petal: nearer petals are larger, brighter and fall
 * faster, and the list stays sorted far to near for drawing.
 *
 * Distances are canvas pixels authored at the reference canvas and scaled by
 * the caller's effect scale.
 */

import type { Petals2DParams } from "../translators/canvas2d-types";
import type { PetalSpriteShape } from "../domain/petal-palettes";
import {
  pickPetalSprite,
  pickPetalTint,
  resolvePetalOpacity,
  resolvePetalSize,
  rollEmberFlag,
} from "../domain/petal-palettes";
import {
  addPetalWake2D,
  resolvePetalAirflowPhrase,
  samplePetalAirflow2D,
  type PetalAirflow2D,
  type PetalWakeSource2D,
} from "../domain/petal-airflow";
import type { EmitterTip } from "./emitter-tip";
import { emitterId } from "./emitter-tip";

export interface FlyingPetal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  /** Half-size in px, depth included. */
  size: number;
  shape: PetalSpriteShape;
  tint: string;
  /** Alpha ceiling: quieter for petals shed at rest and for far petals. */
  opacity: number;
  ember: boolean;
  /** 0 is the back of the stage, 1 the front. */
  depth: number;
  /** In-plane angle of the petal's long axis; 0 is upright. */
  rot: number;
  /** Turn about the long axis. Its cosine is how much face shows, and its sign
   *  which face. */
  roll: number;
  /** Roll the petal has spun through; the glide rocks it about this. */
  spin: number;
  spinDirection: number;
  /** Flutter phase and rate (rad/s). */
  phase: number;
  rate: number;
  /** Side-to-side glide speed at the middle of a swing (px/s). */
  glide: number;
  /** How far the petal tilts into a swing (rad). */
  tilt: number;
  rollBias: number;
  rollSwing: number;
  /** Rest heading the tilt rocks about; the air slowly turns it. */
  heading: number;
  /** Seconds the petal takes to give up the motion it was thrown with. */
  settle: number;
  /** Roll speed of a tumbling petal (rad/s), 0 for a glider. */
  tumble: number;
  /** Sideways drift of a tumbling petal (px/s). */
  drift: number;
  /** Terminal fall speed (px/s). */
  fall: number;
}

export const MAX_PETALS = 2048;
const TAU = Math.PI * 2;
/** Share of `carry × tip velocity` a petal actually leaves with. */
const RELEASE = 0.55;
/** A tip that moves further than this in one frame jumped (a loop restart or
 *  a seek), so nothing is shed along the jump. */
const TELEPORT_PX = 220;
const TUMBLER_SHARE = 0.32;
/** Roll speed of a petal still flying off the tip (rad/s). */
const FLIGHT_SPIN = 11;
/** How fast a petal turns toward its target heading (1/s). */
const TURN_RATE = 9;
/** The longest step the physics takes; longer frames are a stall. */
const MAX_STEP = 0.1;

interface TipState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Fractional petals owed by the distance travelled so far. */
  owed: number;
}

export class PetalFlightSim {
  readonly petals: FlyingPetal[] = [];
  private readonly tips = new Map<string, TipState>();
  private readonly seen = new Set<string>();
  private readonly wakeSources: PetalWakeSource2D[] = [];
  private readonly airflow: PetalAirflow2D = { x: 0, y: 0, turn: 0 };
  private clock = 0;

  constructor(private readonly random: () => number = Math.random) {}

  step(
    params: Petals2DParams,
    emitters: readonly EmitterTip[],
    frameDt: number,
    scale: number
  ): void {
    const dt = Math.min(Math.max(frameDt, 0), MAX_STEP);
    const s = Math.max(scale, 0.01);
    this.clock += dt;
    const poolCap = Math.min(MAX_PETALS, params.poolSize ?? MAX_PETALS);
    const phrase = resolvePetalAirflowPhrase(this.clock);

    this.seen.clear();
    this.wakeSources.length = 0;
    for (const e of emitters) {
      if (!isEndEnabled(e.end, params)) continue;
      const id = emitterId(e.propIndex, e.tipIndex);
      this.seen.add(id);
      let tip = this.tips.get(id);
      if (!tip) {
        tip = { x: e.x, y: e.y, vx: 0, vy: 0, owed: 0 };
        this.tips.set(id, tip);
      }
      const dx = e.x - tip.x;
      const dy = e.y - tip.y;
      const distance = Math.hypot(dx, dy);
      if (distance > TELEPORT_PX * s) {
        tip.x = e.x;
        tip.y = e.y;
        tip.vx = 0;
        tip.vy = 0;
        tip.owed = 0;
        continue;
      }
      if (dt <= 0) {
        // Paused: a scrubbed tip moves without shedding along the scrub.
        tip.x = e.x;
        tip.y = e.y;
        continue;
      }
      const follow = 1 - Math.pow(0.6, dt * 60);
      tip.vx += (dx / dt - tip.vx) * follow;
      tip.vy += (dy / dt - tip.vy) * follow;
      this.wakeSources.push({
        x: e.x,
        y: e.y,
        velocityX: tip.vx,
        velocityY: tip.vy,
      });

      // Shed along the path: petals owed by distance, plus a slow shedding
      // at rest so a still prop is never bare.
      const moving =
        ((params.motionEmission * params.motionDensity) / 100) * (distance / s);
      const resting =
        params.ambientEmission * params.ambientSpawnRate * phrase * dt;
      tip.owed += moving + resting;
      const restShare = moving + resting > 0 ? resting / (moving + resting) : 1;
      while (tip.owed >= 1 && this.petals.length < poolCap) {
        tip.owed -= 1;
        const along = this.random();
        this.spawn(
          params,
          tip.x + dx * along,
          tip.y + dy * along,
          tip.vx,
          tip.vy,
          this.random() < restShare,
          s
        );
      }
      if (this.petals.length >= poolCap) tip.owed = 0;
      tip.x = e.x;
      tip.y = e.y;
    }
    for (const id of this.tips.keys())
      if (!this.seen.has(id)) this.tips.delete(id);

    if (dt > 0) this.integrate(dt, s);
  }

  clear(): void {
    this.petals.length = 0;
    this.tips.clear();
    this.wakeSources.length = 0;
    this.clock = 0;
  }

  private spawn(
    params: Petals2DParams,
    x: number,
    y: number,
    tipVx: number,
    tipVy: number,
    atRest: boolean,
    s: number
  ): void {
    const r = this.random;
    const palette = params.resolvedPalette;
    const shape = pickPetalSprite(palette, r);
    const depth = atRest ? r() : 0.2 + r() * 0.8;
    const size =
      resolvePetalSize(params.baseSize * s, params.intensity, shape, r) *
      (0.72 + depth * 0.56);
    const throwX = atRest ? 0 : tipVx * params.carry * RELEASE;
    const throwY = atRest ? 0 : tipVy * params.carry * RELEASE;
    const fall =
      params.fallBaseSpeed *
      (0.3 + 0.7 * params.fallSpeed) *
      s *
      (0.75 + depth * 0.5) *
      (0.85 + r() * 0.3);
    const tumbling = r() < TUMBLER_SHARE;
    const side = r() < 0.5 ? -1 : 1;
    const sway = params.swayAmplitude;
    const heading = r() * TAU;
    const spin = r() * TAU;
    const petal: FlyingPetal = {
      x: x + (r() - 0.5) * 6 * s,
      y: y + (r() - 0.5) * 6 * s,
      vx: throwX + (r() - 0.5) * (atRest ? 16 : 30) * s,
      vy: throwY + (r() - 0.5) * (atRest ? 8 : 30) * s,
      age: 0,
      maxAge: (1.8 + 1.2 * params.intensity) * (0.8 + r() * 0.4),
      size,
      shape,
      tint: pickPetalTint(palette, r),
      opacity: resolvePetalOpacity(shape, atRest) * (0.72 + depth * 0.28),
      ember: rollEmberFlag(palette, r),
      depth,
      rot: atRest ? heading : Math.atan2(throwY, throwX) - Math.PI / 2,
      roll: spin,
      spin,
      spinDirection: side,
      phase: r() * TAU,
      rate: TAU * (0.45 + r() * 0.45),
      glide: (8 + 26 * sway) * s * (0.7 + r() * 0.6) * (0.75 + depth * 0.5),
      tilt: 0.22 + 0.36 * sway,
      rollBias: (r() - 0.5) * 0.9,
      rollSwing: 0.6 + r() * 0.5,
      heading,
      settle: (0.07 + 0.2 * params.streakLength) * (0.8 + r() * 0.45),
      tumble: tumbling ? side * (2.6 + r() * 3) : 0,
      drift: tumbling ? side * fall * (0.2 + r() * 0.2) : 0,
      fall,
    };
    insertByDepth(this.petals, petal);
  }

  private integrate(dt: number, s: number): void {
    let write = 0;
    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i]!;
      p.age += dt;
      if (p.age >= p.maxAge) continue;
      p.phase += p.rate * dt;
      const swing = Math.cos(p.phase);
      const lean = Math.sin(p.phase);

      // Where still air would carry it: a glider swings and sinks fastest
      // mid-swing; a tumbler drops straighter and slides to one side.
      const glideX = p.tumble ? p.drift : p.glide * swing;
      const sinkY = p.tumble
        ? p.fall * 1.08
        : p.fall * (0.45 + 1.1 * swing * swing);
      const air = samplePetalAirflow2D(p.x, p.y, this.clock, s, this.airflow);
      for (const source of this.wakeSources)
        addPetalWake2D(air, p.x, p.y, source, s);
      const targetX = air.x + glideX;
      const targetY = air.y + sinkY;
      const follow = 1 - Math.exp(-dt / p.settle);
      p.vx += (targetX - p.vx) * follow;
      p.vy += (targetY - p.vy) * follow;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Flight: how much of the throw is left, 1 while it leaves the tip.
      const excess = Math.hypot(p.vx - targetX, p.vy - targetY);
      const flight = smoothstep(excess / (p.fall * 3 + 1e-3));
      p.spin += (p.tumble + FLIGHT_SPIN * flight * p.spinDirection) * dt;
      p.roll =
        p.spin +
        (p.tumble ? 0 : (p.rollBias + p.rollSwing * lean) * (1 - flight));
      p.heading += (air.turn * 0.6 + p.tumble * 0.06) * dt;
      const restRot = p.heading + (p.tumble ? 0 : p.tilt * lean);
      const flightRot = Math.atan2(p.vy, p.vx) - Math.PI / 2;
      const target = restRot + wrapAngle(flightRot - restRot) * flight;
      p.rot += wrapAngle(target - p.rot) * (1 - Math.exp(-TURN_RATE * dt));

      if (i !== write) this.petals[write] = p;
      write++;
    }
    this.petals.length = write;
  }
}

function isEndEnabled(end: "A" | "B", params: Petals2DParams): boolean {
  if (params.trackingMode === "both_ends") return true;
  return params.trackingMode === "left_end" ? end === "A" : end === "B";
}

/** Keep the list sorted far to near, newest last among equals. */
function insertByDepth(petals: FlyingPetal[], petal: FlyingPetal): void {
  let lo = 0;
  let hi = petals.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (petals[mid]!.depth <= petal.depth) lo = mid + 1;
    else hi = mid;
  }
  petals.splice(lo, 0, petal);
}

function wrapAngle(angle: number): number {
  return angle - TAU * Math.round(angle / TAU);
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}
