import { describe, expect, it } from "vitest";
import { Euler, Quaternion, Vector3 } from "three";
import { computePropRotation } from "../../../node_modules/@austencloud/scene-3d/src/lib/components/props/prop3d-transforms";
import {
  ISOLATION_ENDPOINT,
  ISOLATION_STAFF_CONTACT,
  isolationStaffContact,
  sampleStaffIsolation,
} from "$lib/shared/3d/performers/staff-isolation";

describe("authored rigid staff isolation", () => {
  it("holds the thumb endpoint through all cardinal and intermediate phases", () => {
    const end = new Vector3(...ISOLATION_ENDPOINT);
    for (let i = 0; i <= 960; i++) {
      const sample = sampleStaffIsolation(i / 240);
      const actual = new Vector3(0, ISOLATION_STAFF_CONTACT.lengthM / 2, 0)
        .applyQuaternion(
          new Quaternion().setFromEuler(
            new Euler(...computePropRotation(sample))
          )
        )
        .add(sample.worldPosition);
      expect(actual.distanceTo(end)).toBeLessThan(1e-12);
    }
  });
  it("moves south, east, north, west in audience-view coordinates", () => {
    const points = [0, 1, 2, 3].map(
      (phase) => sampleStaffIsolation(phase).worldPosition
    );
    expect(points[0]!.y).toBeLessThan(ISOLATION_ENDPOINT[1]);
    expect(points[1]!.x).toBeLessThan(0);
    expect(points[2]!.y).toBeGreaterThan(ISOLATION_ENDPOINT[1]);
    expect(points[3]!.x).toBeGreaterThan(0);
  });
  it("keeps the thumb endpoint fixed as shaft length changes", () => {
    const end = new Vector3(...ISOLATION_ENDPOINT);
    for (const lengthM of [0.4, 0.65, 0.9, 1.2]) {
      expect(isolationStaffContact(lengthM).lengthM).toBe(lengthM);
      for (const phase of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]) {
        const sample = sampleStaffIsolation(phase, [0, 0, 0], lengthM);
        const actual = new Vector3(0, lengthM / 2, 0)
          .applyQuaternion(
            new Quaternion().setFromEuler(
              new Euler(...computePropRotation(sample))
            )
          )
          .add(sample.worldPosition);
        expect(actual.distanceTo(end)).toBeLessThan(1e-12);
      }
      expect(
        sampleStaffIsolation(3, [0, 0, 0], lengthM).worldPosition.x
      ).toBeCloseTo(lengthM / 2);
    }
  });
  it("is independent of seek order and continuous at the loop seam", () => {
    expect(sampleStaffIsolation(0).worldPosition.toArray()).toEqual(
      sampleStaffIsolation(4).worldPosition.toArray()
    );
    expect(
      sampleStaffIsolation(-0.001).worldPosition.distanceTo(
        sampleStaffIsolation(0.001).worldPosition
      )
    ).toBeLessThan(0.002);
    const before = sampleStaffIsolation(2.345);
    sampleStaffIsolation(3.99);
    expect(sampleStaffIsolation(2.345).worldPosition.toArray()).toEqual(
      before.worldPosition.toArray()
    );
  });
});
