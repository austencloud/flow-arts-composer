/**
 * Petal flight for the Canvas2D backend.
 *
 * A prop sheds petals along the path its tips travel: a set number per
 * distance travelled, spread along each frame's stretch of the path, so a fast
 * swing leaves as even a ribbon as a slow one. A petal leaves edge-on with
 * part of the tip's velocity (`carry`); the air stops it within a few
 * centimetres, so shed petals stay on the arc they came from.
 *
 * From there each petal is the same falling plate the 3D view flies
 * (`petal-aero.ts`): the glides, flutter and tumbling come from the air
 * pushing on its tilted face, not from a timer. The view looks at the stage
 * from the front, so a petal's 3D turn draws as the shape its face makes on
 * screen. All of them ride the shared air field and the air the props drag
 * along.
 *
 * Depth is one number per petal: nearer petals are larger and move further
 * across the screen for the same flight, and the list stays sorted far to
 * near for drawing.
 *
 * Distances are canvas pixels authored at the reference canvas and scaled by
 * the caller's effect scale; the flight itself is in metres at
 * PETAL_PIXELS_PER_METRE.
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
  createPetalBody,
  resolvePetalShape,
  stepPetalBody,
  turnPetalWorld,
  type PetalBody,
} from "../domain/petal-aero";
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
  /** Canvas position and velocity (px, px/s; y down). */
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
  /** Its flight in metres, y up, z toward the viewer. */
  body: PetalBody;
  /** Canvas pixels per metre at this petal's depth. */
  pixelsPerMetre: number;
}

export const MAX_PETALS = 2048;
/** Canvas pixels per metre at the reference canvas and the middle depth. */
export const PETAL_PIXELS_PER_METRE = 140;
const TAU = Math.PI * 2;
/** Share of `carry × tip velocity` a petal actually leaves with. */
const RELEASE = 0.55;
/** A tip that moves further than this in one frame jumped (a loop restart or
 *  a seek), so nothing is shed along the jump. */
const TELEPORT_PX = 220;
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
  private readonly airflow: PetalAirflow2D = { x: 0, y: 0 };
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
    const pixelsPerMetre = PETAL_PIXELS_PER_METRE * s * (0.75 + depth * 0.5);
    const fall =
      (params.fallBaseSpeed * (0.3 + 0.7 * params.fallSpeed)) /
      PETAL_PIXELS_PER_METRE;
    const body = createPetalBody(
      resolvePetalShape(
        shape,
        size / pixelsPerMetre,
        {
          fallSpeed: fall,
          sway: params.swayAmplitude,
          streak: params.streakLength,
        },
        r
      )
    );
    body.x = (x + (r() - 0.5) * 6 * s) / pixelsPerMetre;
    body.y = -(y + (r() - 0.5) * 6 * s) / pixelsPerMetre;
    body.z = 0;
    if (atRest) {
      // Slipping off a still prop: already falling, at any angle.
      body.vx = (r() - 0.5) * 0.1;
      body.vy = -fall * (0.6 + r() * 0.4);
      body.vz = (r() - 0.5) * 0.1;
      turnPetalWorld(body, r() - 0.5, r() - 0.5, r() - 0.5, r() * TAU);
    } else {
      // Thrown off the tip: it leaves edge-on along the throw, the way it
      // was lying against the prop, and the air turns it from there.
      body.vx = (tipVx * params.carry * RELEASE) / pixelsPerMetre;
      body.vy = -(tipVy * params.carry * RELEASE) / pixelsPerMetre;
      body.vz = (r() - 0.5) * 0.2;
      turnPetalWorld(body, 0, 1, 0, r() * TAU);
      turnPetalWorld(body, 0, 0, 1, Math.atan2(-body.vx, body.vy));
    }
    const petal: FlyingPetal = {
      x: body.x * pixelsPerMetre,
      y: -body.y * pixelsPerMetre,
      vx: body.vx * pixelsPerMetre,
      vy: -body.vy * pixelsPerMetre,
      age: 0,
      maxAge: (1.8 + 1.2 * params.intensity) * (0.8 + r() * 0.4),
      size,
      shape,
      tint: pickPetalTint(palette, r),
      opacity: resolvePetalOpacity(shape, atRest) * (0.72 + depth * 0.28),
      ember: rollEmberFlag(palette, r),
      depth,
      body,
      pixelsPerMetre,
    };
    insertByDepth(this.petals, petal);
  }

  private integrate(dt: number, s: number): void {
    let write = 0;
    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i]!;
      p.age += dt;
      if (p.age >= p.maxAge) continue;
      const air = samplePetalAirflow2D(p.x, p.y, this.clock, s, this.airflow);
      for (const source of this.wakeSources)
        addPetalWake2D(air, p.x, p.y, source, s);
      const k = p.pixelsPerMetre;
      const body = p.body;
      stepPetalBody(body, air.x / k, -air.y / k, 0, dt);
      p.x = body.x * k;
      p.y = -body.y * k;
      p.vx = body.vx * k;
      p.vy = -body.vy * k;
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
