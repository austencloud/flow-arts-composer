/**
 * Curl-noise sampling utility for smoke motion.
 *
 * Shared between 2D (Smoke2DRenderer) and 3D (SmokeRenderer3D). Authentic
 * swirling smoke requires a divergence-free velocity field - plain
 * simplex noise produces sources and sinks, which stack particles on hot
 * spots instead of curling around them. Curl-noise solves this by taking
 * the rotation of a potential field: the resulting velocity is zero-
 * divergence by construction, so particles follow swirls without
 * converging.
 *
 * This implementation uses a small inline 2D simplex (Stefan Gustavson's
 * construction, 2005) to avoid pulling a noise npm package. Tests cover
 * determinism and curl-structure (small ring of samples should sum to ~0
 * divergence along a radial integration).
 *
 * ### Performance notes (2D)
 *
 * 2048 particles × 2 simplex calls per curl × 60fps = 245k calls/sec.
 * Each call is ~0.5µs in V8 → ~120ms/sec of raw noise cost. At low/medium
 * tiers (512/1024 particles) it's tractable (<30ms/frame). At high (2048)
 * it approaches the spec's "tight" budget. If profiling shows this
 * dominates, `SampledCurlGrid2D` pre-bakes a 256×256 RGBA field of
 * (vx,vy) pairs at grid-node resolution, which makes per-particle
 * sampling a bilinear lookup - roughly 30x faster for the same quality.
 * The grid is regenerated whenever `time` advances past `regenerateEvery`
 * seconds so the field still evolves.
 */

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

// Stefan Gustavson permutation. 512 entries (duplicated 256) so index
// arithmetic wraps without a modulo.
const PERM = new Uint8Array(512);
{
  const seed = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140,
    36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120,
    234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33,
    88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71,
    134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133,
    230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161,
    1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130,
    116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250,
    124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227,
    47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44,
    154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98,
    108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34,
    242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235, 249, 14,
    239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121,
    50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243,
    141, 128, 195, 78, 66, 215, 61, 156, 180,
  ];
  for (let i = 0; i < 512; i++) PERM[i] = seed[i & 255]!;
}

const GRAD2 = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Classic 2D simplex noise. Returns a scalar in roughly [-1, 1].
 *
 * Deterministic for a given (x, y): same input → same output. Used as
 * the scalar potential whose perpendicular gradient is curl-noise.
 */
