import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { ComponentProps } from "svelte";
import HandPropToolbar from "./HandPropToolbar.svelte";

// Read off the component: plain tsc cannot see a type exported from a
// .svelte module script.
type HandPropToolbarProps = ComponentProps<typeof HandPropToolbar>["handProps"];

function props(over: Partial<HandPropToolbarProps> = {}): HandPropToolbarProps {
  return {
    hand: "both",
    leftPropType: PropType.STAFF,
    rightPropType: PropType.TRIAD,
    onHandChange: vi.fn(),
    ...over,
  };
}

describe("HandPropToolbar Both / Left / Right", () => {
  beforeEach(async () => {
    await page.viewport(344, 700);
    document.body.style.margin = "0";
  });

  it("shows three options with Both chosen on open", async () => {
    render(HandPropToolbar, { handProps: props() });
    await expect
      .element(page.getByRole("radio", { name: "Both" }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(page.getByRole("radio", { name: "Left" }))
      .toHaveAttribute("aria-checked", "false");
    await expect
      .element(page.getByRole("radio", { name: "Right" }))
      .toHaveAttribute("aria-checked", "false");
    expect(document.querySelectorAll("[role='radio']").length).toBe(3);
  });

  it("has no switch, no Cat Dog name and no explaining line", async () => {
    render(HandPropToolbar, { handProps: props() });
    expect(document.querySelector("[role='switch']")).toBeNull();
    expect(document.body.textContent).not.toMatch(/cat\s*dog/i);
    expect(document.body.textContent).not.toMatch(/different prop/i);
  });

  it("marks the hand the host addresses", async () => {
    render(HandPropToolbar, { handProps: props({ hand: "right" }) });
    await expect
      .element(page.getByRole("radio", { name: "Right" }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(page.getByRole("radio", { name: "Both" }))
      .toHaveAttribute("aria-checked", "false");
  });

  it("picking an option reports the hand choice", async () => {
    const handProps = props();
    render(HandPropToolbar, { handProps });
    await page.getByRole("radio", { name: "Left" }).click();
    expect(handProps.onHandChange).toHaveBeenCalledWith("left");
  });

  it("draws two props for Both even when the hands match, and fits 344 px", async () => {
    render(HandPropToolbar, {
      handProps: props({ rightPropType: PropType.STAFF }),
    });
    expect(
      document.querySelectorAll("[data-testid='hand-choice-both'] svg, [data-testid='hand-choice-both'] img").length
    ).toBeGreaterThan(0);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(344);
    const row = document.querySelector<HTMLElement>("[role='radiogroup']")!;
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
  });
});
