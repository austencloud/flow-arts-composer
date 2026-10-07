import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import PropSelectionSheet from "./PropSelectionSheet.svelte";

const mocks = vi.hoisted(() => ({ updateSettings: vi.fn() }));

// The account writer is the one BentoPropGrid falls back to. Component tests
// never start app services, so the setting itself can't be read back; the
// write call is what shows whether a pick reached the account.
vi.mock("$lib/shared/application/state/app-state.svelte", async (original) => ({
  ...(await original<
    typeof import("$lib/shared/application/state/app-state.svelte")
  >()),
  updateSettings: mocks.updateSettings,
}));

describe("PropSelectionSheet prop version", () => {
  beforeEach(async () => {
    mocks.updateSettings.mockReset();
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  // A host that owns the version (Arena) passes its own look and writer, and
  // the pick reaches it with the prop, never the account setting.
  it("hands a Version 2 pick to the host without writing the account", async () => {
    const onSelect = vi.fn();
    const onPropLookChange = vi.fn();

    render(PropSelectionSheet, {
      isOpen: true,
      selectedPropType: PropType.TRIAD,
      onSelect,
      propLook: "pictograph",
      onPropLookChange,
    });

    await page.getByRole("button", { name: "Choose Triad style" }).click();
    await page
      .getByRole("button", { name: "Select Triad V2 prop type", exact: true })
      .click();

    expect(onSelect).toHaveBeenLastCalledWith(PropType.TRIAD, "model");
    expect(onPropLookChange).toHaveBeenLastCalledWith("model");
    expect(mocks.updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ propArtwork: expect.anything() })
    );
  });

  // The control: a host that passes no writer gets the account's, so the
  // assertion above is one that can fail.
  it("writes the account when the host passes no version writer", async () => {
    render(PropSelectionSheet, {
      isOpen: true,
      selectedPropType: PropType.TRIAD,
      onSelect: vi.fn(),
      propLook: "pictograph",
    });

    await page.getByRole("button", { name: "Choose Triad style" }).click();
    await page
      .getByRole("button", { name: "Select Triad V2 prop type", exact: true })
      .click();

    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ propArtwork: "model" })
    );
  });

  // A host whose render ignores the version turns the choice off, so a family
  // offers one plain tile per style.
  it("leaves out the Version 2 tiles when the host turns the choice off", async () => {
    render(PropSelectionSheet, {
      isOpen: true,
      selectedPropType: PropType.TRIAD,
      onSelect: vi.fn(),
      showPropLook: false,
    });

    await page.getByRole("button", { name: "Choose Triad style" }).click();
    await expect
      .element(
        page.getByRole("button", {
          name: "Select Triad prop type",
          exact: true,
        })
      )
      .toBeVisible();
    await expect
      .element(
        page.getByRole("button", {
          name: "Select Triad V2 prop type",
          exact: true,
        })
      )
      .not.toBeInTheDocument();
  });
});
