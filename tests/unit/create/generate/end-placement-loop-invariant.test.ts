import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStartEndOptionsState } from "$lib/features/create/generate/state/start-end-options-state.svelte";
import {
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

const { settings, updateSettings } = vi.hoisted(() => {
  const settings: Record<string, unknown> = {};
  return {
    settings,
    updateSettings: vi.fn((updates: Record<string, unknown>) => {
      Object.assign(settings, updates);
    }),
  };
});

vi.mock("$lib/shared/settings/state/settings-state.svelte", () => ({
  settingsService: { settings, updateSettings },
}));

describe("LOOP end-placement invariant", () => {
  beforeEach(() => {
    localStorage.clear();
    updateSettings.mockClear();
    settings.blockedStartPlacements = [];
    settings.blockedStartPlacementsByGridMode = {};
  });

  it("clears current and legacy end constraints without resetting other customization", () => {
    const startPlacement = { letter: "A" } as PictographData;
    const state = createStartEndOptionsState(
      {
        blockedStartPlacements: [GridPlacement.ALPHA3],
        startPlacement,
        endPlacement: { letter: "B" } as PictographData,
        endPlacements: [GridPlacement.ALPHA1, GridPlacement.BETA3],
      },
      GridMode.DIAMOND
    );

    expect(state.reconcileLoopEnabled(false)).toBe(false);
    expect(state.options.endPlacement).not.toBeNull();
    expect(state.options.endPlacements).toEqual([
      GridPlacement.ALPHA1,
      GridPlacement.BETA3,
    ]);

    expect(state.reconcileLoopEnabled(true)).toBe(true);
    expect(state.options.endPlacement).toBeNull();
    expect(state.options.endPlacements).toEqual([]);
    expect(state.options.startPlacement).toEqual(startPlacement);
    expect(state.options.blockedStartPlacements).toEqual([GridPlacement.ALPHA3]);
    expect(state.reconcileLoopEnabled(true)).toBe(false);

    const restored = createStartEndOptionsState(undefined, GridMode.DIAMOND);
    expect(restored.options.endPlacement).toBeNull();
    expect(restored.options.endPlacements).toEqual([]);
  });
});
