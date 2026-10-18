/**
 * Petal flight shared by the 3D and Canvas2D views.
 *
 * A petal is a thin curved plate falling through air. Nothing here sways or
 * flips on a timer: the air pushes on the plate according to how it is tilted,
 * and the glides, flutter, tumbling and spirals come out of that.
 *
 * - Face drag. Air hitting the face pushes back hard (`faceDrag`); air sliding
 *   along it barely does (`edgeDrag`). A tilted petal therefore slides
 *   sideways down its own slope, which is the glide.
 * - Lift. Air crossing the face at a shallow angle pushes harder than its
 *   head-on share (`lift`), so a gliding petal is held up while it slides.
 * - Pitch. That push acts near the leading edge (a quarter of the way back at
 *   a shallow angle, the middle when broadside), so a gliding petal's nose
 *   lifts, it slows, stalls and slides back the other way: flutter. A petal
 *   that turns fast enough goes over the top and tumbles instead.
 * - Spin damping comes from the same face drag acting on a turning plate.
 * - Added mass: pushing a plate face-first also pushes the air in front of
 *   it, so it is slower to speed up across its face than along it.
 * - `twist` is a slight asymmetry that turns the petal about its face as it
 *   falls, so some spiral down. `cup` is the curl of a curved petal, which
 *   prefers to fall with its hollow facing down and rocks less.
 *
 * Units are metres, seconds and radians, y up. The body frame matches the
 * petal geometry: x across the petal, y from base to tip, z out of the hollow
 * (concave) face.
 */

import type { PetalSpriteShape } from "./petal-palettes";

export const PETAL_GRAVITY = 9.8;
/** The longest step the plate is integrated with. */
export const PETAL_SUBSTEP = 1 / 240;
/** The longest frame the physics takes; a longer one is a stall. */
const MAX_FRAME = 0.1;
/** Turning lift per unit of face drag, chord and spin (Andersen et al.). */
const SPIN_LIFT = 2.6;
const SPIN_DRAG_STILL = 2;
const SPIN_DRAG_SWAY = 1.4;
/**
 * Rolling about its length, a curved and veined petal sweeps air like a plate
 * as long as it is, not as narrow as it is; a flat card of the same width
 * rolls over and over instead of rocking.
 */
const ROLL_DRAG = 5;
/** A step moves the air past the petal by at most this share of its width. */
const STEP_WIDTHS = 0.25;
/** No petal turns faster than this (rad/s); faster is a numerical fault. */
const MAX_SPIN = 120;

export interface PetalBody {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Orientation, body to world. */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** Angular velocity in body axes (rad/s). */
  wx: number;
  wy: number;
  wz: number;
  /** Half-width across the petal (m). */
  halfWidth: number;
  /** Half-length from base to tip (m). */
  halfLength: number;
  /** Face drag per unit mass (1/m); falling broadside, terminal speed is
   *  sqrt(g / faceDrag). */
  faceDrag: number;
  /** Drag along the face per unit mass (1/m). */
  edgeDrag: number;
  /** Extra push on the face when the air crosses it at a shallow angle. */
  lift: number;
  /** Air carried along when the face moves, as a share of the petal's mass. */
  addedMass: number;
  /** Scale on the damping a turning plate feels (1 is a flat plate). */
  spinDrag: number;
  /** Turn about the face per unit of crossflow; signed. */
  twist: number;
  /** How strongly the curl keeps the hollow facing the way it falls. */
  cup: number;
}

export interface PetalShape {
  halfWidth: number;
  halfLength: number;
  /** Speed it falls at when broadside to still air (m/s). */
  terminalSpeed: number;
  /** Edge drag as a share of face drag. Lower glides further. */
  edgeRatio: number;
  lift: number;
  addedMass: number;
  spinDrag: number;
  twist: number;
  cup: number;
}

/** How a kind of petal or leaf flies, relative to a plain loose petal. */
interface PetalFlightTraits {
  /** Width over length. */
  aspect: number;
  /** Fall speed. */
  fall: number;
  /** Spin damping: higher turns less, so it flutters less and rarely tumbles. */
  spin: number;
  /** Air carried across the face; higher is lighter for its size. */
  carried: number;
  /** 0 is a flat petal, 1 a lump that meets the air the same from every
   *  side, so it neither glides nor flutters. */
  solid: number;
  /** Asymmetry that turns it about its face (spirals). */
  twist: number;
  /** Curl that keeps the hollow facing down. */
  cup: number;
}

