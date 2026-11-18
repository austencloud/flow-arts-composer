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

  it("the one-line size is 36px tall (32px tight) with the word beside a 20px picture", async () => {
    const { unmount } = render(HandPropToolbar, {
      handProps: props(),
      line: "regular",
    });
    const row = document.querySelector<HTMLElement>("[role='radiogroup']")!;
    expect(Math.round(row.getBoundingClientRect().height)).toBe(36);
    for (const choice of ["both", "left", "right"]) {
      const card = document.querySelector<HTMLElement>(
        `[data-testid='hand-choice-${choice}']`
      )!;
      const art = card.querySelector<HTMLElement>(".hand-art")!;
      const word = card.querySelector<HTMLElement>(".hand-word")!;
      expect(Math.round(art.getBoundingClientRect().width)).toBe(20);
      // Beside, not above: the word's top is not below the picture's bottom.
      expect(word.getBoundingClientRect().top).toBeLessThan(
        art.getBoundingClientRect().bottom
      );
      expect(word.scrollWidth).toBeLessThanOrEqual(word.clientWidth + 1);
    }
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
    unmount();

    render(HandPropToolbar, { handProps: props(), line: "tight" });
    const tight = document.querySelector<HTMLElement>("[role='radiogroup']")!;
    expect(Math.round(tight.getBoundingClientRect().height)).toBe(32);
  });

  it("the existing sizes keep their look: no line class, the 56px source art", async () => {
    render(HandPropToolbar, { handProps: props() });
    const wrap = document.querySelector<HTMLElement>(".hand-toolbar")!;
    expect(wrap.classList.contains("line")).toBe(false);
    const art = document.querySelector<HTMLElement>(".hand-art")!;
    // A square, as before; the row is far taller than the 36px line.
    const box = art.getBoundingClientRect();
    expect(Math.round(box.width)).toBe(Math.round(box.height));
    expect(box.width).toBeGreaterThan(40);
    expect(wrap.getBoundingClientRect().height).toBeGreaterThan(60);
  });

  it("disabled keeps the row in place and not pressable", async () => {
    const handProps = props();
    render(HandPropToolbar, { handProps, line: "regular", disabled: true });
    const radios = [...document.querySelectorAll<HTMLButtonElement>("[role='radio']")];
    expect(radios.every((r) => r.disabled)).toBe(true);
    expect(radios.length).toBe(3);
  });
});
