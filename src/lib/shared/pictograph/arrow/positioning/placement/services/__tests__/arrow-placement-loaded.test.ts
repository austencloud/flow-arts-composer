/**
 * isArrowPlacementDataLoaded and the retry after a miss. The four store
 * singletons are faked; each fake load can succeed, fail, or hang on demand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Mode = "ok" | "fail" | "hang";
const stores = vi.hoisted(() => {
  const make = () => ({
    mode: "ok" as "ok" | "fail" | "hang",
    loaded: false,
    attempts: 0,
    release: null as null | (() => void),
  });
  return {
    global: make(),
    prop: make(),
    special: make(),
    def: make(),
  };
});

function fakeInit(s: (typeof stores)["global"]) {
  return async () => {
    s.attempts++;
    if (s.mode === "hang") {
      await new Promise<void>((resolve) => (s.release = resolve));
    }
    if (s.mode === "fail") throw new Error("403");
    s.loaded = true;
  };
}

vi.mock(
  "#lib/shared/pictograph/arrow/positioning/global/services/global-adjustment-singleton.js",
  () => ({
    getGlobalAdjustmentRepository: () =>
      stores.global.loaded ? { isInitialized: true } : null,
    initializeGlobalAdjustments: fakeInit(stores.global),
  })
);
vi.mock(
  "#lib/shared/pictograph/arrow/positioning/prop-geometry/services/prop-geometry-singleton.js",
  () => ({
    getPropGeometryRepository: () =>
      stores.prop.loaded ? { isInitialized: true } : null,
    initializePropGeometryAdjustments: fakeInit(stores.prop),
  })
);
vi.mock(
  "#lib/shared/pictograph/arrow/positioning/special-override/services/special-override-singleton.js",
  () => ({
    getSpecialOverrideRepository: () =>
      stores.special.loaded ? { isInitialized: true } : null,
    initializeSpecialOverrides: fakeInit(stores.special),
  })
);
vi.mock(
  "#lib/shared/pictograph/arrow/positioning/default-override/services/default-override-singleton.js",
  () => ({
    getDefaultOverrideRepository: () =>
      stores.def.loaded ? { isInitialized: true } : null,
    initializeDefaultOverrides: fakeInit(stores.def),
  })
);

const all = () => [stores.global, stores.prop, stores.special, stores.def];
function setMode(mode: Mode) {
  for (const s of all()) {
    s.mode = mode;
    s.loaded = false;
    s.attempts = 0;
    s.release = null;
  }
}

async function freshOwner() {
  vi.resetModules();
  return import("../initialize-arrow-placement-data");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("isArrowPlacementDataLoaded", () => {
  it("is false before any load", async () => {
    setMode("ok");
    const owner = await freshOwner();
    expect(owner.isArrowPlacementDataLoaded()).toBe(false);
  });

  it("is true once all four stores loaded", async () => {
    setMode("ok");
    const owner = await freshOwner();
    await owner.whenArrowPlacementDataReady();
    expect(owner.isArrowPlacementDataLoaded()).toBe(true);
  });

  it("is false when one store's load failed, and the wait still settles", async () => {
    setMode("ok");
    stores.special.mode = "fail";
    const owner = await freshOwner();
    await owner.whenArrowPlacementDataReady();
    expect(owner.isArrowPlacementDataLoaded()).toBe(false);
  });

  it("is false after the ceiling with loads still pending", async () => {
    setMode("hang");
    const owner = await freshOwner();
    const ready = owner.whenArrowPlacementDataReady();
    await vi.advanceTimersByTimeAsync(20_000);
    await ready;
    expect(owner.isArrowPlacementDataLoaded()).toBe(false);
  });
});

describe("retry after a miss", () => {
  it("starts one background attempt per cooldown, only on a later call, and flips true", async () => {
    setMode("fail");
    const owner = await freshOwner();
    await owner.whenArrowPlacementDataReady();
    expect(stores.global.attempts).toBe(1);

    // No call, no attempt, however long it waits.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(stores.global.attempts).toBe(1);

    // First call after the cooldown: one new attempt.
    await owner.whenArrowPlacementDataReady();
    await vi.advanceTimersByTimeAsync(0);
    expect(stores.global.attempts).toBe(2);

    // Inside the new cooldown: calls start nothing.
    await owner.whenArrowPlacementDataReady();
    await owner.whenArrowPlacementDataReady();
    await vi.advanceTimersByTimeAsync(0);
    expect(stores.global.attempts).toBe(2);

    await vi.advanceTimersByTimeAsync(30_000);
    for (const s of all()) s.mode = "ok";
    await owner.whenArrowPlacementDataReady();
    await vi.advanceTimersByTimeAsync(0);
    expect(stores.global.attempts).toBe(3);
    expect(owner.isArrowPlacementDataLoaded()).toBe(true);
  });

  it("logs a failed load once, not per attempt", async () => {
    setMode("fail");
    const owner = await freshOwner();
    await owner.whenArrowPlacementDataReady();
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(31_000);
      await owner.whenArrowPlacementDataReady();
      await vi.advanceTimersByTimeAsync(0);
    }
    const failureLogs = vi
      .mocked(console.warn)
      .mock.calls.filter((c) => String(c[0]).includes("store load failed"));
    expect(failureLogs).toHaveLength(1);
  });

  it("runs listeners once, before anyone reads loaded", async () => {
    setMode("fail");
    const owner = await freshOwner();
    await owner.whenArrowPlacementDataReady();
    const seen: boolean[] = [];
    const listener = vi.fn(() => seen.push(true));
    owner.onArrowPlacementDataLoaded(listener);
    await vi.advanceTimersByTimeAsync(31_000);
    setMode("ok");
    await owner.whenArrowPlacementDataReady();
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenCalledTimes(1);
    owner.isArrowPlacementDataLoaded();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