const PLAIN: PetalFlightTraits = {
  aspect: 0.62,
  fall: 1,
  spin: 1,
  carried: 1,
  solid: 0,
  twist: 0.5,
  cup: 0,
};

const TRAITS: Partial<Record<PetalSpriteShape, Partial<PetalFlightTraits>>> = {
  round: { aspect: 0.95 },
  oval: { aspect: 0.7 },
  elongated: { aspect: 0.4 },
  // A whole blossom is a cup of petals, not a plate: it drops faster and
  // turns about its face instead of fluttering.
  blossom_flower: {
    aspect: 0.95,
    fall: 1,
    solid: 0.75,
    twist: 3,
    cup: 0.6,
  },
  blossom_petal_folded: { aspect: 0.5, twist: 0.9 },
  blossom_petal_curled: { spin: 1.2, cup: 1 },
  maple: { aspect: 0.95, twist: 1.4, spin: 0.9 },
  curved: { aspect: 0.5, cup: 0.8 },
  oak: { aspect: 0.6 },
  rounded: { aspect: 0.85 },
  double: { aspect: 0.7, twist: 0.9 },
  nature: { aspect: 0.6 },
  monstera: { aspect: 0.8, fall: 1.15 },
  banana: { aspect: 0.3, fall: 1.1, spin: 1.2 },
  fern: { aspect: 0.3, spin: 1.3 },
  elephant: { aspect: 0.7, fall: 1.15 },
  palm: { aspect: 0.25, spin: 1.3 },
  calathea: { aspect: 0.45 },
  // Ash flakes are light and ragged, so they tumble; a cinder is a lump.
  ash_flake: { aspect: 0.75, fall: 0.7, spin: 0.8, carried: 1.4, twist: 1.6 },
  ash_cinder: { aspect: 0.9, fall: 1.2, solid: 0.85 },
  ginkgo: { aspect: 0.9, twist: 1.2, spin: 0.9 },
};

/** Settings a petal shape is built from. */
export interface PetalShapeSettings {
  /** Average fall speed of a plain petal (m/s). A fluttering petal falls
   *  about a third slower than the same petal held broadside. */
  fallSpeed: number;
  /** 0-1: how freely petals flutter and tumble. */
  sway: number;
  /** 0-1: how far a thrown petal sails edge-on before the air stops it. */
  streak: number;
}

/** The flying shape of one petal of `sprite`, `halfSize` metres across. */
export function resolvePetalShape(
  sprite: PetalSpriteShape,
  halfSize: number,
  settings: PetalShapeSettings,
  random: () => number
): PetalShape {
  const traits = { ...PLAIN, ...TRAITS[sprite] };
  const halfLength = Math.max(halfSize, 0.002) * 0.9;
  const sway = Math.min(1, Math.max(0, settings.sway));
  const streak = Math.min(1, Math.max(0, settings.streak));
  const halfWidth = halfLength * traits.aspect * (0.85 + random() * 0.3);
  const terminalSpeed =
    (settings.fallSpeed / 0.7) * traits.fall * (0.85 + random() * 0.3);
  // The air a plate carries follows from its size and how fast it falls:
  // for a thin plate, 1.31 times its face drag times its half-chord.
  const faceDrag = PETAL_GRAVITY / terminalSpeed ** 2;
  const addedMass =
    1.31 * faceDrag * Math.sqrt(halfWidth * halfLength) * traits.carried;
  return {
    halfLength,
    halfWidth,
    terminalSpeed,
    edgeRatio: 0.24 - 0.14 * streak + (0.76 + 0.14 * streak) * traits.solid,
    lift: (0.85 + random() * 0.3) * (1 - traits.solid),
    addedMass: addedMass * (1 - traits.solid),
    spinDrag:
      (SPIN_DRAG_STILL - SPIN_DRAG_SWAY * sway) *
      traits.spin *
      (0.75 + random() * 0.5),
    twist: traits.twist * (random() * 2 - 1) * 0.1,
    cup: traits.cup * 0.03 * (0.6 + random() * 0.8),
  };
}

