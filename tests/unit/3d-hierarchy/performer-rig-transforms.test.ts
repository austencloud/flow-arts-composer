/**
 * Snapshot Assertion Tests — PerformerRig Hierarchy
 *
 * Builds minimal Three.js scene graphs matching the planned PerformerRig
 * hierarchy and asserts that world positions match the JSON fixtures
 * captured by capture-snapshots.ts.
 *
 * Every test here should pass — they validate that the new hierarchy math
 * produces identical outputs to the old flat pipeline before any source
 * files are changed.
 */

import { describe, it, expect } from "vitest";
import { Group, Vector3, Euler, Quaternion } from "three";

import wallSnapshots from "./fixtures/wall-mode-snapshots.json";
import dualWheelSnapshots from "./fixtures/dual-wheel-snapshots.json";
import museumSnapshots from "./fixtures/museum-snapshots.json";

import {
  planeAngleToWorldPosition,
  calculatePropQuaternion,
} from "#lib/shared/3d/domain/constants/plane-transforms.js";
import { Plane } from "@austencloud/scene-3d";
import type { PropState3D } from "@austencloud/scene-3d";


const GRID_RADIUS = 0.57;
const STAFF_HALF = 0.475;

// ── Canonical prop-rotation formula ──────────────────────────────────────────
//
// `computePropRotation` is deliberately NOT re-exported from the
// @austencloud/scene-3d public barrel — only the `Plane` enum and the
// `PropState3D` type are. The package keeps it internal: every Prop3D component
// imports it via the relative "./prop3d-transforms" path, and the package
// `exports` map blocks any deep import past the barrel. Rather than reach past
// that API boundary (or vendor-edit node_modules, which CI's fresh install would
// discard), reproduce the canonical formula here. It is byte-identical to the
// package source — @austencloud/scene-3d
// src/lib/components/props/prop3d-transforms.ts (computePropRotation) — and to
// the old local pipeline that generated the JSON fixtures: lay a +Y cylinder
// horizontal (rotate +π/2 about Z), apply the prop's `worldRotation` (the value
// this test gets from the local `calculatePropQuaternion`, which is what the
// test actually validates), then read back the composed Euler. Facing rotation
// is applied by the PerformerRig parent group, not here — matching the fixtures,
// which were captured with facingAngle = 0.
const HORIZONTAL_QUAT = new Quaternion().setFromEuler(
  new Euler(0, 0, Math.PI / 2),
);

function computePropRotation(
  propState: PropState3D,
): [number, number, number] {
  const finalQuat = propState.worldRotation.clone().multiply(HORIZONTAL_QUAT);
  const euler = new Euler().setFromQuaternion(finalQuat);
  return [euler.x, euler.y, euler.z];
}


/**
 * Builds a minimal PerformerRig scene graph and returns the propAnchor Group.
 *
 * Hierarchy:
 *   scene (implicit, at origin)
 *   └── rigRoot        (x=rigPosition.x, y=0, z=rigPosition.z)
 *       └── shoulder   (x=0, y=shoulderHeight, z=0)
 *           └── handAnchor  (handAnchorPosition — plane-specific offset)
 *               └── propAnchor (propLocalPosition — plane-local coords)
 *
 * For wall mode:  handAnchor at (0, 0, gridOffset), propAnchor at plane-local XY
 * For dual wheel: handAnchor at (lateralOffset, 0, 0), propAnchor at plane-local YZ
 */
