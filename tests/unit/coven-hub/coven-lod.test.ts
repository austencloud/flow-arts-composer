import { describe, it, expect } from "vitest";
import { computeCovenLods, type LodBand } from "#lib/features/coven-hub/domain/coven-lod.js";

const stations = [
  { id: "a", x: 0, z: 0 },
  { id: "b", x: 0, z: 20 },
  { id: "c", x: 0, z: 40 },
];

describe("computeCovenLods", () => {
  it("marks the nearest station hero, mid idle, far frozen", () => {
    const lods = computeCovenLods(0, 0, stations, new Map());
    expect(lods.get("a")).toBe<LodBand>("hero");
    expect(lods.get("b")).toBe<LodBand>("idle");
    expect(lods.get("c")).toBe<LodBand>("frozen");
  });

  it("applies hysteresis: a hero station stays hero just past the boundary", () => {
    const prev = new Map<string, LodBand>([["a", "hero"]]);
    const lods = computeCovenLods(0, 13, stations, prev);
    expect(lods.get("a")).toBe<LodBand>("hero");
  });

  it("without prior state, the same station past the boundary is not hero", () => {
    const lods = computeCovenLods(0, 13, stations, new Map());
    expect(lods.get("a")).not.toBe<LodBand>("hero");
  });
});