export function createPetalBody(shape: PetalShape): PetalBody {
  const faceDrag = PETAL_GRAVITY / Math.max(shape.terminalSpeed, 0.05) ** 2;
  return {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    wx: 0,
    wy: 0,
    wz: 0,
    halfWidth: shape.halfWidth,
    halfLength: shape.halfLength,
    faceDrag,
    edgeDrag: faceDrag * shape.edgeRatio,
    lift: shape.lift,
    addedMass: shape.addedMass,
    spinDrag: shape.spinDrag,
    twist: shape.twist,
    cup: shape.cup,
  };
}

/** Turns a body-frame vector into world axes, writing into `out`. */
export function petalBodyToWorld(
  body: PetalBody,
  x: number,
  y: number,
  z: number,
  out: { x: number; y: number; z: number }
): void {
  rotate(body.qx, body.qy, body.qz, body.qw, x, y, z, out);
}

/** Sets the orientation from an axis and angle (axis need not be unit). */
export function setPetalAxisAngle(
  body: PetalBody,
  axisX: number,
  axisY: number,
  axisZ: number,
  angle: number
): void {
  const length = Math.hypot(axisX, axisY, axisZ) || 1;
  const s = Math.sin(angle / 2) / length;
  body.qx = axisX * s;
  body.qy = axisY * s;
  body.qz = axisZ * s;
  body.qw = Math.cos(angle / 2);
}

/** Turns the body by `angle` about a world axis, after its current turn. */
export function turnPetalWorld(
  body: PetalBody,
  axisX: number,
  axisY: number,
  axisZ: number,
  angle: number
): void {
  const length = Math.hypot(axisX, axisY, axisZ) || 1;
  const s = Math.sin(angle / 2) / length;
  const ax = axisX * s;
  const ay = axisY * s;
  const az = axisZ * s;
  const aw = Math.cos(angle / 2);
  const { qx, qy, qz, qw } = body;
  body.qx = aw * qx + ax * qw + ay * qz - az * qy;
  body.qy = aw * qy - ax * qz + ay * qw + az * qx;
  body.qz = aw * qz + ax * qy - ay * qx + az * qw;
  body.qw = aw * qw - ax * qx - ay * qy - az * qz;
}

const scratch = { x: 0, y: 0, z: 0 };

/**
 * Advances one petal through `frameDt` seconds of air moving at `wind`
 * (m/s). The wind is held for the frame; the plate is integrated in equal
 * substeps no longer than PETAL_SUBSTEP, so its flutter does not depend on
 * the frame rate and its motion stays smooth at any frame rate.
 */
export function stepPetalBody(
  body: PetalBody,
  windX: number,
  windY: number,
  windZ: number,
  frameDt: number
): void {
  const dt = Math.min(Math.max(frameDt, 0), MAX_FRAME);
  if (dt <= 0) return;
  // The air turns a narrow petal faster the faster it moves through it, so
  // a thrown petal takes finer steps until it slows down.
  const speed = Math.hypot(body.vx - windX, body.vy - windY, body.vz - windZ);
  const longest = Math.min(
    PETAL_SUBSTEP,
    (STEP_WIDTHS * body.halfWidth) / Math.max(speed, 0.3)
  );
  const steps = Math.ceil(dt / longest - 1e-6);
  const h = dt / steps;
  for (let step = 0; step < steps; step++)
    substep(body, windX, windY, windZ, h);
  if (
    !Number.isFinite(body.wx + body.wy + body.wz + body.vx + body.vy + body.vz)
  )
    calm(body, windX, windY, windZ);
}

/** Puts a petal that has gone numerically wrong back to drifting with the air. */
function calm(
  body: PetalBody,
  windX: number,
  windY: number,
  windZ: number
): void {
  body.vx = windX;
  body.vy = windY;
  body.vz = windZ;
  body.wx = 0;
  body.wy = 0;
  body.wz = 0;
  if (!Number.isFinite(body.qx + body.qy + body.qz + body.qw)) {
    body.qx = 0;
    body.qy = 0;
    body.qz = 0;
    body.qw = 1;
  }
}

