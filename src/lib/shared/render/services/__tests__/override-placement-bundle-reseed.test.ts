import { beforeEach, describe, expect, it, vi } from "vitest";

// reseedWhenPlacementLoaded: a pool seeded after a miss is handed the complete
// snapshot exactly once, at the moment the data loads.

const owner = vi.hoisted(() => ({
  loaded: false,
  listeners: [] as Array<() => void>,
}));
const special = vi.hoisted(() => ({ docs: [] as unknown[] }));

vi.mock(
  "#lib/shared/pictograph/arrow/positioning/placement/services/initialize-arrow-placement-data.js",
  () => ({
    isArrowPlacementDataLoaded: () => owner.loaded,
    onArrowPlacementDataLoaded: (l: () => void) => {
      owner.listeners.push(l);
      return () => {};
    },
    whenArrowPlacementDataReady: async () => {},
  })
);
vi.mock(
  "#lib/shared/pictograph/arrow/positioning/special-override/services/special-override-singleton.js",
  () => ({
    getSpecialOverrideRepository: () => ({ getAll: () => special.docs }),
  })
);
vi.mock(
  "#lib/shared/pictograph/arrow/positioning/global/services/global-adjustment-singleton.js",
  () => ({ getGlobalAdjustmentRepository: () => null })
);
vi.mock(
  "#lib/shared/pictograph/arrow/positioning/default-override/services/default-override-singleton.js",
  () => ({ getDefaultOverrideRepository: () => null })
);
vi.mock(
  "#lib/shared/pictograph/arrow/positioning/prop-geometry/services/prop-geometry-singleton.js",
  () => ({ getPropGeometryRepository: () => null })
);

beforeEach(() => {
  vi.resetModules();
  owner.loaded = false;
  owner.listeners = [];
  special.docs = [];
});

describe("reseedWhenPlacementLoaded", () => {
  it("pushes the full snapshot once when the data loads, not before", async () => {
    const { reseedWhenPlacementLoaded } =
      await import("../override-placement-bundle");
    const apply = vi.fn();
    reseedWhenPlacementLoaded(apply);
    reseedWhenPlacementLoaded(apply); // a second seed does not double it
    expect(owner.listeners).toHaveLength(1);
    expect(apply).not.toHaveBeenCalled();

    special.docs = [{ key: "late" }];
    owner.loaded = true;
    owner.listeners.forEach((l) => l());
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![0].special).toEqual([{ key: "late" }]);
  });

  it("pushes at once when the data landed between the snapshot and its install", async () => {
    const { loadOverridePlacementBundle, reseedWhenPlacementLoaded } =
      await import("../override-placement-bundle");
    const stale = await loadOverridePlacementBundle(); // taken after a miss
    expect(stale.special).toEqual([]);

    special.docs = [{ key: "late" }];
    owner.loaded = true; // the load finishes while the caller is still busy
    const apply = vi.fn();
    reseedWhenPlacementLoaded(apply);
    reseedWhenPlacementLoaded(apply);
    expect(owner.listeners).toHaveLength(0);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]![0].special).toEqual([{ key: "late" }]);
  });

  it("does nothing when the data was already loaded at seed time", async () => {
    owner.loaded = true;
    const { reseedWhenPlacementLoaded } =
      await import("../override-placement-bundle");
    const apply = vi.fn();
    reseedWhenPlacementLoaded(apply);
    expect(owner.listeners).toHaveLength(0);
  });
});
