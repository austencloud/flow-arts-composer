/**
 * Staff against body: how far a staff comes into the performer's head and
 * torso for a given torso turn.
 *
 * The body is a stack of horizontal sections, each a rounded box, measured
 * from the skinned mesh of both supported rigs (ch07 and ch18) in the bind
 * pose at 1.905 m. Every head, neck, clavicle and torso vertex within 3.5 cm
 * of a section's height lies inside that section, so a staff point outside
 * every section near its height is outside the mesh. Each section turns with
 * the bone that skins it, about the world vertical through the upper spine,
 * which is how the animator applies the stance segments. A section that
 * spans a joint is tested at both bones' yaws.
 *
 * Rounded boxes, not ellipses: the chest and back are flat, and the smallest
 * covering ellipse per section came out up to 38% wider than the body. An
 * elliptical stack (Hanavan, 1964) would refuse turns that clear the real
 * chest by several centimetres.
 *
 * Ownership, per `.claude/rules/never-hand-roll.md`. Searched: staff or prop
 * through torso or head, penetration, clearance, body volume, capsule, signed
 * distance. Closest matches, none of which models the turned torso the stance
 * plans:
 * - `@austencloud/scene-3d` `CollisionDetector` and the collision lab's
 *   `StanceSimulator`, which mirrors it with spheres and ellipsoids. The mesh
 *   scoreboard showed the package spheres misplace the face and miss the front
 *   of the chest.
 * - `tests/unit/3d/performer-body-mesh.ts`: exact, but it scans the loaded
 *   skinned mesh, far too slow for every sample of a plan, and exists only in
 *   tests.
 * - `wall-feasibility-scanner.ts` (offline, square stance, through
 *   `StanceSimulator`), the dodge planner's torso half extent (locomotion
 *   clearance) and `hard-beat-displacement.ts` (arm reach, no torso volume).
 * Decision: a new capability, owned here, for planning. The mesh scan stays
 * the measurement, and `staff-body-clearance.test.ts` holds this table to it.
 *
 * Every prop is tested as a staff of the performer's staff length along the
 * prop's own axis. That is exact for the staff and a stand-in for the rest.
 *
 * Frame: the performer's. +x is the performer's left, +y is height above the
 * floor, +z points toward the audience, and the performer origin is x = z = 0.
 */

import { DEFAULT_SCENE_DIMENSIONS } from "@austencloud/scene-3d";

/** The performer height every length in the section table was measured at. */
export const CLEARANCE_CALIBRATION_HEIGHT_M = 1.905;

/**
 * Kept clear around the staff's own radius, so a staff that grazes the skin
 * already counts. Not scaled with height.
 */
export const STAFF_BODY_MARGIN_M = 0.01;

const SECTION_SPACING_M = 0.05;
/** How far above and below its height a section's coverage reaches. */
const SECTION_BAND_M = 0.035;
const LOWEST_SECTION_M = 0.9;
const HIGHEST_SECTION_M = 1.9;
/**
 * Depth of the turn axis: the upper spine joint, -0.002 on ch07 and -0.014 on
 * ch18.
 */
const PIVOT_Z_M = -0.008;
/** Staff points are tested at most this far apart along its length. */
const STAFF_SAMPLE_SPACING_M = 0.02;

type SectionBone = "hips" | "spine1" | "chest" | "head";

interface BodySection {
  /** Height above the floor. */
  heightM: number;
  halfWidthM: number;
  /** Centre of the box's depth span, from the turn axis. */
  centerZM: number;
  halfDepthM: number;
  cornerM: number;
  /** Farthest the box reaches from the turn axis, for a quick rejection. */
  reachM: number;
  bones: readonly SectionBone[];
}

function section(
  heightM: number,
  halfWidthM: number,
  backM: number,
  frontM: number,
  cornerM: number,
  bones: readonly SectionBone[]
): BodySection {
  return {
    heightM,
    halfWidthM,
    centerZM: (backM + frontM) / 2,
    halfDepthM: (frontM - backM) / 2,
    cornerM,
    reachM: Math.hypot(halfWidthM, Math.max(-backM, frontM)),
    bones,
  };
}

const HIPS: readonly SectionBone[] = ["hips"];
const HIPS_SPINE1: readonly SectionBone[] = ["hips", "spine1"];
const SPINE1_CHEST: readonly SectionBone[] = ["spine1", "chest"];
const CHEST: readonly SectionBone[] = ["chest"];
const CHEST_HEAD: readonly SectionBone[] = ["chest", "head"];
const HEAD: readonly SectionBone[] = ["head"];

/**
 * Height, half-width, back, front (depth from the turn axis) and corner
 * radius, metres at 1.905 m, pooled over ch07 and ch18. Each covers every
 * vertex skinned to its part within 3.5 cm of its height. Which bones a
 * section turns with comes from the rigs' joint heights: a section whose band
 * reaches a joint is tested at the yaw on either side of it.
 */
