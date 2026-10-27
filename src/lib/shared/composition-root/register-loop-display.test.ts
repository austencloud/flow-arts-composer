import { beforeEach, describe, expect, it, vi } from "vitest";

// The registries are plain module variables, so each test starts from a fresh
// module graph: otherwise an earlier registration (from this file or another
// test sharing the worker) would make the "before" check pass vacuously.
beforeEach(() => {
  vi.resetModules();
});

describe("registerLoopDisplay", () => {
  it("fills the LOOP display slots that the landing hero reads", async () => {
    const { tryGetLoopDisplayResolver, tryGetLoopDisplayCacheClearer } =
      await import("#lib/shared/loop-labeler/get-loop-display-resolver.js");
    const { getLoopDetector } =
      await import("#lib/shared/create/get-loop-detector.js");
    const { loopDetector } =
      await import("#lib/features/create/generate/circular/services/loop-detector.js");
    const { registerLoopDisplay } = await import("./register-loop-display");

    expect(tryGetLoopDisplayResolver()).toBeNull();
    expect(tryGetLoopDisplayCacheClearer()).toBeNull();
    expect(() => getLoopDetector()).toThrow();

    registerLoopDisplay();

    expect(tryGetLoopDisplayResolver()).toBeTypeOf("function");
    expect(tryGetLoopDisplayCacheClearer()).toBeTypeOf("function");
    expect(getLoopDetector()).toBe(loopDetector);
  });

  it("can run twice, since app mode and the hero both call it", async () => {
    const { tryGetLoopDisplayResolver } =
      await import("#lib/shared/loop-labeler/get-loop-display-resolver.js");
    const { registerLoopDisplay } = await import("./register-loop-display");

    registerLoopDisplay();
    const first = tryGetLoopDisplayResolver();
    expect(() => registerLoopDisplay()).not.toThrow();
    expect(tryGetLoopDisplayResolver()).toBe(first);
  });
});
