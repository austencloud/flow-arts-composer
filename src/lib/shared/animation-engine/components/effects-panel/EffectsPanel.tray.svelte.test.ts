import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-svelte";
import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import Host from "./__tests__/EffectsPanelTrayHost.svelte";

// The viewer's tray: Both / Left / Right on the bar's own line, tiles that set
// the chosen prop, and a mix that is shown, never flattened to one effect.
function mixed() {
  const state = createEffectsConfigState();
  state.setEffectFor(0, "fire");
  state.setEffectFor(1, "trails");
  return state;
}

function tile(container: HTMLElement, id: string) {
  return container.querySelector<HTMLElement>(
    `.effect-btn[data-ghost-id='${id}']`
  );
}
const lit = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>(
    ".effect-btn[aria-checked='true']"
  ),
];
const dots = (container: HTMLElement) =>
  container.querySelectorAll(".hand-dot-slot .hand-dot").length;
const radio = (container: HTMLElement, name: string) =>
  [
    ...container.querySelectorAll<HTMLElement>(".tray-hand [role='radio']"),
  ].find((r) => (r.textContent ?? "").toLowerCase().includes(name))!;

describe("EffectsPanel tray with two props", () => {
  it("shows a mix on Both: no lit tile, a dot per hand, the short Off chip", async () => {
    const { container } = render(Host, { state: mixed() });
    await expect
      .poll(() => container.querySelector(".tray-hand"))
      .not.toBeNull();
    await expect
      .poll(() => container.querySelector(".tray-hand"))
      .not.toBeNull();
    expect(lit(container)).toHaveLength(0);
    await expect.poll(() => dots(container)).toBeGreaterThan(0);
    const chip = container.querySelector<HTMLElement>(".off-chip")!;
    expect(chip.classList.contains("short")).toBe(true);
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    // A mix names no one effect.
    expect(chip.getAttribute("aria-label")).toBeNull();
  });

  it("lights the chosen prop's effect, and a tap sets that prop only", async () => {
    const state = mixed();
    const { container } = render(Host, { state });
    await expect
      .poll(() => container.querySelector(".tray-hand"))
      .not.toBeNull();

    radio(container, "left").click();
    await expect.poll(() => lit(container)).toHaveLength(1);
    expect(state.effectForHand(0)).toBe("fire");

    tile(container, "sparkles")!.click();
    await expect.poll(() => state.effectForHand(0)).not.toBe("fire");
    expect(state.effectForHand(1)).toBe("trails");

    radio(container, "right").click();
    await expect.poll(() => lit(container)).toHaveLength(1);
  });

  it("the chip turns off the chosen prop and brings it back", async () => {
    const state = mixed();
    const { container } = render(Host, { state });
    await expect
      .poll(() => container.querySelector(".tray-hand"))
      .not.toBeNull();

    radio(container, "right").click();
    const chip = () => container.querySelector<HTMLElement>(".off-chip")!;
    await expect
      .poll(() => chip().getAttribute("aria-label"))
      .toContain("Turn off");
    chip().click();
    await expect.poll(() => state.effectForHand(1)).toBe("none");
    expect(state.effectForHand(0)).toBe("fire");
    expect(chip().getAttribute("aria-pressed")).toBe("true");
    chip().click();
    await expect.poll(() => state.effectForHand(1)).toBe("trails");

    radio(container, "both").click();
    chip().click();
    await expect.poll(() => state.activeEffect).toBe("none");
    chip().click();
    // Back to the pair that was on, mix included.
    await expect.poll(() => state.effectForHand(0)).toBe("fire");
    expect(state.effectForHand(1)).toBe("trails");
  });

  it("drops the chip's word before it drops the row, and the row last", async () => {
    // Natural widths, read from a roomy tray.
    const wide = render(Host, { state: mixed(), width: 600 });
    await expect
      .poll(() => wide.container.querySelector(".tray-hand"))
      .not.toBeNull();
    await expect
      .poll(
        () =>
          wide.container.querySelector<HTMLElement>(".off-chip.measure")!
            .offsetWidth
      )
      .toBeGreaterThan(50);
    const word =
      wide.container.querySelector<HTMLElement>(
        ".off-chip.measure"
      )!.offsetWidth;
    // The row at word-sized tracks: the narrowest that keeps every word whole.
    const rowEl = wide.container.querySelector<HTMLElement>(".tray-hand")!;
    rowEl.style.width = "min-content";
    const row = rowEl.offsetWidth;
    rowEl.style.width = "";
    expect(wide.container.querySelector(".off-chip.icon-only")).toBeNull();
    wide.unmount();

    // Room for the icon and the row, not for the word: row shown, chip icon-only.
    const state = mixed();
    const { container } = render(Host, { state, width: 44 + 8 + row + 2 });
    await expect
      .poll(() => container.querySelector(".off-chip.icon-only"))
      .not.toBeNull();
    expect(container.querySelector(".tray-hand")).not.toBeNull();
    expect(container.querySelector(".tray-hand.words-hidden")).toBeNull();
    const chip = container.querySelector<HTMLElement>(".off-chip.icon-only")!;
    expect(chip.textContent?.trim()).toBe("");
    expect(chip.getAttribute("aria-label")).toBe("Off");
    expect(word).toBeGreaterThan(44);
    chip.click();
    await expect.poll(() => state.activeEffect).toBe("none");
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });

  it("never drops the row: when nothing else fits all three words hide together", async () => {
    const state = mixed();
    const { container } = render(Host, { state, width: 120 });
    await expect
      .poll(() => container.querySelector(".tray-hand.words-hidden"))
      .not.toBeNull();
    expect(container.querySelectorAll(".tray-hand [role='radio']")).toHaveLength(
      3
    );
    expect(lit(container)).toHaveLength(0);
    await expect.poll(() => dots(container)).toBeGreaterThan(0);
  });

  it("opens tuning for the other prop's effect from its lit tile", async () => {
    const state = mixed();
    const { container } = render(Host, { state });
    await expect
      .poll(() => container.querySelector(".tray-hand"))
      .not.toBeNull();
    radio(container, "right").click();
    await expect.poll(() => lit(container)).toHaveLength(1);
    expect(state.activeEffect).toBe("fire");
    tile(container, "trails")!.click();
    // The detail page names Trails, not the primary Fire.
    await expect
      .poll(() => container.querySelector(".detail-name")?.textContent ?? "")
      .toContain("All effects");
    await expect
      .poll(() => (container.textContent ?? "").includes("Thickness"))
      .toBe(true);
    expect(state.effectForHand(0)).toBe("fire");
    expect(state.effectForHand(1)).toBe("trails");
  });

  it("is exactly as before with one prop", async () => {
    const state = createEffectsConfigState();
    state.setEffectFor("both", "fire");
    const { container } = render(Host, { state, twoProps: false });
    await expect
      .poll(() => container.querySelector(".off-chip"))
      .not.toBeNull();
    expect(container.querySelector(".tray-hand")).toBeNull();
    expect(container.querySelector(".off-chip")!.textContent).toContain("Fire");
  });
});
