import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import PropSelectionSheet from "./PropSelectionSheet.svelte";

const mocks = vi.hoisted(() => ({ updateSettings: vi.fn() }));

// The account writer is the one BentoPropGrid falls back to. Component tests
// never start app services, so the setting itself can't be read back; the
// write call is what shows whether a pick reached the account.
vi.mock(
  "#lib/shared/application/state/app-state.svelte.js",
  async (original) => ({
    ...(await original<
      typeof import("#lib/shared/application/state/app-state.svelte.js")
    >()),
    updateSettings: mocks.updateSettings,
  })
);

describe("PropSelectionSheet family pick", () => {
  beforeEach(async () => {
    mocks.updateSettings.mockReset();
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  // Each style has one tile, and a pick reaches the host as the prop alone.
  it("offers one tile per style and hands the host only the prop", async () => {
    const onSelect = vi.fn();
    render(PropSelectionSheet, {
      isOpen: true,
      selectedPropType: PropType.STAFF,
      onSelect,
    });

    await page.getByRole("button", { name: "Choose Triad style" }).click();
    await expect
      .element(page.getByRole("button", { name: /V2/ }))
      .not.toBeInTheDocument();
    await page
      .getByRole("button", { name: "Select Triad prop type", exact: true })
      .click();

    expect(onSelect).toHaveBeenLastCalledWith(PropType.TRIAD);
    expect(onSelect.mock.lastCall).toHaveLength(1);
    expect(mocks.updateSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ propArtwork: expect.anything() })
    );
  });
});
