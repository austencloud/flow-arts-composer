import { describe, expect, it } from "vitest";
import {
  CAVE_MODE_ROOMS,
  CAVE_SPACE_ORDER,
  VULCAN_CAVE_EDGES,
  buildVulcanCaveFloorPlan,
} from "#lib/features/museum/data/vulcan-cave-floor-plan.js";
import { MUSEUM_EXHIBIT_SEQUENCES } from "#lib/features/museum/data/museum-exhibit-sequences.js";
import { tileKey } from "#lib/features/museum/domain/museum-grid-types.js";
import { isWalkable } from "#lib/features/museum/domain/tile-registry.js";

describe("Vulcan Cave floor plan", () => {
  const plan = buildVulcanCaveFloorPlan();

  it("builds a connected, non-overlapping production grid", () => {
    expect(plan.validation.valid, plan.validation.errors.join("\n")).toBe(true);
    expect(plan.validation.unreachableRooms).toEqual([]);
    expect(plan.validation.overlaps).toEqual([]);
    expect(plan.grid.wings.map((wing) => wing.id)).toEqual(CAVE_SPACE_ORDER);
  });

  it("keeps all nine spaces on one ordered main path", () => {
    expect(VULCAN_CAVE_EDGES).toHaveLength(CAVE_SPACE_ORDER.length - 1);
    expect(VULCAN_CAVE_EDGES.every((edge) => edge.type === "main-path")).toBe(
      true
    );

    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    for (const edge of VULCAN_CAVE_EDGES) {
      outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
      incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    }

    expect(CAVE_SPACE_ORDER.filter((roomId) => !incoming.has(roomId))).toEqual([
      "cave-threshold",
    ]);
    expect(CAVE_SPACE_ORDER.filter((roomId) => !outgoing.has(roomId))).toEqual([
      "egypt-threshold",
    ]);
    expect(Math.max(...incoming.values())).toBe(1);
    expect(Math.max(...outgoing.values())).toBe(1);

    for (let index = 0; index < VULCAN_CAVE_EDGES.length; index++) {
      expect(VULCAN_CAVE_EDGES[index]).toEqual(
        expect.objectContaining({
          from: CAVE_SPACE_ORDER[index],
          to: CAVE_SPACE_ORDER[index + 1],
        })
      );
    }
  });

  // The three authored bays stage an ensemble rather than a solo: the Drowned
  // Gallery its A/B/C procession, the First Fire its DJ/EK/FL stations, the
  // Canyon Overlook its G/H/I bosses. All are excluded from the
  // one-performer-per-chamber rule.
  // cave-air joined the authored bays with the updraft chimney prototype: it
  // carries its own layout, terrain and graybox, and is no longer a solo tile
  // chamber.
  // cave-sun joined on 2026-08-05 for the same reason — the Sundial is a 24 m
  // round chamber with four Quarter-Same stations, a spiral crossing and its
  // own terrain program, so the one-performer-per-chamber rule stops applying
  // to it and it is sized as a release rather than a solo.
  const BAY_ROOM_IDS = new Set([
    "cave-water",
    "cave-fire",
    "cave-earth",
    "cave-air",
    "cave-sun",
    // cave-moon joined on 2026-08-05, and with it the wing has no solo
    // chambers left. It is a ⌀20 m regolith plain with three Quarter-Opposite
    // stations, an arrival hole, low gravity and its own terrain program.
    "cave-moon",
  ]);
  const SOLO_MODE_ROOMS = CAVE_MODE_ROOMS.filter(
    (mode) => !BAY_ROOM_IDS.has(mode.roomId)
  );

  it("places exactly the declared performers in every mode chamber", () => {
    for (const mode of CAVE_MODE_ROOMS) {
      const wing = plan.grid.wings.find(
        (candidate) => candidate.id === mode.roomId
      )!;
      const roomPerformers = plan.grid.performers.filter(
        (performer) =>
          performer.tileX > wing.bounds.x &&
          performer.tileX < wing.bounds.x + wing.bounds.width - 1 &&
          performer.tileY > wing.bounds.y &&
          performer.tileY < wing.bounds.y + wing.bounds.height - 1
      );

      // Placement order and declaration order may differ (CAVE_MODE_ROOMS
      // follows the wing declarations' canon order since 2026-08-12) — the
      // invariant is the performer↔sequence PAIRING, not the array order.
      const placedPairs = roomPerformers
        .map((performer) => `${performer.id}→${performer.sequenceId}`)
        .sort();
      const declaredPairs = mode.performerIds
        .map((performerId, index) => `${performerId}→${mode.sequenceIds[index]}`)
        .sort();
      expect(placedPairs, mode.roomId).toEqual(declaredPairs);
      expect(
        roomPerformers.every((performer) => performer.autoPlay),
        mode.roomId
      ).toBe(true);
    }
  });

  it("keeps every solo chamber a solo chamber", () => {
    for (const mode of SOLO_MODE_ROOMS) {
      expect(mode.performerIds, mode.roomId).toHaveLength(1);
    }
    const allSequences = CAVE_MODE_ROOMS.flatMap((mode) => mode.sequenceIds);
    expect(new Set(allSequences).size).toBe(allSequences.length);
  });

  it("resolves every mode sequence to authored movement data", () => {
    for (const mode of CAVE_MODE_ROOMS) {
      for (const sequenceId of mode.sequenceIds) {
        const sequence = MUSEUM_EXHIBIT_SEQUENCES[sequenceId];
        expect(sequence, sequenceId).toBeDefined();
        expect(sequence.steps.length, sequenceId).toBeGreaterThanOrEqual(4);
        expect(
          sequence.steps.slice(1).every((step) => step.letter.length > 0),
          sequenceId
        ).toBe(true);
      }
    }
  });

  it("keeps every corridor at least three tiles wide", () => {
    for (const edge of plan.edges) {
      expect(
        edge.corridorWidth ?? 4,
        `${edge.from}->${edge.to}`
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses room scale to create compression and one major release", () => {
    const squeeze = plan.grid.wings.find((wing) => wing.id === "cave-squeeze")!;
    const performerRooms = CAVE_MODE_ROOMS.map(
      (mode) => plan.grid.wings.find((wing) => wing.id === mode.roomId)!
    );

    for (const room of performerRooms) {
      expect(room.bounds.width - 2, room.id).toBeGreaterThan(
        squeeze.bounds.width - 2
      );
    }

    const performerAreas = performerRooms.map((room) => ({
      id: room.id,
      area: (room.bounds.width - 2) * (room.bounds.height - 2),
    }));
    // The authored bays are the releases; every remaining single-chamber room
    // stays smaller than all of them.
    const bayAreas = performerAreas.filter(({ id }) => BAY_ROOM_IDS.has(id));
    const soloAreas = performerAreas.filter(({ id }) => !BAY_ROOM_IDS.has(id));
    expect(Math.min(...bayAreas.map(({ area }) => area))).toBeGreaterThan(
      Math.max(...soloAreas.map(({ area }) => area))
    );
  });

  it("offsets adjacent chamber doors to prevent shared performance sightlines", () => {
    const modeRoomIds = new Set(CAVE_MODE_ROOMS.map((mode) => mode.roomId));
    const adjacentModeEdges = plan.edges.filter(
      (edge) => modeRoomIds.has(edge.from) && modeRoomIds.has(edge.to)
    );

    for (const edge of adjacentModeEdges) {
      const fromRoom = plan.grid.wings.find((wing) => wing.id === edge.from)!;
      const toRoom = plan.grid.wings.find((wing) => wing.id === edge.to)!;
      const fromDoor = doorCenter(fromRoom.bounds, edge.fromWall);
      const toDoor = doorCenter(toRoom.bounds, edge.toWall);

      if (edge.fromWall === "north" || edge.fromWall === "south") {
        expect(fromDoor.x, `${edge.from}->${edge.to}`).not.toBe(toDoor.x);
      } else {
        expect(fromDoor.y, `${edge.from}->${edge.to}`).not.toBe(toDoor.y);
      }
    }
  });

  it("keeps every numbered zone inside its compiled room", () => {
    for (const zone of plan.zones) {
      const wing = plan.grid.wings.find(
        (candidate) => candidate.id === zone.id
      )!;
      expect(zone.x, zone.id).toBeGreaterThanOrEqual(wing.bounds.x + 1);
      expect(zone.y, zone.id).toBeGreaterThanOrEqual(wing.bounds.y + 1);
      expect(zone.x + zone.width, zone.id).toBeLessThanOrEqual(
        wing.bounds.x + wing.bounds.width - 1
      );
      expect(zone.y + zone.height, zone.id).toBeLessThanOrEqual(
        wing.bounds.y + wing.bounds.height - 1
      );
    }
  });

  it("starts the visitor on a walkable cave-threshold tile", () => {
    const spawnTile = plan.grid.tiles.get(
      tileKey(plan.grid.spawn.x, plan.grid.spawn.y)
    );
    const threshold = plan.grid.wings.find(
      (wing) => wing.id === "cave-threshold"
    )!;

    expect(spawnTile).toBeDefined();
    expect(isWalkable(spawnTile!.type)).toBe(true);
    expect(plan.grid.spawn.x).toBeGreaterThan(threshold.bounds.x);
    expect(plan.grid.spawn.x).toBeLessThan(
      threshold.bounds.x + threshold.bounds.width - 1
    );
    expect(plan.grid.spawn.y).toBeGreaterThan(threshold.bounds.y);
    expect(plan.grid.spawn.y).toBeLessThan(
      threshold.bounds.y + threshold.bounds.height - 1
    );
  });

  function doorCenter(
    bounds: { x: number; y: number; width: number; height: number },
    wall: "north" | "south" | "east" | "west"
  ): { x: number; y: number } {
    const doorTiles: { x: number; y: number }[] = [];

    if (wall === "north" || wall === "south") {
      const y = wall === "north" ? bounds.y : bounds.y + bounds.height - 1;
      for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
        if (plan.grid.tiles.get(tileKey(x, y))?.type === "door") {
          doorTiles.push({ x, y });
        }
      }
    } else {
      const x = wall === "west" ? bounds.x : bounds.x + bounds.width - 1;
      for (let y = bounds.y; y < bounds.y + bounds.height; y++) {
        if (plan.grid.tiles.get(tileKey(x, y))?.type === "door") {
          doorTiles.push({ x, y });
        }
      }
    }

    expect(doorTiles, `${wall} door`).not.toHaveLength(0);
    return {
      x: doorTiles.reduce((sum, tile) => sum + tile.x, 0) / doorTiles.length,
      y: doorTiles.reduce((sum, tile) => sum + tile.y, 0) / doorTiles.length,
    };
  }
});

describe("drowned gallery rooms", () => {
  const plan = buildVulcanCaveFloorPlan();
  const wing = (id: string) => {
    const w = plan.grid.wings.find((w) => w.id === id);
    if (!w) throw new Error(`missing wing ${id}`);
    return w;
  };

  it("builds the three water-bay rooms in route order", () => {
    expect(wing("cave-water-approach")).toBeDefined();
    expect(wing("cave-water-gallery")).toBeDefined();
    expect(wing("cave-water")).toBeDefined();
  });

  it("retired the sump wing", () => {
    expect(plan.grid.wings.some((w) => w.id === "cave-water-sump")).toBe(false);
  });

  it("gives the grotto exhibit scale (≥ 24 x 21 m interior)", () => {
    const g = wing("cave-water").bounds;
    // interior tiles = bounds minus the 1-tile wall ring; 0.5 m per tile
    expect((g.width - 2) * 0.5).toBeGreaterThanOrEqual(24);
    expect((g.height - 2) * 0.5).toBeGreaterThanOrEqual(21);
  });

  it("gives the flooded gallery room enough length to carry a 24 m submerged walk", () => {
    const g = wing("cave-water-gallery").bounds;
    expect((g.width - 2) * 0.5).toBeGreaterThanOrEqual(12);
    expect((g.height - 2) * 0.5).toBeGreaterThanOrEqual(20);
  });

  it("centres the gallery's grotto door on the grotto's own door", () => {
    const doorSpan = (id: string, wall: "north" | "south") => {
      const b = wing(id).bounds;
      const wallY = wall === "north" ? b.y : b.y + b.height - 1;
      const tiles: number[] = [];
      for (let tx = b.x; tx < b.x + b.width; tx++) {
        if (plan.grid.tiles.get(tileKey(tx, wallY))?.type === "door")
          tiles.push(tx);
      }
      return tiles;
    };
    const galleryDoor = doorSpan("cave-water-gallery", "north");
    const grottoDoor = doorSpan("cave-water", "south");
    expect(galleryDoor).toHaveLength(6);
    expect(grottoDoor).toEqual(galleryDoor);
  });

  it("places three performers in the grotto", () => {
    const grottoPerformers = plan.grid.performers.filter((p) =>
      p.id.startsWith("cave-water-")
    );
    expect(grottoPerformers.map((p) => p.id).sort()).toEqual([
      "cave-water-a",
      "cave-water-b",
      "cave-water-c",
    ]);
  });

  it("still validates as a connected plan", () => {
    expect(plan.validation.valid).toBe(true);
  });

  it("autoplays a distinct looping sequence at each grotto alcove", () => {
    const grottoPerformers = plan.grid.performers.filter((p) =>
      p.id.startsWith("cave-water-")
    );
    expect(grottoPerformers.map((p) => p.sequenceId)).toEqual([
      "cave-water-seq-a",
      "cave-water-seq-b",
      "cave-water-seq-c",
    ]);
    expect(grottoPerformers.every((p) => p.autoPlay)).toBe(true);
  });

  it("has a looping base-letter sequence per grotto performer", async () => {
    const { MUSEUM_EXHIBIT_SEQUENCES } = await import(
      "#lib/features/museum/data/museum-exhibit-sequences.js"
    );
    for (const [id, letter] of [
      ["cave-water-seq-a", "A"],
      ["cave-water-seq-b", "B"],
      ["cave-water-seq-c", "C"],
    ] as const) {
      const seq = MUSEUM_EXHIBIT_SEQUENCES[id];
      expect(seq, id).toBeDefined();
      expect(seq.steps).toHaveLength(4);
      for (const step of seq.steps) expect(step.letter).toBe(letter);
    }
  });
});
