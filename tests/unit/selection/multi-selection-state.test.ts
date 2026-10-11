import { describe, expect, it, vi } from "vitest";
import { createMultiSelectionState } from "#lib/shared/selection/state/create-multi-selection-state.svelte.js";

describe("createMultiSelectionState", () => {
  it("enters with the long-pressed item and clears when selection mode exits", () => {
    const onModeChange = vi.fn();
    const selection = createMultiSelectionState({
      getAllIds: () => ["a", "b", "c"],
      onModeChange,
    });

    selection.enter("b");
    expect(selection.active).toBe(true);
    expect([...selection.selectedIds]).toEqual(["b"]);
    expect(onModeChange).toHaveBeenCalledWith(true);

    selection.exit();
    expect(selection.active).toBe(false);
    expect(selection.selectedIds.size).toBe(0);
    expect(onModeChange).toHaveBeenLastCalledWith(false);
  });

  it("toggles independent items without mutating the previous Set", () => {
    const selection = createMultiSelectionState({
      getAllIds: () => ["a", "b", "c"],
    });
    selection.enter("a");
    const before = selection.selectedIds;

    selection.toggle("b");
    expect(selection.selectedIds).not.toBe(before);
    expect([...selection.selectedIds]).toEqual(["a", "b"]);

    selection.toggle("a");
    expect([...selection.selectedIds]).toEqual(["b"]);
  });

  it("reads the latest visible ids whenever Select all is used", () => {
    let visibleIds = ["a", "b"];
    const selection = createMultiSelectionState({
      getAllIds: () => visibleIds,
    });
    selection.enter();
    selection.selectAll();
    expect([...selection.selectedIds]).toEqual(["a", "b"]);

    visibleIds = ["c"];
    selection.selectAll();
    expect([...selection.selectedIds]).toEqual(["c"]);
  });

  it("drops only the ids completed by a batch action", () => {
    const selection = createMultiSelectionState({
      getAllIds: () => ["a", "b", "c"],
    });
    selection.enter();
    selection.selectAll();

    selection.removeIds(["a", "c"]);

    expect([...selection.selectedIds]).toEqual(["b"]);
    expect(selection.active).toBe(true);
  });
});
