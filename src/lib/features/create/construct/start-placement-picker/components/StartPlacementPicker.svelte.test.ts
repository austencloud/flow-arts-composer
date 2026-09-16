import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

vi.mock("./PictographGrid.svelte", async () => ({
  default: (await import("./StartPlacementPickerPresetTestStub.svelte")).default,
}));

vi.mock("./BuildStartPlacement.svelte", async () => ({
  default: (await import("./StartPlacementPickerBuildTestStub.svelte")).default,
}));

import StartPlacementPicker from "./StartPlacementPicker.svelte";

function pickerState() {
  return {
    placements: [{}],
    allVariations: [],
    selectedPlacement: null,
    currentGridMode: GridMode.DIAMOND,
    leftOrientation: Orientation.IN,
    rightOrientation: Orientation.IN,
    selectPlacement: vi.fn(),
    setLeftOrientation: vi.fn(),
    setRightOrientation: vi.fn(),
    setOrientation: vi.fn(),
    setSelectedPlacement: vi.fn(),
    clearSelectedPlacement: vi.fn(),
    loadPlacements: vi.fn(),
    loadAllVariations: vi.fn(),
    setGridMode: vi.fn(),
    onSelectedPlacementChange: vi.fn(),
  };
}

describe("StartPlacementPicker paths", () => {
  beforeEach(() => {
    localStorage.removeItem("tka-start-placement-picker-prefs");
  });

  it("offers Presets and Build as direct single-select paths", async () => {
    render(StartPlacementPicker, {
      startPlacementState: pickerState() as never,
      embedded: true,
    });

    await expect.element(page.getByTestId("preset-path")).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Presets" }))
      .toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Build" }).click();
    await expect.element(page.getByTestId("build-path")).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Build" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("restores literal blue/red orientation preferences", async () => {
    localStorage.setItem(
      "tka-start-placement-picker-prefs",
      JSON.stringify({ blueOrientation: "clock", redOrientation: "counter" })
    );
    const state = pickerState();
    render(StartPlacementPicker, {
      startPlacementState: state as never,
      embedded: true,
    });

    await vi.waitFor(() => {
      expect(state.setLeftOrientation).toHaveBeenCalledWith(Orientation.CLOCK);
      expect(state.setRightOrientation).toHaveBeenCalledWith(
        Orientation.COUNTER
      );
    });
  });
});
