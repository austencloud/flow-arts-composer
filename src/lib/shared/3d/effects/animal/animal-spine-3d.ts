import type { AnimalIntent } from "#lib/shared/effects/domain/effects-config.js";

const EPSILON = 1e-8;
const MOTION_SPEED_START = 0.08;
const MOTION_SPEED_END = 0.72;
const MOTION_ATTACK_RATE = 13;
const MOTION_RELEASE_RATE = 5.2;
const MAX_SIMULATION_STEP = 1 / 120;
const MAX_SIMULATION_SUBSTEPS = 8;
const GRAVITY_ACCELERATION = 13;
const GRAVITY_SETTLE_RATE = 7.5;
const VELOCITY_DAMPING = 7.5;
const PATH_FOLLOW_RATE = 34;
const MAX_POINT_SPEED = 18;
const DISTANCE_SOLVER_ITERATIONS = 5;
const BEND_SOLVER_ITERATIONS = 3;
const CONSTRAINT_VELOCITY_RETENTION = 0.58;

export interface AnimalSpineFrameBuffers3D {
  tangents: Float32Array;
  normals: Float32Array;
  binormals: Float32Array;
}

/**
 * Persistent joint state for one tracked creature. The renderer owns one of
 * these per prop tip so momentum survives between frames instead of being
 * reconstructed from a single gravity blend every update.
 */
export interface AnimalSpineDynamics3D {
  readonly points: Float32Array;
  readonly velocities: Float32Array;
  readonly previous: Float32Array;
  count: number;
  spacing: number;
  initialized: boolean;
}

export interface AnimalHeadFrameSeed3D {
  x: number;
  y: number;
  z: number;
}

export function createAnimalSpineDynamics3D(
  capacity: number
): AnimalSpineDynamics3D {
  return {
    points: new Float32Array(capacity * 3),
    velocities: new Float32Array(capacity * 3),
    previous: new Float32Array(capacity * 3),
    count: 0,
    spacing: 0,
    initialized: false,
  };
}

/**
 * Smooths the bridge's finite-difference speed before it affects the animal.
 * Motion attacks quickly so a new gesture owns the body, while release is
 * slower so a one-frame zero does not switch the creature into a hold pose.
 */
export function dampAnimalMotionBlend3D(
  current: number,
  speed: number,
  delta: number
): number {
  const target = smoothstep(
    Math.max(0, speed),
    MOTION_SPEED_START,
    MOTION_SPEED_END
  );
  const rate = target > current ? MOTION_ATTACK_RATE : MOTION_RELEASE_RATE;
  const safeDelta = Math.max(0, delta);
  return target + (current - target) * Math.exp(-rate * safeDelta);
}

/**
 * Advances a head-pinned, fixed-length chain toward the recorded prop path.
 * While moving, soft path targets preserve the drawn gesture. As motion fades,
 * those targets release from tail to head and persistent gravity/inertia take
 * over. `pathTargetCount` stops a newly moving endpoint from inventing history
 * for the rest of the body. A final follow-the-leader pass keeps every link
 * inextensible.
 */
