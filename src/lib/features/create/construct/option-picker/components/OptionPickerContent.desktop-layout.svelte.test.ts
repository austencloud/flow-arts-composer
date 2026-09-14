import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import OptionPickerDesktopLayoutHarness from "./OptionPickerDesktopLayoutHarness.svelte";

describe("OptionPickerContent desktop layout", () => {
  it("uses the mobile hierarchy when the desktop sections would scroll", async () => {
    render(OptionPickerDesktopLayoutHarness, {
      width: 900,
      height: 120,
      sideBySide: true,
      sectionTitles: ["Type1", "Type2", "Type3"],
    });

    await vi.waitFor(() => {
      expect(document.querySelector(".sections-container")).toBeNull();
    });
    await expect
      .element(page.getByRole("tablist", { name: "Letter type" }))
      .toBeInTheDocument();
  });

  it("does not render redundant letter-type navigation above visible sections", async () => {
    render(OptionPickerDesktopLayoutHarness);

    await vi.waitFor(() => {
      expect(document.querySelector(".sections-container")).not.toBeNull();
    });

    expect(
      page.getByRole("tablist", { name: "Letter type" }).elements()
    ).toHaveLength(0);
    expect(
      page.getByRole("radiogroup", { name: "Letter type" }).elements()
    ).toHaveLength(0);
  });

  it("keeps the mobile letter-type controls aligned without an action prompt", async () => {
    await page.viewport(327, 708);

    render(OptionPickerDesktopLayoutHarness, {
      width: 327,
      height: 300,
      sideBySide: false,
      topOffset: 350,
    });

    const tabs = page.getByRole("tablist", { name: "Letter type" });
    const settings = page.getByRole("button", { name: /^Option settings/ });
    const info = page.getByRole("button", { name: "Explain letter types" });
    await expect.element(tabs).toBeInTheDocument();
    await expect.element(settings).toBeInTheDocument();
    await expect.element(info).toBeInTheDocument();
    expect(page.getByText("Add next step").elements()).toHaveLength(0);

    const header = document.querySelector<HTMLElement>(".type-navigation");
    expect(header).not.toBeNull();
    const headerBounds = header!.getBoundingClientRect();
    const settingsBounds = settings.element().getBoundingClientRect();
    const tabsBounds = tabs.element().getBoundingClientRect();
    const infoBounds = info.element().getBoundingClientRect();
    expect(headerBounds.height).toBeGreaterThanOrEqual(44);
    expect(headerBounds.height).toBeLessThanOrEqual(48);
    expect(settingsBounds.right).toBeLessThanOrEqual(tabsBounds.left);
    expect(tabsBounds.right).toBeLessThanOrEqual(infoBounds.left);
    expect(
      Math.abs(
        settingsBounds.top +
          settingsBounds.height / 2 -
          (infoBounds.top + infoBounds.height / 2)
      )
    ).toBeLessThanOrEqual(1);

    const carousel = document.querySelector<HTMLElement>(".carousel-area");
    expect(carousel).not.toBeNull();
    const carouselTopBefore = carousel!.getBoundingClientRect().top;

    await settings.click();
    await new Promise((resolve) => setTimeout(resolve, 350));

    const settingsRegion = page.getByRole("region", {
      name: "Option settings",
    });
    await expect.element(settingsRegion).toBeVisible();
    const settingsPanel =
      document.querySelector<HTMLElement>(".settings-panel");
    expect(settingsPanel).not.toBeNull();
    const settingsRegionBounds = settingsRegion
      .element()
      .getBoundingClientRect();
    expect(settingsRegionBounds.height).toBeLessThanOrEqual(233);
    expect(settingsRegionBounds.bottom).toBeLessThanOrEqual(headerBounds.top);
    expect(settingsPanel!.scrollHeight).toBeLessThanOrEqual(
      settingsPanel!.clientHeight
    );
    expect(
      Math.abs(carousel!.getBoundingClientRect().top - carouselTopBefore)
    ).toBeLessThanOrEqual(1);

    await settings.click();
    await expect.element(settings).toHaveAttribute("aria-expanded", "false");
  });

  it("reserves only the controls that exist at each mobile level", async () => {
    await page.viewport(327, 708);

    const screen = render(OptionPickerDesktopLayoutHarness, {
      width: 327,
      height: 300,
      sideBySide: false,
      topOffset: 350,
      level: 1,
    });

    const settings = page.getByRole("button", { name: /^Option settings/ });
    await settings.click();
    await new Promise((resolve) => setTimeout(resolve, 350));

    const settingsRegion = page.getByRole("region", {
      name: "Option settings",
    });
    const settingsPanel =
      document.querySelector<HTMLElement>(".settings-panel");
    expect(settingsPanel).not.toBeNull();
    const level1Height = settingsRegion
      .element()
      .getBoundingClientRect().height;
    expect(level1Height).toBeLessThanOrEqual(89);
    expect(settingsPanel!.scrollHeight).toBeLessThanOrEqual(
      settingsPanel!.clientHeight
    );

    await screen.rerender({
      width: 327,
      height: 300,
      sideBySide: false,
      topOffset: 350,
      level: 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 350));

    const level2Height = settingsRegion
      .element()
      .getBoundingClientRect().height;
    expect(level2Height).toBeLessThanOrEqual(233);
    expect(level2Height).toBeGreaterThan(level1Height + 100);
    expect(settingsPanel!.scrollHeight).toBeLessThanOrEqual(
      settingsPanel!.clientHeight
    );
  });

  it("keeps the filter when direction settings hide every option", async () => {
    const screen = render(OptionPickerDesktopLayoutHarness, {
      width: 1200,
      height: 700,
      continuous: true,
      sequenceLength: 2,
      leftTurns: 2,
      rightTurns: 2,
      shownCount: 0,
      hiddenCount: 6,
    });

    await expect
      .element(page.getByRole("button", { name: /^Continuous/ }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: /^Continuous/ }))
      .toHaveTextContent("6 hidden");
    expect(document.querySelector(".availability-status")).toBeNull();

    await screen.rerender({ continuous: false });
    await expect
      .element(page.getByRole("button", { name: "Continuous", exact: true }))
      .not.toHaveTextContent("hidden");

    await screen.rerender({ continuous: true, hiddenCount: 3 });
    await expect
      .element(page.getByRole("button", { name: /^Continuous/ }))
      .toHaveTextContent("3 hidden");

    await screen.rerender({ hiddenCount: 0, shownCount: 6 });
    await expect
      .element(page.getByRole("button", { name: "Continuous", exact: true }))
      .not.toHaveTextContent("hidden");
  });
});