/**
 * Linear and angular acceleration: world vx, vy, vz then body wx, wy, wz,
 * then each spin's damping rate (1/s), which the step applies implicitly
 * because a fast-turning small petal damps far faster than one step.
 */
const rate = new Float64Array(9);

/**
 * Second-order (midpoint) step. The carried air trades motion between the
 * plate's turning and its sliding quickly, and a first-order step gains energy
 * on that trade until light petals blow up.
 */
function substep(
  b: PetalBody,
  windX: number,
  windY: number,
  windZ: number,
  h: number
): void {
  const { vx, vy, vz, qx, qy, qz, qw, wx, wy, wz } = b;
  rates(b, vx - windX, vy - windY, vz - windZ, qx, qy, qz, qw, wx, wy, wz);
  const half = h / 2;
  const mvx = vx + rate[0]! * half;
  const mvy = vy + rate[1]! * half;
  const mvz = vz + rate[2]! * half;
  const mwx = (wx + rate[3]! * half) / (1 + rate[6]! * half);
  const mwy = (wy + rate[4]! * half) / (1 + rate[7]! * half);
  const mwz = (wz + rate[5]! * half) / (1 + rate[8]! * half);
  turn(qx, qy, qz, qw, wx, wy, wz, half, scratchQuaternion);
  const [mqx, mqy, mqz, mqw] = scratchQuaternion;
  rates(
    b,
    mvx - windX,
    mvy - windY,
    mvz - windZ,
    mqx!,
    mqy!,
    mqz!,
    mqw!,
    mwx,
    mwy,
    mwz
  );
  b.vx = vx + rate[0]! * h;
  b.vy = vy + rate[1]! * h;
  b.vz = vz + rate[2]! * h;
  b.x += mvx * h;
  b.y += mvy * h;
  b.z += mvz * h;
  b.wx = clampSpin((wx + rate[3]! * h) / (1 + rate[6]! * h));
  b.wy = clampSpin((wy + rate[4]! * h) / (1 + rate[7]! * h));
  b.wz = clampSpin((wz + rate[5]! * h) / (1 + rate[8]! * h));
  turn(qx, qy, qz, qw, mwx, mwy, mwz, h, scratchQuaternion);
  b.qx = scratchQuaternion[0]!;
  b.qy = scratchQuaternion[1]!;
  b.qz = scratchQuaternion[2]!;
  b.qw = scratchQuaternion[3]!;
}

const scratchQuaternion = new Float64Array(4);

function clampSpin(w: number): number {
  return w > MAX_SPIN ? MAX_SPIN : w < -MAX_SPIN ? -MAX_SPIN : w;
}

/** q (1 + w h / 2), renormalised: turns q by body spin w for h seconds. */
function turn(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  wx: number,
  wy: number,
  wz: number,
  h: number,
  out: Float64Array
): void {
  const hx = wx * h * 0.5;
  const hy = wy * h * 0.5;
  const hz = wz * h * 0.5;
  const nx = qx + qw * hx + qy * hz - qz * hy;
  const ny = qy + qw * hy + qz * hx - qx * hz;
  const nz = qz + qw * hz + qx * hy - qy * hx;
  const nw = qw - qx * hx - qy * hy - qz * hz;
  const norm = 1 / Math.hypot(nx, ny, nz, nw);
  out[0] = nx * norm;
  out[1] = ny * norm;
  out[2] = nz * norm;
  out[3] = nw * norm;
}

