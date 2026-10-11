import { describe, it, expect } from "vitest";
import {
  createRoomDescriptor,
  serializeDescriptor,
  deserializeDescriptor,
  type RoomDescriptor,
} from "#lib/features/museum/domain/room-descriptor.js";
import type { MuseumGeometryDryRun } from "#lib/features/museum/services/museum-geometry-builder.js";


/**
 * Minimal dry-run that covers all bucket types without needing a real grid.
 * The bucket Maps use the same keying scheme as bucketMuseumTiles() but
 * we only need enough variety to exercise the serialization logic.
 */
function makeDryRun(): MuseumGeometryDryRun {
  const floorBuckets = new Map([
    [
      "#3a3530_stone",
      {
        color: "#3a3530",
        positions: [
          { x: 0, z: 0 },
          { x: 0.5, z: 0 },
        ],
        floorMaterial: "stone" as const,
      },
    ],
    [
      "#e0d8c8_marble",
      {
        color: "#e0d8c8",
        positions: [{ x: 1, z: 0.5 }],
        floorMaterial: "marble" as const,
      },
    ],
  ]);

  const wallBuckets = new Map([
    [
      "#2a2420_cave",
      {
        color: "#2a2420",
        positions: [
          { x: 0, z: -0.25 },
          { x: 0.5, z: -0.25 },
        ],
        wingTheme: "cave" as const,
      },
    ],
  ]);

  return {
    floorBuckets,
    wallBuckets,
    plaquePlacements: [],
    torchPositions: [],
    performerPositions: [{ x: 1, z: 1 }],
    pedestalPositions: [{ x: 2, z: 0 }],
    signPositions: [],
    totalFloorInstances: 3,
    totalWallInstances: 2,
    totalTiles: 5,
  };
}


function assertDescriptorShape(desc: RoomDescriptor): void {
  expect(typeof desc.roomId).toBe("string");
  expect(typeof desc.wingTheme).toBe("string");
  expect(Array.isArray(desc.tileBuckets.floorEntries)).toBe(true);
  expect(Array.isArray(desc.tileBuckets.wallEntries)).toBe(true);
  expect(Array.isArray(desc.materialKeys)).toBe(true);
  expect(Array.isArray(desc.fixtures.torches)).toBe(true);
  expect(Array.isArray(desc.fixtures.plaques)).toBe(true);
}


describe("createRoomDescriptor", () => {
  it("converts floor buckets to plain arrays", () => {
    const dryRun = makeDryRun();
    const desc = createRoomDescriptor("room-1", dryRun, "cave");

    expect(desc.tileBuckets.floorEntries).toHaveLength(2);

    const stoneEntry = desc.tileBuckets.floorEntries.find(
      (e) => e.color === "#3a3530"
    );
    expect(stoneEntry).toBeDefined();
    expect(stoneEntry!.positions).toHaveLength(2);
    expect(stoneEntry!.floorMaterial).toBe("stone");
    expect(stoneEntry!.wingTheme).toBeUndefined();
  });

  it("converts wall buckets to plain arrays", () => {
    const dryRun = makeDryRun();
    const desc = createRoomDescriptor("room-1", dryRun, "cave");

    expect(desc.tileBuckets.wallEntries).toHaveLength(1);

    const wallEntry = desc.tileBuckets.wallEntries[0];
    expect(wallEntry.color).toBe("#2a2420");
    expect(wallEntry.wingTheme).toBe("cave");
    expect(wallEntry.floorMaterial).toBeUndefined();
    expect(wallEntry.positions).toHaveLength(2);
  });

  it("preserves position counts from the dry-run", () => {
    const dryRun = makeDryRun();
    const desc = createRoomDescriptor("room-1", dryRun, "cave");

    expect(desc.tileBuckets.totalFloorInstances).toBe(3);
    expect(desc.tileBuckets.totalWallInstances).toBe(2);
    expect(desc.tileBuckets.performerPositions).toHaveLength(1);
    expect(desc.tileBuckets.pedestalPositions).toHaveLength(1);
    expect(desc.tileBuckets.signPositions).toHaveLength(0);
  });

  it("extracts unique material keys from both bucket types", () => {
    const dryRun = makeDryRun();
    const desc = createRoomDescriptor("room-1", dryRun, "cave");

    // 2 floor colors + 1 wall color = 3 unique keys
    expect(desc.materialKeys).toHaveLength(3);
    expect(desc.materialKeys).toContain("#3a3530");
    expect(desc.materialKeys).toContain("#e0d8c8");
    expect(desc.materialKeys).toContain("#2a2420");
  });

  it("deduplicates material keys when floor and wall share a color", () => {
    const dryRun = makeDryRun();
    // Add a wall bucket that reuses a floor color
    dryRun.wallBuckets.set("#3a3530_shared", {
      color: "#3a3530",
      positions: [{ x: 3, z: 0 }],
      wingTheme: "cave",
    });

    const desc = createRoomDescriptor("room-1", dryRun, "cave");

    // Still 3 unique colors, not 4
    expect(desc.materialKeys).toHaveLength(3);
    const stoneCount = desc.materialKeys.filter((k) => k === "#3a3530").length;
    expect(stoneCount).toBe(1);
  });

  it("stores roomId and wingTheme verbatim", () => {
    const dryRun = makeDryRun();
    const desc = createRoomDescriptor("wing-2-room-3", dryRun, "classical");

    expect(desc.roomId).toBe("wing-2-room-3");
    expect(desc.wingTheme).toBe("classical");
  });
});

