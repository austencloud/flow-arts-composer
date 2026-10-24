/**
 * The poi string: a hand, a light string and a heavy head, moved by gravity
 * and the hand alone (docs/superpowers/specs/active/2026-10-22-real-poi-design.md,
 * unit 1).
 *
 * MIRRORED IN C++ (`FlowArtsPoiTether`, build step 2) and checked against it
 * with parity fixtures. Keep the two in step: plain arrays of numbers, the
 * same loop order, the same constants, nothing from a library. A change here
 * is a change there.
 *
 * Metres, seconds, y up, gravity along −y.
 *
 * - Eight points: the hand anchor, six light string points, the head.
 *   Position Verlet at a fixed 240 Hz substep, fed by an accumulator, so the
 *   result does not depend on the frame rate.
 * - Each segment may be shorter than its rest length but never longer, so
 *   the string sags and goes slack when nothing pulls it.
 * - The head hangs on the hand by one tether as long as the string. The
 *   string points are drawn between the two and never load the head, so the
 *   head swings as a true pendulum and keeps its energy.
 * - The poi is kept on its pattern the way a spinner keeps it there: the hand
 *   moves. The solver's hand target is corrected from the head's error (see
 *   the steering note in `substep`). Nothing ever pushes the head except
 *   gravity, air and the string, so a slack poi can't be steered.
 */

export const POI_TETHER_POINTS = 8;
export const POI_TETHER_SEGMENTS = POI_TETHER_POINTS - 1;
export const POI_TETHER_SUBSTEP_HZ = 240;
const HEAD = POI_TETHER_POINTS - 1;
/** One poi weight, for tension readings, whether or not gravity is on. */
const WEIGHT_G = 9.81;
/** Below this pull, in poi weights, the poi is nearly floating: the string
 *  is slack here and "loose" in the Poi String lab. */
export const LOOSE_TENSION = 0.2;
/** A frame longer than this many substeps is cut short (a stalled tab). */
const MAX_SUBSTEPS_PER_STEP = 48;
/** Per-substep blend for the tension reading, so it doesn't flicker. */
const TENSION_SMOOTHING = 0.2;
/** Half-width, seconds, of the stencil that reads the intended head's
 *  velocity and acceleration off the sampler: one 60 Hz frame. */
const STEER_SPAN = 1 / 60;
/** Floor on the intended pull the steering divides by, m/s² (half a poi
 *  weight), so a near-floating poi asks for a big move, not an infinite one. */
const MIN_STEER_PULL = 0.5 * WEIGHT_G;
const ZERO = [0, 0, 0] as const;

export interface PoiTetherOptions {
  /** Hand to head, metres. */
  stringLength: number;
  /** Downward acceleration, m/s². 0 turns gravity off. */
  gravity: number;
  /** Air drag on the head, per second of velocity. */
  headDrag: number;
  /** Air drag on the string points, per second. It shapes how the string
   *  trails and sags; the head doesn't feel it. */
  stringDrag: number;
  /** Constraint passes per substep before the final no-stretch pass. */
  iterations: number;
  /** Head acceleration asked for per metre of error, 1/s². The `skill`
   *  lever. */
  steeringGain: number;
  /** Head acceleration asked for per m/s of velocity error, 1/s. */
  steeringDamping: number;
  /** Largest hand correction, as a fraction of the string length. */
  maxCorrection: number;
  /**
   * How long the hand takes to act on a correction, seconds. A hand can't
   * react within one substep, and the string answers the hand at once, so
   * without this lag the steering rings at the substep rate.
   */
  steeringLag: number;
  /** One beat, seconds. `lost` waits two beats. */
  beatSeconds: number;
}

/**
 * Picked on the cases in poi-tether.test.ts. The steering holds a plain
 * extension within about 4 cm at 180 bpm (twice the gain halves that, but
 * a spinner isn't a servo); it can't save a slow spin, whose hand runs out
 * of reach (`POI_MAX_HAND_STRAY`), so that string goes slack at the top.
 * The steering lag is a hand's reaction, about two 60 Hz frames.
 */
export const DEFAULT_POI_TETHER_OPTIONS: PoiTetherOptions = {
  stringLength: 0.6,
  gravity: 9.81,
  headDrag: 0.15,
  stringDrag: 0.2,
  iterations: 6,
  steeringGain: 30,
  steeringDamping: 8,
  maxCorrection: 0.5,
  steeringLag: 0.03,
  beatSeconds: 60 / 180,
};

