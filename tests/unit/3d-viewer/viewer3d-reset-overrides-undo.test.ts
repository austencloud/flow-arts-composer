import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { createViewer3DStateForTest } from "./viewer3d-test-helpers.svelte";

describe("viewer bulk reset undo", () => {
  it("restores each performer's prop override after a bulk reset", () => {
    const { state, dispose } = createViewer3DStateForTest({});
    try {
      state.performerManager.initialize();
      state.performerManager.addPerformer();
      const first = state.performerManager.performers[0]!;
      const second = state.performerManager.performers[1]!;
      first.setProp(PropType.FAN);
      second.setProp(PropType.STAFF);
      state.sceneUndo.clear();

      state.resetAllPerformersProp();
      expect(first.hasOverride.prop).toBe(false);
      expect(second.hasOverride.prop).toBe(false);
      state.undo();
      expect(first.settings.prop).toBe(PropType.FAN);
      expect(second.settings.prop).toBe(PropType.STAFF);
      state.redo();
      expect(first.hasOverride.prop).toBe(false);
      expect(second.hasOverride.prop).toBe(false);
    } finally {
      state.sceneUndo.clear();
      dispose();
    }
  });
});
