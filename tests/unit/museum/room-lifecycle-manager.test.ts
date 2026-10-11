import { describe, it, expect, beforeEach } from "vitest";
import {
  RoomLifecycleManager,
  RoomState,
} from "#lib/features/museum/services/room-lifecycle-manager.js";
import type { RoomDescriptor } from "#lib/features/museum/domain/room-descriptor.js";
import type { RoomEdge } from "#lib/features/museum/domain/layout-types.js";

/**
 * Test graph:
 *
 *   lobby ── room-a ── room-c ── room-d
 *     └───── room-b
 *
 * lobby is adjacent to room-a and room-b.
 * room-a is adjacent to lobby and room-c.
 * room-b is adjacent to lobby only.
 * room-c is adjacent to room-a and room-d.
 * room-d is adjacent to room-c only.
 *
 * With 2-hop adjacency:
 * - From lobby: hop1={room-a, room-b}, hop2={room-c} (via room-a). room-d is 3 hops away.
 * - From room-a: hop1={lobby, room-c}, hop2={room-b, room-d} (via lobby and room-c).
 * - From room-c: hop1={room-a, room-d}, hop2={lobby} (via room-a). room-b is 3 hops away.
 */
const EDGES: RoomEdge[] = [
  { from: "lobby", to: "room-a", type: "main-path", fromWall: "north", toWall: "south" },
  { from: "lobby", to: "room-b", type: "side-branch", fromWall: "east", toWall: "west" },
  { from: "room-a", to: "room-c", type: "main-path", fromWall: "north", toWall: "south" },
  { from: "room-c", to: "room-d", type: "main-path", fromWall: "north", toWall: "south" },
];

/** Minimal stub that satisfies the RoomDescriptor shape. */
function makeDescriptor(roomId: string): RoomDescriptor {
  return {
    roomId,
    wingTheme: "cave",
    tileBuckets: {
      floorEntries: [],
      wallEntries: [],
      pedestalPositions: [],
      signPositions: [],
      performerPositions: [],
      totalFloorInstances: 0,
      totalWallInstances: 0,
    },
    fixtures: { torches: [], plaques: [] },
    materialKeys: [],
  };
}

