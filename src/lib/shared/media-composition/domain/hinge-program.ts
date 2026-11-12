/**
 * A small solver for one kind of linear program: a few unknowns, many
 * penalties of the form `w * max(0, a·z - b)`, and a handful of hard limits
 * `a·z <= b`. Auto frame's framing problem is this shape: about fifty
 * unknowns (each key's x, y and size) against thousands of "this staff end
 * should be on screen" penalties.
 *
 * It is the textbook barrier method. Every penalty gets its own slack, and
 * because each slack touches only its own penalty, the slacks drop out of
 * every Newton step and the system left to solve is only as big as the
 * unknowns. A general LP solver would carry all the slacks into its
 * factorisation; here a step costs one pass over the penalties and one tiny
 * Cholesky solve, so a take's framing solves in well under a second without
 * a WebAssembly solver.
 */

/** One linear form `Σ val[i] * z[idx[i]] - b`. */
export interface LinearTerm {
  idx: readonly number[];
  val: readonly number[];
  b: number;
}

export interface HingeProgram {
  /** Number of unknowns. */
  n: number;
  /** Linear cost on the unknowns. */
  cost: readonly number[];
  /** Each adds `weight * max(0, a·z - b)` to the cost. */
  hinges: readonly (LinearTerm & { weight: number })[];
  /** Each must hold `a·z <= b`; `start` must satisfy every one strictly. */
  limits: readonly LinearTerm[];
  start: readonly number[];
}

export interface HingeSolution {
  z: number[];
  /** The cost at `z`, penalties included. */
  cost: number;
  /** Upper bound on how far `cost` is above the true optimum. */
  gap: number;
}

interface Packed {
  rowStart: Int32Array;
  idx: Int32Array;
  val: Float64Array;
  b: Float64Array;
}

function pack(rows: readonly LinearTerm[]): Packed {
  let nnz = 0;
  for (const row of rows) nnz += row.idx.length;
  const rowStart = new Int32Array(rows.length + 1);
  const idx = new Int32Array(nnz);
  const val = new Float64Array(nnz);
  const b = new Float64Array(rows.length);
  let at = 0;
  rows.forEach((row, r) => {
    rowStart[r] = at;
    for (let k = 0; k < row.idx.length; k++) {
      idx[at] = row.idx[k]!;
      val[at] = row.val[k]!;
      at++;
    }
    b[r] = row.b;
  });
  rowStart[rows.length] = at;
  return { rowStart, idx, val, b };
}

/** `a·z - b` for every row. */
function residuals(p: Packed, z: Float64Array, out: Float64Array): void {
  for (let r = 0; r < out.length; r++) {
    let sum = -p.b[r]!;
    for (let k = p.rowStart[r]!; k < p.rowStart[r + 1]!; k++)
      sum += p.val[k]! * z[p.idx[k]!]!;
    out[r] = sum;
  }
}

function rowDot(p: Packed, r: number, v: Float64Array): number {
  let sum = 0;
  for (let k = p.rowStart[r]!; k < p.rowStart[r + 1]!; k++)
    sum += p.val[k]! * v[p.idx[k]!]!;
  return sum;
}

/** Adds `scale * a aᵀ` for row r into the dense n×n matrix. */
function addOuter(p: Packed, r: number, scale: number, m: Float64Array, n: number): void {
  const from = p.rowStart[r]!;
  const to = p.rowStart[r + 1]!;
  for (let i = from; i < to; i++) {
    const ri = p.idx[i]! * n;
    const vi = p.val[i]! * scale;
    for (let j = from; j < to; j++) {
      const at = ri + p.idx[j]!;
      m[at] = m[at]! + vi * p.val[j]!;
    }
  }
}

function addRow(p: Packed, r: number, scale: number, v: Float64Array): void {
  for (let k = p.rowStart[r]!; k < p.rowStart[r + 1]!; k++) {
    const at = p.idx[k]!;
    v[at] = v[at]! + scale * p.val[k]!;
  }
}

