import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import type { BrowseEngine } from "#lib/shared/browse/engine/types.js";

const track = vi.fn();
vi.mock("#lib/shared/analytics/browse-events.js", () => ({
  trackBrowseFilterApplied: (event: unknown) => track(event),
}));

const { createDrillFilterBindings } =
  await import("./drill-filter-bindings.svelte");

/** Just enough engine: a filter map and a result count that follows it. */
function fakeEngine() {
  const activeFilters = new Map<
    string,
    { type: BrowseFilterType; value: string | number; locked?: boolean }
  >();
  const engine = {
    activeFilters,
    get resultCount() {
      return 100 - activeFilters.size * 10;
    },
    addFilter(type: BrowseFilterType, value: string | number) {
      const stacking =
        type === BrowseFilterType.LOOP_TYPE ||
        type === BrowseFilterType.TND_FAMILY;
      activeFilters.set(stacking ? `${type}:${value}` : String(type), {
        type,
        value,
      });
    },
    // Prefix-aware like the real engine: a bare type clears its stack.
    removeFilter(key: string) {
      for (const k of [...activeFilters.keys()]) {
        if (k === key || k.startsWith(`${key}:`)) activeFilters.delete(k);
      }
    },
    clearUserFilters() {
      for (const [k, f] of [...activeFilters]) {
        if (!f.locked) activeFilters.delete(k);
      }
    },
  };
  return engine as unknown as BrowseEngine;
}

describe("browse_filter_applied from the drill bindings", () => {
  beforeEach(() => track.mockClear());

  it("fires once per apply and once per clear with the surface and count", () => {
    const engine = fakeEngine();
    const filters = createDrillFilterBindings(() => engine, {
      surface: () => "ask",
    });

    filters.replace(BrowseFilterType.LENGTH, 16, "16 steps");
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenLastCalledWith({
      filter: "length",
      value: 16,
      action: "apply",
      surface: "ask",
      result_count: 90,
    });

    filters.toggleValue(
      BrowseFilterType.LENGTH,
      16,
      "16 steps",
      undefined,
      false
    );
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith({
      filter: "length",
      value: 16,
      action: "clear",
      surface: "ask",
      result_count: 100,
    });
  });

  it("follows the surface getter and covers stacking categories", () => {
    const engine = fakeEngine();
    let surface: "ask" | "answer_button" = "answer_button";
    const filters = createDrillFilterBindings(() => engine, {
      surface: () => surface,
    });
    filters.toggleLoop("component:mirrored", "Mirrored", "#fff", true);
    expect(track).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filter: BrowseFilterType.LOOP_TYPE,
        action: "apply",
        surface: "answer_button",
      })
    );
    surface = "ask";
    filters.toggleLoop("component:mirrored", "Mirrored", "#fff", false);
    expect(track).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "clear", surface: "ask" })
    );
    expect(track).toHaveBeenCalledTimes(2);
  });

  it("a chip x and the Show all reset send one clear per filter removed", () => {
    const engine = fakeEngine();
    const filters = createDrillFilterBindings(() => engine, {
      surface: () => "more_filters",
    });
    filters.add(BrowseFilterType.LENGTH, 16, "16 steps");
    filters.add(BrowseFilterType.STARTING_LETTER, "D", "D");
    filters.toggleLoop("component:mirrored", "Mirrored", "#fff", true);
    filters.toggleLoop("component:rotated", "Rotated", "#fff", true);
    // A host-locked pile filter, set the way the host sets it.
    (engine.activeFilters as Map<string, unknown>).set("collection", {
      type: BrowseFilterType.COLLECTION,
      value: "pile",
      locked: true,
    } as never);
    track.mockClear();

    filters.removeKey(String(BrowseFilterType.LENGTH));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenLastCalledWith({
      filter: "length",
      value: 16,
      action: "clear",
      surface: "more_filters",
      result_count: 60,
    });

    // A bare loop key clears both stacked loops: two events.
    filters.removeKey(String(BrowseFilterType.LOOP_TYPE));
    expect(track).toHaveBeenCalledTimes(3);

    // Show all: the letter goes, the locked pile stays and is not reported.
    filters.add(BrowseFilterType.LENGTH, 8, "8 steps");
    track.mockClear();
    filters.clearAll();
    expect(
      track.mock.calls.map(([e]) => [e.filter, e.value, e.action])
    ).toEqual([
      ["starting_letter", "D", "clear"],
      ["length", 8, "clear"],
    ]);
    expect(engine.activeFilters.has("collection")).toBe(true);
  });

  it("sends nothing for hosts outside Browse's filter path", () => {
    const engine = fakeEngine();
    const filters = createDrillFilterBindings(() => engine);
    filters.add(BrowseFilterType.STARTING_LETTER, "D", "D");
    expect(track).not.toHaveBeenCalled();
  });
});
