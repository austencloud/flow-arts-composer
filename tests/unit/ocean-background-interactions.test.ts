import type {
  Bubble,
  JellyfishMarineLife,
  OceanState,
} from "../../node_modules/@austencloud/backgrounds/dist/backgrounds/ocean/domain/models/OceanModels.js";
import { OceanBackgroundOrchestrator } from "../../node_modules/@austencloud/backgrounds/dist/backgrounds/ocean/services/OceanBackgroundOrchestrator.js";
import { BubblePhysics } from "../../node_modules/@austencloud/backgrounds/dist/backgrounds/ocean/services/implementations/BubblePhysics.js";
import { describe, expect, it, vi } from "vitest";

interface OceanInternals {
  state: OceanState;
  lastDimensions: { width: number; height: number } | null;
}

function createOcean(): OceanBackgroundOrchestrator {
  const unused = {} as never;
  return new OceanBackgroundOrchestrator(
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused
  );
}

function bubble(overrides: Partial<Bubble> = {}): Bubble {
  return {
    x: 50,
    y: 40,
    radius: 10,
    opacity: 0.5,
    sizeCategory: "large",
    ...overrides,
  } as Bubble;
}

describe("2D ocean direct interactions", () => {
  it("forwards the on-screen spawn option to the async fish initializer", async () => {
    const initializeFish = vi.fn(async () => []);
    const ocean = new OceanBackgroundOrchestrator(
      {
        getBubbleCount: () => 0,
        initializeBubbles: () => [],
      } as never,
      {
        getParticleCount: () => 0,
        initializeParticles: () => [],
      } as never,
      {
        getLightRayCount: () => 0,
        initializeLightRays: () => [],
        getCausticsEnabled: () => false,
      } as never,
      {
        getFishCount: () => 1,
        initializeFish,
      } as never,
      {
        getJellyfishCount: () => 0,
        initializeJellyfish: () => [],
      } as never,
      {
        initializeGradientState: () => null,
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await ocean.initialize({ width: 1280, height: 720 }, "medium", {
      spawnFishOnScreen: true,
    });

    expect(initializeFish).toHaveBeenCalledWith(
      { width: 1280, height: 720 },
      1,
      true,
      true
    );
  });

  it("pops the closest visible bubble and removes it from the live hit-test", () => {
    const ocean = createOcean();
    const internal = ocean as unknown as OceanInternals;
    const target = bubble();
    internal.state.bubbles = [target];
    internal.lastDimensions = { width: 100, height: 100 };

    expect(ocean.interactionAt(52, 40)).toBe("bubble");
    expect(ocean.popBubbleAt(52, 40)).toEqual({
      hit: true,
      size01: 8 / 13,
      pan: 0,
    });
    expect(target.popping).toBe(true);
    expect(ocean.interactionAt(52, 40)).toBeNull();
  });

  it("keeps foreground jellyfish ahead of bubbles at the same point", () => {
    const ocean = createOcean();
    const internal = ocean as unknown as OceanInternals;
    internal.state.bubbles = [bubble()];
    internal.state.jellyfish = [
      { x: 50, y: 40, size: 40, flashTimer: 0 } as JellyfishMarineLife,
    ];
    internal.lastDimensions = { width: 100, height: 100 };

    expect(ocean.interactionAt(50, 40)).toBe("jellyfish");
    expect(ocean.pokeAt(50, 40).hit).toBe(true);
    expect(internal.state.jellyfish[0]?.flashTimer).toBe(0.6);
  });

  it("releases a popped cluster so no followers depend on a missing leader", () => {
    const ocean = createOcean();
    const internal = ocean as unknown as OceanInternals;
    const leader = bubble({ clusterId: 7, clusterOffset: { x: 0, y: 0 } });
    const follower = bubble({
      x: 70,
      clusterId: 7,
      clusterOffset: { x: 20, y: 0 },
    });
    internal.state.bubbles = [leader, follower];
    internal.lastDimensions = { width: 100, height: 100 };

    ocean.popBubbleAt(50, 40);

    expect(leader.clusterId).toBeUndefined();
    expect(follower.clusterId).toBeUndefined();
    expect(follower.clusterOffset).toBeUndefined();
  });

  it("replaces the bubble after its pop animation finishes", () => {
    const physics = new BubblePhysics();
    const popped = bubble({ popping: true, popAge: 0.99 });

    const next = physics.updateBubbles(
      [popped],
      { width: 100, height: 100 },
      1,
      0
    );

    expect(next).toHaveLength(1);
    expect(next[0]).not.toBe(popped);
    expect(next[0]?.popping).toBeUndefined();
  });
});
