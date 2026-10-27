import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import ArenaPropDrawer from "./ArenaPropDrawer.svelte";

const mocks = vi.hoisted(() => ({ updateSettings: vi.fn() }));

// The account writer is the one the prop grid falls back to. Component tests
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

describe("ArenaPropDrawer family pick", () => {
  beforeEach(async () => {
    mocks.updateSettings.mockReset();
    await page.viewport(760, 800);
    document.body.style.margin = "0";
  });

  // The Arena keeps its own prop: a family pick goes to the Arena alone and
  // never to the account setting. Each style has one tile, with no version.
  it("hands a family pick to the Arena without writing the account", async () => {
    const onSelect = vi.fn();

    render(ArenaPropDrawer, {
      isOpen: true,
      selectedPropType: PropType.STAFF,
      onSelect,
    });

    await page.getByRole("button", { name: "Choose Triad style" }).click();
    await page
      .getByRole("button", { name: "Select Triad prop type", exact: true })
      .click();

    expect(onSelect).toHaveBeenLastCalledWith(PropType.TRIAD);
    expect(onSelect.mock.lastCall).toHaveLength(1);
    await expect
      .element(page.getByRole("button", { name: /V2/ }))
      .not.toBeInTheDocument();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });
});