function buildRigHierarchy(opts: {
  rigPosition: { x: number; y: number; z: number };
  groundOffset: number;
  facingAngle: number;
  shoulderHeight: number;
  handAnchorPosition: { x: number; y: number; z: number };
  propLocalPosition: { x: number; y: number; z: number };
}): Group {
  const {
    rigPosition,
    groundOffset,
    facingAngle,
    shoulderHeight,
    handAnchorPosition,
    propLocalPosition,
  } = opts;

  // Rig root: placed at avatar's XZ position, elevated by groundOffset
  const rigRoot = new Group();
  rigRoot.position.set(
    rigPosition.x,
    groundOffset,
    rigPosition.z
  );

  // Shoulder: local Y = shoulderHeight above the rig root
  const shoulder = new Group();
  shoulder.position.set(0, shoulderHeight, 0);
  rigRoot.add(shoulder);

  // Hand anchor: plane-specific offset (z=gridOffset for wall, x=lateral for wheel)
  const handAnchor = new Group();
  handAnchor.position.set(
    handAnchorPosition.x,
    handAnchorPosition.y,
    handAnchorPosition.z
  );
  shoulder.add(handAnchor);

  // Prop anchor: plane-local position of the prop center
  const propAnchor = new Group();
  propAnchor.position.set(
    propLocalPosition.x,
    propLocalPosition.y,
    propLocalPosition.z
  );
  handAnchor.add(propAnchor);

  // Force world matrix update so getWorldPosition works without a renderer
  rigRoot.updateWorldMatrix(false, true);

  return propAnchor;
}


interface PropSnapshotEntry {
  label: string;
  inputAngle: number;
  inputStaffAngle: number;
  plane: string;
  propCenter: [number, number, number];
  propRotation: [number, number, number];
  skipFacingTransform: boolean;
  lateralOffset: number;
}


function assertWorldPosition(
  propAnchor: Group,
  expected: [number, number, number],
  label: string,
  decimals = 3
): void {
  const worldPos = new Vector3();
  propAnchor.getWorldPosition(worldPos);

  expect(worldPos.x, `${label} x`).toBeCloseTo(expected[0], decimals);
  expect(worldPos.y, `${label} y`).toBeCloseTo(expected[1], decimals);
  expect(worldPos.z, `${label} z`).toBeCloseTo(expected[2], decimals);
}

/**
 * Normalize an angle to the range (-π, π].
 * Used when comparing Euler angles where +π and -π represent identical rotations.
 */
function normalizeAngle(a: number): number {
  // Wrap to (-π, π]
  const TWO_PI = 2 * Math.PI;
  let r = a % TWO_PI;
  if (r > Math.PI) r -= TWO_PI;
  if (r <= -Math.PI) r += TWO_PI;
  return r;
}

function assertRotationClose(
  actual: number,
  expected: number,
  label: string,
  decimals = 3
): void {
  // Both +π and -π represent the same rotation. Normalize before comparing.
  const a = normalizeAngle(actual);
  const e = normalizeAngle(expected);
  expect(a, label).toBeCloseTo(e, decimals);
}

// ── 1. Wall Mode ──────────────────────────────────────────────────────────────

describe("PerformerRig hierarchy matches old pipeline (wall mode)", () => {
  for (const scenario of wallSnapshots) {
    const { avatarPosition, gridOffset, facingAngle, beats } = scenario;

    // shoulderHeight is avatarPosition.y — the old pipeline uses it as the
    // body reference height. groundOffset in the new hierarchy is 0 (avatar
    // stands on the ground; y=shoulderHeight represents the shoulder).
    const shoulderHeight = avatarPosition.y;

    for (const beat of beats) {
      for (const [hand, snap] of [
        ["blue", beat.left],
        ["red", beat.right],
      ] as [string, PropSnapshotEntry][]) {
        const label = `${scenario.label} — ${snap.label}`;

        it(`${label} — world position matches snapshot`, () => {
          // For wall mode the handAnchor sits at z=gridOffset in shoulder-local space.
          // planeAngleToWorldPosition returns (x, y, 0) for WALL — z is always 0.
          const planeLocal = planeAngleToWorldPosition(
            Plane.WALL,
            snap.inputAngle,
            GRID_RADIUS
          );

          const propAnchor = buildRigHierarchy({
            rigPosition: { x: avatarPosition.x, y: 0, z: avatarPosition.z },
            groundOffset: 0,
            facingAngle,
            shoulderHeight,
            handAnchorPosition: { x: 0, y: 0, z: gridOffset },
            propLocalPosition: {
              x: planeLocal.x,
              y: planeLocal.y,
              z: planeLocal.z,
            },
          });

          assertWorldPosition(propAnchor, snap.propCenter, label);
        });
      }
    }
  }
});

