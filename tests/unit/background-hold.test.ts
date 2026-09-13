import { beforeEach, describe, expect, it, vi } from "vitest";

const backgroundController = vi.hoisted(() => ({
  freeze: vi.fn(),
  unfreeze: vi.fn(),
}));

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));

/**
 * No `@austencloud/backgrounds` mock: the hold module no longer imports it.
 * BackgroundHost publishes the live controller instead, which is what keeps
 * this module free of a static renderer-package edge — see
 * `tests/unit/boot-import-boundary.test.ts` and the note in the module.
 */
async function importHolds() {
  const module =
    await import("$lib/shared/background/shared/state/background-hold.svelte");
  module.registerBackgroundFreezeTarget(backgroundController);
  return module;
}

describe("background holds", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("freezes once until every keyed hold releases", async () => {
    const { holdBackground, releaseBackground } = await importHolds();

    holdBackground("playback");
    holdBackground("playback");
    holdBackground("panel-transition");

    expect(backgroundController.freeze).toHaveBeenCalledTimes(1);

    releaseBackground("playback");
    expect(backgroundController.unfreeze).not.toHaveBeenCalled();

    releaseBackground("panel-transition");
    releaseBackground("panel-transition");
    expect(backgroundController.unfreeze).toHaveBeenCalledTimes(1);
  });

  it("extends a timed hold without briefly resuming the background", async () => {
    vi.useFakeTimers();
    const { holdBackgroundFor } = await importHolds();

    holdBackgroundFor("panel-transition", 100);
    await vi.advanceTimersByTimeAsync(50);
    holdBackgroundFor("panel-transition", 100);
    await vi.advanceTimersByTimeAsync(50);

    expect(backgroundController.freeze).toHaveBeenCalledTimes(1);
    expect(backgroundController.unfreeze).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);
    expect(backgroundController.unfreeze).toHaveBeenCalledTimes(1);
  });

  it("applies an outstanding hold to a controller that registers later", async () => {
    // A transition can start before BackgroundHost has mounted its controller —
    // a route that opens the 3D viewer during boot, for instance. The hold has
    // to survive that ordering, or the backdrop animates through exactly the
    // window it was supposed to sit still for.
    const {
      holdBackground,
      registerBackgroundFreezeTarget,
      releaseBackground,
    } =
      await import("$lib/shared/background/shared/state/background-hold.svelte");

    holdBackground("panel-transition");
    expect(backgroundController.freeze).not.toHaveBeenCalled();

    registerBackgroundFreezeTarget(backgroundController);
    expect(backgroundController.freeze).toHaveBeenCalledTimes(1);

    releaseBackground("panel-transition");
    expect(backgroundController.unfreeze).toHaveBeenCalledTimes(1);
  });

  it("does not freeze a controller that registers after every hold released", async () => {
    const {
      holdBackground,
      registerBackgroundFreezeTarget,
      releaseBackground,
    } =
      await import("$lib/shared/background/shared/state/background-hold.svelte");

    holdBackground("panel-transition");
    releaseBackground("panel-transition");

    registerBackgroundFreezeTarget(backgroundController);
    expect(backgroundController.freeze).not.toHaveBeenCalled();
    expect(backgroundController.unfreeze).not.toHaveBeenCalled();
  });
});
