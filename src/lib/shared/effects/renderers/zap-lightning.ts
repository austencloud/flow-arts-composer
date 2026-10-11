/**
 * Zap lightning model, shared by the 2D renderer and the 3D discharge.
 *
 * A strike's channel is cut once, in a frame normalised to its two endpoints:
 * `u` runs 0→1 from the first end to the second, and `v` / `w` are sideways
 * offsets measured in multiples of the endpoint distance. Every frame maps the
 * stored shape onto wherever the tips are now, so a bolt keeps its shape while
 * the props carry it around. The old renderer re-cut the path on a frame
 * counter, which read as noise at 120 Hz and as a slideshow at 30 Hz.
 *
 * Timing is in seconds. A strike flashes, re-flashes on its return strokes,
 * and leaves a colored afterglow that outlives the white core.
 */
import {
  mulberry32,
  type SeededNoise,
} from "#lib/shared/3d/procedural-engine/generation/seed-generator.js";

/** One polyline of a strike, in normalised (u, v, w) triplets. */
export interface BoltStroke {
  readonly points: Float32Array;
  /** 0 = main channel, 1 = fork, 2 = twig. */
  readonly depth: number;
}

export interface ChannelShape {
  /** 0-1 path roughness (the Jitter control). */
  jitter: number;
  /** 0-1 fork richness (the Branching control). */
  branching: number;
  /** 0-1 motion energy when the strike is born; fast swings fork more. */
  energy: number;
  /** false keeps every offset in the canvas plane (w = 0). */
  depthAxis: boolean;
}

export interface Strike {
  readonly strokes: readonly BoltStroke[];
  /** Return-stroke onsets in seconds after birth; the first is always 0. */
  readonly pulses: readonly number[];
  /** Seconds until fully dark. */
  readonly life: number;
  /** Seconds since birth. */
  age: number;
}

export interface StrikeLight {
  /** White-hot channel core, 0-1. Dies with each flash. */
  core: number;
  /** Colored sheath, 0-1. Lingers after the core as afterglow. */
  halo: number;
}

/** Main channel subdivision depth: 2^5 + 1 = 33 points. */
const MAIN_LEVELS = 5;
const FORK_LEVELS = 3;
const TWIG_LEVELS = 2;
const MAX_STROKES = 9;
/** A flash's brightness falls by 1/e every FLASH_DECAY seconds. */
const FLASH_DECAY = 0.05;
/** At most this many strikes share one channel; the oldest goes first. */
export const MAX_LIVE_STRIKES = 4;

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Midpoint displacement between two normalised points. Each pass splits every
 * segment and pushes the midpoint sideways by up to `roughness` times that
 * segment's length, so detail shrinks with scale the way a real leader's does.
 */
function displace(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  levels: number,
  roughness: number,
  rng: () => number,
  depthAxis: boolean
): Float32Array {
  let pts: number[] = [ax, ay, az, bx, by, bz];
  for (let level = 0; level < levels; level++) {
    const next: number[] = [];
    const count = pts.length / 3;
    for (let i = 0; i < count - 1; i++) {
      const x1 = pts[i * 3]!;
      const y1 = pts[i * 3 + 1]!;
      const z1 = pts[i * 3 + 2]!;
      const x2 = pts[i * 3 + 3]!;
      const y2 = pts[i * 3 + 4]!;
      const z2 = pts[i * 3 + 5]!;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dy, dz) || 1e-6;
      let px: number;
      let py: number;
      let pz: number;
      if (!depthAxis) {
        px = -dy / len;
        py = dx / len;
        pz = 0;
      } else {
        // Two axes perpendicular to the segment, mixed at a random angle.
        const tx = dx / len;
        const ty = dy / len;
        const tz = dz / len;
        const rx = Math.abs(tx) < 0.9 ? 1 : 0;
        const ry = rx === 1 ? 0 : 1;
        let ax1 = ty * 0 - tz * ry;
        let ay1 = tz * rx - tx * 0;
        let az1 = tx * ry - ty * rx;
        const l1 = Math.hypot(ax1, ay1, az1) || 1;
        ax1 /= l1;
        ay1 /= l1;
        az1 /= l1;
        const ax2 = ty * az1 - tz * ay1;
        const ay2 = tz * ax1 - tx * az1;
        const az2 = tx * ay1 - ty * ax1;
        const angle = rng() * Math.PI * 2;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        px = ax1 * c + ax2 * s;
        py = ay1 * c + ay2 * s;
        pz = az1 * c + az2 * s;
      }
      const offset = (rng() * 2 - 1) * roughness * len;
      next.push(
        x1,
        y1,
        z1,
        (x1 + x2) / 2 + px * offset,
        (y1 + y2) / 2 + py * offset,
        (z1 + z2) / 2 + pz * offset
      );
    }
    next.push(pts[pts.length - 3]!, pts[pts.length - 2]!, pts[pts.length - 1]!);
    pts = next;
  }
  return Float32Array.from(pts);
}