// ── 2. Dual Wheel Mode ────────────────────────────────────────────────────────

describe("PerformerRig hierarchy matches old pipeline (dual-wheel mode)", () => {
  for (const scenario of dualWheelSnapshots) {
    const { avatarPosition, gridOffset, facingAngle, beats } = scenario;
    const shoulderHeight = avatarPosition.y;

    for (const beat of beats) {
      for (const [hand, snap] of [
        ["blue", beat.left],
        ["red", beat.right],
      ] as [string, PropSnapshotEntry][]) {
        const label = `${scenario.label} — ${snap.label}`;

        it(`${label} — world position matches snapshot`, () => {
          // Dual wheel: handAnchor carries the lateral X offset.
          // planeAngleToWorldPosition(WHEEL) returns (0, y, z) — no X component.
          // The lateral offset goes on the handAnchor so the propAnchor holds
          // only the pure plane-local position.
          const planeLocal = planeAngleToWorldPosition(
            Plane.WHEEL,
            snap.inputAngle,
            GRID_RADIUS
          );

          const propAnchor = buildRigHierarchy({
            rigPosition: { x: avatarPosition.x, y: 0, z: avatarPosition.z },
            groundOffset: 0,
            facingAngle,
            shoulderHeight,
            // handAnchor holds the lateral X; no forward Z offset for wheel
            handAnchorPosition: {
              x: snap.lateralOffset,
              y: 0,
              z: gridOffset,
            },
            propLocalPosition: {
              x: planeLocal.x,
              y: planeLocal.y,
              z: planeLocal.z,
            },
          });

          assertWorldPosition(propAnchor, snap.propCenter, label);
        });
      }
    }
  }
});

// ── 3. Ground Offset (museum platform) ───────────────────────────────────────

describe("PerformerRig with groundOffset (museum)", () => {
  it("groundOffset=0.3 shifts all y positions up by 0.3", () => {
    // Take the first wall-mode snapshot beat and compare the y coordinate
    // when groundOffset is 0 vs 0.3.
    const scenario = wallSnapshots[0];
    if (!scenario) return;

    const beat = scenario.beats[0];
    if (!beat) return;

    const snap = beat.left;
    const shoulderHeight = scenario.avatarPosition.y;
    const planeLocal = planeAngleToWorldPosition(
      Plane.WALL,
      snap.inputAngle,
      GRID_RADIUS
    );

    const makeRig = (groundOffset: number) =>
      buildRigHierarchy({
        rigPosition: { x: 0, y: 0, z: 0 },
        groundOffset,
        facingAngle: 0,
        shoulderHeight,
        handAnchorPosition: { x: 0, y: 0, z: scenario.gridOffset },
        propLocalPosition: { x: planeLocal.x, y: planeLocal.y, z: planeLocal.z },
      });

    const pos0 = new Vector3();
    makeRig(0).getWorldPosition(pos0);

    const pos03 = new Vector3();
    makeRig(0.3).getWorldPosition(pos03);

    expect(pos03.x).toBeCloseTo(pos0.x, 5);
    expect(pos03.y).toBeCloseTo(pos0.y + 0.3, 3);
    expect(pos03.z).toBeCloseTo(pos0.z, 5);
  });
});

// ── 4. Prop Rotation Matches Old Pipeline ─────────────────────────────────────