export function stepAnimalSpineDynamics3D(
  dynamics: AnimalSpineDynamics3D,
  targets: Float32Array,
  count: number,
  spacing: number,
  motionBlend: number,
  delta: number,
  reset = false,
  pathTargetCount = count
): void {
  if (count < 2) return;
  const safeSpacing = Math.max(EPSILON, spacing);
  const layoutChanged =
    dynamics.count !== count ||
    Math.abs(dynamics.spacing - safeSpacing) > safeSpacing * 0.001;
  if (!dynamics.initialized || reset || layoutChanged) {
    const scalarCount = count * 3;
    for (let scalar = 0; scalar < scalarCount; scalar++) {
      dynamics.points[scalar] = targets[scalar]!;
      dynamics.previous[scalar] = targets[scalar]!;
    }
    dynamics.velocities.fill(0, 0, scalarCount);
    dynamics.count = count;
    dynamics.spacing = safeSpacing;
    dynamics.initialized = true;
    return;
  }

  const safeDelta = Math.min(Math.max(delta, 0), 1 / 15);
  if (safeDelta <= 0) {
    dynamics.points[0] = targets[0]!;
    dynamics.points[1] = targets[1]!;
    dynamics.points[2] = targets[2]!;
    return;
  }

  const substeps = Math.min(
    MAX_SIMULATION_SUBSTEPS,
    Math.max(1, Math.ceil(safeDelta / MAX_SIMULATION_STEP))
  );
  const step = safeDelta / substeps;
  const damping = Math.exp(-VELOCITY_DAMPING * step);
  const boundedMotion = clamp(motionBlend, 0, 1);
  const holdBlend = 1 - boundedMotion;
  const boundedPathTargetCount = Math.round(clamp(pathTargetCount, 1, count));
  const startHeadX = dynamics.points[0]!;
  const startHeadY = dynamics.points[1]!;
  const startHeadZ = dynamics.points[2]!;

  for (let substep = 0; substep < substeps; substep++) {
    const headAmount = (substep + 1) / substeps;
    const headX = startHeadX + (targets[0]! - startHeadX) * headAmount;
    const headY = startHeadY + (targets[1]! - startHeadY) * headAmount;
    const headZ = startHeadZ + (targets[2]! - startHeadZ) * headAmount;

    for (let segment = 1; segment < count; segment++) {
      const i3 = segment * 3;
      const x = dynamics.points[i3]!;
      const y = dynamics.points[i3 + 1]!;
      const z = dynamics.points[i3 + 2]!;
      dynamics.previous[i3] = x;
      dynamics.previous[i3 + 1] = y;
      dynamics.previous[i3 + 2] = z;

      let velocityX = dynamics.velocities[i3]! * damping;
      let velocityY = dynamics.velocities[i3 + 1]! * damping;
      let velocityZ = dynamics.velocities[i3 + 2]! * damping;
      velocityY -= GRAVITY_ACCELERATION * step;
      dynamics.points[i3] = x + velocityX * step;
      dynamics.points[i3 + 1] = y + velocityY * step;
      dynamics.points[i3 + 2] = z + velocityZ * step;

      // The whole animal transitions continuously between gesture following
      // and gravity. The tail leads that release slightly, but there is no
      // moving threshold along the body that can turn into a visible elbow.
      const progress = segment / (count - 1);
      const released = clamp(holdBlend * (0.88 + progress * 0.12), 0, 1);
      // A body segment follows the gesture only after the recorded prop path
      // actually reaches it. Extrapolating the first few centimetres of motion
      // across the whole animal turns a fresh direction into a violent tail
      // whip, which was especially visible at the start of B.
      const pathRetention = segment < boundedPathTargetCount ? 1 - released : 0;
      if (pathRetention > 0) {
        const follow =
          (1 - Math.exp(-PATH_FOLLOW_RATE * pathRetention * step)) *
          pathRetention;
        dynamics.points[i3] =
          dynamics.points[i3]! + (targets[i3]! - dynamics.points[i3]!) * follow;
        dynamics.points[i3 + 1] =
          dynamics.points[i3 + 1]! +
          (targets[i3 + 1]! - dynamics.points[i3 + 1]!) * follow;
        dynamics.points[i3 + 2] =
          dynamics.points[i3 + 2]! +
          (targets[i3 + 2]! - dynamics.points[i3 + 2]!) * follow;
      }
      if (released > 0) {
        const settle =
          (1 - Math.exp(-GRAVITY_SETTLE_RATE * released * step)) * released;
        dynamics.points[i3] =
          dynamics.points[i3]! + (headX - dynamics.points[i3]!) * settle;
        dynamics.points[i3 + 1] =
          dynamics.points[i3 + 1]! +
          (headY - safeSpacing * segment - dynamics.points[i3 + 1]!) * settle;
        dynamics.points[i3 + 2] =
          dynamics.points[i3 + 2]! +
          (headZ - dynamics.points[i3 + 2]!) * settle;
      }
    }

    dynamics.points[0] = headX;
    dynamics.points[1] = headY;
    dynamics.points[2] = headZ;
    dynamics.velocities[0] = 0;
    dynamics.velocities[1] = 0;
    dynamics.velocities[2] = 0;
    solveAnimalBendConstraints3D(
      dynamics.points,
      count,
      0.05 + holdBlend * 0.16
    );
    solveAnimalDistanceConstraints3D(dynamics.points, count, safeSpacing);
    projectAnimalLinkLengths3D(dynamics.points, targets, count, safeSpacing);

    const inverseStep = 1 / step;
    for (let segment = 1; segment < count; segment++) {
      const i3 = segment * 3;
      let velocityX =
        (dynamics.points[i3]! - dynamics.previous[i3]!) *
        inverseStep *
        CONSTRAINT_VELOCITY_RETENTION;
      let velocityY =
        (dynamics.points[i3 + 1]! - dynamics.previous[i3 + 1]!) *
        inverseStep *
        CONSTRAINT_VELOCITY_RETENTION;
      let velocityZ =
        (dynamics.points[i3 + 2]! - dynamics.previous[i3 + 2]!) *
        inverseStep *
        CONSTRAINT_VELOCITY_RETENTION;
      const speed = Math.hypot(velocityX, velocityY, velocityZ);
      if (speed > MAX_POINT_SPEED) {
        const scale = MAX_POINT_SPEED / speed;
        velocityX *= scale;
        velocityY *= scale;
        velocityZ *= scale;
      }
      dynamics.velocities[i3] = velocityX;
      dynamics.velocities[i3 + 1] = velocityY;
      dynamics.velocities[i3 + 2] = velocityZ;
    }
  }
}

