import { describe, it, expect } from "vitest";
import { Plane } from "@austencloud/scene-3d";
import {
  MotionType,
  RotationDirection,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { buildSweptVolume } from "./swept-volume-builder";
import { handToPropTarget } from "#lib/features/lab/tabs/collision-lab/services/pose-target-mapper.js";
import type { MotionConfig3D } from "#lib/shared/3d/domain/models/motion-data-3d.js";

// LH wheel-plane spin held at south, "in", 2 turns — the impaling move.
const blueSpin: MotionConfig3D = {
  plane: Plane.WHEEL,
  startLocation: GridLocation.SOUTH,
  endLocation: GridLocation.SOUTH,
  motionType: MotionType.STATIC,
  rotationDirection: RotationDirection.CLOCKWISE,
  turns: 2,
  startOrientation: Orientation.IN,
  endOrientation: Orientation.IN,
};

describe("buildSweptVolume", () => {
  it("start sample matches the canonical Collision Lab mapper (frames agree)", () => {
    const vol = buildSweptVolume(blueSpin, 24);
    const start = vol.samples[0]!;
    const canonical = handToPropTarget(Plane.WHEEL, "S", "in");
    // Both coordinate paths must land the grip in the same frame within 1 mm.
    expect(start.gripWorld.distanceTo(canonical.gripWorld)).toBeLessThan(0.001);
    // And the shaft direction must agree (dot of normalized axes ~ ±1).
    const aStart = start.tipAWorld.clone().sub(start.gripWorld).normalize();
    const aCanon = canonical.tipAWorld.clone().sub(canonical.gripWorld).normalize();
    expect(Math.abs(aStart.dot(aCanon))).toBeGreaterThan(0.999);
  });

  it("produces the requested number of samples with finite endpoints", () => {
    const vol = buildSweptVolume(blueSpin, 24);
    expect(vol.samples.length).toBe(24);
    for (const s of vol.samples) {
      expect(Number.isFinite(s.tipAWorld.x)).toBe(true);
      expect(Number.isFinite(s.tipBWorld.y)).toBe(true);
      expect(s.radius).toBeGreaterThan(0);
    }
  });

  it("the wheel-plane sweep occupies a range of Z (sagittal sweep through body)", () => {
    const vol = buildSweptVolume(blueSpin, 24);
    const zs = vol.samples.flatMap((s) => [s.tipAWorld.z, s.tipBWorld.z]);
    const span = Math.max(...zs) - Math.min(...zs);
    // A wheel-plane spin sweeps front-to-back; span must be a sizeable fraction
    // of the staff length (0.86 m total), proving it crosses the torso depth.
    expect(span).toBeGreaterThan(0.3);
  });
});
