import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStartEndOptionsState } from "$lib/features/create/generate/state/start-end-options-state.svelte";
import {
  getBlockedPlacementsForPreset,
  StartPlacementPreset,
} from "$lib/features/create/generate/shared/domain/start-placement-presets";
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

function classicBlocked(gridMode: GridMode) {
  return getBlockedPlacementsForPreset(StartPlacementPreset.CLASSIC, gridMode);
}

describe("start-placement preferences by grid mode", () => {
  beforeEach(() => {
    localStorage.clear();
    updateSettings.mockClear();
    settings.blockedStartPlacements = [];
    settings.blockedStartPlacementsByGridMode = {};
  });

  it("carries Classic 3 into an unvisited grid, then persists both", () => {
    const diamondPreference = classicBlocked(GridMode.DIAMOND);
    const boxPreference = classicBlocked(GridMode.BOX);
    const state = createStartEndOptionsState(undefined, GridMode.DIAMOND);

    state.updateOptions({ blockedStartPlacements: diamondPreference });
    state.setGridMode(GridMode.BOX);

    expect(state.options.blockedStartPlacements).toEqual(boxPreference);

    state.setGridMode(GridMode.DIAMOND);
    expect(state.options.blockedStartPlacements).toEqual(diamondPreference);

    state.setGridMode(GridMode.BOX);
    expect(state.options.blockedStartPlacements).toEqual(boxPreference);

    const restored = createStartEndOptionsState(undefined, GridMode.DIAMOND);
    expect(restored.options.blockedStartPlacements).toEqual(diamondPreference);
    restored.setGridMode(GridMode.BOX);
    expect(restored.options.blockedStartPlacements).toEqual(boxPreference);
  });

  it("distinguishes a saved All selection from an unvisited grid", () => {
    const diamondPreference = classicBlocked(GridMode.DIAMOND);
    const state = createStartEndOptionsState(undefined, GridMode.DIAMOND);

    state.updateOptions({ blockedStartPlacements: diamondPreference });
    state.setGridMode(GridMode.BOX);
    state.updateOptions({ blockedStartPlacements: [] });

    state.setGridMode(GridMode.DIAMOND);
    expect(state.options.blockedStartPlacements).toEqual(diamondPreference);

    state.setGridMode(GridMode.BOX);
    expect(state.options.blockedStartPlacements).toEqual([]);
  });

  it("migrates the legacy preference even when the other grid is active", () => {
    const boxPreference = classicBlocked(GridMode.BOX);
    settings.blockedStartPlacements = boxPreference;
    const state = createStartEndOptionsState(undefined, GridMode.DIAMOND);

    expect(state.options.blockedStartPlacements).toEqual([]);

    state.setGridMode(GridMode.BOX);
    expect(state.options.blockedStartPlacements).toEqual(boxPreference);
  });

  it("restores literal blue/red start orientations", () => {
    localStorage.setItem(
      "tka-start-end-session-options",
      JSON.stringify({
        mustContainLetters: [],
        mustNotContainLetters: [],
        blueStartOrientation: "clock",
        redStartOrientation: "counter",
        timestamp: Date.now(),
      })
    );

    const state = createStartEndOptionsState(undefined, GridMode.DIAMOND);
    expect(state.options.leftStartOrientation).toBe("clock");
    expect(state.options.rightStartOrientation).toBe("counter");
  });

  it("restores custom selections and clears incompatible exact placements", () => {
    const diamondPreference = [GridPlacement.ALPHA3, GridPlacement.BETA7];
    const boxPreference = [GridPlacement.ALPHA4, GridPlacement.GAMMA10];
    settings.blockedStartPlacements = diamondPreference;
    settings.blockedStartPlacementsByGridMode = {
      [GridMode.DIAMOND]: diamondPreference,
      [GridMode.BOX]: boxPreference,
    };
    const state = createStartEndOptionsState(
      {
        startPlacement: { letter: "A" } as PictographData,
        endPlacement: { letter: "B" } as PictographData,
      },
      GridMode.DIAMOND
    );

    expect(state.setGridMode(GridMode.BOX)).toBe(true);
    expect(state.options.blockedStartPlacements).toEqual(boxPreference);
    expect(state.options.startPlacement).toBeNull();
    expect(state.options.endPlacement).toBeNull();

    state.setGridMode(GridMode.DIAMOND);
    expect(state.options.blockedStartPlacements).toEqual(diamondPreference);
  });
});