/**
 * Turn a unit direction away from itself by `angle` radians: around the depth
 * axis on the canvas, around a random perpendicular axis in 3D.
 */
function turn(
  dx: number,
  dy: number,
  dz: number,
  angle: number,
  rng: () => number,
  depthAxis: boolean
): [number, number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  if (!depthAxis) return [dx * c - dy * s, dx * s + dy * c, 0];
  // A perpendicular from a random mix of the two normal axes.
  const rx = Math.abs(dx) < 0.9 ? 1 : 0;
  const ry = rx === 1 ? 0 : 1;
  let nx = dy * 0 - dz * ry;
  let ny = dz * rx - dx * 0;
  let nz = dx * ry - dy * rx;
  const ln = Math.hypot(nx, ny, nz) || 1;
  nx /= ln;
  ny /= ln;
  nz /= ln;
  const mx = dy * nz - dz * ny;
  const my = dz * nx - dx * nz;
  const mz = dx * ny - dy * nx;
  const phi = rng() * Math.PI * 2;
  const qx = nx * Math.cos(phi) + mx * Math.sin(phi);
  const qy = ny * Math.cos(phi) + my * Math.sin(phi);
  const qz = nz * Math.cos(phi) + mz * Math.sin(phi);
  return [dx * c + qx * s, dy * c + qy * s, dz * c + qz * s];
}

/** Grow a forked stroke from point `index` of `parent`. */
function growFork(
  parent: Float32Array,
  index: number,
  length: number,
  levels: number,
  roughness: number,
  rng: () => number,
  depthAxis: boolean
): Float32Array {
  const count = parent.length / 3;
  const prev = Math.max(0, index - 1);
  const next = Math.min(count - 1, index + 1);
  let dx = parent[next * 3]! - parent[prev * 3]!;
  let dy = parent[next * 3 + 1]! - parent[prev * 3 + 1]!;
  let dz = parent[next * 3 + 2]! - parent[prev * 3 + 2]!;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  const side = rng() < 0.5 ? -1 : 1;
  const [fx, fy, fz] = turn(
    dx,
    dy,
    dz,
    side * (0.35 + rng() * 0.55),
    rng,
    depthAxis
  );
  const ox = parent[index * 3]!;
  const oy = parent[index * 3 + 1]!;
  const oz = parent[index * 3 + 2]!;
  return displace(
    ox,
    oy,
    oz,
    ox + fx * length,
    oy + fy * length,
    oz + fz * length,
    levels,
    roughness,
    rng,
    depthAxis
  );
}

/**
 * Cut one strike's channel: a jagged main bolt from (0,0,0) to (1,0,0), forks
 * that leave it at a slant and run part of the way on, and twigs off the forks.
 */
export function cutChannel(
  rng: () => number,
  shape: ChannelShape
): BoltStroke[] {
  const roughness = 0.2 + clamp01(shape.jitter) * 0.3;
  const main = displace(
    0,
    0,
    0,
    1,
    0,
    0,
    MAIN_LEVELS,
    roughness,
    rng,
    shape.depthAxis
  );
  const strokes: BoltStroke[] = [{ points: main, depth: 0 }];
  const forkChance =
    0.015 + clamp01(shape.branching) * 0.09 + clamp01(shape.energy) * 0.05;
  const count = main.length / 3;
  for (let i = 3; i < count - 4 && strokes.length < MAX_STROKES; i++) {
    if (rng() >= forkChance) continue;
    const along = i / (count - 1);
    const length = (0.16 + rng() * 0.26) * (1.1 - along * 0.6);
    const fork = growFork(
      main,
      i,
      length,
      FORK_LEVELS,
      roughness * 1.15,
      rng,
      shape.depthAxis
    );
    strokes.push({ points: fork, depth: 1 });
    const forkCount = fork.length / 3;
    for (let j = 2; j < forkCount - 2 && strokes.length < MAX_STROKES; j++) {
      if (rng() >= 0.12 + clamp01(shape.branching) * 0.18) continue;
      strokes.push({
        points: growFork(
          fork,
          j,
          length * (0.3 + rng() * 0.25),
          TWIG_LEVELS,
          roughness * 1.2,
          rng,
          shape.depthAxis
        ),
        depth: 2,
      });
      break;
    }
  }
  return strokes;
}