/**
 * Writes the hand target and the intended head, xyz, for a sim time in
 * seconds. Called a few times per substep (the steering reads the intended
 * head a frame either side), so it must be a pure function of time. That is
 * also what makes the sim see the same targets whatever the frame rate.
 */
export type PoiTetherSampler = (
  time: number,
  handTarget: Float64Array,
  headIntended: Float64Array
) => void;

export class PoiTether {
  readonly options: PoiTetherOptions;
  /** xyz per point, hand first, head last. */
  readonly points = new Float64Array(POI_TETHER_POINTS * 3);
  readonly headVelocity = new Float64Array(3);
  /** Where the solver put the hand, before the steering correction. */
  readonly handTarget = new Float64Array(3);
  readonly headIntended = new Float64Array(3);
  /** The correction the hand is carrying out, lagging the one asked for. */
  readonly correction = new Float64Array(3);
  /** Seconds simulated so far. */
  time = 0;
  /** String pull at the head, in poi weights. */
  tension = 0;
  slack = true;
  /** Head error has been over one string length for two beats. */
  lost = false;
  /** Distance from the head to its intended position, metres. */
  headError = 0;

  private readonly previous = new Float64Array(POI_TETHER_POINTS * 3);
  private readonly scratch = new Float64Array(3);
  private readonly behind = new Float64Array(3);
  private readonly ahead = new Float64Array(3);
  /** The steering frame: two axes square to the intended string. */
  private readonly frame1 = new Float64Array(3);
  private readonly frame2 = new Float64Array(3);
  private hasFrame = false;
  private accumulator = 0;
  private lostSeconds = 0;

  constructor(options: Partial<PoiTetherOptions> = {}) {
    this.options = { ...DEFAULT_POI_TETHER_OPTIONS, ...options };
  }

  /** The hand, where the sim actually put it. */
  get hand(): Float64Array {
    return this.points.subarray(0, 3);
  }

  get head(): Float64Array {
    return this.points.subarray(HEAD * 3, HEAD * 3 + 3);
  }

