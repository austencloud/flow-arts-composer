import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi } from "vitest";
import ModeTabBar from "./ModeTabBar.svelte";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";

describe("ModeTabBar", () => {
  it("calls onModeChange('visual') when the Visual button is clicked", async () => {
    const onModeChange = vi.fn();
    render(ModeTabBar, { activeMode: "playback", onModeChange });

    await page.getByRole("button", { name: "Visual" }).click();
    expect(onModeChange).toHaveBeenCalledWith("visual");
    expect(onModeChange).toHaveBeenCalledTimes(1);
  });

  it("does not call onModeChange when clicking the already-active tab", async () => {
    const onModeChange = vi.fn();
    render(ModeTabBar, { activeMode: "playback", onModeChange });

    // Clicking the active button is a no-op (guarded by `if (mode !== activeMode)`)
    await page.getByRole("button", { name: "Playback" }).click();
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("reflects activeMode via aria-pressed and moves on rerender", async () => {
    const screen = render(ModeTabBar, {
      activeMode: "playback",
      onModeChange: vi.fn(),
    });

    // Initial state: playback active
    await expect
      .element(page.getByRole("button", { name: "Playback" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(page.getByRole("button", { name: "Visual" }))
      .toHaveAttribute("aria-pressed", "false");

    // Rerender with visual active — indicator must move
    await screen.rerender({ activeMode: "visual", onModeChange: vi.fn() });
    await expect
      .element(page.getByRole("button", { name: "Visual" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(page.getByRole("button", { name: "Playback" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("has no AAA a11y violations", async () => {
    render(ModeTabBar, { activeMode: "playback", onModeChange: vi.fn() });
    await expectNoA11yViolations();
  });
});