/** Strike brightness at its current age. */
export function strikeLight(strike: Strike): StrikeLight {
  let flash = 0;
  for (let i = 0; i < strike.pulses.length; i++) {
    const onset = strike.pulses[i]!;
    if (strike.age < onset) break;
    const peak = i === 0 ? 1 : 0.82;
    flash = Math.max(
      flash,
      peak * Math.exp(-(strike.age - onset) / FLASH_DECAY)
    );
  }
  const tail = clamp01(1 - strike.age / strike.life);
  return {
    core: flash * Math.min(1, tail * 4),
    halo: Math.max(flash, 0.38 * tail) * Math.min(1, tail * 2.5),
  };
}

/**
 * One discharge path between two endpoints: owns its strikes and the
 * irregular clock that fires them. Strikes arrive roughly `rate` times a
 * second, never on a metronome.
 */
export class DischargeChannel {
  readonly strikes: Strike[] = [];
  private readonly rng: () => number;
  private untilNext = 0;
  private born = 0;

  constructor(seed: number) {
    this.rng = mulberry32(seed >>> 0);
  }

  /** Advance by `dt` seconds; fire new strikes at `rate` per second. */
  step(dt: number, rate: number, shape: ChannelShape, flashes = 1): void {
    for (const strike of this.strikes) strike.age += dt;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      if (this.strikes[i]!.age >= this.strikes[i]!.life)
        this.strikes.splice(i, 1);
    }
    if (rate <= 0) return;
    this.untilNext -= dt;
    let guard = 0;
    while (this.untilNext <= 0 && guard++ < 4) {
      this.fire(shape, flashes, Math.max(0, -this.untilNext));
      this.untilNext += (0.45 + this.rng() * 1.1) / rate;
    }
  }

  /** Strikes fired since construction. */
  get fired(): number {
    return this.born;
  }

  private fire(shape: ChannelShape, flashes: number, age: number): void {
    const rng = this.rng;
    const pulses = [0];
    const extra = Math.floor(rng() * (1 + clamp01(flashes) * 2.2));
    let onset = 0;
    for (let i = 0; i < extra; i++) {
      onset += 0.035 + rng() * 0.05;
      pulses.push(onset);
    }
    const strike: Strike = {
      strokes: cutChannel(mulberry32((rng() * 4294967296) >>> 0), shape),
      pulses,
      life: onset + 0.16 + rng() * 0.1,
      age,
    };
    this.strikes.push(strike);
    this.born++;
    if (this.strikes.length > MAX_LIVE_STRIKES) this.strikes.shift();
  }
}

export interface PlasmaShape {
  /** 0-1 sideways sway of each filament (Wobble Amount). */
  sway: number;
  /** 0-1 fine crackle along each filament (Jitter). */
  crawl: number;
  depthAxis: boolean;
}

/** Points along one plasma filament. */
export const PLASMA_POINTS = 28;

/**
 * Write one plasma filament into `out` as normalised (u, v, w) triplets. Noise
 * is sampled along the filament and through time, so the filament crawls and
 * writhes continuously instead of jumping; `phase` advances with Wobble Rate.
 */
export function writePlasmaFilament(
  out: Float32Array,
  noise: SeededNoise,
  seed: number,
  phase: number,
  shape: PlasmaShape
): void {
  const n = out.length / 3;
  const sway = 0.06 + clamp01(shape.sway) * 0.3;
  const crawl = 0.025 + clamp01(shape.crawl) * 0.07;
  const swayV = noise.noise3D(seed * 0.73, phase * 0.3, 0.5) * sway;
  const swayW = shape.depthAxis
    ? noise.noise3D(seed * 0.73, phase * 0.3, 7.5) * sway
    : 0;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const envelope = Math.sin(Math.PI * u);
    const coarse = noise.noise3D(u * 3.1 + seed, phase, 1.7);
    const fine = noise.noise3D(u * 13 + seed * 1.9, phase * 2.3, 4.1);
    const spark = noise.noise3D(u * 31 + seed * 3.7, phase * 4.1, 9.3);
    out[i * 3] = u;
    out[i * 3 + 1] =
      envelope *
      (swayV + coarse * crawl * 1.6 + fine * crawl + spark * crawl * 0.45);
    out[i * 3 + 2] = shape.depthAxis
      ? envelope *
        (swayW +
          noise.noise3D(u * 3.1 + seed, phase, 12.9) * crawl * 1.6 +
          noise.noise3D(u * 13 + seed * 1.9, phase * 2.3, 15.2) * crawl)
      : 0;
  }
}
