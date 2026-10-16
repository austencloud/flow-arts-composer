/**
 * One silk streamer as real cloth: a grid of particles gathered at the prop
 * tip, solved with position-based dynamics. Gravity pulls it down, air drag
 * on each patch of fabric (strongest when the air hits it face on) makes it
 * stream behind a moving tip and billow, a little turbulence keeps it alive,
 * and the floor holds it up when it hangs that low.
 *
 * Rows run along the streamer from the tip (row 0) to the tail; columns run
 * across it. Only the middle of row 0 is pinned, so the head can turn freely
 * the way a streamer tied to a point does.
 */

import type { SilkIntent } from "#lib/shared/effects/domain/effects-config.js";

export interface SilkClothSettings {
  /** Streamer length in metres. */
  length: number;
  /** Full width of the body in metres. */
  width: number;
  /** 0-1. Air turbulence that keeps the fabric rippling. */
  flutter: number;
  /** 0-1. Bending stiffness: high streams flat and straight, low folds. */
  tautness: number;
}

export interface SilkVector {
  x: number;
  y: number;
  z: number;
}

/** Streamer shape from the user's settings; 2D and 3D share it. */
export function resolveSilkClothSettings(intent: SilkIntent): SilkClothSettings {
  return {
    length: 0.6 + 1.4 * clamp01(intent.duration),
    // The same 5-30 cm half width range the old ribbon used, at 80%.
    width: (0.8 * (5 + 25 * clamp01(intent.width))) / 60,
    flutter: clamp01(intent.flutter),
    tautness: clamp01(intent.tautness),
  };
}

/** How each palette's fabric handles light. */
export interface SilkFabricProfile3D {
  /** Surface roughness: low reads as satin, high as velvet. */
  roughness: number;
  /** Strength of the soft cloth sheen at grazing angles. */
  sheen: number;
  /** Light from behind that shows through the fabric. */
  translucency: number;
  /** Metallic share, for leaf that is really foil. */
  metalness: number;
  /** How far the body color leans toward the prop color. */
  identityMix: number;
}

const PROFILES: Record<string, SilkFabricProfile3D> = {
  satin: { roughness: 0.3, sheen: 0.9, translucency: 0.35, metalness: 0, identityMix: 0.68 },
  velvet: { roughness: 0.85, sheen: 1, translucency: 0.06, metalness: 0, identityMix: 0.2 },
  ethereal: { roughness: 0.42, sheen: 0.8, translucency: 0.75, metalness: 0, identityMix: 0.22 },
  shadow: { roughness: 0.7, sheen: 0.45, translucency: 0.2, metalness: 0, identityMix: 0.18 },
  gold_leaf: { roughness: 0.24, sheen: 0.6, translucency: 0.05, metalness: 0.55, identityMix: 0.06 },
  ember: { roughness: 0.45, sheen: 0.7, translucency: 0.6, metalness: 0, identityMix: 0.04 },
  custom: { roughness: 0.4, sheen: 0.75, translucency: 0.3, metalness: 0, identityMix: 0.42 },
};

export function resolveSilkFabricProfile3D(paletteId: string): SilkFabricProfile3D {
  return PROFILES[paletteId] ?? PROFILES.custom!;
}

export const SILK_CLOTH_ROWS = 26;
export const SILK_CLOTH_COLUMNS = 7;
export const SILK_CLOTH_VERTICES = SILK_CLOTH_ROWS * SILK_CLOTH_COLUMNS;
const PIN = (SILK_CLOTH_COLUMNS - 1) / 2;
const GRAVITY = -9.8;
const ITERATIONS = 4;
/**
 * Silk is light, so air pushes hard on it: drag per unit mass for a patch
 * facing the air, 1/m. About 20 g/m2 of fabric with a flat plate's drag.
 */
const NORMAL_DRAG = 35;
/** A little drag on any motion through the air, 1/s. */
const TANGENT_DRAG = 0.1;
/** Air rubbing along both faces as the fabric slides edgewise, 1/m. */
const SKIN_DRAG = 0.6;
const FLOOR_GAP = 0.004;
/** Longest physics step, s: the cloth moves the same at any frame rate. */
const MAX_SUBSTEP = 1 / 240;
/** Velocity lost to everything that is not air drag, per second. */
const DAMPING = 0.6;

