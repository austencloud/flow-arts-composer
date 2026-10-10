import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi } from "vitest";
import MotionColorChips from "./MotionColorChips.svelte";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";

describe("MotionColorChips", () => {
  it("clicking the blue chip calls onToggleBlue and leaves onToggleRed untouched", async () => {
    const onToggleLeft = vi.fn();
    const onToggleRight = vi.fn();
    render(MotionColorChips, {
      showLeft: true,
      showRight: true,
      onToggleLeft,
      onToggleRight,
    });

    // Label when showBlue=true is "Hide left motion"
    await page.getByRole("button", { name: "Hide left motion" }).click();
    expect(onToggleLeft).toHaveBeenCalledTimes(1);
    expect(onToggleRight).not.toHaveBeenCalled();
  });

  it("clicking the red chip calls onToggleRed and leaves onToggleBlue untouched", async () => {
    const onToggleLeft = vi.fn();
    const onToggleRight = vi.fn();
    render(MotionColorChips, {
      showLeft: true,
      showRight: true,
      onToggleLeft,
      onToggleRight,
    });

    // Label when showRed=true is "Hide right motion"
    await page.getByRole("button", { name: "Hide right motion" }).click();
    expect(onToggleRight).toHaveBeenCalledTimes(1);
    expect(onToggleLeft).not.toHaveBeenCalled();
  });

  it("aria-pressed reflects showBlue/showRed and updates on rerender", async () => {
    const screen = render(MotionColorChips, {
      showLeft: true,
      showRight: false,
      onToggleLeft: vi.fn(),
      onToggleRight: vi.fn(),
    });

    // showBlue=true → aria-pressed="true" (label="Hide left motion")
    await expect
      .element(page.getByRole("button", { name: "Hide left motion" }))
      .toHaveAttribute("aria-pressed", "true");
    // showRed=false → aria-pressed="false" (label="Show right motion")
    await expect
      .element(page.getByRole("button", { name: "Show right motion" }))
      .toHaveAttribute("aria-pressed", "false");

    // Flip showBlue to false — aria-pressed and label must update
    await screen.rerender({
      showLeft: false,
      showRight: false,
      onToggleLeft: vi.fn(),
      onToggleRight: vi.fn(),
    });
    await expect
      .element(page.getByRole("button", { name: "Show left motion" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("supports Blue/Red labels in a stacked control without losing accessible names", async () => {
    render(MotionColorChips, {
      showLeft: true,
      showRight: false,
      onToggleLeft: vi.fn(),
      onToggleRight: vi.fn(),
      leftLabel: "Blue",
      rightLabel: "Red",
      layout: "column",
      showVisibilityIcons: true,
    });

    await expect
      .element(page.getByRole("button", { name: "Hide left motion" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(page.getByRole("button", { name: "Show right motion" }))
      .toHaveAttribute("aria-pressed", "false");
    expect(
      document
        .querySelector(".motion-color-chips")
        ?.classList.contains("column")
    ).toBe(true);
    expect(document.querySelectorAll(".motion-color-chips i")).toHaveLength(2);
  });

  it("has no AAA a11y violations", async () => {
    render(MotionColorChips, {
      showLeft: true,
      showRight: true,
      onToggleLeft: vi.fn(),
      onToggleRight: vi.fn(),
    });
    await expectNoA11yViolations();
  });
});
