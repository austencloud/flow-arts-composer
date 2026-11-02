import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";
import OptionViewerSwipeLayoutTestHarness from "./OptionViewerSwipeLayoutTestHarness.svelte";
import type { OrganizedSection } from "../../domain/option-picker-types";

const EMPTY_PANELS: OrganizedSection[] = [
  { title: "Type1", pictographs: [], type: "section" },
  { title: "Type2", pictographs: [], type: "section" },
  { title: "Type3", pictographs: [], type: "section" },
  { title: "Types 4-6", pictographs: [], type: "grouped" },
];

function wheel(deltaX: number, deltaY: number) {
  document
    .querySelector(".embla__viewport")!
    .dispatchEvent(
      new WheelEvent("wheel", {
        deltaX,
        deltaY,
        bubbles: true,
        cancelable: true,
      })
    );
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

describe("OptionViewerSwipeLayout type navigation", () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await page.viewport(900, 900);
  });

  it("turns one page per side-wheel gesture and ignores the main wheel", async () => {
    render(OptionViewerSwipeLayoutTestHarness, {
      organizedPictographs: EMPTY_PANELS,
    });
    const type1 = page.getByRole("tab", {
      name: "Type 1: Dual-Shift, 0 options",
    });
    const type2 = page.getByRole("tab", { name: "Type 2: Shift, 0 options" });
    await expect.element(type1).toHaveAttribute("aria-selected", "true");

    wheel(0, 120);
    await pause(250);
    await expect.element(type1).toHaveAttribute("aria-selected", "true");

    wheel(60, 0);
    wheel(60, 0);
    wheel(60, 0);
    await expect.element(type2).toHaveAttribute("aria-selected", "true");
    await pause(250);
    await expect.element(type2).toHaveAttribute("aria-selected", "true");

    wheel(-60, 0);
    await expect.element(type1).toHaveAttribute("aria-selected", "true");
  });

  it("keeps direct selection, carousel arrows, and the active panel in sync", async () => {
    const onSectionChange = vi.fn();
    const onLetterTypeGroupSelected = vi.fn();
    render(OptionViewerSwipeLayoutTestHarness, {
      organizedPictographs: EMPTY_PANELS,
      onSectionChange,
      onLetterTypeGroupSelected,
    });

    const type1 = page.getByRole("tab", {
      name: "Type 1: Dual-Shift, 0 options",
    });
    const type2 = page.getByRole("tab", {
      name: "Type 2: Shift, 0 options",
    });
    const type3 = page.getByRole("tab", {
      name: "Type 3: Cross-Shift, 0 options",
    });

    await expect.element(type1).toHaveAttribute("aria-selected", "true");

    const type1Element = type1.element() as HTMLButtonElement;
    type1Element.focus();
    type1Element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
      })
    );
    await expect.element(type2).toHaveAttribute("aria-selected", "true");
    await expect.element(type2).toHaveAttribute("tabindex", "0");
    expect(onLetterTypeGroupSelected).toHaveBeenCalledWith("Type2", "selector");

    await type3.click();
    await expect.element(type3).toHaveAttribute("aria-selected", "true");
    expect(onSectionChange).toHaveBeenCalledWith(2);
    expect(onLetterTypeGroupSelected).toHaveBeenCalledWith("Type3", "selector");

    (
      page
        .getByRole("button", { name: "Previous slide" })
        .element() as HTMLButtonElement
    ).click();
    await expect.element(type2).toHaveAttribute("aria-selected", "true");
    expect(onLetterTypeGroupSelected).toHaveBeenCalledWith("Type2", "carousel");
  });

  it("keeps an empty selected letter-type group visible and explains how to recover", async () => {
    render(OptionViewerSwipeLayoutTestHarness, {
      organizedPictographs: EMPTY_PANELS,
    });

    await page.getByRole("tab", { name: "Type 2: Shift, 0 options" }).click();

    const activePanel = page.getByRole("tabpanel", {
      name: "Type 2: Shift, 0 options",
    });
    await expect
      .element(
        activePanel.getByText(
          "No pictographs in Type 2: Shift match these settings."
        )
      )
      .toBeVisible();
    await expect
      .element(
        activePanel.getByText(
          "Try another letter type or adjust the option settings."
        )
      )
      .toBeVisible();
    await expect.element(activePanel).toHaveAttribute("aria-hidden", "false");
  });

  it("restores the selected letter-type group from session storage", async () => {
    sessionStorage.setItem("tka-option-picker-panel", "2");

    render(OptionViewerSwipeLayoutTestHarness, {
      organizedPictographs: EMPTY_PANELS,
    });

    await expect
      .element(
        page.getByRole("tab", {
          name: "Type 3: Cross-Shift, 0 options",
        })
      )
      .toHaveAttribute("aria-selected", "true");
  });

  it("keeps compact labels visible while full group names remain accessible", async () => {
    render(OptionViewerSwipeLayoutTestHarness, {
      organizedPictographs: EMPTY_PANELS,
      width: 640,
    });

    expect(document.querySelector(".letter-type-group-full")).toBeNull();
    expect(
      Array.from(
        document.querySelectorAll<HTMLElement>(".letter-type-group-number")
      ).map((label) => label.textContent)
    ).toEqual(["1", "2", "3", "4-6"]);
    await expect
      .element(
        page.getByRole("tab", {
          name: "Types 4-6: Dash, Dual-Dash, Static, 0 options",
        })
      )
      .toBeInTheDocument();
  });

  it("uses one shared tray for settings and letter-type help", async () => {
    render(OptionViewerSwipeLayoutTestHarness, {
      organizedPictographs: EMPTY_PANELS,
      width: 480,
      height: 700,
      settingsEnabled: true,
      openIntoWorkspace: true,
      topOffset: 360,
    });

    const settings = page.getByRole("button", { name: "Option settings" });
    const info = page.getByRole("button", {
      name: "Explain letter types",
    });

    await settings.click();
    const settingsRegion = page.getByRole("region", {
      name: "Option settings",
    });
    await expect.element(settingsRegion).toBeVisible();
    await expect.element(settings).toHaveAttribute("aria-expanded", "true");
    await expect.element(info).toHaveAttribute("aria-expanded", "false");
    const sharedPanelId = settingsRegion.element().id;

    await info.click();
    const infoRegion = page.getByRole("region", {
      name: "Letter type guide",
    });
    await expect.element(infoRegion).toBeVisible();
    expect(infoRegion.element().id).toBe(sharedPanelId);
    await expect.element(settings).toHaveAttribute("aria-expanded", "false");
    await expect.element(info).toHaveAttribute("aria-expanded", "true");
    await expect
      .element(page.getByRole("heading", { name: "Letter types" }))
      .toBeVisible();
    expect(document.querySelectorAll(".workspace-utility-panel")).toHaveLength(
      1
    );
    expect(document.querySelectorAll(".utility-disclosure")).toHaveLength(0);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
    expect(document.querySelectorAll(".controls-overlay")).toHaveLength(0);
    await expectNoA11yViolations();

    info
      .element()
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    await expect.element(info).toHaveAttribute("aria-expanded", "false");
  });

  it("opens mobile help into the workspace without shrinking the picker", async () => {
    await page.viewport(327, 900);

    render(OptionViewerSwipeLayoutTestHarness, {
      organizedPictographs: EMPTY_PANELS,
      width: 327,
      height: 300,
      openIntoWorkspace: true,
      topOffset: 360,
    });

    const carousel = document.querySelector<HTMLElement>(".carousel-area");
    const header = document.querySelector<HTMLElement>(".type-navigation");
    expect(carousel).not.toBeNull();
    expect(header).not.toBeNull();
    const carouselTopBefore = carousel!.getBoundingClientRect().top;

    await page.getByRole("button", { name: "Explain letter types" }).click();
    await new Promise((resolve) => setTimeout(resolve, 320));

    const workspacePanel = document.querySelector<HTMLElement>(
      ".workspace-utility-panel"
    );
    expect(workspacePanel).not.toBeNull();
    const panelBounds = workspacePanel!.getBoundingClientRect();
    const headerBounds = header!.getBoundingClientRect();
    expect(panelBounds.bottom).toBeLessThanOrEqual(headerBounds.top + 1);
    expect(panelBounds.top).toBeGreaterThanOrEqual(0);
    expect(Math.abs(panelBounds.left - headerBounds.left)).toBeLessThanOrEqual(
      1
    );
    expect(
      Math.abs(panelBounds.width - headerBounds.width)
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(carousel!.getBoundingClientRect().top - carouselTopBefore)
    ).toBeLessThanOrEqual(1);
  });

  it("expands the tray in flow when the picker has enough height", async () => {
    render(OptionViewerSwipeLayoutTestHarness, {
      organizedPictographs: EMPTY_PANELS,
      width: 640,
      height: 700,
    });

    const carousel = document.querySelector<HTMLElement>(".carousel-area");
    expect(carousel).not.toBeNull();
    const carouselTopBefore = carousel!.getBoundingClientRect().top;

    await page.getByRole("button", { name: "Explain letter types" }).click();
    await new Promise((resolve) => setTimeout(resolve, 320));

    const disclosure = document.querySelector<HTMLElement>(
      ".utility-disclosure"
    );
    expect(disclosure).not.toBeNull();
    expect(getComputedStyle(disclosure!).position).toBe("relative");
    expect(carousel!.getBoundingClientRect().top).toBeGreaterThan(
      carouselTopBefore + 100
    );
  });
});

