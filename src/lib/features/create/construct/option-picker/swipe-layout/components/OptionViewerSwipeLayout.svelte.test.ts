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

describe("OptionViewerSwipeLayout type navigation", () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await page.viewport(900, 900);
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
