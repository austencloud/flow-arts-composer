import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi } from "vitest";
import QuickBpmPresets from "./QuickBpmPresets.svelte";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";

describe("QuickBpmPresets", () => {
  it("calls onBpmChange with the preset value when clicked", async () => {
    const onBpmChange = vi.fn();
    render(QuickBpmPresets, { bpm: 60, onBpmChange });

    await page.getByRole("button", { name: "Set BPM to 90" }).click();
    expect(onBpmChange).toHaveBeenCalledWith(90);
    expect(onBpmChange).toHaveBeenCalledTimes(1);
  });

  it("marks the active preset via class and moves on rerender", async () => {
    const onBpmChange = vi.fn();
    const screen = render(QuickBpmPresets, { bpm: 60, onBpmChange });

    // 60 is the active preset at initial render
    await expect
      .element(page.getByRole("button", { name: "Set BPM to 60" }))
      .toHaveClass("active");

    // Re-render with bpm=90 — active class should move
    await screen.rerender({ bpm: 90, onBpmChange });
    await expect
      .element(page.getByRole("button", { name: "Set BPM to 90" }))
      .toHaveClass("active");
    await expect
      .element(page.getByRole("button", { name: "Set BPM to 60" }))
      .not.toHaveClass("active");
  });

  it("has no AAA a11y violations", async () => {
    render(QuickBpmPresets, { bpm: 60, onBpmChange: vi.fn() });
    await expectNoA11yViolations();
  });
});