/**
 * The creature needs a stable notion of up and sideways along the whole body.
 * A Frenet frame can flip when a prop path straightens or crosses an inflection,
 * so the frame below carries the previous normal forward with the smallest
 * possible rotation. Crests, eyes, and legs therefore stay on the same side of
 * the animal instead of snapping around its spine.
 */
export function writeAnimalRotationMinimizingFrames3D(
  points: Float32Array,
  count: number,
  buffers: AnimalSpineFrameBuffers3D,
  headFrameSeed?: AnimalHeadFrameSeed3D
): void {
  if (count < 2) return;

  const { tangents, normals, binormals } = buffers;
  writeTangents(points, count, tangents);

  const tx = tangents[0]!;
  const ty = tangents[1]!;
  const tz = tangents[2]!;
  let nx = headFrameSeed?.x ?? -tx * ty;
  let ny = headFrameSeed?.y ?? 1 - ty * ty;
  let nz = headFrameSeed?.z ?? -tz * ty;
  if (headFrameSeed) {
    const alongTangent = nx * tx + ny * ty + nz * tz;
    nx -= tx * alongTangent;
    ny -= ty * alongTangent;
    nz -= tz * alongTangent;
  }
  let normalLength = Math.hypot(nx, ny, nz);
  if (normalLength < EPSILON) {
    nx = 1 - tx * tx;
    ny = -tx * ty;
    nz = -tx * tz;
    normalLength = Math.hypot(nx, ny, nz);
  }
  const inverseNormalLength = normalLength > EPSILON ? 1 / normalLength : 1;
  nx *= inverseNormalLength;
  ny *= inverseNormalLength;
  nz *= inverseNormalLength;
  normals[0] = nx;
  normals[1] = ny;
  normals[2] = nz;
  writeBinormal(tangents, normals, binormals, 0);

  for (let segment = 1; segment < count; segment++) {
    const i3 = segment * 3;
    const previous = i3 - 3;
    const ptx = tangents[previous]!;
    const pty = tangents[previous + 1]!;
    const ptz = tangents[previous + 2]!;
    const ctx = tangents[i3]!;
    const cty = tangents[i3 + 1]!;
    const ctz = tangents[i3 + 2]!;

    let axisX = pty * ctz - ptz * cty;
    let axisY = ptz * ctx - ptx * ctz;
    let axisZ = ptx * cty - pty * ctx;
    const sinAngle = Math.hypot(axisX, axisY, axisZ);
    const cosAngle = clamp(ptx * ctx + pty * cty + ptz * ctz, -1, 1);

    nx = normals[previous]!;
    ny = normals[previous + 1]!;
    nz = normals[previous + 2]!;

    if (sinAngle > EPSILON) {
      const inverseAxisLength = 1 / sinAngle;
      axisX *= inverseAxisLength;
      axisY *= inverseAxisLength;
      axisZ *= inverseAxisLength;
      const crossX = axisY * nz - axisZ * ny;
      const crossY = axisZ * nx - axisX * nz;
      const crossZ = axisX * ny - axisY * nx;
      const axisDotNormal = axisX * nx + axisY * ny + axisZ * nz;
      const oneMinusCos = 1 - cosAngle;
      nx =
        nx * cosAngle + crossX * sinAngle + axisX * axisDotNormal * oneMinusCos;
      ny =
        ny * cosAngle + crossY * sinAngle + axisY * axisDotNormal * oneMinusCos;
      nz =
        nz * cosAngle + crossZ * sinAngle + axisZ * axisDotNormal * oneMinusCos;
    } else if (cosAngle < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }

    const alongTangent = nx * ctx + ny * cty + nz * ctz;
    nx -= ctx * alongTangent;
    ny -= cty * alongTangent;
    nz -= ctz * alongTangent;
    normalLength = Math.hypot(nx, ny, nz);
    if (normalLength < EPSILON) {
      nx = normals[previous]!;
      ny = normals[previous + 1]!;
      nz = normals[previous + 2]!;
      normalLength = Math.hypot(nx, ny, nz);
    }
    const inverseLength = normalLength > EPSILON ? 1 / normalLength : 1;
    normals[i3] = nx * inverseLength;
    normals[i3 + 1] = ny * inverseLength;
    normals[i3 + 2] = nz * inverseLength;
    writeBinormal(tangents, normals, binormals, segment);
  }
}