describe("Prop rotation matches old pipeline", () => {
  for (const scenario of wallSnapshots) {
    const { facingAngle, beats } = scenario;

    for (const beat of beats) {
      for (const [hand, snap] of [
        ["blue", beat.left],
        ["red", beat.right],
      ] as [string, PropSnapshotEntry][]) {
        const label = `${scenario.label} — ${snap.label}`;

        it(`${label} — rotation matches snapshot`, () => {
          // Build a minimal PropState3D matching what the old pipeline used
          const worldPosition = planeAngleToWorldPosition(
            Plane.WALL,
            snap.inputAngle,
            GRID_RADIUS
          );
          const worldRotation = calculatePropQuaternion(
            Plane.WALL,
            snap.inputStaffAngle
          );

          const propState: PropState3D = {
            centerPathAngle: snap.inputAngle,
            staffRotationAngle: snap.inputStaffAngle,
            plane: Plane.WALL,
            worldPosition,
            worldRotation,
            skipFacingTransform: snap.skipFacingTransform,
          };

          const rotation = computePropRotation(propState);

          assertRotationClose(rotation[0], snap.propRotation[0], `${label} rx`);
          assertRotationClose(rotation[1], snap.propRotation[1], `${label} ry`);
          assertRotationClose(rotation[2], snap.propRotation[2], `${label} rz`);
        });
      }
    }
  }
});

// ── 5. Tip Positions Computed from Hierarchy ──────────────────────────────────

describe("Tip positions computed from hierarchy", () => {
  it("tips are STAFF_LENGTH apart and equidistant from center", () => {
    const scenario = wallSnapshots[0];
    if (!scenario) return;

    const beat = scenario.beats[0];
    if (!beat) return;

    const snap = beat.left;
    const shoulderHeight = scenario.avatarPosition.y;

    const planeLocal = planeAngleToWorldPosition(
      Plane.WALL,
      snap.inputAngle,
      GRID_RADIUS
    );

    const propAnchor = buildRigHierarchy({
      rigPosition: { x: 0, y: 0, z: 0 },
      groundOffset: 0,
      facingAngle: 0,
      shoulderHeight,
      handAnchorPosition: { x: 0, y: 0, z: scenario.gridOffset },
      propLocalPosition: { x: planeLocal.x, y: planeLocal.y, z: planeLocal.z },
    });

    const center = new Vector3();
    propAnchor.getWorldPosition(center);

    // Staff rotation: compute the axis along which the staff lies.
    // For wall mode with facingAngle=0, the staff rotation is around Z.
    // propRotation[2] = the Z-euler angle from computePropRotation.
    const worldRotation = calculatePropQuaternion(Plane.WALL, snap.inputStaffAngle);
    const propState: PropState3D = {
      centerPathAngle: snap.inputAngle,
      staffRotationAngle: snap.inputStaffAngle,
      plane: Plane.WALL,
      worldPosition: planeLocal.clone(),
      worldRotation,
      skipFacingTransform: false,
    };

    const [rx, ry, rz] = computePropRotation(propState);

    // The staff axis: starts as +Y (cylinder default), then apply the final rotation.
    // After computePropRotation's horizontal tilt (π/2 around Z), the staff axis
    // in the final orientation points along the X axis, then rotated by the euler.
    const finalQuat = new Quaternion().setFromEuler(new Euler(rx, ry, rz));
    // Staff axis in local space is +X (after horizontal tilt from prop3d-transforms)
    const staffAxis = new Vector3(1, 0, 0).applyQuaternion(finalQuat).normalize();

    const tip1 = center.clone().addScaledVector(staffAxis, STAFF_HALF);
    const tip2 = center.clone().addScaledVector(staffAxis, -STAFF_HALF);

    const staffLength = tip1.distanceTo(tip2);
    expect(staffLength).toBeCloseTo(STAFF_HALF * 2, 3);

    const d1 = tip1.distanceTo(center);
    const d2 = tip2.distanceTo(center);
    expect(d1).toBeCloseTo(STAFF_HALF, 3);
    expect(d2).toBeCloseTo(STAFF_HALF, 3);
  });

  it("tip midpoint equals prop center for several wall-mode beats", () => {
    const scenario = wallSnapshots[0];
    if (!scenario) return;

    for (const beat of scenario.beats) {
      const snap = beat.left;
      const shoulderHeight = scenario.avatarPosition.y;

      const planeLocal = planeAngleToWorldPosition(
        Plane.WALL,
        snap.inputAngle,
        GRID_RADIUS
      );

      const propAnchor = buildRigHierarchy({
        rigPosition: { x: 0, y: 0, z: 0 },
        groundOffset: 0,
        facingAngle: 0,
        shoulderHeight,
        handAnchorPosition: { x: 0, y: 0, z: scenario.gridOffset },
        propLocalPosition: {
          x: planeLocal.x,
          y: planeLocal.y,
          z: planeLocal.z,
        },
      });

      const center = new Vector3();
      propAnchor.getWorldPosition(center);

      const worldRotation = calculatePropQuaternion(
        Plane.WALL,
        snap.inputStaffAngle
      );
      const propState: PropState3D = {
        centerPathAngle: snap.inputAngle,
        staffRotationAngle: snap.inputStaffAngle,
        plane: Plane.WALL,
        worldPosition: planeLocal.clone(),
        worldRotation,
        skipFacingTransform: false,
      };

      const [rx, ry, rz] = computePropRotation(propState);
      const finalQuat = new Quaternion().setFromEuler(new Euler(rx, ry, rz));
      const staffAxis = new Vector3(1, 0, 0).applyQuaternion(finalQuat).normalize();

      const tip1 = center.clone().addScaledVector(staffAxis, STAFF_HALF);
      const tip2 = center.clone().addScaledVector(staffAxis, -STAFF_HALF);
      const midpoint = tip1.clone().add(tip2).multiplyScalar(0.5);

      expect(midpoint.x, `${snap.label} midpoint.x`).toBeCloseTo(center.x, 3);
      expect(midpoint.y, `${snap.label} midpoint.y`).toBeCloseTo(center.y, 3);
      expect(midpoint.z, `${snap.label} midpoint.z`).toBeCloseTo(center.z, 3);
    }
  });
});