export function simplex2D(x: number, y: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  const gi0 = PERM[ii + (PERM[jj]! & 255)]! % 8;
  const gi1 = PERM[ii + i1 + (PERM[jj + j1]! & 255)]! % 8;
  const gi2 = PERM[ii + 1 + (PERM[jj + 1]! & 255)]! % 8;
  const g0 = GRAD2[gi0]!;
  const g1 = GRAD2[gi1]!;
  const g2 = GRAD2[gi2]!;
  let n0 = 0;
  let n1 = 0;
  let n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    t0 *= t0;
    n0 = t0 * t0 * (g0[0]! * x0 + g0[1]! * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    t1 *= t1;
    n1 = t1 * t1 * (g1[0]! * x1 + g1[1]! * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    t2 *= t2;
    n2 = t2 * t2 * (g2[0]! * x2 + g2[1]! * y2);
  }
  return 70 * (n0 + n1 + n2);
}

/**
 * 2D curl-noise velocity from a scalar potential.
 *
 * Curl of a 2D scalar field φ is (∂φ/∂y, −∂φ/∂x). We animate the field
 * in time by evaluating a 3D-projection - offsetting the simplex lookup
 * by a time-dependent shift in a third pseudo-axis via a second sample
 * at an orthogonal phase. The result is a smoothly-evolving divergence-
 * free field in the XY plane.
 *
 * `eps` is the finite-difference step size; 0.0001 is small enough for
 * visual quality and large enough to dodge floating-point noise on the
 * gradient.
 */
export function curl2D(
  x: number,
  y: number,
  time: number,
  eps = 0.0001
): { vx: number; vy: number } {
  // Two potentials, one shifted in "z" (via a large constant offset +
  // time drift). Subtracting lets the field evolve without repeating.
  const tz = time * 0.3;
  const phi = (px: number, py: number) =>
    simplex2D(px + tz, py - tz) + simplex2D(px + 97.3, py - 31.7 + tz);
  const dPhi_dy = (phi(x, y + eps) - phi(x, y - eps)) / (2 * eps);
  const dPhi_dx = (phi(x + eps, y) - phi(x - eps, y)) / (2 * eps);
  return { vx: dPhi_dy, vy: -dPhi_dx };
}

/**
 * Pre-baked curl-noise field on a regular grid, with bilinear sampling.
 *
 * The grid stores the (vx, vy) output of `curl2D` at each node. Per-
 * particle sampling becomes 4 node lookups + 2 lerps - roughly 30x
 * faster than re-evaluating simplex on every particle every frame.
 *
 * Regeneration is amortized: the grid lives for `regenerateEvery` seconds
 * of simulation time, then is re-baked against the new `time` value.
 * With `regenerateEvery = 1/3` (≈3 Hz) and a 64×64 grid, that's ~12k
 * simplex calls per regeneration - one 4ms hiccup every 333ms, versus
 * 245k calls/sec continuously.
 *
 * World-space → grid-space mapping: the `domainSize` is the world-units
 * the grid covers along one axis. Particles outside the domain wrap
 * modulo domainSize so the field tiles seamlessly.
 */
export class SampledCurlGrid2D {
  private readonly size: number;
  private readonly domain: number;
  private readonly cells: Float32Array; // size*size*2 - (vx, vy) per node
  private bakedAt = -Infinity;
  private readonly regenerateEvery: number;

  constructor(size = 64, domainSize = 8, regenerateEvery = 1 / 3) {
    this.size = size;
    this.domain = domainSize;
    this.regenerateEvery = regenerateEvery;
    this.cells = new Float32Array(size * size * 2);
  }

  /** Force a regeneration even if `time` hasn't advanced enough. */
  bake(time: number): void {
    const n = this.size;
    const step = this.domain / n;
    let w = 0;
    for (let j = 0; j < n; j++) {
      const y = j * step;
      for (let i = 0; i < n; i++) {
        const x = i * step;
        const { vx, vy } = curl2D(x, y, time);
        this.cells[w++] = vx;
        this.cells[w++] = vy;
      }
    }
    this.bakedAt = time;
  }

  /**
   * Sample the field at world position (x, y) with bilinear
   * interpolation. Rebakes the grid if `time` has moved past the
   * regeneration window since the last bake.
   */
  sample(x: number, y: number, time: number): { vx: number; vy: number } {
    return this.sampleInto(x, y, time, { vx: 0, vy: 0 });
  }

  /**
   * Allocation-free form for dense typed-array simulations. Callers keep one
   * scratch object and receive the same bilinear field as `sample()`.
   */
  sampleInto<T extends { vx: number; vy: number }>(
    x: number,
    y: number,
    time: number,
    target: T
  ): T {
    if (time - this.bakedAt >= this.regenerateEvery) {
      this.bake(time);
    }
    const n = this.size;
    const step = this.domain / n;
    // Wrap into [0, domain)
    const u = ((x % this.domain) + this.domain) % this.domain;
    const v = ((y % this.domain) + this.domain) % this.domain;
    const gx = u / step;
    const gy = v / step;
    const i0 = Math.floor(gx) % n;
    const j0 = Math.floor(gy) % n;
    const i1 = (i0 + 1) % n;
    const j1 = (j0 + 1) % n;
    const fx = gx - Math.floor(gx);
    const fy = gy - Math.floor(gy);
    const a = (j0 * n + i0) * 2;
    const b = (j0 * n + i1) * 2;
    const c = (j1 * n + i0) * 2;
    const d = (j1 * n + i1) * 2;
    const vx0 = this.cells[a]! * (1 - fx) + this.cells[b]! * fx;
    const vx1 = this.cells[c]! * (1 - fx) + this.cells[d]! * fx;
    const vy0 = this.cells[a + 1]! * (1 - fx) + this.cells[b + 1]! * fx;
    const vy1 = this.cells[c + 1]! * (1 - fx) + this.cells[d + 1]! * fx;
    target.vx = vx0 * (1 - fy) + vx1 * fy;
    target.vy = vy0 * (1 - fy) + vy1 * fy;
    return target;
  }
}

/**
 * Curl field that changes smoothly over time. SampledCurlGrid2D swaps in a
 * new bake at once, so anything that follows the air closely (fire gas
 * matches it within a few hundredths of a second) jerks to a new direction
 * at every bake. This keeps two bakes, one at the start of a window and one
 * at its end, and blends between them, so the air never jumps.
 */
export class BlendedCurlGrid2D {
  private from: SampledCurlGrid2D;
  private to: SampledCurlGrid2D;
  private fromTime = Infinity;

  constructor(
    size = 64,
    domainSize = 8,
    private readonly keyframeEvery = 1 / 3
  ) {
    // Baked only here, never by their own clock.
    this.from = new SampledCurlGrid2D(size, domainSize, Infinity);
    this.to = new SampledCurlGrid2D(size, domainSize, Infinity);
  }

  sampleInto<T extends { vx: number; vy: number }>(
    x: number,
    y: number,
    time: number,
    target: T
  ): T {
    const span = this.keyframeEvery;
    if (time >= this.fromTime + span && time < this.fromTime + 2 * span) {
      // The next window: the old end bake becomes the start.
      const previous = this.from;
      this.from = this.to;
      this.to = previous;
      this.fromTime += span;
      this.to.bake(this.fromTime + span);
    } else if (!(time >= this.fromTime && time < this.fromTime + span)) {
      // First sample, a reset or a long gap: start a window here.
      this.fromTime = time;
      this.from.bake(time);
      this.to.bake(time + span);
    }
    const w = (time - this.fromTime) / span;
    const a = this.from.sampleInto(x, y, time, target);
    const ax = a.vx;
    const ay = a.vy;
    const b = this.to.sampleInto(x, y, time, target);
    target.vx = ax + (b.vx - ax) * w;
    target.vy = ay + (b.vy - ay) * w;
    return target;
  }
}
