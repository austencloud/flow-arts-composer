import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import ArenaPropDrawer from "./ArenaPropDrawer.svelte";

const mocks = vi.hoisted(() => ({ updateSettings: vi.fn() }));

// The account writer is the one the prop grid falls back to. Component tests
// never start app services, so the setting itself can't be read back; the
// write call is what shows whether a pick reached the account.
vi.mock("$lib/shared/application/state/app-state.svelte", async (original) => ({
  ...(await original<
    typeof import("$lib/shared/application/state/app-state.svelte")
  >()),
  updateSettings: mocks.updateSettings,
}));

describe("ArenaPropDrawer prop version", () => {
  beforeEach(async () => {
    mocks.updateSettings.mockReset();
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  // The Arena keeps its own version: a Version 2 pick goes to the Arena with
  // the prop and never to the account setting.
  it("hands a Version 2 pick to the Arena without writing the account", async () => {
    const onSelect = vi.fn();
    const onPropLookChange = vi.fn();

    render(ArenaPropDrawer, {
      isOpen: true,
      selectedPropType: PropType.TRIAD,
      propLook: "pictograph",
      onSelect,
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
});
