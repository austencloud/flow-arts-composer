import { afterEach, describe, expect, it, vi } from "vitest";

interface TestViewTransition {
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  finished: Promise<void>;
  skipTransition: () => void;
}

function installViewTransitionMock(): void {
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: vi.fn((update: () => void) => {
      update();
      const complete = Promise.resolve();
      return {
        ready: complete,
        updateCallbackDone: complete,
        finished: complete,
        skipTransition: vi.fn(),
      } satisfies TestViewTransition;
    }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("results morph layout stabilization", () => {
  it("stabilizes virtualized layouts twice before the new frame is captured", async () => {
    installViewTransitionMock();
    const events: string[] = [];
    const { registerResultsLayoutStabilizer, startMorph } =
      await import("$lib/shared/transitions/results-morph");

    registerResultsLayoutStabilizer(() => events.push("stabilize"));
    startMorph(() => events.push("mutate"));

    expect(events).toEqual(["mutate", "stabilize", "stabilize"]);
  });

  it("stops stabilizing a results layout after it unmounts", async () => {
    installViewTransitionMock();
    const stabilize = vi.fn();
    const { registerResultsLayoutStabilizer, startMorph } =
      await import("$lib/shared/transitions/results-morph");

    const unregister = registerResultsLayoutStabilizer(stabilize);
    unregister();
    startMorph(() => {});

    expect(stabilize).not.toHaveBeenCalled();
  });
});

describe("results morph reduced motion", () => {
  afterEach(() => {
    delete document.documentElement.dataset.motionPreference;
  });

  it("applies the mutation plainly under the app's Reduce Motion setting", async () => {
    installViewTransitionMock();
    document.documentElement.dataset.motionPreference = "reduce";
    const mutate = vi.fn();
    const { startMorph } =
      await import("$lib/shared/transitions/results-morph");

    const transition = startMorph(mutate);

    expect(transition).toBeNull();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(document.startViewTransition).not.toHaveBeenCalled();
  });
});

describe("results morph backdrop hold", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the animated backdrop until the morph finishes, then lets it run", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: vi.fn((update: () => void) => {
        update();
        return {
          ready: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          finished,
          skipTransition: vi.fn(),
        } satisfies TestViewTransition;
      }),
    });
    const backdrop = { freeze: vi.fn(), unfreeze: vi.fn() };
    const { registerBackgroundFreezeTarget } =
      await import("$lib/shared/background/shared/state/background-hold.svelte");
    registerBackgroundFreezeTarget(backdrop);
    const { startMorph } =
      await import("$lib/shared/transitions/results-morph");

    startMorph(() => {});
    expect(backdrop.freeze).toHaveBeenCalledTimes(1);

    // A morph can outlast a fixed window; the hold follows `finished`.
    await vi.advanceTimersByTimeAsync(1000);
    expect(backdrop.unfreeze).not.toHaveBeenCalled();

    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(backdrop.unfreeze).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(backdrop.unfreeze).toHaveBeenCalledTimes(1);
  });
});
