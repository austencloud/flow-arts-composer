import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ViewerOverflowMenu from "./ViewerOverflowMenu.svelte";
import ViewerOverflowMenuDrawerHarness from "./ViewerOverflowMenu.drawer-regression.test-harness.svelte";

const mocks = vi.hoisted(() => ({
  settings: {
    darkMode: true,
    primaryPropColors: null as { left: string; right: string } | null,
    propType: "staff",
    catDogMode: false,
    propViewingMode: "my-props",
  },
  updateSetting: vi.fn(),
  updateSettings: vi.fn(),
}));

// Component tests never start app services, so the prop colors are read from
// a plain object here and the write call is what shows a change was asked for.
vi.mock(
  "#lib/shared/application/state/app-state.svelte.js",
  async (original) => ({
    ...(await original<
      typeof import("#lib/shared/application/state/app-state.svelte.js")
    >()),
    getSettings: () => mocks.settings,
    updateSetting: mocks.updateSetting,
    updateSettings: mocks.updateSettings,
  })
);

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

function motion(showLeft: boolean, showRight: boolean) {
  return {
    showLeft,
    showRight,
    onToggleLeft: vi.fn(),
    onToggleRight: vi.fn(),
  };
}

async function openMenu(props: Record<string, unknown>): Promise<HTMLElement> {
  render(ViewerOverflowMenu, { dropDown: true, ...props });
  await page.getByRole("button", { name: "More actions" }).click();
  return openMenuPanel();
}

function drillRow(id: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(
    `.layer:not([inert]) [data-drill="${id}"]`
  );
  expect(row).not.toBeNull();
  return row!;
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

describe("ViewerOverflowMenu display rows", () => {
  beforeEach(() => {
    mocks.settings.primaryPropColors = null;
    mocks.updateSetting.mockReset();
  });

  it.each([
    [true, true, "Left · Right"],
    [true, false, "Left only"],
    [false, true, "Right only"],
  ])(
    "sums up motion left %s, right %s as %s",
    async (showLeft, showRight, summary) => {
      await openMenu({ motionVisibility: motion(showLeft, showRight) });
      expect(
        drillRow("motion").querySelector(".drill-summary")?.textContent?.trim()
      ).toBe(summary);
    }
  );

  it("calls prop colors Default until a pair is chosen", async () => {
    await openMenu({ motionVisibility: motion(true, true) });
    expect(
      drillRow("colors").querySelector(".drill-summary")?.textContent?.trim()
    ).toBe("Default");
  });

  it("calls a chosen pair Custom", async () => {
    mocks.settings.primaryPropColors = { left: "#0e05fe", right: "#fe052c" };
    await openMenu({ motionVisibility: motion(true, true) });
    const row = drillRow("colors");
    expect(row.querySelector(".drill-summary")?.textContent?.trim()).toBe(
      "Custom"
    );
    const swatches = row.querySelectorAll<HTMLElement>(".drill-swatches span");
    expect([...swatches].map((swatch) => swatch.style.background)).toEqual([
      "rgb(14, 5, 254)",
      "rgb(254, 5, 44)",
    ]);
  });

  it("opens Motion as its own screen and comes back to the row", async () => {
    await openMenu({ motionVisibility: motion(true, true) });

    await page.getByRole("button", { name: /^Motion/ }).click();

    const back = page.getByRole("button", { name: "Back" });
    await expect.element(back).toBeVisible();
    await expect
      .element(page.getByRole("group", { name: "Motion visibility" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: /^Prop colors/ }))
      .not.toBeInTheDocument();
    await expect.poll(() => document.activeElement).toBe(back.element());

    await back.click();

    await expect
      .element(page.getByRole("button", { name: /^Prop colors/ }))
      .toBeVisible();
    await expect.element(back).not.toBeInTheDocument();
    await expect
      .poll(() => (document.activeElement as HTMLElement | null)?.dataset.drill)
      .toBe("motion");
  });

  it("reopens on the list after closing from a settings screen", async () => {
    await openMenu({ motionVisibility: motion(true, true) });
    await page.getByRole("button", { name: /^Prop colors/ }).click();
    await expect
      .element(page.getByRole("button", { name: "Back" }))
      .toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect
      .poll(() =>
        document.querySelector('.viewer-overflow-popover[data-state="open"]')
      )
      .toBeNull();

    await page.getByRole("button", { name: "More actions" }).click();
    await openMenuPanel();
    await expect
      .element(page.getByRole("button", { name: /^Motion/ }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Back" }))
      .not.toBeInTheDocument();
  });

  it("drills into the props, applies a choice at once, and stays open", async () => {
    mocks.updateSettings.mockClear();
    await openMenu({ propViewing: {}, propsSummary: "Double Staff" });

    const row = drillRow("props");
    expect(row.querySelector(".drill-label")?.textContent?.trim()).toBe(
      "Props"
    );
    expect(row.querySelector(".drill-summary")?.textContent?.trim()).toBe(
      "Double Staff"
    );

    await page.getByRole("button", { name: /^Props/ }).click();
    const mine = page.getByRole("radio", { name: "My props, Double Staff" });
    await expect.element(mine).toHaveAttribute("aria-checked", "true");

    await page.getByRole("radio", { name: /^As saved/ }).click();
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      propViewingMode: "as-saved",
    });
    await expect.element(mine).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await expect
      .element(page.getByRole("button", { name: /^Props/ }))
      .toHaveFocus();
  });

  it("picks new props inside the menu and lands back on the choice", async () => {
    mocks.updateSettings.mockClear();
    await openMenu({ propViewing: {}, propsSummary: "Double Staff" });

    await page.getByRole("button", { name: /^Props/ }).click();
    await page.getByRole("button", { name: "Change my props" }).click();
    await page.getByRole("button", { name: "Select Quiad prop type" }).click();

    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        leftPropType: "quiad",
        rightPropType: "quiad",
        catDogMode: false,
        propViewingMode: "my-props",
      })
    );
    await expect
      .element(page.getByRole("radio", { name: /^My props/ }))
      .toHaveFocus();
  });

  // A family opens its styles, and a prop with more to choose opens that
  // page, instead of the tap picking the last one used.
  it("drills into a family and a prop's own choices before finishing", async () => {
    mocks.updateSettings.mockClear();
    await openMenu({ propViewing: {}, propsSummary: "Double Staff" });

    await page.getByRole("button", { name: /^Props/ }).click();
    await page.getByRole("button", { name: "Change my props" }).click();
    await page
      .getByRole("button", { name: "Select Buugeng prop type" })
      .click();

    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ leftPropType: "buugeng" })
    );
    await expect
      .element(page.getByRole("region", { name: /Buugeng/ }))
      .toBeInTheDocument();
    expect(page.getByRole("radio", { name: /^My props/ }).query()).toBeNull();

    await page.getByRole("button", { name: "Back to all props" }).click();
    await page.getByRole("button", { name: "Choose Club style" }).click();
    await page
      .getByRole("button", { name: "Select Classic Club prop type" })
      .click();

    expect(mocks.updateSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ leftPropType: "classic_club" })
    );
    await expect
      .element(page.getByRole("radio", { name: /^My props/ }))
      .toHaveFocus();
  });
});

