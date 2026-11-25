import { describe, expect, it } from "vitest";
import {
  moonBeaconLevel,
  moonBenchPlacements,
  moonMastPlacements,
  moonPadLightLevel,
} from "#lib/shared/3d/environments/worlds/cosmic/moon-outpost-layout.js";

describe("moon outpost layout", () => {
  it("turns every flood mast's lamps towards the pad centre", () => {
    for (const mast of moonMastPlacements(5.5)) {
      // Templates face +Z; after the yaw, +Z must point at the origin.
      const facing = { x: Math.sin(mast.yaw), z: Math.cos(mast.yaw) };
      const toCentre = { x: -mast.x, z: -mast.z };
      const length = Math.hypot(toCentre.x, toCentre.z);
      expect((facing.x * toCentre.x + facing.z * toCentre.z) / length).toBeCloseTo(1, 6);
    }
  });

  it("puts the benches on the audience's own arc, facing the pad", () => {
    const benches = moonBenchPlacements(9, 6.9);
    expect(benches).toHaveLength(9);
    for (const bench of benches) {
      expect(Math.hypot(bench.x, bench.z)).toBeCloseTo(6.9, 6);
    }
    // The middle seat is straight in front of the opening camera, facing back.
    expect(benches[4]!.x).toBeCloseTo(0, 6);
    expect(benches[4]!.yaw).toBeCloseTo(Math.PI, 6);
  });

  it("holds the pad lights and the beacon steady with motion off", () => {
    const levels = new Set<number>();
    const beacon = new Set<number>();
    for (let t = 0; t < 20; t += 0.37) {
      levels.add(moonPadLightLevel(3, 32, t, 0));
      beacon.add(moonBeaconLevel(t, 0));
    }
    expect(levels.size).toBe(1);
    expect(beacon.size).toBe(1);
  });

  it("chases the pad lights round the ring with motion on", () => {
    const head = Array.from({ length: 32 }, (_, index) =>
      moonPadLightLevel(index, 32, 1, 1)
    );
    const later = Array.from({ length: 32 }, (_, index) =>
      moonPadLightLevel(index, 32, 3, 1)
    );
    const brightest = (levels: number[]) => levels.indexOf(Math.max(...levels));
    expect(brightest(later)).not.toBe(brightest(head));
  });
});
