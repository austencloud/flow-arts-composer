import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import ViewerOverflowMenuDrawerHarness from "./ViewerOverflowMenu.drawer-regression.test-harness.svelte";

// The menu is a Bits UI popover since 60a67dcb02: a labelled panel of plain
// buttons, with no menu role to find it by.
async function openMenuPanel(): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const panel = document.querySelector<HTMLElement>(
      '.viewer-overflow-popover[data-state="open"]'
    );
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute("aria-label")).toBe("More actions");
    return panel!;
  });
}

describe("ViewerOverflowMenu in a sequence-viewer drawer", () => {
  it("keeps the mobile save action inside the open viewer", async () => {
    render(ViewerOverflowMenuDrawerHarness);

    const viewer = page.getByRole("dialog", { name: "Sequence Viewer" });
    await expect.element(viewer).toBeVisible();

    await page.getByRole("button", { name: "More actions" }).click();

    const menu = await openMenuPanel();
    await expect.element(page.elementLocator(menu)).toBeVisible();
    expect(viewer.element().contains(menu)).toBe(true);

    await page.getByRole("button", { name: "Save" }).click();

    await expect.element(viewer).toBeVisible();
    expect(
      document
        .querySelector('[data-testid="viewer-open-state"]')
        ?.textContent?.trim()
    ).toBe("true");
    expect(
      document.querySelector('[data-testid="saved-state"]')?.textContent?.trim()
    ).toBe("true");
  });

  it("keeps its trigger interactive so a second press closes only the menu", async () => {
    render(ViewerOverflowMenuDrawerHarness);

    const viewer = page.getByRole("dialog", { name: "Sequence Viewer" });
    const trigger = page.getByRole("button", { name: "More actions" });
    await expect.element(viewer).toBeVisible();

    await trigger.click();
    const menu = await openMenuPanel();
    await expect.element(page.elementLocator(menu)).toBeVisible();
    expect(getComputedStyle(document.body).pointerEvents).not.toBe("none");
    expect(getComputedStyle(trigger.element()).pointerEvents).not.toBe("none");

    await trigger.click();

    expect(trigger.element().getAttribute("aria-expanded")).toBe("false");
    await expect.element(viewer).toBeVisible();
    expect(
      document
        .querySelector('[data-testid="viewer-open-state"]')
        ?.textContent?.trim()
    ).toBe("true");
  });
});