/** How wide the fabric is at a point along it, 0 at the tip to 1 at the tail. */
export function silkWidthProfile(along: number): number {
  const gather = 0.18 + 0.82 * smoothstep(along, 0, 0.16);
  const taper = 1 - 0.45 * smoothstep(along, 0.55, 1);
  return gather * taper;
}

export class SilkCloth3D {
  readonly positions = new Float32Array(SILK_CLOTH_VERTICES * 3);
  readonly normals = new Float32Array(SILK_CLOTH_VERTICES * 3);
  private readonly previous = new Float32Array(SILK_CLOTH_VERTICES * 3);
  /** The air around each point, sampled once a frame: it turns slowly. */
  private readonly wind = new Float32Array(SILK_CLOTH_VERTICES * 3);
  // Distance constraints, flat for speed: the two points' offsets into
  // `positions`, rest length, stiffness, and the share of the correction
  // the first point takes while the tip is held.
  private links = new Uint16Array(0);
  private rests = new Float32Array(0);
  private stiffnesses = new Float32Array(0);
  private heldShares = new Float32Array(0);
  /** Furthest each point can be from the tip: silk does not stretch. */
  private tethers = new Float32Array(SILK_CLOTH_VERTICES);
  private builtFor = "";
  private clock = 0;
  private readonly phase: number;
  private pinX = 0;
  private pinY = 0;
  private pinZ = 0;
  // Where the tip was a step earlier and how long ago, so its path between
  // frames can follow the curve it is on rather than cut straight across.
  private lastX = 0;
  private lastY = 0;
  private lastZ = 0;
  private lastDt = 0;
  private started = false;

  constructor(seed: number) {
    this.phase = ((seed * 2.399963) % (Math.PI * 2)) + 0.3;
  }

  /** Lay the streamer out flat, hanging from the tip and trailing `behind`. */
  reset(pin: SilkVector, behind: SilkVector, settings: SilkClothSettings): void {
    this.build(settings);
    let bx = behind.x;
    let by = behind.y - 0.6;
    let bz = behind.z;
    const length = Math.hypot(bx, by, bz) || 1;
    bx /= length;
    by /= length;
    bz /= length;
    // Across the fabric: horizontal and square to the trailing direction.
    let sx = -bz;
    let sz = bx;
    const side = Math.hypot(sx, sz);
    if (side < 1e-4) {
      sx = 1;
      sz = 0;
    } else {
      sx /= side;
      sz /= side;
    }
    for (let row = 0; row < SILK_CLOTH_ROWS; row++) {
      const along = row / (SILK_CLOTH_ROWS - 1);
      const width = settings.width * silkWidthProfile(along);
      for (let column = 0; column < SILK_CLOTH_COLUMNS; column++) {
        const across = (column / (SILK_CLOTH_COLUMNS - 1) - 0.5) * width;
        const o = (row * SILK_CLOTH_COLUMNS + column) * 3;
        this.positions[o] = pin.x + bx * along * settings.length + sx * across;
        this.positions[o + 1] = pin.y + by * along * settings.length;
        this.positions[o + 2] = pin.z + bz * along * settings.length + sz * across;
      }
    }
    this.previous.set(this.positions);
    this.pinX = pin.x;
    this.pinY = pin.y;
    this.pinZ = pin.z;
    this.lastDt = 0;
    this.started = true;
    this.writeNormals();
  }

  /** Carry the whole streamer, motion and all, by an offset: a loop seam. */
  translate(dx: number, dy: number, dz: number): void {
    for (let o = 0; o < this.positions.length; o += 3) {
      this.positions[o] = this.positions[o]! + dx;
      this.positions[o + 1] = this.positions[o + 1]! + dy;
      this.positions[o + 2] = this.positions[o + 2]! + dz;
      this.previous[o] = this.previous[o]! + dx;
      this.previous[o + 1] = this.previous[o + 1]! + dy;
      this.previous[o + 2] = this.previous[o + 2]! + dz;
    }
    this.pinX += dx;
    this.pinY += dy;
    this.pinZ += dz;
    this.lastX += dx;
    this.lastY += dy;
    this.lastZ += dz;
  }

