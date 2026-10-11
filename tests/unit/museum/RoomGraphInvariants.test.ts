import { describe, it, expect } from "vitest";
import {
  MUSEUM_ROOMS,
  MUSEUM_EDGES,
} from "#lib/features/museum/data/museum-room-graph.js";
import type { RoomNode, RoomEdge } from "#lib/features/museum/domain/layout-types.js";

// Build lookup maps once
const roomById = new Map(MUSEUM_ROOMS.map((r) => [r.id, r]));
const edgeByKey = new Map(MUSEUM_EDGES.map((e) => [`${e.from}->${e.to}`, e]));

/**
 * Get all portal segments (doors and ropes) from a room's walls.
 * Both segment types carry an edgeId and connect two rooms — the visual
 * presentation differs (door frame vs. velvet rope) but the topology is identical.
 */
function getPortalSegments(room: RoomNode) {
  const portals: { wall: string; edgeId: string; width: number }[] = [];
  for (const [wallName, wallDef] of Object.entries(room.walls)) {
    for (const seg of wallDef.segments) {
      if ((seg.type === "door" || seg.type === "rope") && seg.edgeId) {
        portals.push({ wall: wallName, edgeId: seg.edgeId, width: seg.width ?? 4 });
      }
    }
  }
  return portals;
}

/** Compatible wall pairs (rooms connect through opposing walls) */
const COMPATIBLE_WALLS: Record<string, string> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

describe("RoomGraphInvariants", () => {
  describe("reference integrity", () => {
    it("every edge's 'from' room exists in MUSEUM_ROOMS", () => {
      for (const edge of MUSEUM_EDGES) {
        expect(
          roomById.has(edge.from),
          `Edge "${edge.from}->${edge.to}": room "${edge.from}" not found`,
        ).toBe(true);
      }
    });

    it("every edge's 'to' room exists in MUSEUM_ROOMS", () => {
      for (const edge of MUSEUM_EDGES) {
        expect(
          roomById.has(edge.to),
          `Edge "${edge.from}->${edge.to}": room "${edge.to}" not found`,
        ).toBe(true);
      }
    });

    it("every door/rope segment's edgeId matches an entry in MUSEUM_EDGES", () => {
      for (const room of MUSEUM_ROOMS) {
        const portals = getPortalSegments(room);
        for (const portal of portals) {
          expect(
            edgeByKey.has(portal.edgeId),
            `Room "${room.id}" wall "${portal.wall}": portal edgeId "${portal.edgeId}" has no matching edge`,
          ).toBe(true);
        }
      }
    });
  });

  describe("uniqueness", () => {
    it("no duplicate room IDs", () => {
      const ids = MUSEUM_ROOMS.map((r) => r.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it("no duplicate edge pairs", () => {
      const keys = MUSEUM_EDGES.map((e) => `${e.from}->${e.to}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(keys.length);
    });
  });

  describe("structural correctness", () => {
    it("every edge has a matching portal segment on fromWall of from room", () => {
      for (const edge of MUSEUM_EDGES) {
        const room = roomById.get(edge.from)!;
        const portals = getPortalSegments(room);
        const edgeKey = `${edge.from}->${edge.to}`;
        const match = portals.find(
          (d) => d.edgeId === edgeKey && d.wall === edge.fromWall,
        );
        expect(
          match,
          `Edge "${edgeKey}": no portal (door/rope) on "${edge.fromWall}" wall of room "${edge.from}"`,
        ).toBeDefined();
      }
    });

    it("every edge has a matching portal segment on toWall of to room", () => {
      for (const edge of MUSEUM_EDGES) {
        const room = roomById.get(edge.to)!;
        const portals = getPortalSegments(room);
        const edgeKey = `${edge.from}->${edge.to}`;
        const match = portals.find(
          (d) => d.edgeId === edgeKey && d.wall === edge.toWall,
        );
        expect(
          match,
          `Edge "${edgeKey}": no portal (door/rope) on "${edge.toWall}" wall of room "${edge.to}"`,
        ).toBeDefined();
      }
    });

    it("fromWall and toWall are compatible directions", () => {
      for (const edge of MUSEUM_EDGES) {
        const expected = COMPATIBLE_WALLS[edge.fromWall];
        expect(
          edge.toWall,
          `Edge "${edge.from}->${edge.to}": fromWall "${edge.fromWall}" should pair with "${expected}" but got "${edge.toWall}"`,
        ).toBe(expected);
      }
    });

    it("every room has at least one portal segment (door or rope)", () => {
      for (const room of MUSEUM_ROOMS) {
        const portals = getPortalSegments(room);
        expect(
          portals.length,
          `Room "${room.id}" has no portal segments (door or rope) — it's fully sealed`,
        ).toBeGreaterThan(0);
      }
    });

    it("portal width is >= edge corridorWidth", () => {
      for (const edge of MUSEUM_EDGES) {
        if (edge.corridorWidth === undefined) continue;

        const fromRoom = roomById.get(edge.from)!;
        const edgeKey = `${edge.from}->${edge.to}`;
        const portals = getPortalSegments(fromRoom);
        const portal = portals.find((d) => d.edgeId === edgeKey);

        if (portal) {
          expect(
            portal.width,
            `Edge "${edgeKey}": portal width ${portal.width} < corridorWidth ${edge.corridorWidth}`,
          ).toBeGreaterThanOrEqual(edge.corridorWidth);
        }
      }
    });
  });

  describe("reachability", () => {
    it("BFS from entrance visits every room", () => {
      const adjacency = new Map<string, Set<string>>();
      for (const room of MUSEUM_ROOMS) {
        adjacency.set(room.id, new Set());
      }
      for (const edge of MUSEUM_EDGES) {
        adjacency.get(edge.from)?.add(edge.to);
        adjacency.get(edge.to)?.add(edge.from);
      }

      const visited = new Set<string>();
      const queue = ["entrance"];
      visited.add("entrance");

      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const neighbor of adjacency.get(current) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      const allRoomIds = new Set(MUSEUM_ROOMS.map((r) => r.id));
      const unreachable = [...allRoomIds].filter((id) => !visited.has(id));

      expect(
        unreachable,
        `Unreachable rooms from entrance: ${unreachable.join(", ")}`,
      ).toEqual([]);
    });
  });
});