const SECTIONS: readonly BodySection[] = [
  // Torso, including the pelvis, which the stance never turns.
  section(0.9, 0.102, -0.088, 0.143, 0.014, HIPS),
  section(0.95, 0.189, -0.106, 0.158, 0.111, HIPS),
  section(1.0, 0.189, -0.105, 0.168, 0.097, HIPS),
  section(1.05, 0.189, -0.104, 0.173, 0.079, HIPS),
  section(1.1, 0.2, -0.122, 0.178, 0.122, HIPS),
  section(1.15, 0.203, -0.125, 0.191, 0.121, HIPS),
  section(1.2, 0.204, -0.124, 0.181, 0.113, HIPS),
  section(1.25, 0.204, -0.122, 0.181, 0.119, HIPS_SPINE1),
  section(1.3, 0.207, -0.114, 0.183, 0.121, HIPS_SPINE1),
  section(1.35, 0.18, -0.11, 0.178, 0.096, HIPS_SPINE1),
  section(1.4, 0.192, -0.115, 0.184, 0.08, SPINE1_CHEST),
  section(1.45, 0.186, -0.123, 0.184, 0.055, SPINE1_CHEST),
  section(1.5, 0.181, -0.124, 0.165, 0.046, CHEST),
  section(1.55, 0.158, -0.122, 0.13, 0.031, CHEST),
  section(1.6, 0.144, -0.103, 0.1, 0.01, CHEST),
  section(1.65, 0.099, -0.073, 0.094, 0.037, CHEST),
  // Clavicles: the skin of the shoulder bones, wider than the ribcage.
  section(1.4, 0.213, -0.054, 0.065, 0.021, CHEST),
  section(1.45, 0.226, -0.101, 0.099, 0.01, CHEST),
  section(1.5, 0.235, -0.112, 0.101, 0.039, CHEST),
  section(1.55, 0.238, -0.112, 0.091, 0.045, CHEST),
  section(1.6, 0.225, -0.097, 0.081, 0.045, CHEST),
  // Neck and head.
  section(1.6, 0.07, 0.012, 0.12, 0.003, CHEST_HEAD),
  section(1.65, 0.081, -0.083, 0.167, 0.08, CHEST_HEAD),
  section(1.7, 0.103, -0.094, 0.182, 0.099, HEAD),
  section(1.75, 0.103, -0.101, 0.183, 0.078, HEAD),
  section(1.8, 0.107, -0.109, 0.208, 0.096, HEAD),
  section(1.85, 0.099, -0.103, 0.208, 0.079, HEAD),
  section(1.9, 0.082, -0.072, 0.138, 0.062, HEAD),
];

const LEVEL_COUNT =
  Math.round((HIGHEST_SECTION_M - LOWEST_SECTION_M) / SECTION_SPACING_M) + 1;

const SECTIONS_BY_LEVEL: readonly (readonly BodySection[])[] = (() => {
  const levels: BodySection[][] = Array.from({ length: LEVEL_COUNT }, () => []);
  for (const entry of SECTIONS) {
    const level = Math.round(
      (entry.heightM - LOWEST_SECTION_M) / SECTION_SPACING_M
    );
    levels[level]!.push(entry);
  }
  return levels;
})();

/** The body and staff a clearance is measured for. */
export interface StaffBodyClearanceBody {
  /** Performer height. Every section scales with it. */
  heightM: number;
  /** Height of the grid centre above the floor. */
  gridHeightM: number;
  staffLengthM: number;
  staffRadiusM: number;
}

/** The scene's default performer (190.5 cm) with its default 34-inch staff. */
export const DEFAULT_STAFF_BODY_CLEARANCE_BODY: Readonly<StaffBodyClearanceBody> =
  Object.freeze({
    heightM: CLEARANCE_CALIBRATION_HEIGHT_M,
    gridHeightM: -DEFAULT_SCENE_DIMENSIONS.groundY,
    staffLengthM: DEFAULT_SCENE_DIMENSIONS.staffLength,
    staffRadiusM: DEFAULT_SCENE_DIMENSIONS.staffRadius,
  });

/**
 * How far each stance segment is turned about the vertical, radians, as the
 * animator applies them: cumulative, so `chestRad` is the shoulder line. The
 * pelvis never turns.
 */
export interface BodyYawPose {
  spine1Rad: number;
  chestRad: number;
  headRad: number;
}

/** A staff in the performer frame, as a centre, a unit axis and a half length. */
export interface ClearanceStaff {
  centerX: number;
  centerY: number;
  centerZ: number;
  axisX: number;
  axisY: number;
  axisZ: number;
  halfLengthM: number;
}

/** Where a prop is, in its grid's frame. The rotation is optional. */
export interface ClearanceProp {
  worldPosition: { x: number; y: number; z: number };
  worldRotation?: { x: number; y: number; z: number; w: number } | null;
}

/**
 * The staff a prop draws, in the performer frame. The prop's grid sits
 * `lateralM` to the side and `gridOffsetM` in front of the performer, with its
 * centre `body.gridHeightM` above the floor; `depthOffsetM` is the stance
 * corridor. The staff runs along the prop's local -x (the scene lays the staff
 * mesh's +y there). Without a rotation only the grip is known, so only the
 * grip is tested.
 */