function solveAnimalBendConstraints3D(
  points: Float32Array,
  count: number,
  stiffness: number
): void {
  for (let iteration = 0; iteration < BEND_SOLVER_ITERATIONS; iteration++) {
    for (let segment = 1; segment < count - 1; segment++) {
      const i3 = segment * 3;
      const previous = i3 - 3;
      const next = i3 + 3;
      points[i3] =
        points[i3]! +
        ((points[previous]! + points[next]!) * 0.5 - points[i3]!) * stiffness;
      points[i3 + 1] =
        points[i3 + 1]! +
        ((points[previous + 1]! + points[next + 1]!) * 0.5 - points[i3 + 1]!) *
          stiffness;
      points[i3 + 2] =
        points[i3 + 2]! +
        ((points[previous + 2]! + points[next + 2]!) * 0.5 - points[i3 + 2]!) *
          stiffness;
    }
  }
}

function solveAnimalDistanceConstraints3D(
  points: Float32Array,
  count: number,
  spacing: number
): void {
  const headX = points[0]!;
  const headY = points[1]!;
  const headZ = points[2]!;
  for (let iteration = 0; iteration < DISTANCE_SOLVER_ITERATIONS; iteration++) {
    for (let segment = 1; segment < count; segment++) {
      const current = segment * 3;
      const previous = current - 3;
      const dx = points[current]! - points[previous]!;
      const dy = points[current + 1]! - points[previous + 1]!;
      const dz = points[current + 2]! - points[previous + 2]!;
      const length = Math.hypot(dx, dy, dz);
      if (length < EPSILON) continue;
      const correction = (length - spacing) / length;
      if (segment === 1) {
        points[current] = points[current]! - dx * correction;
        points[current + 1] = points[current + 1]! - dy * correction;
        points[current + 2] = points[current + 2]! - dz * correction;
      } else {
        const half = correction * 0.5;
        points[previous] = points[previous]! + dx * half;
        points[previous + 1] = points[previous + 1]! + dy * half;
        points[previous + 2] = points[previous + 2]! + dz * half;
        points[current] = points[current]! - dx * half;
        points[current + 1] = points[current + 1]! - dy * half;
        points[current + 2] = points[current + 2]! - dz * half;
      }
    }
    points[0] = headX;
    points[1] = headY;
    points[2] = headZ;
  }
}

function projectAnimalLinkLengths3D(
  points: Float32Array,
  targets: Float32Array,
  count: number,
  spacing: number
): void {
  for (let segment = 1; segment < count; segment++) {
    const i3 = segment * 3;
    const previous = i3 - 3;
    let dx = points[i3]! - points[previous]!;
    let dy = points[i3 + 1]! - points[previous + 1]!;
    let dz = points[i3 + 2]! - points[previous + 2]!;
    let length = Math.hypot(dx, dy, dz);
    if (length < EPSILON) {
      dx = targets[i3]! - targets[previous]!;
      dy = targets[i3 + 1]! - targets[previous + 1]!;
      dz = targets[i3 + 2]! - targets[previous + 2]!;
      length = Math.hypot(dx, dy, dz);
    }
    if (length < EPSILON) {
      dx = 0;
      dy = -1;
      dz = 0;
      length = 1;
    }
    const scale = spacing / length;
    points[i3] = points[previous]! + dx * scale;
    points[i3 + 1] = points[previous + 1]! + dy * scale;
    points[i3 + 2] = points[previous + 2]! + dz * scale;
  }
}

/**
 * Adds a travelling two-harmonic wave without moving the head off the prop.
 * The second axis gives the body a small rolling motion, so the animal reads as
 * a volume in wheel, wall, and floor planes instead of a flat sine ribbon.
 */