/** Solves `m x = rhs` in place for a symmetric positive definite m. */
function choleskySolve(m: Float64Array, rhs: Float64Array, n: number): Float64Array {
  let trace = 0;
  for (let i = 0; i < n; i++) trace += m[i * n + i]!;
  const ridge = 1e-13 * (trace / n) + 1e-300;
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = m[i * n + j]!;
      for (let k = 0; k < j; k++) sum -= l[i * n + k]! * l[j * n + k]!;
      if (i === j) l[i * n + i] = Math.sqrt(Math.max(sum + ridge, ridge));
      else l[i * n + j] = sum / l[j * n + j]!;
    }
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = rhs[i]!;
    for (let k = 0; k < i; k++) sum -= l[i * n + k]! * y[k]!;
    y[i] = sum / l[i * n + i]!;
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i]!;
    for (let k = i + 1; k < n; k++) sum -= l[k * n + i]! * x[k]!;
    x[i] = sum / l[i * n + i]!;
  }
  return x;
}

export interface HingeSolveOptions {
  /** Stop once the cost is provably within this of the optimum. */
  gap?: number;
  /** Barrier weight growth per outer round. */
  growth?: number;
}

/**
 * Minimises `cost·z + Σ weight * max(0, a·z - b)` subject to the limits.
 * Throws when `start` is not strictly inside the limits.
 */
