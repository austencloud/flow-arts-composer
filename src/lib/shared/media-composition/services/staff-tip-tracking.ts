/**
 * Staff Tip Tracking — two-staff tracker + gap fill
 *
 * Pure port of the Python reference `track.py` (the `Staff` class and its
 * forward-only `run_staff` pass) and `smooth_gaps.py` (cubic gap fill),
 * turning a per-frame list of colour blobs (from `staff-tip-detection.ts`)
 * into the two staffs' end positions over time.
 *
 * Why a model instead of nearest-neighbour: a spinning staff's two ends move
 * as a rigid body (one centre, one angle, one half-length), so predicting
 * both ends from the model and gating new detections against that
 * prediction survives the staffs crossing, one end blinking out behind the
 * other, and motion blur — a per-tip nearest-neighbour tracker (the
 * baseline `run_naive` in track.py, not ported here) loses identity across
 * those the moment two candidate blobs pass close together, which is
 * exactly when it matters most. `track.py`'s own metrics confirm zero
 * identity flips between the two approaches on the reference clip, but the
 * staff model gets there without ever having to reason about the crossing
 * specially.
 *
 * Every constant below (HOT_STRONG, the MIX threshold, the weak-candidate
 * rule, the gate formula, OM_MAX, the foreshortened |L|<18 case) is copied
 * verbatim from `track.py`.
 */

import type { DetectionBlob } from "./staff-tip-detection";
import {
  TIP_FILLED,
  TIP_MISSING,
  TIP_SEEN,
  type StaffColor,
  type StaffTipSeries,
} from "../domain/staff-tip-track";

export interface Vec2 {
  x: number;
  y: number;
}

function vAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function vSub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function vScale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}
function vNorm(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

/** Python-style modulo (result always has the sign of the divisor). */
function pymod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
/** Wrap an angle to (-pi, pi], matching track.py's `wrap`. */
function wrapAngle(a: number): number {
  return pymod(a + Math.PI, 2 * Math.PI) - Math.PI;
}

const HOT_STRONG = 20;
/** A blob with both red and blue halo is two touching ends: offer it to both staffs. */
const MIX_THRESHOLD = 0.08;
const WEAK_STRENGTH_MIN = 110;
const WEAK_AREA_MIN = 60;
const OM_MAX = (60 * Math.PI) / 180;
/** A staff turning toward the camera shrinks through zero and comes out the
 * other side, so the ends swap screen sides without the projected angle
 * turning 180 — tracking a *signed* half-length instead of a fixed length
 * models that instead of fighting it. */
const SIGNED_LENGTH = true;
/** Below this, both ends are effectively in one blob (foreshortened staff). */
const FORESHORTENED_LENGTH = 18;

function candidatesForColour(
  frame: readonly DetectionBlob[],
  colour: "red" | "blue",
): { strong: DetectionBlob[]; weak: DetectionBlob[] } {
  const strong = frame.filter((d) => (d.colour === colour || d.mix >= MIX_THRESHOLD) && d.hot >= HOT_STRONG);
  const weak = frame.filter(
    (d) => d.colour === colour && d.hot < HOT_STRONG && d.strength >= WEAK_STRENGTH_MIN && d.area >= WEAK_AREA_MIN,
  );
  return { strong, weak };
}

/** The up-to-4 best candidate points for a colour in one frame, strongest (by hot-pixel count) first. */
function poolForColour(frame: readonly DetectionBlob[], colour: "red" | "blue"): Vec2[] {
  const { strong, weak } = candidatesForColour(frame, colour);
  let pool: DetectionBlob[];
  if (strong.length >= 2) {
    pool = strong;
  } else {
    const weakByArea = [...weak].sort((a, b) => b.area - a.area);
    pool = [...strong, ...weakByArea.slice(0, 2 - strong.length)];
  }
  return [...pool]
    .sort((a, b) => b.hot - a.hot)
    .slice(0, 4)
    .map((d) => ({ x: d.x, y: d.y }));
}

export type EndStatus = "meas" | "inferred" | "merged" | "coast" | "none";

export interface FrameTrackResult {
  A: Vec2 | null;
  B: Vec2 | null;
  faStatus: EndStatus;
  fbStatus: EndStatus;
}

/**
 * One staff's rigid-body model: a centre, a signed half-length and an
 * angle, each with its own smoothed rate of change so the model can predict
 * one step ahead and gate incoming detections against that prediction.
 * Port of track.py's `Staff` class (forward pass only — the reference
 * script's backward pass and naive baseline were validation tools, not part
 * of the tracker itself).
 */
class Staff {
  private ok = false;
  private c: Vec2 = { x: 0, y: 0 };
  private th = 0;
  private L = 0;
  private vc: Vec2 = { x: 0, y: 0 };
  private om = 0;
  private dL = 0;

  private ends(c: Vec2, th: number, L: number): [Vec2, Vec2] {
    const u = { x: Math.cos(th) * L, y: Math.sin(th) * L };
    return [vAdd(c, u), vSub(c, u)];
  }

  private init(a: Vec2, b: Vec2): void {
    this.c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const h = { x: (a.x - b.x) / 2, y: (a.y - b.y) / 2 };
    this.th = Math.atan2(h.y, h.x);
    this.L = Math.hypot(h.x, h.y);
    this.vc = { x: 0, y: 0 };
    this.om = 0;
    this.dL = 0;
    this.ok = true;
  }

  private gate(): number {
    return 90 + 1.2 * vNorm(this.vc) + Math.abs(this.om) * Math.abs(this.L) * 1.5 + Math.abs(this.dL);
  }

  step(pool: readonly Vec2[], alpha = 0.75): FrameTrackResult {
    if (!this.ok) {
      if (pool.length >= 2) {
        this.init(pool[0]!, pool[1]!);
        const [A, B] = this.ends(this.c, this.th, this.L);
        return { A, B, faStatus: "meas", fbStatus: "meas" };
      }
      return { A: null, B: null, faStatus: "none", fbStatus: "none" };
    }

    const cp = vAdd(this.c, this.vc);
    const thp = this.th + this.om;
    const Lp = this.L + (SIGNED_LENGTH ? this.dL : 0);
    const [Ap, Bp] = this.ends(cp, thp, Lp);
    const g = this.gate();

    if (pool.length >= 2) {
      let bestCost = Infinity;
      let bestSwapped = Infinity;
      let bi = -1;
      let bj = -1;
      for (let i = 0; i < pool.length; i++) {
        for (let j = 0; j < pool.length; j++) {
          if (i === j) continue;
          const cost = vNorm(vSub(pool[i]!, Ap)) + vNorm(vSub(pool[j]!, Bp));
          const swapped = vNorm(vSub(pool[j]!, Ap)) + vNorm(vSub(pool[i]!, Bp));
          if (cost < bestCost) {
            bestCost = cost;
            bestSwapped = swapped;
            bi = i;
            bj = j;
          }
        }
      }
      void bestSwapped; // kept for parity with track.py's margin; unused downstream
      if (bestCost / 2 <= g) {
        const A = pool[bi]!;
        const B = pool[bj]!;
        this.update(A, B, alpha, thp, false);
        return { A, B, faStatus: "meas", fbStatus: "meas" };
      }
    }

    if (pool.length >= 1) {
      const dA = pool.map((p) => vNorm(vSub(p, Ap)));
      const dB = pool.map((p) => vNorm(vSub(p, Bp)));
      let ia = 0;
      for (let i = 1; i < dA.length; i++) if (dA[i]! < dA[ia]!) ia = i;
      let ib = 0;
      for (let i = 1; i < dB.length; i++) if (dB[i]! < dB[ib]!) ib = i;

      if (Math.min(dA[ia]!, dB[ib]!) < g) {
        const u = { x: Math.cos(thp) * Lp, y: Math.sin(thp) * Lp };
        if (Math.abs(Lp) < FORESHORTENED_LENGTH) {
          const chosen = dA[ia]! <= dB[ib]! ? pool[ia]! : pool[ib]!;
          this.update(chosen, chosen, alpha * 0.5, thp, true);
          return { A: chosen, B: chosen, faStatus: "merged", fbStatus: "merged" };
        }
        let A: Vec2;
        let B: Vec2;
        let faStatus: EndStatus;
        let fbStatus: EndStatus;
        if (dA[ia]! <= dB[ib]!) {
          A = pool[ia]!;
          B = vSub(A, vScale(u, 2));
          faStatus = "meas";
          fbStatus = "inferred";
        } else {
          B = pool[ib]!;
          A = vAdd(B, vScale(u, 2));
          faStatus = "inferred";
          fbStatus = "meas";
        }
        this.update(A, B, alpha * 0.6, thp, true);
        return { A, B, faStatus, fbStatus };
      }
    }

    // Nothing usable this frame: coast the model forward and decay its rates.
    this.c = cp;
    this.th = thp;
    this.om *= 0.9;
    this.vc = vScale(this.vc, 0.8);
    this.dL *= 0.5;
    const [A, B] = this.ends(this.c, this.th, this.L);
    return { A, B, faStatus: "coast", fbStatus: "coast" };
  }

  private update(A: Vec2, B: Vec2, alpha: number, thp: number, keepL: boolean): void {
    const c = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const h = { x: (A.x - B.x) / 2, y: (A.y - B.y) / 2 };
    let th = Math.atan2(h.y, h.x);
    let L = Math.hypot(h.x, h.y);
    if (SIGNED_LENGTH) {
      // (th, L) and (th+pi, -L) are the same vector: keep the angle within
      // 90 degrees of the prediction rather than letting it flip.
      let d = wrapAngle(th - thp);
      if (Math.abs(d) > Math.PI / 2) {
        th += Math.PI;
        L = -L;
        d = wrapAngle(th - thp);
      }
      th = thp + d;
    } else {
      th = thp + wrapAngle(th - thp);
    }
    // A short (foreshortened) staff has an unreliable angle: trust its turn rate less.
    const k = Math.abs(L) / (Math.abs(L) + 30);
    this.vc = { x: alpha * (c.x - this.c.x) + (1 - alpha) * this.vc.x, y: alpha * (c.y - this.c.y) + (1 - alpha) * this.vc.y };
    let om = alpha * k * (th - this.th) + (1 - alpha * k) * this.om;
    om = Math.max(-OM_MAX, Math.min(OM_MAX, om));
    this.om = om;
    const newL = keepL ? 0.8 * this.L + 0.2 * L : L;
    this.dL = alpha * (newL - this.L) + (1 - alpha) * this.dL;
    this.c = c;
    this.th = th;
    this.L = newL;
  }
}

/** Runs one staff's forward tracking pass across every frame's detections. */
export function runForwardTracker(
  detectionsPerFrame: readonly (readonly DetectionBlob[])[],
  colour: "red" | "blue",
): FrameTrackResult[] {
  const staff = new Staff();
  const results: FrameTrackResult[] = [];
  for (const frame of detectionsPerFrame) {
    results.push(staff.step(poolForColour(frame, colour)));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Gap fill — port of smooth_gaps.py, with one deliberate deviation: the
// Python script interpolates every non-"meas" frame between the first and
// last measured sample, no matter how long the gap. In the browser we cap
// that at MAX_FILLED_GAP samples; a longer gap is left TIP_MISSING rather
// than asking a spline to invent several seconds of staff motion.
// ---------------------------------------------------------------------------

export const MAX_FILLED_GAP = 5;

/**
 * A not-a-knot cubic spline through (t_i, y_i) — the same boundary
 * condition `scipy.interpolate.CubicSpline` defaults to. Degenerates to a
 * line for 2 points and to the unique quadratic through all 3 points for 3
 * (both are what scipy itself does at those sizes). `t` must be strictly
 * increasing.
 */
function fitNotAKnotSpline(t: readonly number[], y: readonly number[]): (query: number) => number {
  const n = t.length;
  if (n === 1) {
    const y0 = y[0]!;
    return () => y0;
  }
  if (n === 2) {
    const [t0, t1] = [t[0]!, t[1]!];
    const [y0, y1] = [y[0]!, y[1]!];
    return (q: number) => y0 + ((y1 - y0) * (q - t0)) / (t1 - t0);
  }
  if (n === 3) {
    const [t0, t1, t2] = [t[0]!, t[1]!, t[2]!];
    const [y0, y1, y2] = [y[0]!, y[1]!, y[2]!];
    return (q: number) =>
      y0 * (((q - t1) * (q - t2)) / ((t0 - t1) * (t0 - t2))) +
      y1 * (((q - t0) * (q - t2)) / ((t1 - t0) * (t1 - t2))) +
      y2 * (((q - t0) * (q - t1)) / ((t2 - t0) * (t2 - t1)));
  }

  const h: number[] = [];
  for (let i = 0; i < n - 1; i++) h.push(t[i + 1]! - t[i]!);

  // Standard interior cubic-spline rows (i = 1..n-2), in second derivatives M:
  //   h[i-1] M[i-1] + 2(h[i-1]+h[i]) M[i] + h[i] M[i+1] = d[i]
  const d: number[] = new Array(n).fill(0);
  for (let i = 1; i <= n - 2; i++) {
    d[i] = 6 * ((y[i + 1]! - y[i]!) / h[i]! - (y[i]! - y[i - 1]!) / h[i - 1]!);
  }

  // Not-a-knot eliminates M[0] and M[n-1] via the boundary rows, leaving a
  // plain tridiagonal system for M[1..n-2] that the Thomas algorithm solves
  // in O(n). See the derivation of `scipy.interpolate.CubicSpline`'s
  // default boundary condition for the two elimination identities below.
  const size = n - 2;
  const sub = new Array<number>(size).fill(0);
  const diag = new Array<number>(size).fill(0);
  const sup = new Array<number>(size).fill(0);
  const rhs = new Array<number>(size).fill(0);
  for (let k = 0; k < size; k++) {
    const i = k + 1;
    sub[k] = h[i - 1]!;
    diag[k] = 2 * (h[i - 1]! + h[i]!);
    sup[k] = h[i]!;
    rhs[k] = d[i]!;
  }

  {
    const h0 = h[0]!;
    const h1 = h[1]!;
    diag[0]! += (h0 * (h0 + h1)) / h1;
    sup[0]! -= (h0 * h0) / h1;
    sub[0] = 0;
  }
  {
    const hLast = h[n - 2]!;
    const hPrev = h[n - 3]!;
    diag[size - 1]! += (hLast * (hLast + hPrev)) / hPrev;
    sub[size - 1]! -= (hLast * hLast) / hPrev;
    sup[size - 1] = 0;
  }

  const cPrime = new Array<number>(size).fill(0);
  const dPrime = new Array<number>(size).fill(0);
  cPrime[0] = sup[0]! / diag[0]!;
  dPrime[0] = rhs[0]! / diag[0]!;
  for (let k = 1; k < size; k++) {
    const denom = diag[k]! - sub[k]! * cPrime[k - 1]!;
    cPrime[k] = sup[k]! / denom;
    dPrime[k] = (rhs[k]! - sub[k]! * dPrime[k - 1]!) / denom;
  }
  const interior = new Array<number>(size).fill(0);
  interior[size - 1] = dPrime[size - 1]!;
  for (let k = size - 2; k >= 0; k--) {
    interior[k] = dPrime[k]! - cPrime[k]! * interior[k + 1]!;
  }

  const M = new Array<number>(n).fill(0);
  for (let k = 0; k < size; k++) M[k + 1] = interior[k]!;
  M[0] = ((h[0]! + h[1]!) * M[1]! - h[0]! * M[2]!) / h[1]!;
  M[n - 1] = ((h[n - 2]! + h[n - 3]!) * M[n - 2]! - h[n - 2]! * M[n - 3]!) / h[n - 3]!;

  return (q: number): number => {
    let i: number;
    if (q <= t[0]!) i = 0;
    else if (q >= t[n - 1]!) i = n - 2;
    else {
      let lo = 0;
      let hi = n - 2;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (t[mid]! <= q) lo = mid;
        else hi = mid - 1;
      }
      i = lo;
    }
    const hi_ = h[i]!;
    const a = (t[i + 1]! - q) / hi_;
    const b = (q - t[i]!) / hi_;
    return a * y[i]! + b * y[i + 1]! + (((a ** 3 - a) * M[i]! + (b ** 3 - b) * M[i + 1]!) * (hi_ * hi_)) / 6;
  };
}

/**
 * One end's series, in analysis-pixel space, with gaps of at most
 * `MAX_FILLED_GAP` samples cubic-filled between measured neighbours. Longer
 * gaps and any run before the first or after the last measurement stay
 * TIP_MISSING, matching smooth_gaps.py's `t_m[0] < t < t_m[-1]` bound.
 */
export function buildTipSeriesPixels(frames: readonly FrameTrackResult[], end: "A" | "B"): StaffTipSeries {
  const n = frames.length;
  const x = new Array<number>(n).fill(-1);
  const y = new Array<number>(n).fill(-1);
  const state = new Array<number>(n).fill(TIP_MISSING);

  const measuredIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const frame = frames[i]!;
    const status = end === "A" ? frame.faStatus : frame.fbStatus;
    const point = end === "A" ? frame.A : frame.B;
    if (status === "meas" && point) {
      x[i] = point.x;
      y[i] = point.y;
      state[i] = TIP_SEEN;
      measuredIdx.push(i);
    }
  }

  if (measuredIdx.length >= 2) {
    const tKnots = measuredIdx;
    const xKnots = measuredIdx.map((i) => x[i]!);
    const yKnots = measuredIdx.map((i) => y[i]!);
    const splineX = fitNotAKnotSpline(tKnots, xKnots);
    const splineY = fitNotAKnotSpline(tKnots, yKnots);

    for (let k = 0; k < measuredIdx.length - 1; k++) {
      const lo = measuredIdx[k]!;
      const hi = measuredIdx[k + 1]!;
      const gapLen = hi - lo - 1;
      if (gapLen <= 0 || gapLen > MAX_FILLED_GAP) continue;
      for (let t = lo + 1; t < hi; t++) {
        x[t] = splineX(t);
        y[t] = splineY(t);
        state[t] = TIP_FILLED;
      }
    }
  }

  return { x, y, state };
}

export interface TrackedStaff {
  color: StaffColor;
  ends: [StaffTipSeries, StaffTipSeries];
}

function toFraction(series: StaffTipSeries, width: number, height: number): StaffTipSeries {
  const n = series.x.length;
  const x = new Array<number>(n);
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    x[i] = series.state[i] === TIP_MISSING ? -1 : series.x[i]! / width;
    y[i] = series.state[i] === TIP_MISSING ? -1 : series.y[i]! / height;
  }
  return { x, y, state: series.state.slice() };
}

/**
 * Tracks both staffs across every frame's detections and gap-fills each
 * end, returning positions as fractions of the analysis picture
 * (`analysisWidth`/`analysisHeight` — the same pixel space `detectBlobsInFrame`
 * measured in). Staff order matches the app's blue=0, red=1 convention.
 */
export function trackStaffTips(
  detectionsPerFrame: readonly (readonly DetectionBlob[])[],
  analysisWidth: number,
  analysisHeight: number,
): TrackedStaff[] {
  const order: { color: StaffColor; pyColour: "red" | "blue" }[] = [
    { color: "blue", pyColour: "blue" },
    { color: "red", pyColour: "red" },
  ];
  return order.map(({ color, pyColour }) => {
    const frames = runForwardTracker(detectionsPerFrame, pyColour);
    const endA = toFraction(buildTipSeriesPixels(frames, "A"), analysisWidth, analysisHeight);
    const endB = toFraction(buildTipSeriesPixels(frames, "B"), analysisWidth, analysisHeight);
    return { color, ends: [endA, endB] };
  });
}