export function applyAnimalSlither3D(
  points: Float32Array,
  count: number,
  buffers: AnimalSpineFrameBuffers3D,
  clock: number,
  spacing: number,
  amplitude: number,
  speedRatio: number
): void {
  const activity = smoothstep(speedRatio, 0.02, 0.34);
  if (activity <= 0) return;
  const phaseSpeed = 3.2 + speedRatio * 2.1;
  for (let segment = 1; segment < count; segment++) {
    const i3 = segment * 3;
    const progress = segment / (count - 1);
    const ramp = Math.pow(progress, 1.3);
    const phase = segment * spacing * 3.7 - clock * phaseSpeed;
    const lateralWave =
      (Math.sin(phase) + 0.22 * Math.sin(phase * 2.1 + 0.7)) *
      amplitude *
      ramp *
      activity;
    const rollWave =
      Math.sin(phase * 0.71 + 1.2) * amplitude * 0.22 * ramp * activity;
    points[i3] =
      points[i3]! +
      buffers.binormals[i3]! * lateralWave +
      buffers.normals[i3]! * rollWave;
    points[i3 + 1] =
      points[i3 + 1]! +
      buffers.binormals[i3 + 1]! * lateralWave +
      buffers.normals[i3 + 1]! * rollWave;
    points[i3 + 2] =
      points[i3 + 2]! +
      buffers.binormals[i3 + 2]! * lateralWave +
      buffers.normals[i3 + 2]! * rollWave;
  }
}

/**
 * Species shape the authored slither instead of replacing it. Snakes stay
 * close to the recorded prop trail, while the heavier fantasy silhouettes can
 * carry more secondary motion without losing their path.
 */
export function animalSlitherMultiplier(
  creature: AnimalIntent["creature"]
): number {
  if (creature === "snake") return 0.22;
  if (creature === "dragon") return 0.62;
  return 0.46;
}

export function animalBodyRadiusProfile(
  creature: AnimalIntent["creature"],
  progress: number
): number {
  const u = clamp(progress, 0, 1);
  if (creature === "caterpillar") {
    if (u < 0.08) return 0.72 + (u / 0.08) * 0.28;
    const tail = (u - 0.08) / 0.92;
    return Math.max(0.18, Math.sqrt(Math.max(0, 1 - tail ** 4)));
  }
  if (creature === "dragon") {
    if (u < 0.08) return 0.78 + (u / 0.08) * 0.34;
    if (u < 0.3) return 1.12 - ((u - 0.08) / 0.22) * 0.12;
    const tail = (u - 0.3) / 0.7;
    return Math.max(0.1, 1 - tail * tail * 0.92);
  }
  if (u < 0.075) return 0.72 + (u / 0.075) * 0.28;
  const tail = (u - 0.075) / 0.925;
  return Math.max(0.1, 1 - tail * tail * 0.92);
}

export function animalBuildMultiplier(
  creature: AnimalIntent["creature"]
): number {
  if (creature === "caterpillar") return 1.28;
  if (creature === "dragon") return 1.12;
  return 0.86;
}

function writeTangents(
  points: Float32Array,
  count: number,
  tangents: Float32Array
): void {
  for (let segment = 0; segment < count; segment++) {
    const i3 = segment * 3;
    const towardHead = Math.max(0, segment - 1) * 3;
    const towardTail = Math.min(count - 1, segment + 1) * 3;
    let tx = points[towardHead]! - points[towardTail]!;
    let ty = points[towardHead + 1]! - points[towardTail + 1]!;
    let tz = points[towardHead + 2]! - points[towardTail + 2]!;
    const length = Math.hypot(tx, ty, tz);
    if (length < EPSILON && segment > 0) {
      tx = tangents[i3 - 3]!;
      ty = tangents[i3 - 2]!;
      tz = tangents[i3 - 1]!;
    } else if (length < EPSILON) {
      tx = 1;
      ty = 0;
      tz = 0;
    } else {
      const inverseLength = 1 / length;
      tx *= inverseLength;
      ty *= inverseLength;
      tz *= inverseLength;
    }
    tangents[i3] = tx;
    tangents[i3 + 1] = ty;
    tangents[i3 + 2] = tz;
  }
}

function writeBinormal(
  tangents: Float32Array,
  normals: Float32Array,
  binormals: Float32Array,
  segment: number
): void {
  const i3 = segment * 3;
  const tx = tangents[i3]!;
  const ty = tangents[i3 + 1]!;
  const tz = tangents[i3 + 2]!;
  const nx = normals[i3]!;
  const ny = normals[i3 + 1]!;
  const nz = normals[i3 + 2]!;
  let bx = ty * nz - tz * ny;
  let by = tz * nx - tx * nz;
  let bz = tx * ny - ty * nx;
  const length = Math.hypot(bx, by, bz);
  const inverseLength = length > EPSILON ? 1 / length : 1;
  bx *= inverseLength;
  by *= inverseLength;
  bz *= inverseLength;
  binormals[i3] = bx;
  binormals[i3 + 1] = by;
  binormals[i3 + 2] = bz;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(value: number, min: number, max: number): number {
  const amount = clamp((value - min) / (max - min), 0, 1);
  return amount * amount * (3 - 2 * amount);
}
