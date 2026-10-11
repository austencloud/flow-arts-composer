import { describe, it, expect } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import demo from "#lib/shared/landing/data/demo-sequence.json";
import {
  computeAutoOrbitShot,
  computeChoreographerShot,
  computePlaneShot,
  computeGroupBounds,
  computeRevealStartShot,
  type PerformerShotSubject,
} from "../../../src/lib/shared/sequence-viewer/camera-choreography/presets/shots";

function fakePerformer(x: number, z: number): PerformerShotSubject {
  return { position: { x, z } };
}

describe("camera-choreography shot helpers", () => {
  const joinedSequence = {
    ...(demo as unknown as SequenceData),
    conjoined: { toward: "e", steps: 2 },
  } as SequenceData;

  it("keeps the original unjoined solo radius", () => {
    expect(computeGroupBounds([fakePerformer(0, 0)]).radius).toBe(1.2);
  });

  it("fits joined hand grids and prop reach in each shared shot", () => {
    const solo = fakePerformer(0, 0);
    const joined = { ...solo, loadedSequence: joinedSequence };
    const standardRadius = computeGroupBounds([solo]).radius;
    const joinedRadius = computeGroupBounds([joined]).radius;
    expect(joinedRadius).toBeGreaterThan(standardRadius + 0.5);

    const standardShots = [
      computePlaneShot("wall", [solo]),
      computeAutoOrbitShot([solo], 0),
      computeChoreographerShot([solo], 0),
      computeRevealStartShot([solo], 0),
    ];
    const joinedShots = [
      computePlaneShot("wall", [joined]),
      computeAutoOrbitShot([joined], 0),
      computeChoreographerShot([joined], 0),
      computeRevealStartShot([joined], 0),
    ];
    for (let index = 0; index < standardShots.length; index++) {
      expect(
        joinedShots[index].eye.distanceTo(joinedShots[index].target)
      ).toBeGreaterThan(
        standardShots[index].eye.distanceTo(standardShots[index].target)
      );
    }
  });

  it("includes the actual staff half length in joined bounds", () => {
    const joined = { ...fakePerformer(0, 0), loadedSequence: joinedSequence };
    const standard = computeGroupBounds([{ ...joined, staffHalfLength: 0.43 }]);
    const longStaff = computeGroupBounds([{ ...joined, staffHalfLength: 2 }]);
    expect(longStaff.radius - standard.radius).toBeGreaterThan(1);
  });

  it("uses the widest joined performer, even when it is off center", () => {
    const bounds = computeGroupBounds([
      fakePerformer(-2, 0),
      { ...fakePerformer(2, 0), loadedSequence: joinedSequence },
    ]);
    expect(bounds.radius).toBeGreaterThan(3.7);
  });
  it("computes group bounds centered on the mean XZ position", () => {
    const bounds = computeGroupBounds([
      fakePerformer(1, 0),
      fakePerformer(-1, 0),
    ]);
    expect(bounds.center.x).toBeCloseTo(0);
    expect(bounds.center.z).toBeCloseTo(0);
    expect(bounds.radius).toBeGreaterThan(1);
  });

  it("auto-orbit shot sits a positive distance from the performer", () => {
    const shot = computeAutoOrbitShot([fakePerformer(0, 0)], 0);
    const dx = shot.eye.x - shot.target.x;
    const dy = shot.eye.y - shot.target.y;
    const dz = shot.eye.z - shot.target.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    expect(dist).toBeGreaterThan(1);
    // Polar 65° means eye is above target.
    expect(shot.eye.y).toBeGreaterThan(shot.target.y);
  });

  it("wall shot puts the camera along -Z from the centroid", () => {
    const shot = computePlaneShot("wall", [fakePerformer(0, 0)]);
    expect(shot.target.x).toBeCloseTo(0);
    expect(shot.eye.x).toBeCloseTo(0);
    expect(shot.eye.y).toBeCloseTo(shot.target.y);
    expect(shot.eye.z).toBeLessThan(shot.target.z);
  });

  it("wheel shot puts the camera along +X from the centroid", () => {
    const shot = computePlaneShot("wheel", [fakePerformer(0, 0)]);
    expect(shot.eye.x).toBeGreaterThan(shot.target.x);
    expect(shot.eye.y).toBeCloseTo(shot.target.y);
    expect(shot.eye.z).toBeCloseTo(shot.target.z);
  });

  it("floor shot puts the camera above the centroid", () => {
    const shot = computePlaneShot("floor", [fakePerformer(0, 0)]);
    expect(shot.eye.x).toBeCloseTo(shot.target.x);
    expect(shot.eye.y).toBeGreaterThan(shot.target.y);
    expect(shot.eye.z).toBeCloseTo(shot.target.z);
  });

  it("centers the choreographer shot on the destination formation", () => {
    const shot = computeChoreographerShot(
      [fakePerformer(3, -2), fakePerformer(5, 2)],
      2.5
    );

    expect(shot.target.x).toBeCloseTo(4);
    expect(shot.target.z).toBeCloseTo(0);
    expect(shot.target.y).toBeCloseTo(3.05);
  });

  it("backs the choreographer camera away as the formation spreads", () => {
    const compact = computeChoreographerShot(
      [fakePerformer(-0.5, 0), fakePerformer(0.5, 0)],
      0
    );
    const wide = computeChoreographerShot(
      [fakePerformer(-4, 0), fakePerformer(4, 0)],
      0
    );

    const compactDistance = compact.eye.distanceTo(compact.target);
    const wideDistance = wide.eye.distanceTo(wide.target);
    expect(wideDistance).toBeGreaterThan(compactDistance);
  });

  it("backs the choreographer camera away in a portrait viewport", () => {
    const performers = [fakePerformer(-2, 0), fakePerformer(2, 0)];
    const landscape = computeChoreographerShot(performers, 0, 16 / 9);
    const portrait = computeChoreographerShot(performers, 0, 9 / 16);

    expect(portrait.eye.distanceTo(portrait.target)).toBeGreaterThan(
      landscape.eye.distanceTo(landscape.target)
    );
  });
});
