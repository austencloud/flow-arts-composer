import { describe, expect, it } from "vitest";
import {
  MUSEUM_WALK_ROOMS,
  MUSEUM_WALK_EDGES,
} from "$lib/features/museum/data/museum-walk";
import { ROOM_PICKER_ROOMS } from "$lib/features/museum/components/room-picker-rooms";
import {
  ROOM_ISOLATION_GROUPS,
  resolveRoomIsolation,
} from "$lib/features/museum/services/room-isolation";
import { buildMuseumGrid } from "$lib/features/museum/services/museum-grid-builder";
// The real config the module builds with. An invented one compiles a grid
// whose rooms sit at different coordinates, so its doors never line up and
// the wing layouts fail for reasons the running app would never hit.
import { GRID_CONFIG } from "$lib/features/museum/data/museum-room-graph";
import { attachMuseumWalkTerrain } from "$lib/features/museum/data/museum-walk";
import type { MuseumGrid } from "$lib/features/museum/domain/museum-grid-types";
import { buildEarthRootTerraceLayout } from "$lib/features/museum/data/earth-root-terrace-terrain";
import { buildAirChimneyLayout } from "$lib/features/museum/data/air-chimney-layout";
import { buildDrownedGalleryLayout } from "$lib/features/museum/data/drowned-gallery-terrain";
import { buildMoonLayout } from "$lib/features/museum/data/moon-layout";
import { buildSundialLayout } from "$lib/features/museum/data/sundial-layout";
import { buildFirstFireProcessionPlanForGrid } from "$lib/features/museum/data/first-fire-procession-plan";