describe("RoomLifecycleManager", () => {
  let manager: RoomLifecycleManager;

  beforeEach(() => {
    manager = new RoomLifecycleManager(EDGES);
  });


  describe("initial state", () => {
    it("all rooms start as Unvisited", () => {
      expect(manager.getRoomState("lobby")).toBe(RoomState.Unvisited);
      expect(manager.getRoomState("room-a")).toBe(RoomState.Unvisited);
      expect(manager.getRoomState("room-b")).toBe(RoomState.Unvisited);
      expect(manager.getRoomState("room-c")).toBe(RoomState.Unvisited);
      expect(manager.getRoomState("room-d")).toBe(RoomState.Unvisited);
    });

    it("unknown room also reports Unvisited", () => {
      expect(manager.getRoomState("not-a-room")).toBe(RoomState.Unvisited);
    });
  });


  describe("getAllRoomIds()", () => {
    it("returns all 5 rooms derived from the edges", () => {
      const ids = manager.getAllRoomIds();
      expect(ids).toHaveLength(5);
      expect(ids).toContain("lobby");
      expect(ids).toContain("room-a");
      expect(ids).toContain("room-b");
      expect(ids).toContain("room-c");
      expect(ids).toContain("room-d");
    });
  });


  describe("entering lobby (first visit)", () => {
    it("activates lobby, room-a, room-b (1 hop), and room-c (2 hops)", () => {
      const update = manager.onPlayerEnteredRoom("lobby");

      expect(update.toActivate).toContain("lobby");
      expect(update.toActivate).toContain("room-a");
      expect(update.toActivate).toContain("room-b");
      expect(update.toActivate).toContain("room-c");
    });

    it("does NOT activate room-d (3 hops from lobby)", () => {
      const update = manager.onPlayerEnteredRoom("lobby");
      expect(update.toActivate).not.toContain("room-d");
    });

    it("produces no rooms to cache on first entry", () => {
      const update = manager.onPlayerEnteredRoom("lobby");
      expect(update.toCache).toHaveLength(0);
    });

    it("produces no fromCache entries on first entry (nothing was cached yet)", () => {
      const update = manager.onPlayerEnteredRoom("lobby");
      expect(update.fromCache).toHaveLength(0);
    });

    it("sets lobby state to Active after entry", () => {
      manager.onPlayerEnteredRoom("lobby");
      expect(manager.getRoomState("lobby")).toBe(RoomState.Active);
    });

    it("sets adjacent rooms (room-a, room-b) to Active after entry", () => {
      manager.onPlayerEnteredRoom("lobby");
      expect(manager.getRoomState("room-a")).toBe(RoomState.Active);
      expect(manager.getRoomState("room-b")).toBe(RoomState.Active);
    });

    it("sets 2-hop room (room-c) to Active after entry", () => {
      manager.onPlayerEnteredRoom("lobby");
      expect(manager.getRoomState("room-c")).toBe(RoomState.Active);
    });

    it("leaves room-d as Unvisited — it's three hops away", () => {
      manager.onPlayerEnteredRoom("lobby");
      expect(manager.getRoomState("room-d")).toBe(RoomState.Unvisited);
    });

    it("exposes the two-hop active set for renderer visibility", () => {
      manager.onPlayerEnteredRoom("lobby");

      expect(new Set(manager.getActiveRoomIds())).toEqual(
        new Set(["lobby", "room-a", "room-b", "room-c"]),
      );
    });
  });


  describe("moving from lobby → room-a", () => {
    it("does NOT cache room-b because it's 2 hops from room-a (via lobby)", () => {
      manager.onPlayerEnteredRoom("lobby");
      const update = manager.onPlayerEnteredRoom("room-a");

      expect(update.toCache).not.toContain("room-b");
    });

    it("does NOT cache lobby or room-a (still adjacent)", () => {
      manager.onPlayerEnteredRoom("lobby");
      const update = manager.onPlayerEnteredRoom("room-a");

      expect(update.toCache).not.toContain("lobby");
      expect(update.toCache).not.toContain("room-a");
    });

    it("activates room-d (2 hops from room-a via room-c)", () => {
      manager.onPlayerEnteredRoom("lobby");
      const update = manager.onPlayerEnteredRoom("room-a");

      expect(update.toActivate).toContain("room-d");
    });

    it("does NOT re-activate room-c (already active from lobby entry)", () => {
      manager.onPlayerEnteredRoom("lobby");
      const update = manager.onPlayerEnteredRoom("room-a");

      expect(update.toActivate).not.toContain("room-c");
    });

    it("sets room-d state to Active", () => {
      manager.onPlayerEnteredRoom("lobby");
      manager.onPlayerEnteredRoom("room-a");
      expect(manager.getRoomState("room-d")).toBe(RoomState.Active);
    });
  });

  // ── Moving further: room-a → room-c (room-b should cache) ─────────────────

  describe("moving from room-a → room-c", () => {
    it("caches room-b because it's 3 hops from room-c", () => {
      manager.onPlayerEnteredRoom("lobby");
      manager.onPlayerEnteredRoom("room-a");
      const update = manager.onPlayerEnteredRoom("room-c");

      expect(update.toCache).toContain("room-b");
    });

    it("keeps lobby active (2 hops from room-c via room-a)", () => {
      manager.onPlayerEnteredRoom("lobby");
      manager.onPlayerEnteredRoom("room-a");
      const update = manager.onPlayerEnteredRoom("room-c");

      expect(update.toCache).not.toContain("lobby");
    });
  });

  // ── Returning to lobby (room-b cache hit) ──────────────────────────────────

  describe("returning to lobby after visiting room-c (room-b was cached)", () => {
    beforeEach(() => {
      manager.onPlayerEnteredRoom("lobby");
      manager.onPlayerEnteredRoom("room-a");
      manager.onPlayerEnteredRoom("room-c");
      // room-b is now Cached. Store a descriptor so the cache hit is detectable.
      manager.cacheDescriptor("room-b", makeDescriptor("room-b"));
    });

    it("includes room-b in toActivate (it needs geometry rebuilt)", () => {
      const update = manager.onPlayerEnteredRoom("lobby");
      expect(update.toActivate).toContain("room-b");
    });

    it("includes room-b in fromCache (descriptor is available — skip bucketing)", () => {
      const update = manager.onPlayerEnteredRoom("lobby");
      expect(update.fromCache).toContain("room-b");
    });

    it("room-b state returns to Active", () => {
      manager.onPlayerEnteredRoom("lobby");
      expect(manager.getRoomState("room-b")).toBe(RoomState.Active);
    });
  });


  describe("priorities", () => {
    it("current room gets priority 0", () => {
      const update = manager.onPlayerEnteredRoom("lobby");
      expect(update.priorities.get("lobby")).toBe(0);
    });

    it("direct adjacent rooms get priority 1", () => {
      const update = manager.onPlayerEnteredRoom("lobby");
      expect(update.priorities.get("room-a")).toBe(1);
      expect(update.priorities.get("room-b")).toBe(1);
    });

    it("2-hop rooms get priority 2", () => {
      const update = manager.onPlayerEnteredRoom("lobby");
      expect(update.priorities.get("room-c")).toBe(2);
    });

    it("3-hop rooms are absent from priorities", () => {
      const update = manager.onPlayerEnteredRoom("lobby");
      expect(update.priorities.has("room-d")).toBe(false);
    });
  });


  describe("descriptor cache", () => {
    it("getCachedDescriptor returns null before any descriptor is stored", () => {
      expect(manager.getCachedDescriptor("lobby")).toBeNull();
    });

    it("getCachedDescriptor returns the stored descriptor", () => {
      const desc = makeDescriptor("lobby");
      manager.cacheDescriptor("lobby", desc);
      expect(manager.getCachedDescriptor("lobby")).toBe(desc);
    });

    it("storing a second descriptor overwrites the first", () => {
      const first = makeDescriptor("lobby");
      const second = makeDescriptor("lobby");
      manager.cacheDescriptor("lobby", first);
      manager.cacheDescriptor("lobby", second);
      expect(manager.getCachedDescriptor("lobby")).toBe(second);
    });

    it("descriptors for different rooms are independent", () => {
      const a = makeDescriptor("room-a");
      const b = makeDescriptor("room-b");
      manager.cacheDescriptor("room-a", a);
      manager.cacheDescriptor("room-b", b);
      expect(manager.getCachedDescriptor("room-a")).toBe(a);
      expect(manager.getCachedDescriptor("room-b")).toBe(b);
    });
  });

  // ── Already-active rooms are not re-activated ──────────────────────────────

  describe("idempotent activation", () => {
    it("entering the same room twice does not re-add it to toActivate", () => {
      manager.onPlayerEnteredRoom("lobby");
      const update = manager.onPlayerEnteredRoom("lobby");

      // lobby and its neighbors are already Active, so toActivate should be empty
      expect(update.toActivate).toHaveLength(0);
    });
  });
});
