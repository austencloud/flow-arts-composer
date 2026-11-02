import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import MenuItemChipRow from "./MenuItemChipRow.svelte";
import type { ContextMenuItem } from "./context-menu-types";

// The chip row is the phone view of a menu builder's list (Settings →
// Display's drill-down screens). The silent failures are a chip that looks
// on while its switch is off, and a click that never reaches the builder.
function items(gridOn: boolean, onGrid = vi.fn()): ContextMenuItem[] {
  return [
    {
      id: "grid",
      label: "Grid",
      icon: "fa-table-cells",
      checked: gridOn,
      keepOpen: true,
      action: onGrid,
    },
    { id: "tka", label: "TKA", checked: false, action: vi.fn() },
    { id: "plain", label: "Plain", action: vi.fn() },
  ];
}

describe("MenuItemChipRow", () => {
  it("renders one toggle chip per item, pressed when the item is checked", async () => {
    render(MenuItemChipRow, { items: items(true), ariaLabel: "Switches" });

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
    await expect
      .element(page.getByRole("button", { name: "Plain" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("runs the item's action on click and follows the rebuilt list", async () => {
    const onGrid = vi.fn();
    const screen = render(MenuItemChipRow, { items: items(true, onGrid) });

    await page.getByRole("button", { name: "Grid" }).click();
    expect(onGrid).toHaveBeenCalledOnce();

    await screen.rerender({ items: items(false, onGrid) });
    await expect
      .element(page.getByRole("button", { name: "Grid" }))
      .toHaveAttribute("aria-pressed", "false");
  });
});