  /**
   * Lays the string straight from the hand to the head and starts the clock
   * at `time`. A head farther than the string reaches is pulled in. Give the
   * velocities to start the poi already spinning; the string points blend
   * from the hand's to the head's along the string.
   */
  reset(
    hand: ArrayLike<number>,
    head: ArrayLike<number>,
    time = 0,
    headVelocity: ArrayLike<number> = ZERO,
    handVelocity: ArrayLike<number> = ZERO
  ): void {
    const h = 1 / POI_TETHER_SUBSTEP_HZ;
    const L = this.options.stringLength;
    let dx = head[0]! - hand[0]!;
    let dy = head[1]! - hand[1]!;
    let dz = head[2]! - hand[2]!;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > L) {
      dx *= L / d;
      dy *= L / d;
      dz *= L / d;
    }
    for (let i = 0; i < POI_TETHER_POINTS; i++) {
      const f = i / POI_TETHER_SEGMENTS;
      const k = i * 3;
      this.points[k] = hand[0]! + dx * f;
      this.points[k + 1] = hand[1]! + dy * f;
      this.points[k + 2] = hand[2]! + dz * f;
      for (let a = 0; a < 3; a++) {
        const v = handVelocity[a]! + (headVelocity[a]! - handVelocity[a]!) * f;
        this.previous[k + a] = this.points[k + a]! - v * h;
      }
    }
    for (let k = 0; k < 3; k++) {
      this.handTarget[k] = hand[k]!;
      this.headIntended[k] = head[k]!;
      this.headVelocity[k] = headVelocity[k]!;
      this.correction[k] = 0;
    }
    this.hasFrame = false;
    this.time = time;
    this.accumulator = 0;
    this.lostSeconds = 0;
    this.lost = false;
    this.tension = 0;
    this.slack = true;
    this.headError = 0;
  }

  /**
   * Advances by `dt` seconds of wall time. Whole substeps run; the remainder
   * waits in the accumulator for the next call. Returns the substeps run.
   */
  step(dt: number, sample: PoiTetherSampler): number {
    const h = 1 / POI_TETHER_SUBSTEP_HZ;
    this.accumulator += dt;
    let count = 0;
    while (this.accumulator >= h && count < MAX_SUBSTEPS_PER_STEP) {
      this.substep(h, sample);
      this.accumulator -= h;
      count++;
    }
    if (count === MAX_SUBSTEPS_PER_STEP) this.accumulator = 0;
    return count;
  }

  private substep(h: number, sample: PoiTetherSampler): void {
    const o = this.options;
    const p = this.points;
    const q = this.previous;
    const L = o.stringLength;
    const rest = L / POI_TETHER_SEGMENTS;
    const hk = HEAD * 3;
    const t = this.time + h;

    // Steering, through the hand. The solver's target is nudged across the
    // intended string, the way a pendulum is steered by its pivot: a
    // sideways hand move of x tilts the string by x/L and turns that much of
    // its pull sideways. The PD term asks for a head acceleration, converted
    // with the pull the track intends (not the one the string has, or a
    // tension spike would raise the loop gain and the steering would feed
    // itself). Along the string the head answers the hand at once, so
    // nothing is corrected there.
    //
    // The error is measured in a frame that turns with the intended string
    // (carried along without twisting), and its rate is taken in that frame.
    // A spinning poi with a steady lag has no error rate; measured in the
    // world, its error spins, and damping on that spin pushes the head
    // sideways round its circle and sets it fluttering.
    sample(t - STEER_SPAN, this.scratch, this.behind);
    sample(t + STEER_SPAN, this.scratch, this.ahead);
    sample(t, this.handTarget, this.headIntended);
    let ux = this.headIntended[0]! - this.handTarget[0]!;
    let uy = this.headIntended[1]! - this.handTarget[1]!;
    let uz = this.headIntended[2]! - this.handTarget[2]!;
    const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
    if (ul > 1e-9) {
      ux /= ul;
      uy /= ul;
      uz /= ul;
    } else {
      ux = 0;
      uy = -1;
      uz = 0;
    }
    const f1 = this.frame1;
    const f2 = this.frame2;
    const prev1x = f1[0]!;
    const prev1y = f1[1]!;
    const prev1z = f1[2]!;
    const prev2x = f2[0]!;
    const prev2y = f2[1]!;
    const prev2z = f2[2]!;
    {
      // Carry the old first axis over, square to the new string. A fresh
      // frame starts from the head's intended direction of travel.
      let ax = this.hasFrame ? prev1x : this.ahead[0]! - this.behind[0]!;
      let ay = this.hasFrame ? prev1y : this.ahead[1]! - this.behind[1]!;
      let az = this.hasFrame ? prev1z : this.ahead[2]! - this.behind[2]!;
      let d = ax * ux + ay * uy + az * uz;
      ax -= d * ux;
      ay -= d * uy;
      az -= d * uz;
      let al = Math.sqrt(ax * ax + ay * ay + az * az);
      if (al < 1e-6) {
        // Any axis square to the string will do.
        ax = Math.abs(ux) < 0.9 ? 1 : 0;
        ay = Math.abs(ux) < 0.9 ? 0 : 1;
        az = 0;
        d = ax * ux + ay * uy + az * uz;
        ax -= d * ux;
        ay -= d * uy;
        az -= d * uz;
        al = Math.sqrt(ax * ax + ay * ay + az * az);
      }
      f1[0] = ax / al;
      f1[1] = ay / al;
      f1[2] = az / al;
      f2[0] = uy * f1[2]! - uz * f1[1]!;
      f2[1] = uz * f1[0]! - ux * f1[2]!;
      f2[2] = ux * f1[1]! - uy * f1[0]!;
    }
    // The first substep after a reset has no earlier frame to turn from.
    const turns = this.hasFrame;
    this.hasFrame = true;
    let errorSq = 0;
    let e1 = 0;
    let e2 = 0;
    let r1 = 0;
    let r2 = 0;
    let px = 0;
    let py = o.gravity;
    let pz = 0;
    for (let k = 0; k < 3; k++) {
      const intended = this.headIntended[k]!;
      const e = intended - p[hk + k]!;
      errorSq += e * e;
      const velocity = (this.ahead[k]! - this.behind[k]!) / (2 * STEER_SPAN);
      const accel =
        (this.ahead[k]! - 2 * intended + this.behind[k]!) /
        (STEER_SPAN * STEER_SPAN);
      if (k === 0) px += accel;
      else if (k === 1) py += accel;
      else pz += accel;
      const ev = velocity - this.headVelocity[k]!;
      const prev1 = k === 0 ? prev1x : k === 1 ? prev1y : prev1z;
      const prev2 = k === 0 ? prev2x : k === 1 ? prev2y : prev2z;
      e1 += e * f1[k]!;
      e2 += e * f2[k]!;
      // d/dt (e·f) = ė·f + e·ḟ, with ḟ from the frame's turn this substep.
      r1 += ev * f1[k]! + (turns ? (e * (f1[k]! - prev1)) / h : 0);
      r2 += ev * f2[k]! + (turns ? (e * (f2[k]! - prev2)) / h : 0);
    }
    const intendedPull = Math.max(
      Math.sqrt(px * px + py * py + pz * pz),
      MIN_STEER_PULL
    );
    const a1 =
      ((o.steeringGain * e1 + o.steeringDamping * r1) * L) / intendedPull;
    const a2 =
      ((o.steeringGain * e2 + o.steeringDamping * r2) * L) / intendedPull;
    let cx = a1 * f1[0]! + a2 * f2[0]!;
    let cy = a1 * f1[1]! + a2 * f2[1]!;
    let cz = a1 * f1[2]! + a2 * f2[2]!;
    {
      const c = Math.sqrt(cx * cx + cy * cy + cz * cz);
      const limit = o.maxCorrection * L;
      if (c > limit) {
        cx *= limit / c;
        cy *= limit / c;
        cz *= limit / c;
      }
    }
    const follow = o.steeringLag > h ? h / o.steeringLag : 1;
    this.correction[0] =
      this.correction[0]! + (cx - this.correction[0]!) * follow;
    this.correction[1] =
      this.correction[1]! + (cy - this.correction[1]!) * follow;
    this.correction[2] =
      this.correction[2]! + (cz - this.correction[2]!) * follow;

    // The hand is kinematic: it goes where it is put.
    q[0] = p[0]!;
    q[1] = p[1]!;
    q[2] = p[2]!;
    p[0] = this.handTarget[0]! + this.correction[0]!;
    p[1] = this.handTarget[1]! + this.correction[1]!;
    p[2] = this.handTarget[2]! + this.correction[2]!;

    // Verlet for the string and head.
    const gy = -o.gravity * h * h;
    for (let i = 1; i < POI_TETHER_POINTS; i++) {
      const k = i * 3;
      const keep = 1 - (i === HEAD ? o.headDrag : o.stringDrag) * h;
      for (let a = 0; a < 3; a++) {
        const now = p[k + a]!;
        p[k + a] = now + (now - q[k + a]!) * keep + (a === 1 ? gy : 0);
        q[k + a] = now;
      }
    }

    // The head hangs on the hand by the whole string: one tether, hand to
    // head, no longer than the string. A light string barely loads the head,
    // so its points don't push or drag it; this keeps the head a true
    // pendulum whatever the chain is doing.
    const fx = p[hk]!;
    const fy = p[hk + 1]!;
    const fz = p[hk + 2]!;
    {
      const dx = fx - p[0]!;
      const dy = fy - p[1]!;
      const dz = fz - p[2]!;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > L) {
        const f = L / d;
        p[hk] = p[0]! + dx * f;
        p[hk + 1] = p[1]! + dy * f;
        p[hk + 2] = p[2]! + dz * f;
        // A string only pulls along itself, so seen from the hand it can't
        // change how fast the head travels round it. Pulling the head back
        // onto the tether would trim that speed a little every substep (the
        // chord is shorter than the arc) and brake a fast spin within a
        // second, so the head keeps its speed across the string, measured
        // against the string as it was, and only loses its speed along it.
        const vhx = (p[0]! - q[0]!) / h;
        const vhy = (p[1]! - q[1]!) / h;
        const vhz = (p[2]! - q[2]!) / h;
        let rx = (fx - q[hk]!) / h - vhx;
        let ry = (fy - q[hk + 1]!) / h - vhy;
        let rz = (fz - q[hk + 2]!) / h - vhz;
        // The string before this substep: head (now in q) from the hand (q).
        let ox = q[hk]! - q[0]!;
        let oy = q[hk + 1]! - q[1]!;
        let oz = q[hk + 2]! - q[2]!;
        const ol = Math.sqrt(ox * ox + oy * oy + oz * oz);
        let across = 0;
        if (ol > 1e-9) {
          ox /= ol;
          oy /= ol;
          oz /= ol;
          const along = rx * ox + ry * oy + rz * oz;
          const tx = rx - along * ox;
          const ty = ry - along * oy;
          const tz = rz - along * oz;
          across = Math.sqrt(tx * tx + ty * ty + tz * tz);
        }
        const nx = dx / d;
        const ny = dy / d;
        const nz = dz / d;
        const along = rx * nx + ry * ny + rz * nz;
        rx -= along * nx;
        ry -= along * ny;
        rz -= along * nz;
        const rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
        const scale = rl > 1e-9 ? across / rl : 0;
        q[hk] = p[hk]! - (vhx + rx * scale) * h;
        q[hk + 1] = p[hk + 1]! - (vhy + ry * scale) * h;
        q[hk + 2] = p[hk + 2]! - (vhz + rz * scale) * h;
      }
    }

    // The string points relax between the two ends, which hold still.
    for (let it = 0; it < o.iterations; it++) {
      for (let s = 0; s < POI_TETHER_SEGMENTS; s++) {
        const a = s * 3;
        const b = a + 3;
        const dx = p[b]! - p[a]!;
        const dy = p[b + 1]! - p[a + 1]!;
        const dz = p[b + 2]! - p[a + 2]!;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d <= rest) continue;
        const wa = s === 0 ? 0 : 1;
        const wb = s + 1 === HEAD ? 0 : 1;
        if (wa + wb === 0) continue;
        const f = (d - rest) / (d * (wa + wb));
        p[a] = p[a]! + dx * f * wa;
        p[a + 1] = p[a + 1]! + dy * f * wa;
        p[a + 2] = p[a + 2]! + dz * f * wa;
        p[b] = p[b]! - dx * f * wb;
        p[b + 1] = p[b + 1]! - dy * f * wb;
        p[b + 2] = p[b + 2]! - dz * f * wb;
      }
    }
    // Then one pass out from the hand makes it exact: each point within a
    // segment of the one before it and within the rest of the string of the
    // head. Both always fit, because the head is within the string of the
    // hand, so no segment is ever long.
    for (let i = 1; i < HEAD; i++) {
      const a = (i - 1) * 3;
      const b = i * 3;
      let dx = p[b]! - p[a]!;
      let dy = p[b + 1]! - p[a + 1]!;
      let dz = p[b + 2]! - p[a + 2]!;
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > rest) {
        const f = rest / d;
        p[b] = p[a]! + dx * f;
        p[b + 1] = p[a + 1]! + dy * f;
        p[b + 2] = p[a + 2]! + dz * f;
      }
      const reach = (HEAD - i) * rest;
      dx = p[b]! - p[hk]!;
      dy = p[b + 1]! - p[hk + 1]!;
      dz = p[b + 2]! - p[hk + 2]!;
      d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > reach) {
        // Too far from the head: put the point on the line from the one
        // before it to the head, exactly `reach` short of the head.
        const hx = p[hk]! - p[a]!;
        const hy = p[hk + 1]! - p[a + 1]!;
        const hz = p[hk + 2]! - p[a + 2]!;
        const hd = Math.sqrt(hx * hx + hy * hy + hz * hz);
        const f = hd > 1e-12 ? Math.max(0, hd - reach) / hd : 0;
        p[b] = p[a]! + hx * f;
        p[b + 1] = p[a + 1]! + hy * f;
        p[b + 2] = p[a + 2]! + hz * f;
      }
    }

    // The string's pull is whatever changed the head's velocity this
    // substep beyond gravity and air, taken along the string toward the hand.
    {
      const drag = o.headDrag;
      let pull = 0;
      const dx = p[0]! - p[hk]!;
      const dy = p[1]! - p[hk + 1]!;
      const dz = p[2]! - p[hk + 2]!;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      for (let a = 0; a < 3; a++) {
        const v = (p[hk + a]! - q[hk + a]!) / h;
        const accel =
          (v - this.headVelocity[a]!) / h +
          (a === 1 ? o.gravity : 0) +
          drag * this.headVelocity[a]!;
        const toward = a === 0 ? dx : a === 1 ? dy : dz;
        if (d > 1e-9) pull += (accel * toward) / d;
        this.headVelocity[a] = v;
      }
      const tension = Math.max(0, pull) / WEIGHT_G;
      this.tension += (tension - this.tension) * TENSION_SMOOTHING;
      this.slack = this.tension < LOOSE_TENSION;
    }

    this.headError = Math.sqrt(errorSq);
    this.lostSeconds = this.headError > L ? this.lostSeconds + h : 0;
    this.lost = this.lostSeconds >= 2 * o.beatSeconds;
    this.time = t;
  }
}