describe("room isolation", () => {
  it("offers only rooms that survive into the walk", () => {
    const walkIds = new Set(MUSEUM_WALK_ROOMS.map((r) => r.id));
    const dangling = ROOM_PICKER_ROOMS.map((r) => r.id).filter(
      (id) => !walkIds.has(id)
    );
    expect(dangling).toEqual([]);
  });

  // The two concrete faults the derived list fixes. `vulcan-cave` is the
  // placeholder the authored cave replaced; museum-walk strips it, so offering
  // it was the crash. The chambers were simply missing, so there was no way to
  // jump to the Root Terrace to review it.
  it("no longer offers the replaced cave placeholder", () => {
    expect(ROOM_PICKER_ROOMS.map((r) => r.id)).not.toContain("vulcan-cave");
  });

  it("offers the authored cave chambers", () => {
    const ids = ROOM_PICKER_ROOMS.map((r) => r.id);
    for (const chamber of [
      "cave-water",
      "cave-fire",
      "cave-earth",
      "cave-air",
      "cave-sun",
      "cave-moon",
    ]) {
      expect(ids, `picker cannot reach ${chamber}`).toContain(chamber);
    }
  });

  it("gives every offered room a real name", () => {
    for (const room of ROOM_PICKER_ROOMS) {
      expect(room.name?.trim(), `${room.id} has no name`).toBeTruthy();
      expect(room.theme?.trim(), `${room.id} has no theme`).toBeTruthy();
    }
  });

  it("builds a non-empty room set for every offered room", () => {
    for (const { id } of ROOM_PICKER_ROOMS) {
      const { rooms } = resolveRoomIsolation(
        id,
        MUSEUM_WALK_ROOMS,
        MUSEUM_WALK_EDGES
      );
      expect(rooms.length, `${id} isolated to an empty room set`).toBeGreaterThan(0);
    }
  });

  it("falls back to the whole museum when the URL names an unknown room", () => {
    const { rooms, edges } = resolveRoomIsolation(
      "no-such-room",
      MUSEUM_WALK_ROOMS,
      MUSEUM_WALK_EDGES
    );
    expect(rooms).toBe(MUSEUM_WALK_ROOMS);
    expect(edges).toBe(MUSEUM_WALK_EDGES);
  });

  it("never hands buildMuseumGrid an empty room list", () => {
    for (const id of [...ROOM_PICKER_ROOMS.map((r) => r.id), "vulcan-cave", "no-such-room"]) {
      const { rooms, edges } = resolveRoomIsolation(
        id,
        MUSEUM_WALK_ROOMS,
        MUSEUM_WALK_EDGES
      );
      expect(() => buildMuseumGrid(rooms, edges, GRID_CONFIG)).not.toThrow();
    }
  });

  it("reaches the Earth cave", () => {
    const { rooms } = resolveRoomIsolation(
      "cave-earth",
      MUSEUM_WALK_ROOMS,
      MUSEUM_WALK_EDGES
    );
    expect(rooms.map((r) => r.id)).toContain("cave-earth");
  });

  // The Root Terrace mounts its shell at the layout's plan centre. A null
  // layout collapses that origin to [0, 0, 0], the shell lands at the world
  // origin instead of around the visitor, and the isolated room renders black
  // with no error. It did: the layout required the Fire wing purely to span
  // the corridor between the two, which an isolated grid does not contain.
  it("still lays out the Root Terrace when isolated from the Fire wing", () => {
    const { rooms, edges } = resolveRoomIsolation(
      "cave-earth",
      MUSEUM_WALK_ROOMS,
      MUSEUM_WALK_EDGES
    );
    expect(rooms.map((r) => r.id)).not.toContain("cave-fire");

    const { grid } = buildMuseumGrid(rooms, edges, GRID_CONFIG);
    attachMuseumWalkTerrain(grid);
    const layout = buildEarthRootTerraceLayout(grid);

    expect(layout, "isolated cave-earth produced no layout").not.toBeNull();
    expect(layout!.corridor).toEqual([]);
    expect(layout!.stations.length).toBe(3);
  });

  // Every authored wing mounts its shell at an origin its layout supplies. A
  // null layout collapses that origin to the world origin, so the shell lands
  // far from the visitor and the room renders black with NO error - nothing in
  // the console, nothing thrown, nothing a smoke test that only checks for
  // exceptions would catch. Three wings had it: each read a NEIGHBOUR room
  // purely to span the corridor between them, and an isolated grid has no such
  // corridor. This is the check that would have caught all three at once.
  const WING_BUILDERS: Record<string, (grid: MuseumGrid) => unknown> = {
    "cave-air": buildAirChimneyLayout,
    "cave-water": buildDrownedGalleryLayout,
    "cave-earth": buildEarthRootTerraceLayout,
    "cave-fire": buildFirstFireProcessionPlanForGrid,
    "cave-moon": buildMoonLayout,
    "cave-sun": buildSundialLayout,
  };

  it("lays out every authored wing when that wing is isolated", () => {
    for (const [roomId, build] of Object.entries(WING_BUILDERS)) {
      const { rooms, edges } = resolveRoomIsolation(
        roomId,
        MUSEUM_WALK_ROOMS,
        MUSEUM_WALK_EDGES
      );
      const { grid } = buildMuseumGrid(rooms, edges, GRID_CONFIG);
      attachMuseumWalkTerrain(grid);
      expect(
        build(grid),
        `${roomId} isolated produced no layout - its shell would mount at the world origin and the room would render black`
      ).not.toBeNull();
    }
  });

  it("lays out every authored wing in the full museum", () => {
    const { rooms, edges } = resolveRoomIsolation(
      null,
      MUSEUM_WALK_ROOMS,
      MUSEUM_WALK_EDGES
    );
    const { grid } = buildMuseumGrid(rooms, edges, GRID_CONFIG);
    attachMuseumWalkTerrain(grid);
    for (const [roomId, build] of Object.entries(WING_BUILDERS)) {
      expect(build(grid), `${roomId} has no layout in the full museum`).not.toBeNull();
    }
  });

  // The picker is the only way in for most of these, so every id it offers has
  // to survive the whole pipeline, not just the grid build.
  it("builds a grid and terrain for every room the picker offers", () => {
    for (const { id } of ROOM_PICKER_ROOMS) {
      const { rooms, edges } = resolveRoomIsolation(
        id,
        MUSEUM_WALK_ROOMS,
        MUSEUM_WALK_EDGES
      );
      expect(() => {
        const { grid } = buildMuseumGrid(rooms, edges, GRID_CONFIG);
        attachMuseumWalkTerrain(grid);
      }, `${id} failed to compile`).not.toThrow();
    }
  });

  // A layout that survives isolation can still be WRONG: the failure that
  // rendered the Root Terrace black was a shell sitting at the world origin
  // while the room sat elsewhere. The invariant that catches it without any
  // per-wing knowledge is that every point a layout produces must land at the
  // same offset from its OWN room's corner whether or not the neighbours are
  // in the grid. The corridor keys are excluded: they describe the gap between
  // two rooms and are legitimately empty when the neighbour is absent.
  const CORRIDOR_KEYS = new Set(["corridor", "corridorWalls"]);

  function collectPoints(node: unknown, key = "", acc: { x: number; z: number }[] = []) {
    if (CORRIDOR_KEYS.has(key) || node === null || typeof node !== "object") return acc;
    const o = node as Record<string, unknown>;
    if (typeof o.x === "number" && typeof o.z === "number") acc.push({ x: o.x, z: o.z });
    for (const [k, v] of Object.entries(o)) collectPoints(v, k, acc);
    return acc;
  }

  function gridFor(roomFilter: string | null) {
    const { rooms, edges } = resolveRoomIsolation(
      roomFilter,
      MUSEUM_WALK_ROOMS,
      MUSEUM_WALK_EDGES
    );
    const { grid } = buildMuseumGrid(rooms, edges, GRID_CONFIG);
    attachMuseumWalkTerrain(grid);
    return grid;
  }

  it("anchors every wing the same way isolated as in the full museum", () => {
    const full = gridFor(null);
    for (const [roomId, build] of Object.entries(WING_BUILDERS)) {
      // A grouped isolation brings several rooms, and the packer is free to
      // arrange those rooms more tightly than the full walk does. Geometry
      // belonging to a sibling room then moves relative to this room's corner,
      // which is the packer working rather than a mount defect. Only a wing
      // that stands alone can be held to an exact offset.
      if (ROOM_ISOLATION_GROUPS[roomId]) continue;
      const iso = gridFor(roomId);
      const cornerOf = (grid: MuseumGrid) => {
        const wing = grid.wings.find((w) => w.id === roomId)!;
        return { x: wing.bounds.x * grid.tileScale, z: wing.bounds.y * grid.tileScale };
      };
      const relative = (grid: MuseumGrid, layout: unknown) => {
        const c = cornerOf(grid);
        return collectPoints(layout).map((p) => `${(p.x - c.x).toFixed(3)},${(p.z - c.z).toFixed(3)}`);
      };
      const inFull = relative(full, build(full));
      const inIso = relative(iso, build(iso));
      expect(
        inIso,
        `${roomId} places its geometry differently when isolated - its shell would not sit around the visitor`
      ).toEqual(inFull);
      expect(inFull.length, `${roomId} produced no points to compare`).toBeGreaterThan(0);
    }
  });
});