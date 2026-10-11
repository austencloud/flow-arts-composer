import { describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, type WebGLRenderer } from "three";
import { BackgroundType } from "@austencloud/backgrounds";
import { getStageCoordinateFrame } from "#lib/shared/3d/environments/domain/stage-coordinate-frame.js";
import type { WorkerWorldContext } from "#lib/shared/3d/worker-renderer/worlds/worker-environment-world.js";

const mocks = vi.hoisted(() => ({
  setGroundY: vi.fn(),
  setStageBounds: vi.fn(),
  load: vi.fn(),
}));
vi.mock(
  "#lib/shared/3d/environments/worlds/celestial/celestial-environment-world.js",
  () => ({
    createLoadedCelestialEnvironmentWorld: mocks.load,
    attachCelestialEnvironmentWorld: () => () => {},
  })
);
import { createCelestialPrototypeWorld } from "#lib/shared/3d/worker-renderer/worlds/celestial-prototype-world.js";

describe("Celestial worker layout", () => {
  it("uses canonical grounding and updates the authored court for cast changes", async () => {
    mocks.load.mockResolvedValue({
      fog: null,
      background: null,
      setGroundY: mocks.setGroundY,
      setStageBounds: mocks.setStageBounds,
      dispose: vi.fn(),
    });
    const performers = Array.from({ length: 8 }, (_, index) => ({
      groundY: -1.5,
      position: [index % 2 ? 3 : -3, 0, Math.floor(index / 2) * 2],
    })) as unknown as WorkerWorldContext["performers"];
    const world = await createCelestialPrototypeWorld({
      camera: new PerspectiveCamera(),
      renderer: {} as WebGLRenderer,
      performers: performers.slice(0, 1),
      requestId: 1,
      reducedMotion: true,
      reportProgress: vi.fn(),
    });
    expect(mocks.load).toHaveBeenCalledWith(
      expect.objectContaining({
        worldYOffset: getStageCoordinateFrame(BackgroundType.CELESTIAL, true)
          .environmentYOffset,
        motionScale: 0,
      })
    );
    world.setPerformers!(performers);
    expect(mocks.setGroundY).toHaveBeenLastCalledWith(-1.5);
    expect(mocks.setStageBounds).toHaveBeenLastCalledWith(
      expect.any(Number),
      3.5
    );
    expect(mocks.setStageBounds.mock.lastCall![0]).toBeGreaterThan(7);
    world.dispose();
  });
});