describe("serializeDescriptor / deserializeDescriptor round-trip", () => {
  it("survives a full JSON round-trip with identical values", () => {
    const dryRun = makeDryRun();
    const original = createRoomDescriptor("room-rt", dryRun, "industrial");

    const json = serializeDescriptor(original);
    const restored = deserializeDescriptor(json);

    expect(restored.roomId).toBe(original.roomId);
    expect(restored.wingTheme).toBe(original.wingTheme);
    expect(restored.materialKeys).toEqual(original.materialKeys);
    expect(restored.tileBuckets.totalFloorInstances).toBe(
      original.tileBuckets.totalFloorInstances
    );
    expect(restored.tileBuckets.totalWallInstances).toBe(
      original.tileBuckets.totalWallInstances
    );
    expect(restored.tileBuckets.floorEntries).toEqual(
      original.tileBuckets.floorEntries
    );
    expect(restored.tileBuckets.wallEntries).toEqual(
      original.tileBuckets.wallEntries
    );
    expect(restored.tileBuckets.performerPositions).toEqual(
      original.tileBuckets.performerPositions
    );
    expect(restored.fixtures.torches).toEqual(original.fixtures.torches);
    expect(restored.fixtures.plaques).toEqual(original.fixtures.plaques);
  });

  it("produces valid JSON", () => {
    const dryRun = makeDryRun();
    const desc = createRoomDescriptor("room-json", dryRun, "digital");

    const json = serializeDescriptor(desc);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("restored descriptor passes shape validation", () => {
    const dryRun = makeDryRun();
    const original = createRoomDescriptor("room-shape", dryRun, "gallery");
    const restored = deserializeDescriptor(serializeDescriptor(original));

    assertDescriptorShape(restored);
  });

  it("handles descriptors with no positions gracefully", () => {
    const emptyDryRun: MuseumGeometryDryRun = {
      floorBuckets: new Map(),
      wallBuckets: new Map(),
      plaquePlacements: [],
      torchPositions: [],
      performerPositions: [],
      pedestalPositions: [],
      signPositions: [],
      totalFloorInstances: 0,
      totalWallInstances: 0,
      totalTiles: 0,
    };

    const desc = createRoomDescriptor("empty-room", emptyDryRun, "modern");
    const restored = deserializeDescriptor(serializeDescriptor(desc));

    expect(restored.tileBuckets.floorEntries).toHaveLength(0);
    expect(restored.tileBuckets.wallEntries).toHaveLength(0);
    expect(restored.materialKeys).toHaveLength(0);
    expect(restored.tileBuckets.totalFloorInstances).toBe(0);
  });
});
