// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutumnSceneryRenderer } from "../../node_modules/@austencloud/backgrounds/dist/backgrounds/autumn/services/AutumnSceneryRenderer.js";

class ImageDouble {
  static instances: ImageDouble[] = [];

  decoding = "auto";
  naturalWidth = 1600;
  naturalHeight = 900;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";

  constructor() {
    ImageDouble.instances.push(this);
  }
}

interface AutumnSceneryInternals {
  artwork: Record<string, unknown>;
  artworkRetryTimers: Map<string, ReturnType<typeof setTimeout>>;
}

describe("AutumnSceneryRenderer artwork recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    ImageDouble.instances = [];
  });

  it("keeps the last loaded plate visible while replacement artwork loads", () => {
    vi.stubGlobal("Image", ImageDouble);
    const renderer = new AutumnSceneryRenderer("medium");
    const internals = renderer as unknown as AutumnSceneryInternals;
    const existingPlate = { naturalWidth: 1600, naturalHeight: 900 };
    internals.artwork.flat = existingPlate;

    renderer.initialize({ width: 1600, height: 900 }, "medium");

    expect(internals.artwork.flat).toBe(existingPlate);
    expect(ImageDouble.instances.length).toBeGreaterThan(0);
    renderer.cleanup();
  });

  it("retries a failed plate three times, then stops", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Image", ImageDouble);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const renderer = new AutumnSceneryRenderer("medium");
    const internals = renderer as unknown as AutumnSceneryInternals;

    renderer.initialize({ width: 1600, height: 900 }, "medium");
    const firstAttempt = ImageDouble.instances[0];
    expect(firstAttempt).toBeDefined();
    const source = firstAttempt!.src;
    const initialImageCount = ImageDouble.instances.length;

    firstAttempt!.onerror?.();
    await vi.advanceTimersByTimeAsync(250);
    expect(ImageDouble.instances).toHaveLength(initialImageCount + 1);

    ImageDouble.instances.at(-1)!.onerror?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ImageDouble.instances).toHaveLength(initialImageCount + 2);

    ImageDouble.instances.at(-1)!.onerror?.();
    await vi.advanceTimersByTimeAsync(3000);
    expect(ImageDouble.instances).toHaveLength(initialImageCount + 3);

    const finalAttempt = ImageDouble.instances.at(-1)!;
    expect(finalAttempt.src).toBe(source);
    finalAttempt.onerror?.();
    await vi.runOnlyPendingTimersAsync();

    expect(ImageDouble.instances).toHaveLength(initialImageCount + 3);
    expect(internals.artworkRetryTimers.size).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    renderer.cleanup();
  });
});