describe("OptionViewerSwipeLayout type rail", () => {
  beforeEach(async () => {
    sessionStorage.clear();
    // The unfolded Fold: its stacked picker is about 707x365.
    await page.viewport(707, 772);
  });

  function renderRail() {
    return render(OptionViewerSwipeLayoutTestHarness, {
      organizedPictographs: EMPTY_PANELS,
      width: 707,
      height: 365,
      settingsEnabled: true,
      openIntoWorkspace: true,
      typeRail: true,
      touchTarget: 40,
      topOffset: 360,
    });
  }

  it("stands the tabs in a left rail and gives the grid the full height", async () => {
    renderRail();

    const rail = document.querySelector<HTMLElement>(".type-navigation");
    const carousel = document.querySelector<HTMLElement>(".carousel-area");
    expect(rail).not.toBeNull();
    expect(carousel).not.toBeNull();
    const railBounds = rail!.getBoundingClientRect();
    const carouselBounds = carousel!.getBoundingClientRect();

    // The rail is a column on the left; the carousel fills the rest.
    expect(railBounds.width).toBeLessThanOrEqual(52);
    expect(railBounds.height).toBeCloseTo(365, 0);
    expect(carouselBounds.left).toBeGreaterThanOrEqual(railBounds.right - 1);
    expect(carouselBounds.height).toBeCloseTo(365, 0);
    expect(carouselBounds.right).toBeCloseTo(railBounds.left + 707, 0);

    // Tabs keep their order, stacked top to bottom, inside the rail.
    const tabs = Array.from(
      rail!.querySelectorAll<HTMLElement>('[role="tab"]')
    ).map((tab) => tab.getBoundingClientRect());
    expect(tabs).toHaveLength(4);
    for (let i = 1; i < tabs.length; i++) {
      expect(tabs[i]!.top).toBeGreaterThanOrEqual(tabs[i - 1]!.bottom - 1);
      expect(Math.abs(tabs[i]!.left - tabs[0]!.left)).toBeLessThanOrEqual(1);
    }
    for (const tab of tabs) {
      expect(tab.left).toBeGreaterThanOrEqual(railBounds.left);
      expect(tab.right).toBeLessThanOrEqual(railBounds.right);
    }

    // Settings above the tabs, the guide below them.
    const settings = page
      .getByRole("button", { name: "Option settings" })
      .element()
      .getBoundingClientRect();
    const info = page
      .getByRole("button", { name: "Explain letter types" })
      .element()
      .getBoundingClientRect();
    expect(settings.bottom).toBeLessThanOrEqual(tabs[0]!.top + 1);
    expect(info.top).toBeGreaterThanOrEqual(tabs[3]!.bottom - 1);
  });

  it("pages the type groups up and down, matching the rail", async () => {
    renderRail();
    const carousel = document.querySelector<HTMLElement>(".carousel-area")!;
    const panels = Array.from(carousel.querySelectorAll<HTMLElement>(".panel"));
    expect(panels).toHaveLength(4);

    // Panels stack in a column, so Type 2 waits below Type 1, as its tab does.
    const first = panels[0]!.getBoundingClientRect();
    const second = panels[1]!.getBoundingClientRect();
    expect(Math.abs(second.left - first.left)).toBeLessThanOrEqual(1);
    expect(second.top).toBeCloseTo(first.bottom, 0);

    // The tabs share the rail's height instead of bunching at the top.
    const tabs = Array.from(
      document.querySelectorAll<HTMLElement>('.type-navigation [role="tab"]')
    ).map((tab) => tab.getBoundingClientRect().height);
    for (const height of tabs) expect(height).toBeGreaterThan(50);

    // Choosing Type 3 slides its panel up into the carousel's frame.
    await page
      .getByRole("tab", { name: "Type 3: Cross-Shift, 0 options" })
      .click();
    const top = () => carousel.getBoundingClientRect().top;
    await expect
      .poll(() => Math.abs(panels[2]!.getBoundingClientRect().top - top()))
      .toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        panels[2]!.getBoundingClientRect().left -
          carousel.getBoundingClientRect().left
      )
    ).toBeLessThanOrEqual(1);
  });

  it("turns the rail's pages with the main wheel, not the side wheel", async () => {
    renderRail();
    const type1 = page.getByRole("tab", {
      name: "Type 1: Dual-Shift, 0 options",
    });
    const type2 = page.getByRole("tab", { name: "Type 2: Shift, 0 options" });

    wheel(120, 0);
    await pause(250);
    await expect.element(type1).toHaveAttribute("aria-selected", "true");

    wheel(0, 100);
    await expect.element(type2).toHaveAttribute("aria-selected", "true");
    await pause(250);

    wheel(0, -100);
    await expect.element(type1).toHaveAttribute("aria-selected", "true");
  });

  it("moves between tabs with the vertical arrow keys", async () => {
    renderRail();
    const type1 = page.getByRole("tab", {
      name: "Type 1: Dual-Shift, 0 options",
    });
    const type2 = page.getByRole("tab", { name: "Type 2: Shift, 0 options" });

    const type1Element = type1.element() as HTMLButtonElement;
    type1Element.focus();
    type1Element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    );
    await expect.element(type2).toHaveAttribute("aria-selected", "true");
  });

  it("opens the tray over the grid beside the rail and closes it", async () => {
    renderRail();
    const rail = document.querySelector<HTMLElement>(".type-navigation")!;
    const carousel = document.querySelector<HTMLElement>(".carousel-area")!;
    const carouselBefore = carousel.getBoundingClientRect();

    const info = page.getByRole("button", { name: "Explain letter types" });
    await info.click();
    const region = page.getByRole("region", { name: "Letter type guide" });
    await expect.element(region).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 320));

    const railBounds = rail.getBoundingClientRect();
    const panel = region.element().getBoundingClientRect();
    expect(panel.left).toBeGreaterThanOrEqual(railBounds.right);
    expect(panel.top).toBeGreaterThanOrEqual(railBounds.top - 1);
    expect(panel.bottom).toBeLessThanOrEqual(railBounds.bottom + 1);
    expect(panel.right).toBeLessThanOrEqual(railBounds.left + 707);
    // Opening it does not move the grid.
    const carouselAfter = carousel.getBoundingClientRect();
    expect(carouselAfter.top).toBeCloseTo(carouselBefore.top, 0);
    expect(carouselAfter.left).toBeCloseTo(carouselBefore.left, 0);

    region
      .element()
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    await expect.element(info).toHaveAttribute("aria-expanded", "false");
  });
});