export function clearanceStaffForProp(
  prop: ClearanceProp,
  lateralM: number,
  gridOffsetM: number,
  depthOffsetM: number,
  body: StaffBodyClearanceBody
): ClearanceStaff {
  const q = prop.worldRotation;
  let axisX = 0;
  let axisY = 0;
  let axisZ = 0;
  let halfLengthM = 0;
  if (q) {
    // (-1, 0, 0) rotated by q.
    axisX = -1 + 2 * (q.y * q.y + q.z * q.z);
    axisY = -2 * (q.x * q.y + q.w * q.z);
    axisZ = 2 * (q.w * q.y - q.x * q.z);
    const length = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
    if (length > 1e-9) {
      axisX /= length;
      axisY /= length;
      axisZ /= length;
      halfLengthM = body.staffLengthM / 2;
    }
  }
  return {
    centerX: lateralM + prop.worldPosition.x,
    centerY: body.gridHeightM + prop.worldPosition.y,
    centerZ: gridOffsetM + prop.worldPosition.z + depthOffsetM,
    axisX,
    axisY,
    axisZ,
    halfLengthM,
  };
}

function roundedBoxDistance(
  x: number,
  z: number,
  halfX: number,
  halfZ: number,
  corner: number
): number {
  const qx = Math.abs(x) - halfX + corner;
  const qz = Math.abs(z) - halfZ + corner;
  const ox = Math.max(qx, 0);
  const oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(qx, qz), 0) - corner;
}

function bodyScale(body: StaffBodyClearanceBody): number {
  return Number.isFinite(body.heightM) && body.heightM > 0
    ? body.heightM / CLEARANCE_CALIBRATION_HEIGHT_M
    : 1;
}

/**
 * The deepest any staff point comes into the body, metres: how far inside the
 * clearance envelope (the body grown by the staff radius plus
 * `STAFF_BODY_MARGIN_M`). Positive is a hit. Negative is the smallest
 * clearance among the staff points level with the table; `-Infinity` when no
 * staff point is level with the head or torso at all.
 *
 * `stopAboveM` returns early once the answer is known to exceed it, for a
 * caller that only needs a yes or no.
 */
export function staffBodyIntrusionM(
  staffs: readonly (ClearanceStaff | null)[],
  pose: BodyYawPose,
  body: StaffBodyClearanceBody,
  stopAboveM = Infinity
): number {
  const scale = bodyScale(body);
  const inflation = body.staffRadiusM + STAFF_BODY_MARGIN_M;
  const pivotZ = PIVOT_Z_M * scale;
  const bottom = (LOWEST_SECTION_M - SECTION_BAND_M) * scale;
  const top = (HIGHEST_SECTION_M + SECTION_BAND_M) * scale;
  const cos: Record<SectionBone, number> = {
    hips: 1,
    spine1: Math.cos(pose.spine1Rad),
    chest: Math.cos(pose.chestRad),
    head: Math.cos(pose.headRad),
  };
  const sin: Record<SectionBone, number> = {
    hips: 0,
    spine1: Math.sin(pose.spine1Rad),
    chest: Math.sin(pose.chestRad),
    head: Math.sin(pose.headRad),
  };

  let worst = -Infinity;
  for (const staff of staffs) {
    if (!staff) continue;
    const segments =
      staff.halfLengthM > 0
        ? Math.ceil((2 * staff.halfLengthM) / STAFF_SAMPLE_SPACING_M)
        : 0;
    for (let i = 0; i <= segments; i++) {
      const u =
        segments === 0
          ? 0
          : -staff.halfLengthM + (2 * staff.halfLengthM * i) / segments;
      const y = staff.centerY + staff.axisY * u;
      if (y < bottom || y > top) continue;
      const x = staff.centerX + staff.axisX * u;
      const z = staff.centerZ + staff.axisZ * u - pivotZ;
      const radius = Math.sqrt(x * x + z * z);
      const level = y / scale;
      const first = Math.max(
        0,
        Math.ceil(
          (level - SECTION_BAND_M - LOWEST_SECTION_M) / SECTION_SPACING_M - 1e-9
        )
      );
      const last = Math.min(
        LEVEL_COUNT - 1,
        Math.floor(
          (level + SECTION_BAND_M - LOWEST_SECTION_M) / SECTION_SPACING_M + 1e-9
        )
      );
      for (let k = first; k <= last; k++) {
        for (const entry of SECTIONS_BY_LEVEL[k]!) {
          // No point of this section is nearer than this, whatever the turn.
          if (inflation - (radius - entry.reachM * scale) <= worst) continue;
          const halfX = entry.halfWidthM * scale;
          const halfZ = entry.halfDepthM * scale;
          const centerZ = entry.centerZM * scale;
          const corner = entry.cornerM * scale;
          for (const bone of entry.bones) {
            const c = cos[bone];
            const s = sin[bone];
            // Into the turned section's own frame.
            const bx = x * c - z * s;
            const bz = x * s + z * c;
            const intrusion =
              inflation -
              roundedBoxDistance(bx, bz - centerZ, halfX, halfZ, corner);
            if (intrusion > worst) {
              worst = intrusion;
              if (worst > stopAboveM) return worst;
            }
          }
        }
      }
    }
  }
  return worst;
}