export function solveHingeProgram(
  program: HingeProgram,
  options: HingeSolveOptions = {}
): HingeSolution {
  const { n } = program;
  const tolerance = options.gap ?? 1e-6;
  const growth = options.growth ?? 12;
  const H = pack(program.hinges);
  const L = pack(program.limits);
  const nh = program.hinges.length;
  const nl = program.limits.length;
  const weight = Float64Array.from(program.hinges, (h) => h.weight);
  const c = Float64Array.from(program.cost);
  const z = Float64Array.from(program.start);

  const r = new Float64Array(nh);
  const d = new Float64Array(nl);
  residuals(L, z, d);
  for (let i = 0; i < nl; i++) {
    if (!(d[i]! < 0)) throw new Error("The starting point breaks a hard limit.");
    d[i] = -d[i]!;
  }
  residuals(H, z, r);
  // Each penalty's slack s >= 0 and s >= r, started strictly above both.
  const s = new Float64Array(nh);
  for (let j = 0; j < nh; j++) s[j] = Math.max(0, r[j]!) + 1;

  const barrierTerms = 2 * nh + nl;
  const objective = (zz: Float64Array, ss: Float64Array): number => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += c[i]! * zz[i]!;
    for (let j = 0; j < nh; j++) sum += weight[j]! * ss[j]!;
    return sum;
  };
  // Start the barrier where its pull and the cost are about the same size.
  let scale = 0;
  for (let i = 0; i < n; i++) scale += Math.abs(c[i]!);
  for (let j = 0; j < nh; j++) scale += weight[j]!;
  let t = Math.max(1e-6, barrierTerms / Math.max(scale, 1e-9));

  const m = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  const hEff = new Float64Array(nh);
  const gS = new Float64Array(nh);
  const hSS = new Float64Array(nh);
  const hSR = new Float64Array(nh);
  const dr = new Float64Array(nh);
  const ds = new Float64Array(nh);
  const dd = new Float64Array(nl);
  const gZ = new Float64Array(n);
  const zTry = new Float64Array(n);
  const sTry = new Float64Array(nh);
  const rTry = new Float64Array(nh);
  const dTry = new Float64Array(nl);

  const barrier = (zz: Float64Array, ss: Float64Array, rr: Float64Array, d2: Float64Array): number => {
    let sum = t * objective(zz, ss);
    for (let j = 0; j < nh; j++) {
      const p = ss[j]!;
      const q = ss[j]! - rr[j]!;
      if (p <= 0 || q <= 0) return Infinity;
      sum -= Math.log(p) + Math.log(q);
    }
    for (let i = 0; i < nl; i++) {
      if (d2[i]! <= 0) return Infinity;
      sum -= Math.log(d2[i]!);
    }
    return sum;
  };

  for (let round = 0; round < 60; round++) {
    for (let step = 0; step < 80; step++) {
      m.fill(0);
      rhs.fill(0);
      for (let i = 0; i < n; i++) rhs[i] = -t * c[i]!;
      for (let j = 0; j < nh; j++) {
        const p = s[j]!;
        const q = s[j]! - r[j]!;
        const iq2 = 1 / (q * q);
        gS[j] = t * weight[j]! - 1 / p - 1 / q;
        hSS[j] = 1 / (p * p) + iq2;
        hSR[j] = -iq2;
        const gR = 1 / q;
        hEff[j] = iq2 - (iq2 * iq2) / hSS[j]!;
        const gEff = gR - (hSR[j]! * gS[j]!) / hSS[j]!;
        addOuter(H, j, hEff[j]!, m, n);
        addRow(H, j, -gEff, rhs);
      }
      for (let i = 0; i < nl; i++) {
        const inv = 1 / d[i]!;
        addOuter(L, i, inv * inv, m, n);
        addRow(L, i, -inv, rhs);
      }
      const dz = choleskySolve(m, rhs, n);
      // The full gradient in z (not the reduced one in rhs), for the slope.
      gZ.fill(0);
      for (let i = 0; i < n; i++) gZ[i] = t * c[i]!;
      for (let j = 0; j < nh; j++) addRow(H, j, 1 / (s[j]! - r[j]!), gZ);
      for (let i = 0; i < nl; i++) addRow(L, i, 1 / d[i]!, gZ);
      // slope = gradient · step; the Newton decrement is its negative.
      let slope = 0;
      for (let i = 0; i < n; i++) slope += gZ[i]! * dz[i]!;
      for (let j = 0; j < nh; j++) {
        dr[j] = rowDot(H, j, dz);
        ds[j] = -(gS[j]! + hSR[j]! * dr[j]!) / hSS[j]!;
        slope += gS[j]! * ds[j]!;
      }
      const decrement = -slope;
      for (let i = 0; i < nl; i++) dd[i] = -rowDot(L, i, dz);

      // The furthest step that keeps every slack positive.
      let reach = 1;
      for (let j = 0; j < nh; j++) {
        if (ds[j]! < 0) reach = Math.min(reach, -s[j]! / ds[j]!);
        const dq = ds[j]! - dr[j]!;
        if (dq < 0) reach = Math.min(reach, -(s[j]! - r[j]!) / dq);
      }
      for (let i = 0; i < nl; i++)
        if (dd[i]! < 0) reach = Math.min(reach, -d[i]! / dd[i]!);
      let alpha = reach < 1 ? 0.99 * reach : 1;

      if (decrement / 2 < 1e-9) break;
      const before = barrier(z, s, r, d);
      let accepted = false;
      for (let tries = 0; tries < 60; tries++) {
        for (let i = 0; i < n; i++) zTry[i] = z[i]! + alpha * dz[i]!;
        for (let j = 0; j < nh; j++) {
          sTry[j] = s[j]! + alpha * ds[j]!;
          rTry[j] = r[j]! + alpha * dr[j]!;
        }
        for (let i = 0; i < nl; i++) dTry[i] = d[i]! + alpha * dd[i]!;
        const after = barrier(zTry, sTry, rTry, dTry);
        if (after <= before + 1e-4 * alpha * slope) {
          accepted = true;
          break;
        }
        alpha *= 0.5;
      }
      if (!accepted) break;
      z.set(zTry);
      s.set(sTry);
      // Recompute exactly to stop rounding drift in the residuals.
      residuals(H, z, r);
      residuals(L, z, d);
      for (let i = 0; i < nl; i++) d[i] = -d[i]!;
      for (let j = 0; j < nh; j++) {
        // A slack must stay above its residual; nudge it back if drift crossed.
        if (s[j]! - r[j]! <= 0) s[j] = r[j]! + 1e-14 * (1 + Math.abs(r[j]!));
      }
    }
    if (barrierTerms / t < tolerance) break;
    t *= growth;
  }

  // Report the cost with each slack at its exact penalty.
  const zOut = Array.from(z);
  let cost = 0;
  for (let i = 0; i < n; i++) cost += c[i]! * z[i]!;
  residuals(H, z, r);
  for (let j = 0; j < nh; j++) cost += weight[j]! * Math.max(0, r[j]!);
  return { z: zOut, cost, gap: barrierTerms / t };
}