  get isStarted(): boolean {
    return this.started;
  }

  /**
   * Advance the cloth by `dt`. With `pin` null the streamer has been let go
   * and falls freely.
   */
  step(
    pin: SilkVector | null,
    dt: number,
    settings: SilkClothSettings,
    floorY: number
  ): void {
    if (!this.started || dt <= 0) return;
    this.build(settings);
    // Steps of the same length whatever the frame rate, and short enough that
    // the tip never moves more than half a row in one.
    const segment = settings.length / (SILK_CLOTH_ROWS - 1);
    const travel = pin
      ? Math.hypot(pin.x - this.pinX, pin.y - this.pinY, pin.z - this.pinZ)
      : 0;
    const substeps = Math.min(
      10,
      Math.max(1, Math.ceil(dt / MAX_SUBSTEP - 1e-6), Math.ceil(travel / (segment * 0.5)))
    );
    const h = dt / substeps;
    this.sampleWind(settings);
    const startX = this.pinX;
    const startY = this.pinY;
    const startZ = this.pinZ;
    // The parabola through the last three tip positions, when they came at a
    // steady pace; a straight line otherwise.
    const d0 = this.lastDt;
    const curved = pin !== null && d0 > dt * 0.4 && d0 < dt * 2.5;
    for (let s = 1; s <= substeps; s++) {
      this.clock += h;
      this.integrate(h, floorY);
      if (pin && curved) {
        const t = s * h;
        const a = (t * (t - dt)) / (d0 * (d0 + dt));
        const b = -((t + d0) * (t - dt)) / (d0 * dt);
        const c = ((t + d0) * t) / ((d0 + dt) * dt);
        this.pinX = a * this.lastX + b * startX + c * pin.x;
        this.pinY = a * this.lastY + b * startY + c * pin.y;
        this.pinZ = a * this.lastZ + b * startZ + c * pin.z;
      } else if (pin) {
        const t = s / substeps;
        this.pinX = startX + (pin.x - startX) * t;
        this.pinY = startY + (pin.y - startY) * t;
        this.pinZ = startZ + (pin.z - startZ) * t;
      }
      for (let iteration = 0; iteration < ITERATIONS; iteration++) {
        if (pin) this.holdPin();
        this.solve(pin !== null);
        if (pin) this.tether();
      }
      if (pin) this.holdPin();
      this.collideFloor(floorY);
      this.writeNormals();
    }
    this.lastX = startX;
    this.lastY = startY;
    this.lastZ = startZ;
    this.lastDt = pin ? dt : 0;
  }

  private holdPin(): void {
    const o = PIN * 3;
    this.positions[o] = this.pinX;
    this.positions[o + 1] = this.pinY;
    this.positions[o + 2] = this.pinZ;
  }

