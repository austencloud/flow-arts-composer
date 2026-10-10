import { describe, expect, it } from "vitest";

import { createStageEditMode } from "#lib/features/stage/state/stage-edit-mode.svelte.js";

describe("Stage selection", () => {
  it("keeps exactly one explicit target kind", () => {
    const editMode = createStageEditMode();

    editMode.selectPerformer("a");
    expect(editMode.selection).toEqual({
      kind: "performers",
      performerIds: ["a"],
      anchorId: "a",
    });

    editMode.selectClip("a", "clip-a");
    expect(editMode.selection).toEqual({
      kind: "clip",
      performerId: "a",
      clipId: "clip-a",
    });
    expect(editMode.selectedClipId).toBe("clip-a");
    expect(editMode.selectedFormationId).toBeNull();
    expect(editMode.multiSelectedPerformerIds).toEqual(new Set());

    editMode.selectTravel("set-2", "a");
    expect(editMode.selection).toEqual({
      kind: "travel",
      formationId: "set-2",
      performerId: "a",
    });
    expect(editMode.selectedClipId).toBeNull();
  });

  it("toggles a performer group without leaving a hidden anchor selected", () => {
    const editMode = createStageEditMode();

    editMode.selectPerformer("a");
    editMode.selectPerformer("b", true);
    expect(editMode.multiSelectedPerformerIds).toEqual(new Set(["a", "b"]));
    expect(editMode.selectedPerformerId).toBe("b");

    editMode.selectPerformer("b", true);
    expect(editMode.multiSelectedPerformerIds).toEqual(new Set(["a"]));
    expect(editMode.selectedPerformerId).toBe("a");

    editMode.selectPerformer("a", true);
    expect(editMode.selection).toEqual({ kind: "none" });
    expect(editMode.selectedPerformerId).toBeNull();
  });

  it("sets and normalizes a whole performer selection atomically", () => {
    const editMode = createStageEditMode();

    editMode.selectPerformers(["a", "b", "a"], "a");

    expect(editMode.selection).toEqual({
      kind: "performers",
      performerIds: ["a", "b"],
      anchorId: "a",
    });
    expect(editMode.selectedPerformerId).toBe("a");

    editMode.selectPerformers([]);
    expect(editMode.selection).toEqual({ kind: "none" });
  });
});
