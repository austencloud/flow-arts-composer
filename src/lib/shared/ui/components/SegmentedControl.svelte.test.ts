import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import SegmentedControl from "./SegmentedControl.svelte";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
];

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex
      .replace("#", "")
      .match(/.{2}/g)!
      .map((channel) => parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4
      );
    return (
      0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
    );
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("SegmentedControl", () => {
  it("marks exactly the selected option as pressed", async () => {
    render(SegmentedControl, {
      options: OPTIONS,
      value: "a",
      onchange: vi.fn(),
    });
    await expect
      .element(page.getByRole("button", { name: "Alpha" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(page.getByRole("button", { name: "Beta" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("calls onchange with the clicked value and reflects the new selection (aria-pressed) on rerender", async () => {
    const onchange = vi.fn();
    const screen = render(SegmentedControl, {
      options: OPTIONS,
      value: "a",
      onchange,
    });

    await page.getByRole("button", { name: "Beta" }).click();
    expect(onchange).toHaveBeenCalledWith("b");

    await screen.rerender({ options: OPTIONS, value: "b", onchange });
    await expect
      .element(page.getByRole("button", { name: "Beta" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(page.getByRole("button", { name: "Alpha" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("toggles a binary mode from either segment or the padded control surface", async () => {
    const onchange = vi.fn();
    const options = OPTIONS.slice(0, 2);
    const screen = render(SegmentedControl, {
      options,
      value: "a",
      onchange,
      toggleOnActivate: true,
      ariaLabel: "Option mode",
    });

    await page.getByRole("button", { name: "Alpha" }).click();
    expect(onchange).toHaveBeenLastCalledWith("b");

    await page.getByRole("button", { name: "Beta" }).click();
    expect(onchange).toHaveBeenLastCalledWith("b");

    await screen.rerender({
      options,
      value: "b",
      onchange,
      toggleOnActivate: true,
      ariaLabel: "Option mode",
    });
    const selectedBeta = page.getByRole("button", { name: "Beta" });
    selectedBeta.element().focus();
    await userEvent.keyboard("{Enter}");
    expect(onchange).toHaveBeenLastCalledWith("a");

    await page
      .getByRole("group", { name: "Option mode" })
      .click({ position: { x: 1, y: 1 } });
    expect(onchange).toHaveBeenLastCalledWith("a");
    expect(onchange).toHaveBeenCalledTimes(4);
  });

  // The construct option picker swaps the whole turn palette when the level
  // changes (4 buttons at L2, 8 at L3). Segments are keyed + FLIPped for that,
  // and a keyed each is exactly where a stale-node bug would show up.
  it("swaps the rendered segments when the option list itself changes", async () => {
    const onchange = vi.fn();
    const screen = render(SegmentedControl, {
      options: OPTIONS,
      value: "a",
      onchange,
    });

    const GROWN = [
      { value: "a", label: "Alpha" },
      { value: "a2", label: "Delta" },
      { value: "b", label: "Beta" },
      { value: "c", label: "Gamma" },
    ];
    await screen.rerender({ options: GROWN, value: "a", onchange });

    // Arrival rendered, survivor kept its selection.
    await expect
      .element(page.getByRole("button", { name: "Delta" }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Alpha" }))
      .toHaveAttribute("aria-pressed", "true");

    // Shrinking back drops it again — no orphaned node left behind by the key.
    await screen.rerender({ options: OPTIONS, value: "a", onchange });
    expect(page.getByRole("button", { name: "Delta" }).elements()).toHaveLength(
      0
    );
  });

  // Icon-only options (the picker's All/Continuous filter) drop the visible
  // label, so the accessible name has to come from aria-label instead.
  it("keeps an accessible name when an option renders as an icon only", async () => {
    render(SegmentedControl, {
      options: [
        { value: "all", label: "All", icon: "fas fa-asterisk" },
        { value: "continuous", label: "Continuous", icon: "fas fa-infinity" },
      ],
      value: "all",
      onchange: vi.fn(),
    });

    await expect
      .element(page.getByRole("button", { name: "Continuous" }))
      .toHaveAttribute("title", "Continuous");
    await expectNoA11yViolations();
  });

  it("carries a prop tone from each option to the selected indicator", async () => {
    const onchange = vi.fn();
    const options = [
      { value: "blue", label: "Left", tone: "blue" as const },
      { value: "both", label: "Both", tone: "both" as const },
      { value: "red", label: "Right", tone: "red" as const },
    ];
    const screen = render(SegmentedControl, {
      options,
      value: "blue",
      onchange,
      color: "accent",
    });

    await expect
      .element(page.getByRole("button", { name: "Left" }))
      .toHaveAttribute("data-tone", "blue");
    expect(
      document.querySelector<HTMLElement>(".indicator")?.dataset.tone
    ).toBe("blue");

    await screen.rerender({
      options,
      value: "both",
      onchange,
      color: "accent",
    });
    expect(
      document.querySelector<HTMLElement>(".indicator")?.dataset.tone
    ).toBe("both");

    await screen.rerender({
      options,
      value: "red",
      onchange,
      color: "accent",
    });
    expect(
      document.querySelector<HTMLElement>(".indicator")?.dataset.tone
    ).toBe("red");
  });

  it("uses AA ink on the selected orange accent", async () => {
    render(SegmentedControl, {
      options: OPTIONS,
      value: "a",
      onchange: vi.fn(),
      color: "accent",
    });
    const control = document.querySelector<HTMLElement>(".segmented-control");
    control?.style.setProperty("--theme-accent", "#ea580c");
    control?.style.setProperty("--segmented-selected-ink", "#ffffff");

    const selected = page.getByRole("button", { name: "Alpha" }).element();
    expect(getComputedStyle(selected).color).toBe("rgb(255, 255, 255)");
    expect(contrastRatio("#ffffff", "#692705")).toBeGreaterThanOrEqual(7);
  });

  it("supports an automatically activated tablist with roving keyboard focus", async () => {
    const onchange = vi.fn();
    const screen = render(SegmentedControl, {
      options: [
        {
          value: "a",
          label: "Type 1: Dual-Shift",
          shortLabel: "1",
          id: "type-1-tab",
          controls: "type-1-panel",
        },
        {
          value: "b",
          label: "Type 2: Shift",
          shortLabel: "2",
          id: "type-2-tab",
          controls: "type-2-panel",
        },
      ],
      value: "a",
      onchange,
      semantics: "tabs",
      ariaLabel: "Movement type",
    });

    const firstTab = page.getByRole("tab", { name: "Type 1: Dual-Shift" });
    await expect.element(firstTab).toHaveAttribute("aria-selected", "true");
    await expect.element(firstTab).toHaveAttribute("tabindex", "0");
    await expect
      .element(firstTab)
      .toHaveAttribute("aria-controls", "type-1-panel");
    expect(page.getByText("1").elements()).toHaveLength(1);

    const firstTabElement = firstTab.element() as HTMLButtonElement;
    firstTabElement.focus();
    firstTabElement.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
      })
    );
    expect(onchange).toHaveBeenCalledWith("b");

    await screen.rerender({
      options: [
        {
          value: "a",
          label: "Type 1: Dual-Shift",
          shortLabel: "1",
          id: "type-1-tab",
          controls: "type-1-panel",
        },
        {
          value: "b",
          label: "Type 2: Shift",
          shortLabel: "2",
          id: "type-2-tab",
          controls: "type-2-panel",
        },
      ],
      value: "b",
      onchange,
      semantics: "tabs",
      ariaLabel: "Movement type",
    });
    await expect
      .element(page.getByRole("tab", { name: "Type 2: Shift" }))
      .toHaveAttribute("tabindex", "0");
  });

  it("supports a keyboard-operated single-select radio group", async () => {
    const onchange = vi.fn();
    render(SegmentedControl, {
      options: OPTIONS,
      value: "a",
      onchange,
      semantics: "radiogroup",
      ariaLabel: "Movement type",
    });

    const alpha = page.getByRole("radio", { name: "Alpha" });
    await expect.element(alpha).toHaveAttribute("aria-checked", "true");
    await expect.element(alpha).toHaveAttribute("tabindex", "0");

    const alphaElement = alpha.element() as HTMLButtonElement;
    const bubbledKeydown = vi.fn();
    document.addEventListener("keydown", bubbledKeydown);
    alphaElement.focus();
    const keydown = new KeyboardEvent("keydown", {
      key: "End",
      bubbles: true,
      cancelable: true,
    });
    alphaElement.dispatchEvent(keydown);
    document.removeEventListener("keydown", bubbledKeydown);

    expect(onchange).toHaveBeenCalledWith("c");
    expect(keydown.defaultPrevented).toBe(true);
    expect(bubbledKeydown).not.toHaveBeenCalled();
  });

  it("has no AAA a11y violations", async () => {
    render(SegmentedControl, {
      options: OPTIONS,
      value: "a",
      onchange: vi.fn(),
    });
    await expectNoA11yViolations();
  });
});
