import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { buildLobbyFloorPlan } from "#lib/features/museum/data/lobby-floor-plan.js";
import { tileKey } from "#lib/features/museum/domain/museum-grid-types.js";
import { isWalkable } from "#lib/features/museum/domain/tile-registry.js";

describe("lobby floor plan", () => {
  const plan = buildLobbyFloorPlan();
  const lobby = plan.grid.wings.find((wing) => wing.id === "lobby")!;
  const cave = plan.grid.wings.find((wing) => wing.id === "cave-threshold")!;

  it("builds a connected, non-overlapping museum grid", () => {
    expect(plan.validation.valid, plan.validation.errors.join("\n")).toBe(true);
    expect(plan.validation.unreachableRooms).toEqual([]);
    expect(plan.validation.overlaps).toEqual([]);
    expect(plan.edges).toEqual([
      expect.objectContaining({
        from: "lobby",
        to: "cave-threshold",
        corridorWidth: 5,
      }),
    ]);
  });

  it("keeps the lobby interior at 24 by 36 half-metre tiles", () => {
    expect(plan.lobbyInterior).toEqual({
      widthTiles: 24,
      heightTiles: 36,
      widthMetres: 12,
      heightMetres: 18,
    });
    expect(lobby.bounds.width - 2).toBe(24);
    expect(lobby.bounds.height - 2).toBe(36);
  });

  it("attaches the optimized authored dressing and dust profile to the lobby", () => {
    expect(lobby.roomPresentation).toEqual({
      modelPath: "/models/museum/lobby/order-lobby-dressing.glb",
      ceilingModelPath: "/models/museum/lobby/order-lobby-ceiling.glb",
      atmosphere: {
        type: "dust",
        count: 72,
        speed: 0.035,
        colors: ["#d9ccb0", "#9d927c"],
        sizeRange: [0.007, 0.018],
      },
    });

    for (const modelPath of [
      lobby.roomPresentation!.modelPath,
      lobby.roomPresentation!.ceilingModelPath!,
    ]) {
      const assetPath = resolve("static", modelPath.slice(1));
      expect(existsSync(assetPath), modelPath).toBe(true);
      expect(statSync(assetPath).size, modelPath).toBeLessThan(128 * 1024);
    }
  });

  it("starts the visitor inside the south arrival apron", () => {
    const spawnTile = plan.grid.tiles.get(
      tileKey(plan.grid.spawn.x, plan.grid.spawn.y)
    );
    const arrival = plan.zones.find((zone) => zone.id === "arrival")!;

    expect(spawnTile).toBeDefined();
    expect(isWalkable(spawnTile!.type)).toBe(true);
    expect(plan.grid.spawn.x).toBeGreaterThanOrEqual(arrival.x);
    expect(plan.grid.spawn.x).toBeLessThan(arrival.x + arrival.width);
    expect(plan.grid.spawn.y).toBeGreaterThanOrEqual(arrival.y);
    expect(plan.grid.spawn.y).toBeLessThan(arrival.y + arrival.height);
  });

  it("moves the cave portal off the entry axis and routes a dogleg", () => {
    const southDoorXs: number[] = [];
    const northDoorXs: number[] = [];
    const southY = lobby.bounds.y + lobby.bounds.height - 1;
    const northY = lobby.bounds.y;

    for (let x = lobby.bounds.x; x < lobby.bounds.x + lobby.bounds.width; x++) {
      if (plan.grid.tiles.get(tileKey(x, southY))?.type === "door")
        southDoorXs.push(x);
      if (plan.grid.tiles.get(tileKey(x, northY))?.type === "door")
        northDoorXs.push(x);
    }

    const entryCenter =
      southDoorXs.reduce((sum, x) => sum + x, 0) / southDoorXs.length;
    const exitCenter =
      northDoorXs.reduce((sum, x) => sum + x, 0) / northDoorXs.length;
    expect(southDoorXs).toHaveLength(6);
    expect(northDoorXs).toHaveLength(6);
    expect(exitCenter - entryCenter).toBeGreaterThanOrEqual(6);
    expect(
      plan.circulation.some((point, index) => {
        const previous = plan.circulation[index - 1];
        return previous !== undefined && point.x !== previous.x;
      })
    ).toBe(true);
    expect(cave.bounds.y + cave.bounds.height).toBeLessThan(lobby.bounds.y);
  });

  it("keeps every authored lobby program zone inside its room", () => {
    const lobbyZones = plan.zones.filter((zone) => zone.id !== "cave-dogleg");
    for (const zone of lobbyZones) {
      expect(zone.x, zone.id).toBeGreaterThanOrEqual(lobby.bounds.x + 1);
      expect(zone.y, zone.id).toBeGreaterThanOrEqual(lobby.bounds.y + 1);
      expect(zone.x + zone.width, zone.id).toBeLessThanOrEqual(
        lobby.bounds.x + lobby.bounds.width - 1
      );
      expect(zone.y + zone.height, zone.id).toBeLessThanOrEqual(
        lobby.bounds.y + lobby.bounds.height - 1
      );
    }

    for (let i = 0; i < lobbyZones.length; i++) {
      for (let j = i + 1; j < lobbyZones.length; j++) {
        const a = lobbyZones[i]!;
        const b = lobbyZones[j]!;
        const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
        const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlapX && overlapY, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("carries the approved lobby program into production 3D placements", () => {
    const sculpture = plan.grid.performers.find(
      (performer) => performer.id === "lobby-telekinetic-formation"
    );
    expect(sculpture).toEqual(
      expect.objectContaining({
        id: "lobby-telekinetic-formation",
        presentation: "sculpture",
        scale: 1.45,
        collisionRadiusTiles: 3,
        sequenceId: "gallery-spiral-seq",
        autoPlay: true,
      })
    );
    expect(sculpture!.tileX).toBeLessThan(
      lobby.bounds.x + lobby.bounds.width / 2
    );

    const roles = plan.grid.furniture.map((item) => item.role);
    expect(roles).toEqual(
      expect.arrayContaining([
        "bench",
        "pedestal",
        "desk",
        "desk-chair",
        "trashcan",
        "bookshelf",
        "coat-rack",
        "rug",
        "lamp",
        "plant",
      ])
    );
  });

  it("marks the cave threshold with a paired fixture transition", () => {
    const torchCount = Array.from(plan.grid.tiles.values()).filter(
      (tile) => tile.type === "torch"
    ).length;
    expect(torchCount).toBe(2);
  });
});
