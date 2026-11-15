import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

vi.mock("./PictographGrid.svelte", async () => ({
  default: (await import("./StartPlacementPickerPresetTestStub.svelte"))
    .default,
}));

vi.mock("./BuildStartPlacement.svelte", async () => ({
  default: (await import("./StartPlacementPickerBuildTestStub.svelte")).default,
}));

import StartPlacementPicker from "./StartPlacementPicker.svelte";

const FAMILY_SIZES = { alpha: 4, beta: 4, gamma: 8 } as const;

// Sixteen variations in picker order, ids naming grid and placement.
function variationsFor(mode: GridMode) {
  return Object.entries(FAMILY_SIZES).flatMap(([family, count]) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${mode}-${family}${i * 2 + 1}`,
      startPlacement: `${family}${i * 2 + 1}`,
      gridMode: mode,
      motions: {},
    }))
  );
}

// A reactive stand-in for the picker state, so a grid switch re-renders.
function familyPickerState() {
  const state = $state({
    ...pickerState(),
    allVariations: [] as ReturnType<typeof variationsFor>,
  });
  state.loadAllVariations = vi.fn((mode: GridMode = state.currentGridMode) => {
    state.currentGridMode = mode;
    state.allVariations = variationsFor(mode);
  });
  state.loadPlacements = vi.fn((mode: GridMode = state.currentGridMode) => {
    state.currentGridMode = mode;
  });
  return state;
}

function tiles() {
  return document.querySelectorAll<HTMLButtonElement>(
    '[data-testid="start-tile"]'
  );
}

function pickerState() {
  return {
    placements: [{}],
    allVariations: [],
    selectedPlacement: null,
    currentGridMode: GridMode.DIAMOND as GridMode,
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
    localStorage.removeItem("tka-start-position-picker-prefs");
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

  it("stays on presets and leaves saved choices alone when locked", async () => {
    const saved = JSON.stringify({ pickerPath: "build", showAdvanced: true });
    localStorage.setItem("tka-start-placement-picker-prefs", saved);
    render(StartPlacementPicker, {
      startPlacementState: pickerState() as never,
      embedded: true,
      lockedPath: "presets",
      rememberPreferences: false,
    });

    await expect.element(page.getByTestId("preset-path")).toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Build" }))
      .not.toBeInTheDocument();
    expect(localStorage.getItem("tka-start-placement-picker-prefs")).toBe(
      saved
    );
  });

  it("opens on alpha and shows each family's own variations", async () => {
    render(StartPlacementPicker, {
      startPlacementState: familyPickerState() as never,
    });

    await vi.waitFor(() => expect(tiles()).toHaveLength(4));
    expect(tiles()[0]?.textContent).toBe("diamond-alpha1");
    await expect
      .element(page.getByRole("button", { name: "Apart (Alpha)", exact: true }))
      .toHaveAttribute("aria-pressed", "true");

    await page
      .getByRole("button", { name: "Adjacent (Gamma)", exact: true })
      .click();
    await vi.waitFor(() => {
      expect(tiles()).toHaveLength(8);
      expect(
        [...tiles()].every((tile) => tile.textContent?.includes("gamma"))
      ).toBe(true);
    });

    await page
      .getByRole("button", { name: "Together (Beta)", exact: true })
      .click();
    await vi.waitFor(() => {
      expect(tiles()).toHaveLength(4);
      expect(tiles()[0]?.textContent).toBe("diamond-beta1");
    });
  });

  it("names the family switch in plain words with no Greek letters", async () => {
    render(StartPlacementPicker, {
      startPlacementState: familyPickerState() as never,
    });

    for (const label of [
      "Apart (Alpha)",
      "Together (Beta)",
      "Adjacent (Gamma)",
    ]) {
      await expect
        .element(page.getByRole("button", { name: label, exact: true }))
        .toBeInTheDocument();
    }
    const switchText = document.querySelector(".family-switch")?.textContent;
    for (const word of ["Apart", "Together", "Adjacent"]) {
      expect(switchText).toContain(word);
    }
    expect(switchText).not.toMatch(/[αβγ]/);
  });

  it("picks the tapped variation as the start", async () => {
    const state = familyPickerState();
    render(StartPlacementPicker, { startPlacementState: state as never });

    await page
      .getByRole("button", { name: "Adjacent (Gamma)", exact: true })
      .click();
    await vi.waitFor(() => expect(tiles()).toHaveLength(8));
    tiles()[5]?.click();

    await vi.waitFor(() =>
      expect(state.selectPlacement).toHaveBeenCalledWith(
        expect.objectContaining({ id: "diamond-gamma11" })
      )
    );
  });

  it("keeps the open family when the grid switches, and stops saving showAdvanced", async () => {
    localStorage.setItem(
      "tka-start-placement-picker-prefs",
      JSON.stringify({ showAdvanced: true, gridMode: "DIAMOND" })
    );
    const state = familyPickerState();
    render(StartPlacementPicker, { startPlacementState: state as never });

    await page
      .getByRole("button", { name: "Adjacent (Gamma)", exact: true })
      .click();
    await page.getByRole("button", { name: "Box", exact: true }).click();

    await vi.waitFor(() => {
      expect(state.loadAllVariations).toHaveBeenCalledWith(GridMode.BOX);
      expect(tiles()).toHaveLength(8);
      expect(tiles()[0]?.textContent).toBe("box-gamma1");
    });
    await expect
      .element(
        page.getByRole("button", { name: "Adjacent (Gamma)", exact: true })
      )
      .toHaveAttribute("aria-pressed", "true");

    const saved = JSON.parse(
      localStorage.getItem("tka-start-placement-picker-prefs") ?? "{}"
    );
    expect(saved.gridMode).toBe("BOX");
    expect(saved).not.toHaveProperty("showAdvanced");
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

  it("falls back to the pre-rename storage key when the new key has nothing", async () => {
    localStorage.setItem(
      "tka-start-position-picker-prefs",
      JSON.stringify({ leftOrientation: "clock", rightOrientation: "counter" })
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

  it("prefers the new storage key when both are present", async () => {
    localStorage.setItem(
      "tka-start-placement-picker-prefs",
      JSON.stringify({ leftOrientation: "clock", rightOrientation: "counter" })
    );
    localStorage.setItem(
      "tka-start-position-picker-prefs",
      JSON.stringify({ leftOrientation: "out", rightOrientation: "out" })
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