  /** Pull back any point that has drifted further from the tip than the fabric reaches. */
  private tether(): void {
    const p = this.positions;
    for (let i = 0; i < SILK_CLOTH_VERTICES; i++) {
      const reach = this.tethers[i]!;
      const o = i * 3;
      const dx = p[o]! - this.pinX;
      const dy = p[o + 1]! - this.pinY;
      const dz = p[o + 2]! - this.pinZ;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance <= reach || distance < 1e-9) continue;
      const k = reach / distance;
      p[o] = this.pinX + dx * k;
      p[o + 1] = this.pinY + dy * k;
      p[o + 2] = this.pinZ + dz * k;
    }
  }

  /** Slow-turning air, different at every point of the fabric. */
  private sampleWind(settings: SilkClothSettings): void {
    const p = this.positions;
    const w = this.wind;
    // Gentle: silk feels the slightest draft, and a still staff should hang
    // and sway, not stream out sideways.
    const gust = 0.62 * (0.25 + 1.6 * settings.flutter);
    const time = this.clock;
    for (let o = 0; o < w.length; o += 3) {
      const x = p[o]!;
      const y = p[o + 1]!;
      const z = p[o + 2]!;
      w[o] = gust * Math.sin(2.3 * y + 1.7 * time + this.phase) * Math.cos(1.1 * z + 0.9 * time);
      w[o + 1] = 0.5 * gust * Math.sin(2.9 * z + 2.1 * time + 2 * this.phase);
      w[o + 2] = gust * Math.sin(2.1 * x + 1.3 * time - this.phase) * Math.cos(1.7 * y - 0.7 * time);
    }
  }

  private integrate(h: number, floorY: number): void {
    const p = this.positions;
    const q = this.previous;
    const n = this.normals;
    const w = this.wind;
    const keep = Math.exp(-DAMPING * h);
    for (let i = 0; i < SILK_CLOTH_VERTICES; i++) {
      const o = i * 3;
      const x = p[o]!;
      const y = p[o + 1]!;
      const z = p[o + 2]!;
      let vx = (x - q[o]!) / h;
      let vy = (y - q[o + 1]!) / h;
      let vz = (z - q[o + 2]!) / h;
      const rx = vx - w[o]!;
      const ry = vy - w[o + 1]!;
      const rz = vz - w[o + 2]!;
      const relative = Math.hypot(rx, ry, rz);
      const nx = n[o]!;
      const ny = n[o + 1]!;
      const nz = n[o + 2]!;
      const facing = rx * nx + ry * ny + rz * nz;
      // Pressure drag on the face, capped so it can only stop the fabric
      // moving through the air, never throw it back.
      let push = -NORMAL_DRAG * facing * relative * h;
      if (Math.abs(push) > Math.abs(facing)) push = -facing;
      vx += push * nx - TANGENT_DRAG * rx * h;
      vy += push * ny - TANGENT_DRAG * ry * h + GRAVITY * h;
      vz += push * nz - TANGENT_DRAG * rz * h;
      // Skin friction on the motion along the fabric, capped the same way.
      const sx = rx - facing * nx;
      const sy = ry - facing * ny;
      const sz = rz - facing * nz;
      const rub = Math.min(1, SKIN_DRAG * Math.sqrt(sx * sx + sy * sy + sz * sz) * h);
      vx -= rub * sx;
      vy -= rub * sy;
      vz -= rub * sz;
      q[o] = x;
      q[o + 1] = y;
      q[o + 2] = z;
      p[o] = x + vx * h * keep;
      p[o + 1] = Math.max(floorY + FLOOR_GAP, y + vy * h * keep);
      p[o + 2] = z + vz * h * keep;
    }
  }

  /**
   * One pass over every constraint. A held tip does not give: the fabric
   * beside it takes the whole correction, or the head would hang off it on
   * a spring.
   */
  private solve(held: boolean): void {
    const p = this.positions;
    const links = this.links;
    const rests = this.rests;
    const stiffnesses = this.stiffnesses;
    const shares = this.heldShares;
    for (let c = 0; c < rests.length; c++) {
      const ao = links[c * 2]!;
      const bo = links[c * 2 + 1]!;
      const rest = rests[c]!;
      const dx = p[bo]! - p[ao]!;
      const dy = p[bo + 1]! - p[ao + 1]!;
      const dz = p[bo + 2]! - p[ao + 2]!;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance < 1e-9) continue;
      const k = (stiffnesses[c]! * (distance - rest)) / distance;
      const ka = k * (held ? shares[c]! : 0.5);
      const kb = k - ka;
      p[ao] = p[ao]! + dx * ka;
      p[ao + 1] = p[ao + 1]! + dy * ka;
      p[ao + 2] = p[ao + 2]! + dz * ka;
      p[bo] = p[bo]! - dx * kb;
      p[bo + 1] = p[bo + 1]! - dy * kb;
      p[bo + 2] = p[bo + 2]! - dz * kb;
    }
  }

  private collideFloor(floorY: number): void {
    const p = this.positions;
    const q = this.previous;
    const rest = floorY + FLOOR_GAP;
    for (let o = 0; o < p.length; o += 3) {
      if (p[o + 1]! > rest) continue;
      p[o + 1] = rest;
      // Fabric lying on the floor drags instead of sliding.
      q[o] = p[o]! + (q[o]! - p[o]!) * 0.4;
      q[o + 2] = p[o + 2]! + (q[o + 2]! - p[o + 2]!) * 0.4;
      q[o + 1] = rest;
    }
  }

  /** Grid normals from the neighbors across and along each point. */
  private writeNormals(): void {
    const p = this.positions;
    const n = this.normals;
    const C = SILK_CLOTH_COLUMNS;
    for (let row = 0; row < SILK_CLOTH_ROWS; row++) {
      const up = Math.max(0, row - 1);
      const down = Math.min(SILK_CLOTH_ROWS - 1, row + 1);
      for (let column = 0; column < C; column++) {
        const left = Math.max(0, column - 1);
        const right = Math.min(C - 1, column + 1);
        const r = (row * C + right) * 3;
        const l = (row * C + left) * 3;
        const d = (down * C + column) * 3;
        const u = (up * C + column) * 3;
        const ax = p[r]! - p[l]!;
        const ay = p[r + 1]! - p[l + 1]!;
        const az = p[r + 2]! - p[l + 2]!;
        const bx = p[d]! - p[u]!;
        const by = p[d + 1]! - p[u + 1]!;
        const bz = p[d + 2]! - p[u + 2]!;
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const length = Math.hypot(nx, ny, nz) || 1;
        nx /= length;
        ny /= length;
        nz /= length;
        const o = (row * C + column) * 3;
        n[o] = nx;
        n[o + 1] = ny;
        n[o + 2] = nz;
      }
    }
  }

  private build(settings: SilkClothSettings): void {
    const key = `${settings.length.toFixed(3)}:${settings.width.toFixed(3)}:${settings.tautness.toFixed(2)}`;
    if (key === this.builtFor) return;
    this.builtFor = key;
    const C = SILK_CLOTH_COLUMNS;
    const R = SILK_CLOTH_ROWS;
    // Rest shape: the fabric laid flat, x across and y along.
    const flat = new Float32Array(SILK_CLOTH_VERTICES * 2);
    for (let row = 0; row < R; row++) {
      const along = row / (R - 1);
      const width = settings.width * silkWidthProfile(along);
      for (let column = 0; column < C; column++) {
        const i = (row * C + column) * 2;
        flat[i] = (column / (C - 1) - 0.5) * width;
        flat[i + 1] = along * settings.length;
      }
    }
    const rest = (a: number, b: number) =>
      Math.hypot(flat[a * 2]! - flat[b * 2]!, flat[a * 2 + 1]! - flat[b * 2 + 1]!);
    for (let i = 0; i < SILK_CLOTH_VERTICES; i++) this.tethers[i] = rest(PIN, i) * 1.01;
    const bend = 0.08 + 0.5 * settings.tautness;
    const list: { a: number; b: number; rest: number; stiffness: number }[] = [];
    const add = (a: number, b: number, stiffness: number) =>
      list.push({ a, b, rest: rest(a, b), stiffness });
    for (let row = 0; row < R; row++) {
      for (let column = 0; column < C; column++) {
        const i = row * C + column;
        if (column + 1 < C) add(i, i + 1, 1);
        if (row + 1 < R) add(i, i + C, 1);
        if (row + 1 < R && column + 1 < C) {
          add(i, i + C + 1, 0.7);
          add(i + 1, i + C, 0.7);
        }
        if (column + 2 < C) add(i, i + 2, bend);
        if (row + 2 < R) add(i, i + 2 * C, bend * 0.6);
      }
    }
    // Solve from the pinned head outward so the pull travels down the fabric
    // within one pass instead of creeping a row per iteration.
    list.sort((left, right) => Math.min(left.a, left.b) - Math.min(right.a, right.b));
    this.links = new Uint16Array(list.length * 2);
    this.rests = new Float32Array(list.length);
    this.stiffnesses = new Float32Array(list.length);
    this.heldShares = new Float32Array(list.length);
    list.forEach(({ a, b, rest, stiffness }, c) => {
      this.links[c * 2] = a * 3;
      this.links[c * 2 + 1] = b * 3;
      this.rests[c] = rest;
      this.stiffnesses[c] = stiffness;
      this.heldShares[c] = a === PIN ? 0 : b === PIN ? 1 : 0.5;
    });
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function smoothstep(value: number, minimum: number, maximum: number): number {
  const t = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  return t * t * (3 - 2 * t);
}