// ── 6. Museum Snapshots with groundOffset ────────────────────────────────────

describe("Museum snapshots with groundOffset", () => {
  // Museum avatarPosition.y = SHOULDER_HEIGHT + 0.3 (platform elevation).
  // In the new PerformerRig model this becomes:
  //   groundOffset  = 0.3  (platform/pedestal height)
  //   shoulderHeight = SHOULDER_HEIGHT (same constant, independent of platform)
  // World y = groundOffset + shoulderHeight + propLocalY
  //         = 0.3 + 1.5621 + propLocalY
  //         = museum_avatarPosition.y + propLocalY   ✓

  const MUSEUM_GROUND_OFFSET = 0.3;
  const MUSEUM_SHOULDER_HEIGHT = 190.5 * 0.82 * 0.01; // ≈ 1.5621

  for (const scenario of museumSnapshots) {
    const { avatarPosition, gridOffset, facingAngle, beats } = scenario;

    for (const beat of beats) {
      for (const [hand, snap] of [
        ["blue", beat.left],
        ["red", beat.right],
      ] as [string, PropSnapshotEntry][]) {
        const label = `${scenario.label} — ${snap.label}`;

        it(`${label} — world position matches snapshot`, () => {
          const planeLocal = planeAngleToWorldPosition(
            Plane.WALL,
            snap.inputAngle,
            GRID_RADIUS
          );

          const propAnchor = buildRigHierarchy({
            rigPosition: { x: avatarPosition.x, y: 0, z: avatarPosition.z },
            groundOffset: MUSEUM_GROUND_OFFSET,
            facingAngle,
            shoulderHeight: MUSEUM_SHOULDER_HEIGHT,
            handAnchorPosition: { x: 0, y: 0, z: gridOffset },
            propLocalPosition: {
              x: planeLocal.x,
              y: planeLocal.y,
              z: planeLocal.z,
            },
          });

          assertWorldPosition(propAnchor, snap.propCenter, label);
        });
      }
    }
  }
});
