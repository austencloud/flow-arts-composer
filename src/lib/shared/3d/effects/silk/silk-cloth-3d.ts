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

export const SILK_CLOTH_ROWS = 26;
export const SILK_CLOTH_COLUMNS = 7;
export const SILK_CLOTH_VERTICES = SILK_CLOTH_ROWS * SILK_CLOTH_COLUMNS;
const PIN = (SILK_CLOTH_COLUMNS - 1) / 2;
const GRAVITY = -9.8;
const ITERATIONS = 7;
/** Silk is light: drag per unit mass for a patch facing the air, 1/m. */
const NORMAL_DRAG = 9;
const TANGENT_DRAG = 0.35;
const FLOOR_GAP = 0.004;

/** How wide the fabric is at a point along it, 0 at the tip to 1 at the tail. */
export function silkWidthProfile(along: number): number {
  const gather = 0.18 + 0.82 * smoothstep(along, 0, 0.16);
  const taper = 1 - 0.45 * smoothstep(along, 0.55, 1);
  return gather * taper;
}

interface Constraint {
  a: number;
  b: number;
  rest: number;
  stiffness: number;
}

export class SilkCloth3D {
  readonly positions = new Float32Array(SILK_CLOTH_VERTICES * 3);
  readonly normals = new Float32Array(SILK_CLOTH_VERTICES * 3);
  private readonly previous = new Float32Array(SILK_CLOTH_VERTICES * 3);
  private constraints: Constraint[] = [];
  private builtFor = "";
  private clock = 0;
  private readonly phase: number;
  private pinX = 0;
  private pinY = 0;
  private pinZ = 0;
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
    this.started = true;
    this.writeNormals();
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
    // Enough substeps that the tip never moves more than half a row per step.
    const segment = settings.length / (SILK_CLOTH_ROWS - 1);
    const travel = pin
      ? Math.hypot(pin.x - this.pinX, pin.y - this.pinY, pin.z - this.pinZ)
      : 0;
    const substeps = Math.min(6, Math.max(2, Math.ceil(travel / (segment * 0.5))));
    const h = dt / substeps;
    const startX = this.pinX;
    const startY = this.pinY;
    const startZ = this.pinZ;
    for (let s = 1; s <= substeps; s++) {
      this.clock += h;
      this.integrate(h, settings, floorY);
      if (pin) {
        const t = s / substeps;
        this.pinX = startX + (pin.x - startX) * t;
        this.pinY = startY + (pin.y - startY) * t;
        this.pinZ = startZ + (pin.z - startZ) * t;
      }
      for (let iteration = 0; iteration < ITERATIONS; iteration++) {
        if (pin) this.holdPin();
        this.solve();
      }
      if (pin) this.holdPin();
      this.collideFloor(floorY);
      this.writeNormals();
    }
  }

  private holdPin(): void {
    const o = PIN * 3;
    this.positions[o] = this.pinX;
    this.positions[o + 1] = this.pinY;
    this.positions[o + 2] = this.pinZ;
  }

  private integrate(h: number, settings: SilkClothSettings, floorY: number): void {
    const p = this.positions;
    const q = this.previous;
    const n = this.normals;
    const gust = 0.25 + 1.6 * settings.flutter;
    const time = this.clock;
    for (let i = 0; i < SILK_CLOTH_VERTICES; i++) {
      const o = i * 3;
      const x = p[o]!;
      const y = p[o + 1]!;
      const z = p[o + 2]!;
      let vx = (x - q[o]!) / h;
      let vy = (y - q[o + 1]!) / h;
      let vz = (z - q[o + 2]!) / h;
      // Slow-turning air, different at every point of the fabric.
      const wx = gust * Math.sin(2.3 * y + 1.7 * time + this.phase) * Math.cos(1.1 * z + 0.9 * time);
      const wy = 0.5 * gust * Math.sin(2.9 * z + 2.1 * time + 2 * this.phase);
      const wz = gust * Math.sin(2.1 * x + 1.3 * time - this.phase) * Math.cos(1.7 * y - 0.7 * time);
      const rx = vx - wx;
      const ry = vy - wy;
      const rz = vz - wz;
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
      q[o] = x;
      q[o + 1] = y;
      q[o + 2] = z;
      p[o] = x + vx * h * 0.996;
      p[o + 1] = Math.max(floorY + FLOOR_GAP, y + vy * h * 0.996);
      p[o + 2] = z + vz * h * 0.996;
    }
  }

  private solve(): void {
    const p = this.positions;
    for (const { a, b, rest, stiffness } of this.constraints) {
      const ao = a * 3;
      const bo = b * 3;
      const dx = p[bo]! - p[ao]!;
      const dy = p[bo + 1]! - p[ao + 1]!;
      const dz = p[bo + 2]! - p[ao + 2]!;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance < 1e-9) continue;
      const k = (0.5 * stiffness * (distance - rest)) / distance;
      p[ao] = p[ao]! + dx * k;
      p[ao + 1] = p[ao + 1]! + dy * k;
      p[ao + 2] = p[ao + 2]! + dz * k;
      p[bo] = p[bo]! - dx * k;
      p[bo + 1] = p[bo + 1]! - dy * k;
      p[bo + 2] = p[bo + 2]! - dz * k;
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
    const bend = 0.08 + 0.5 * settings.tautness;
    const list: Constraint[] = [];
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
    this.constraints = list;
  }
}

function smoothstep(value: number, minimum: number, maximum: number): number {
  const t = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  return t * t * (3 - 2 * t);
}
