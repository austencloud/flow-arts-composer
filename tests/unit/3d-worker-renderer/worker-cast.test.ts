// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CHARACTER_ID } from "#lib/shared/3d/domain/character-model.js";
import { createPerformerManager } from "#lib/shared/3d/state/performer-manager.svelte.js";
import { selectWorkerCast } from "#lib/shared/3d/worker-renderer/services/worker-cast.js";

const canvasSource = readFileSync(
  "src/lib/shared/3d/components/Viewer3DCanvas.svelte",
  "utf8"
);
const workerSceneSource = readFileSync(
  "src/lib/shared/3d/components/WorkerViewer3DScene.svelte",
  "utf8"
);

describe("the cast the worker renderer draws", () => {
  let now = 1_000;

  beforeEach(() => {
    now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function settledCastOfTwo() {
    const manager = createPerformerManager({
      initialCharacterId: DEFAULT_CHARACTER_ID,
      maxPerformers: 8,
    });
    manager.initialize();
    manager.addPerformer();
    manager.updateFormationTransition(now + 280);
    now = 2_000;
    return manager;
  }

  function drawnIds(manager: ReturnType<typeof createPerformerManager>) {
    return selectWorkerCast(
      manager.renderablePerformers,
      manager.performers.length
    ).map(({ performer }) => performer.id);
  }

  it("draws a performer from the moment they are added", () => {
    const manager = createPerformerManager({
      initialCharacterId: DEFAULT_CHARACTER_ID,
      maxPerformers: 8,
    });
    manager.initialize();

    manager.addPerformer();

    expect(drawnIds(manager)).toEqual(
      manager.performers.map((performer) => performer.id)
    );
    manager.destroy();
  });

  it("stops drawing the first performer the moment they are removed", () => {
    const manager = settledCastOfTwo();
    const survivor = manager.performers[1];

    manager.removePerformer(0);

    // The leaver keeps place 0 while it leaves and the survivor moves into
    // place 0. Only one drawn performer may hold a place: the badge, the
    // selection ring and the step a performer plays are all looked up by it.
    expect(drawnIds(manager)).toEqual([survivor?.id]);
    manager.destroy();
  });

  it("stops drawing the last performer the moment they are removed", () => {
    const manager = settledCastOfTwo();
    const survivor = manager.performers[0];

    manager.removePerformer();

    expect(drawnIds(manager)).toEqual([survivor?.id]);
    manager.destroy();
  });

  it("keeps the same renderer while the cast changes", () => {
    // Choosing the renderer by whether anyone is arriving or leaving sent the
    // viewer to the other renderer for the 280 ms that motion lasts, then
    // back: two cold starts, a black stage and stopped playback.
    expect(/presencePhase/.test(canvasSource)).toBe(false);
    expect(workerSceneSource).toContain("selectWorkerCast(");
  });
});