describe("ViewerOverflowMenu rows while open", () => {
  function rowLabels(panel: HTMLElement): string[] {
    return [
      ...panel.querySelectorAll<HTMLElement>(
        ".layer:not([inert]) .menu-screen > button"
      ),
    ].map((row) => row.textContent?.trim() ?? "");
  }

  // Austen's Fold, 11-12: the saved check answered while the menu was up,
  // Save left, Remix slid up a row and his tap on it opened Upload Video.
  it("holds every row in its slot until the menu closes", async () => {
    const props = {
      dropDown: true,
      onFavoriteToggle: vi.fn(),
      isSaved: false,
      onSave: vi.fn(),
      onAddToCollection: vi.fn(),
      onRemix: vi.fn(),
      onVideoUpload: vi.fn(),
    };
    const screen = render(ViewerOverflowMenu, props);
    const trigger = page.getByRole("button", { name: "More actions" });
    await trigger.click();
    const panel = await openMenuPanel();
    const opened = [
      "Favorite",
      "Save",
      "Add to collection…",
      "Remix",
      "Upload Video",
    ];
    expect(rowLabels(panel)).toEqual(opened);
    const remix = page.getByRole("button", { name: "Remix" });
    const remixTop = remix.element().getBoundingClientRect().top;

    await screen.rerender({
      ...props,
      isSaved: true,
      isFavorite: true,
      onDeleteRequest: vi.fn(),
    });

    await vi.waitFor(() =>
      expect(rowLabels(panel)).toEqual([
        "Unfavorite",
        "Save",
        "Add to collection…",
        "Remix",
        "Upload Video",
      ])
    );
    expect(remix.element().getBoundingClientRect().top).toBe(remixTop);
    expect(
      page
        .getByRole("button", { name: "Save" })
        .element()
        .hasAttribute("disabled")
    ).toBe(true);

    await trigger.click();
    await trigger.click();
    const reopened = await openMenuPanel();
    expect(rowLabels(reopened)).toEqual([
      "Unfavorite",
      "Add to collection…",
      "Remix",
      "Upload Video",
      "Delete",
    ]);
  });
});
