import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import MenuItemTileGrid from "./MenuItemTileGrid.svelte";
import type { ContextMenuItem } from "./context-menu-types";

// The tile grid is a second view of a menu builder's list. The silent failure
// is a tile that looks pressed while its switch is off, or a click that never
// reaches the builder's action.
function items(gridOn: boolean, onGrid = vi.fn()): ContextMenuItem[] {
  return [
    {
      id: "grid",
      label: "Grid",
      checked: gridOn,
      keepOpen: true,
      action: onGrid,
    },
    {
      id: "tka",
      label: "TKA",
      checked: false,
      keepOpen: true,
      action: vi.fn(),
    },
    { id: "plain", label: "Plain", action: vi.fn() },
  ];
}

describe("MenuItemTileGrid", () => {
  it("renders one picture tile per item, pressed when the item is checked", async () => {
    render(MenuItemTileGrid, { items: items(true), ariaLabel: "Switches" });

    await expect
      .element(page.getByRole("group", { name: "Switches" }))
      .toBeVisible();
    expect(page.getByRole("button").elements()).toHaveLength(3);
    await expect
      .element(page.getByRole("button", { name: "Grid" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(page.getByRole("button", { name: "TKA" }))
      .toHaveAttribute("aria-pressed", "false");
    // An item without `checked` reads as off rather than as no state.
    await expect
      .element(page.getByRole("button", { name: "Plain" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("runs the item's action on click and follows the rebuilt list", async () => {
    const onGrid = vi.fn();
    const screen = render(MenuItemTileGrid, { items: items(true, onGrid) });

    await page.getByRole("button", { name: "Grid" }).click();
    expect(onGrid).toHaveBeenCalledOnce();

    // keepOpen means nothing here: there is no menu to close, so the grid
    // stays and simply shows the rebuilt state.
    await screen.rerender({ items: items(false, onGrid) });
    await expect
      .element(page.getByRole("button", { name: "Grid" }))
      .toHaveAttribute("aria-pressed", "false");
  });
});
