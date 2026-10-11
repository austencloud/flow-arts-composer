import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GameBridge,
  initGameBridge,
  getGameBridge,
  destroyGameBridge,
} from "#lib/shared/3d/debug/game-bridge.js";
import type { GameBridgeBindings } from "#lib/shared/3d/debug/game-bridge-types.js";
import {
  serializeGrid,
  deserializeGrid,
  createEmptyGrid,
} from "#lib/features/museum/domain/museum-grid-types.js";
import type { MuseumGrid } from "#lib/features/museum/domain/museum-grid-types.js";

function createMinimalBindings(): GameBridgeBindings {
  return {
    physics: {
      getPlayerPosition: () => ({ x: 0, y: 0, z: 0 }),
      getPlayerVelocity: () => ({ x: 0, y: 0, z: 0 }),
      isGrounded: () => true,
      movePlayer: vi.fn(),
      teleportPlayer: vi.fn(),
      raycast: () => ({ hit: false }),
    },
    camera: {
      getYaw: () => 0,
      getPitch: () => 0,
      getMode: () => "first_person",
      setYaw: vi.fn(),
      setPitch: vi.fn(),
      setMode: vi.fn(),
    },
    playback: {
      getPerformerManager: () => null,
      getSpeed: () => 1,
      setSpeed: vi.fn(),
    },
  };
}

describe("GameBridge cleanup", () => {
  it("disconnect sets isConnected to false", () => {
    const bridge = new GameBridge(createMinimalBindings(), {
      autoReconnect: false,
    });

    // Manually set connected state
    (bridge as any).ws = {
      readyState: 1,
      close: vi.fn(),
      send: vi.fn(),
    };
    (bridge as any).isAuthenticated = true;

    expect(bridge.isConnected()).toBe(true);

    bridge.disconnect();

    expect(bridge.isConnected()).toBe(false);
  });

  it("disconnect prevents auto-reconnect", () => {
    const bridge = new GameBridge(createMinimalBindings(), {
      autoReconnect: true,
    });

    (bridge as any).ws = {
      readyState: 1,
      close: vi.fn(),
      send: vi.fn(),
    };
    (bridge as any).isAuthenticated = true;

    bridge.disconnect();

    // The config flag should now be false
    expect((bridge as any).config.autoReconnect).toBe(false);
  });

  it("disconnect clears auth state", () => {
    const bridge = new GameBridge(createMinimalBindings(), {
      autoReconnect: false,
    });

    (bridge as any).ws = {
      readyState: 1,
      close: vi.fn(),
      send: vi.fn(),
    };
    (bridge as any).isAuthenticated = true;

    bridge.disconnect();

    expect((bridge as any).isAuthenticated).toBe(false);
  });
});

describe("singleton lifecycle", () => {
  afterEach(() => {
    // Clean up singleton after each test
    destroyGameBridge();
  });

  it("destroyGameBridge nulls the singleton", () => {
    initGameBridge(createMinimalBindings(), { autoReconnect: false });

    expect(getGameBridge()).not.toBeNull();

    destroyGameBridge();

    expect(getGameBridge()).toBeNull();
  });

  it("destroyGameBridge cleans window global", () => {
    initGameBridge(createMinimalBindings(), { autoReconnect: false });

    expect((window as any).__gameBridge).toBeDefined();

    destroyGameBridge();

    expect((window as any).__gameBridge).toBeUndefined();
  });
});

describe("grid serialization round-trip", () => {
  it("preserves all fields through serialize/deserialize", () => {
    const grid: MuseumGrid = {
      width: 20,
      height: 30,
      tileScale: 0.5,
      tiles: new Map([
        ["0,0", { type: "floor", material: "marble" }],
        ["1,0", { type: "wall" }],
        ["2,0", { type: "door" }],
      ]),
      wings: [
        {
          id: "test-wing",
          name: "Test Wing",
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          theme: "cave",
        },
      ],
      spawn: { x: 5, y: 5, facing: "north" },
      exhibits: [
        {
          id: "exhibit-1",
          tileX: 3,
          tileY: 4,
          plaque: { title: "Test", body: "Content" },
        },
      ],
      performers: [
        {
          id: "perf-1",
          tileX: 6,
          tileY: 7,
          facing: "south",
          autoPlay: true,
        },
      ],
      triggers: [
        {
          id: "trigger-1",
          tileX: 8,
          tileY: 9,
          action: "show-lore",
          content: { body: "Lore text" },
        },
      ],
      furniture: [
        {
          id: "bench-1",
          role: "bench",
          tileX: 2,
          tileY: 3,
          rotationY: 0,
        },
      ],
    };

    const roundTripped = deserializeGrid(serializeGrid(grid));

    expect(roundTripped.width).toBe(grid.width);
    expect(roundTripped.height).toBe(grid.height);
    expect(roundTripped.tileScale).toBe(grid.tileScale);
    expect(roundTripped.tiles.size).toBe(grid.tiles.size);
    expect(roundTripped.spawn).toEqual(grid.spawn);
    expect(roundTripped.wings).toEqual(grid.wings);
    expect(roundTripped.exhibits).toEqual(grid.exhibits);
    expect(roundTripped.performers).toEqual(grid.performers);
    expect(roundTripped.triggers).toEqual(grid.triggers);
    expect(roundTripped.furniture).toEqual(grid.furniture);
  });

  it("preserves tile types and materials", () => {
    const grid: MuseumGrid = createEmptyGrid(5, 5);
    grid.tiles.set("0,0", { type: "floor", material: "marble" });
    grid.tiles.set("1,0", { type: "wall" });

    const roundTripped = deserializeGrid(serializeGrid(grid));

    expect(roundTripped.tiles.get("0,0")).toEqual({
      type: "floor",
      material: "marble",
    });
    expect(roundTripped.tiles.get("1,0")).toEqual({ type: "wall" });
  });

  it("empty grid round-trips cleanly", () => {
    const grid = createEmptyGrid(5, 5);
    const roundTripped = deserializeGrid(serializeGrid(grid));

    expect(roundTripped.tiles.size).toBe(0);
    expect(roundTripped.width).toBe(5);
    expect(roundTripped.height).toBe(5);
    expect(roundTripped.exhibits).toEqual([]);
    expect(roundTripped.performers).toEqual([]);
  });
});
