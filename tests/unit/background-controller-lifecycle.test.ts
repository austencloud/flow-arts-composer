import {
  BackgroundController,
  BackgroundFactory,
  BackgroundType,
} from "@austencloud/backgrounds";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ControllerInternals {
  mounted: boolean;
  initialized: boolean;
  lifecycleGeneration: number;
  canvasA: HTMLCanvasElement | null;
  canvasB: HTMLCanvasElement | null;
  systemA: unknown;
  systemB: unknown;
  activeCanvas: "A" | "B";
  currentType: BackgroundType | null;
  initializationRetryTimer: ReturnType<typeof setTimeout> | null;
  initializeBackground(
    type: BackgroundType,
    options: Record<string, unknown>
  ): Promise<void>;
  performCrossfade(
    type: BackgroundType,
    options: Record<string, unknown>
  ): Promise<void>;
  waitForFrame(): Promise<void>;
  delay(milliseconds: number): Promise<void>;
  attachCanvasRecovery(canvas: HTMLCanvasElement, which: "A" | "B"): void;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createCanvasDouble() {
  const listeners = new Map<string, EventListener>();
  const canvas = {
    width: 1280,
    height: 720,
    classList: { toggle: vi.fn() },
    getContext: vi.fn(() => ({ clearRect: vi.fn() })),
    setAttribute: vi.fn(),
    addEventListener: vi.fn((name: string, listener: EventListener) => {
      listeners.set(name, listener);
    }),
    remove: vi.fn(),
  } as unknown as HTMLCanvasElement;
  return { canvas, listeners };
}

function createSystemDouble() {
  return {
    initialize: vi.fn(),
    update: vi.fn(),
    draw: vi.fn(),
    cleanup: vi.fn(),
    setQuality: vi.fn(),
  };
}

describe("BackgroundController lifecycle recovery", () => {
  beforeEach(() => {
    let animationId = 0;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => ++animationId)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("freezes and resumes live systems without disposing their canvases", () => {
    const controller = new BackgroundController();
    const internals = controller as unknown as ControllerInternals & {
      animationIdA: number | null;
      animationIdB: number | null;
    };
    const canvasA = createCanvasDouble().canvas;
    const canvasB = createCanvasDouble().canvas;
    const systemA = createSystemDouble();
    const systemB = createSystemDouble();

    internals.mounted = true;
    internals.canvasA = canvasA;
    internals.canvasB = canvasB;
    internals.systemA = systemA;
    internals.systemB = systemB;
    internals.animationIdA = 11;
    internals.animationIdB = 12;

    controller.freeze();
    controller.freeze();

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(2);
    expect(internals.systemA).toBe(systemA);
    expect(internals.systemB).toBe(systemB);
    expect(internals.canvasA).toBe(canvasA);
    expect(internals.canvasB).toBe(canvasB);
    expect(systemA.cleanup).not.toHaveBeenCalled();
    expect(systemB.cleanup).not.toHaveBeenCalled();

    controller.unfreeze();
    controller.unfreeze();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(internals.systemA).toBe(systemA);
    expect(internals.systemB).toBe(systemB);
  });

  it("rejects an async initialization that resolves after unmount", async () => {
    const controller = new BackgroundController();
    const internals = controller as unknown as ControllerInternals;
    const pendingSystem =
      createDeferred<ReturnType<typeof createSystemDouble>>();
    const staleSystem = createSystemDouble();
    const factory = vi
      .spyOn(BackgroundFactory, "createBackgroundSystem")
      .mockImplementation(async () => pendingSystem.promise as never);

    internals.mounted = true;
    internals.lifecycleGeneration = 1;
    internals.canvasA = createCanvasDouble().canvas;
    internals.canvasB = createCanvasDouble().canvas;

    const initialization = internals.initializeBackground(
      BackgroundType.COSMIC,
      {}
    );
    expect(factory).toHaveBeenCalledTimes(1);

    controller.unmount();
    pendingSystem.resolve(staleSystem);
    await initialization;

    expect(staleSystem.cleanup).toHaveBeenCalledTimes(1);
    expect(internals.systemA).toBeNull();
    expect(internals.initialized).toBe(false);
    expect(controller.isReady()).toBe(false);
  });

  it("waits for Ocean sprites before exposing the first canvas", async () => {
    const controller = new BackgroundController();
    const internals = controller as unknown as ControllerInternals;
    const initialization = createDeferred<void>();
    const system = createSystemDouble();
    system.initialize.mockImplementation(() => initialization.promise);
    vi.spyOn(BackgroundFactory, "createBackgroundSystem").mockResolvedValue(
      system as never
    );

    internals.mounted = true;
    internals.lifecycleGeneration = 1;
    internals.canvasA = createCanvasDouble().canvas;
    internals.canvasB = createCanvasDouble().canvas;

    const starting = internals.initializeBackground(BackgroundType.OCEAN, {});
    await vi.waitFor(() => expect(system.initialize).toHaveBeenCalledTimes(1));

    expect(system.initialize).toHaveBeenCalledWith(
      { width: 1280, height: 720 },
      "medium",
      { spawnFishOnScreen: true }
    );
    expect(controller.isReady()).toBe(false);
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    initialization.resolve();
    await starting;

    expect(controller.isReady()).toBe(true);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("keeps the outgoing canvas visible until an Ocean crossfade initializes", async () => {
    const controller = new BackgroundController();
    const internals = controller as unknown as ControllerInternals;
    const initialization = createDeferred<void>();
    const outgoingSystem = createSystemDouble();
    const incomingSystem = createSystemDouble();
    incomingSystem.initialize.mockImplementation(() => initialization.promise);
    vi.spyOn(BackgroundFactory, "createBackgroundSystem").mockResolvedValue(
      incomingSystem as never
    );
    vi.spyOn(internals, "waitForFrame").mockResolvedValue();
    vi.spyOn(internals, "delay").mockResolvedValue();

    internals.mounted = true;
    internals.lifecycleGeneration = 1;
    internals.initialized = true;
    internals.activeCanvas = "A";
    internals.currentType = BackgroundType.COSMIC;
    internals.canvasA = createCanvasDouble().canvas;
    internals.canvasB = createCanvasDouble().canvas;
    internals.systemA = outgoingSystem;

    const crossfade = internals.performCrossfade(BackgroundType.OCEAN, {});
    await vi.waitFor(() =>
      expect(incomingSystem.initialize).toHaveBeenCalledTimes(1)
    );

    expect(incomingSystem.initialize).toHaveBeenCalledWith(
      { width: 1280, height: 720 },
      "medium",
      { spawnFishOnScreen: true }
    );
    expect(internals.activeCanvas).toBe("A");
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    initialization.resolve();
    await crossfade;

    expect(internals.activeCanvas).toBe("B");
    expect(internals.currentType).toBe(BackgroundType.OCEAN);
    expect(outgoingSystem.cleanup).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it("cleans up a deferred Ocean initializer after its generation becomes stale", async () => {
    const controller = new BackgroundController();
    const internals = controller as unknown as ControllerInternals;
    const initialization = createDeferred<void>();
    const system = createSystemDouble();
    system.initialize.mockImplementation(() => initialization.promise);
    vi.spyOn(BackgroundFactory, "createBackgroundSystem").mockResolvedValue(
      system as never
    );

    internals.mounted = true;
    internals.lifecycleGeneration = 1;
    internals.canvasA = createCanvasDouble().canvas;
    internals.canvasB = createCanvasDouble().canvas;

    const starting = internals.initializeBackground(BackgroundType.OCEAN, {});
    await vi.waitFor(() => expect(system.initialize).toHaveBeenCalledTimes(1));

    controller.unmount();
    initialization.resolve();
    await starting;

    expect(system.cleanup).toHaveBeenCalledTimes(1);
    expect(internals.systemA).toBeNull();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("refreshes the active background when a canvas context returns", () => {
    const controller = new BackgroundController();
    const internals = controller as unknown as ControllerInternals;
    const { canvas, listeners } = createCanvasDouble();
    const stopAnimation = vi.spyOn(
      controller as unknown as { stopAnimation(which: "A" | "B"): void },
      "stopAnimation"
    );
    const forceRefresh = vi
      .spyOn(controller, "forceRefresh")
      .mockImplementation(() => {});

    internals.mounted = true;
    internals.canvasA = canvas;
    internals.attachCanvasRecovery(canvas, "A");

    listeners.get("contextlost")?.(new Event("contextlost"));
    listeners.get("contextrestored")?.(new Event("contextrestored"));

    expect(stopAnimation).toHaveBeenCalledWith("A");
    expect(forceRefresh).toHaveBeenCalledTimes(1);
  });

  it("bounds retries after repeated initialization failures", async () => {
    vi.useFakeTimers();
    const controller = new BackgroundController();
    const internals = controller as unknown as ControllerInternals;
    const failure = new Error("transient background failure");
    const factory = vi
      .spyOn(BackgroundFactory, "createBackgroundSystem")
      .mockRejectedValue(failure);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    internals.mounted = true;
    internals.lifecycleGeneration = 1;
    internals.canvasA = createCanvasDouble().canvas;
    internals.canvasB = createCanvasDouble().canvas;

    await internals.initializeBackground(BackgroundType.COSMIC, {});
    await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(3000);

    expect(factory).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(error).toHaveBeenCalledTimes(1);
    expect(internals.initializationRetryTimer).toBeNull();
  });
});