/** Fills `rate` for a petal moving at (rx, ry, rz) through the air. */
function rates(
  b: PetalBody,
  rx: number,
  ry: number,
  rz: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  wx: number,
  wy: number,
  wz: number
): void {
  // Motion through the air and gravity, both in body axes.
  rotate(-qx, -qy, -qz, qw, rx, ry, rz, scratch);
  const ux = scratch.x;
  const uy = scratch.y;
  const uz = scratch.z;
  rotate(-qx, -qy, -qz, qw, 0, -PETAL_GRAVITY, 0, scratch);
  let fx = scratch.x;
  let fy = scratch.y;
  let fz = scratch.z;

  const a = b.halfWidth;
  const l = b.halfLength;
  const speed = Math.hypot(ux, uy, uz);
  if (speed > 1e-6) {
    const across = uz / speed;
    // Drag: full face drag broadside, edge drag edge-on.
    const drag =
      (b.edgeDrag + (b.faceDrag - b.edgeDrag) * across * across) * speed;
    fx -= drag * ux;
    fy -= drag * uy;
    fz -= drag * uz;
    // Lift from air crossing the face, square to the motion: the part of
    // the face's push that does not oppose the motion, strongest at 45 degrees.
    const push = -b.lift * b.faceDrag * speed * uz;
    fx -= push * across * (ux / speed);
    fy -= push * across * (uy / speed);
    fz += push * (1 - across * across);
  }
  // Lift from turning: a plate that pitches as it moves throws air like a
  // spinning ball (the Magnus push), square to both its spin and its motion.
  const turnX = SPIN_LIFT * b.lift * b.faceDrag * l * wx;
  const turnY = SPIN_LIFT * b.lift * b.faceDrag * a * wy;
  fx += turnY * uz;
  fy -= turnX * uz;
  fz += turnX * uy - turnY * ux;

  // Air carried along across the face: momentum M u, with M = 1 along the
  // face and 1 + addedMass across it. du/dt = M^-1 (f - w x M u), and the
  // world sees du/dt + w x u.
  const m3 = 1 + b.addedMass;
  const muz = m3 * uz;
  const dux = fx - (wy * muz - wz * uy);
  const duy = fy - (wz * ux - wx * muz);
  const duz = (fz - (wx * uy - wy * ux)) / m3;
  rotate(
    qx,
    qy,
    qz,
    qw,
    dux + (wy * uz - wz * uy),
    duy + (wz * ux - wx * uz),
    duz + (wx * uy - wy * ux),
    scratch
  );
  rate[0] = scratch.x;
  rate[1] = scratch.y;
  rate[2] = scratch.z;

  // Munk moment: the carried air turns a moving plate broadside, (M u) x u.
  let torqueX = -b.addedMass * uy * uz;
  let torqueY = b.addedMass * ux * uz;
  // The curl turns the hollow toward the way the petal is moving.
  if (b.cup !== 0) {
    const curl = b.cup * b.faceDrag * speed * Math.sqrt(a * l);
    torqueX -= uy * curl;
    torqueY += ux * curl;
  }
  // An uneven petal is pushed round about its face by any air crossing it.
  const torqueZ = (b.twist * b.faceDrag * speed * speed * (a + l)) / 4;
  // Plate inertia plus the air turned with it.
  const inertiaX = (l * l) / 3 + (b.addedMass * l * l) / 4;
  const inertiaY = (a * a) / 3 + (b.addedMass * a * a) / 4;
  const inertiaZ = (l * l + a * a) / 3;
  rate[3] = (torqueX - (inertiaZ - inertiaY) * wy * wz) / inertiaX;
  rate[4] = (torqueY - (inertiaX - inertiaZ) * wz * wx) / inertiaY;
  rate[5] = (torqueZ - (inertiaY - inertiaX) * wx * wy) / inertiaZ;
  // A turning plate pushes air with its far edges: damping that grows with
  // its spin, and about the face with the speed it is flying at too.
  const pitchDrag = b.faceDrag * b.spinDrag * 0.25;
  rate[6] = (pitchDrag * l * l * l * Math.abs(wx)) / inertiaX;
  rate[7] = (ROLL_DRAG * pitchDrag * a * l * l * Math.abs(wy)) / inertiaY;
  rate[8] =
    (b.edgeDrag * (a * a + l * l) * (speed + (a + l) * Math.abs(wz))) /
    inertiaZ;
}

function rotate(
  qx: number,
  qy: number,
  qz: number,
  qw: number,
  x: number,
  y: number,
  z: number,
  out: { x: number; y: number; z: number }
): void {
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  out.x = x + qw * tx + (qy * tz - qz * ty);
  out.y = y + qw * ty + (qz * tx - qx * tz);
  out.z = z + qw * tz + (qx * ty - qy * tx);
}
