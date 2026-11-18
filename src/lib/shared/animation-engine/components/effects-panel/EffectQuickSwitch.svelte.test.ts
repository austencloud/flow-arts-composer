import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-svelte";
import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import EffectQuickSwitch from "./EffectQuickSwitch.svelte";

/** A mouse press the way a browser sends it: down, up, click. */
async function press(target: HTMLElement) {
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  };
  target.dispatchEvent(new PointerEvent("pointerdown", init));
  target.dispatchEvent(new MouseEvent("mousedown", init));
  target.dispatchEvent(new PointerEvent("pointerup", init));
  target.dispatchEvent(new MouseEvent("mouseup", init));
  target.dispatchEvent(new MouseEvent("click", init));
}

describe("EffectQuickSwitch outside taps", () => {
  it("stays open for a host-marked control and closes for any other", async () => {
    const stage = document.createElement("div");
    stage.style.cssText =
      "position:fixed;left:20px;top:20px;width:340px;height:400px";
    const marked = document.createElement("button");
    marked.setAttribute("data-picker-passthrough", "");
    marked.textContent = "pause";
    const other = document.createElement("button");
    other.textContent = "other";
    marked.style.cssText =
      "position:fixed;left:10px;bottom:10px;width:90px;height:44px;z-index:1";
    other.style.cssText =
      "position:fixed;left:120px;bottom:10px;width:90px;height:44px;z-index:1";
    stage.append(marked, other);
    document.body.append(stage);

    const { container } = render(EffectQuickSwitch, {
      effectsConfigState: createEffectsConfigState(),
      player: stage,
      bounds: document.body,
    });
    const trigger = () =>
      container.querySelector<HTMLElement>(".fx-quick-trigger");
    const panel = () => document.querySelector(".fx-quick-panel");

    trigger()!.click();
    await expect.poll(panel).not.toBeNull();

    // The layer ignores outside presses while it is still opening.
    await new Promise((r) => setTimeout(r, 400));
    await press(marked);
    await new Promise((r) => setTimeout(r, 300));
    expect(panel()).not.toBeNull();

    await press(other);
    await expect.poll(panel).toBeNull();
    stage.remove();
  });
});

describe("EffectQuickSwitch one effect per prop", () => {
  async function openList() {
    const bounds = document.createElement("div");
    bounds.style.cssText =
      "position:fixed;left:0;top:0;width:1100px;height:800px";
    const stage = document.createElement("div");
    stage.style.cssText =
      "position:fixed;left:380px;top:60px;width:340px;height:400px";
    document.body.append(bounds, stage);
    const state = createEffectsConfigState();
    state.setEffectFor("both", "fire");
    const { container } = render(EffectQuickSwitch, {
      effectsConfigState: state,
      player: stage,
      bounds,
    });
    const trigger = () =>
      container.querySelector<HTMLElement>(".fx-quick-trigger")!;
    trigger().click();
    await expect.poll(() => document.querySelector(".fx-quick-panel")).not.toBeNull();
    const handRadio = (hand: string) =>
      document
        .querySelector(`[data-testid="hand-choice-${hand}"]`)
        ?.closest<HTMLElement>('[role="radio"]') ?? null;
    const tile = (id: string) =>
      document.querySelector<HTMLElement>(`.effect-btn[data-ghost-id="${id}"]`);
    return {
      state,
      trigger,
      handRadio,
      tile,
      cleanup: () => {
        stage.remove();
        bounds.remove();
      },
    };
  }

  it("opens on Both, and Left changes only the left prop", async () => {
    const list = await openList();
    expect(list.handRadio("both")?.getAttribute("aria-checked")).toBe("true");

    list.handRadio("left")!.click();
    await expect
      .poll(() => list.handRadio("left")?.getAttribute("aria-checked"))
      .toBe("true");
    list.tile("trails")!.click();

    await expect.poll(() => list.state.effectForHand(0)).toBe("trails");
    expect(list.state.effectForHand(1)).toBe("fire");
    expect(list.state.effectsDiffer()).toBe(true);
    // The lit tile is the chosen prop's effect.
    expect(list.tile("trails")?.getAttribute("aria-checked")).toBe("true");
    expect(list.tile("fire")?.getAttribute("aria-checked")).toBe("false");
    list.cleanup();
  });

  it("makes the On / Off switch follow the chosen hand", async () => {
    const list = await openList();
    list.handRadio("right")!.click();
    await expect
      .poll(() => list.handRadio("right")?.getAttribute("aria-checked"))
      .toBe("true");
    document
      .querySelector<HTMLElement>("[data-quick-toggle] [role='switch']")!
      .click();
    await expect.poll(() => list.state.effectForHand(1)).toBe("none");
    expect(list.state.effectForHand(0)).toBe("fire");
    list.cleanup();
  });

  it("draws the hand dots only while the props differ", async () => {
    const list = await openList();
    const dots = () =>
      document.querySelectorAll(".hand-dot-slot .hand-dot.visible").length;
    expect(dots()).toBe(0);
    // Two props: every tile keeps both slots mounted, none visible.
    const slotCount = document.querySelectorAll(".hand-dot-slot").length;
    expect(slotCount).toBeGreaterThan(0);
    expect(slotCount % 2).toBe(0);

    list.state.setEffectFor(0, "trails");
    await expect.poll(dots).toBe(2);
    // Only the wearing tiles' dots are visible; others stay mounted, hidden.
    expect(
      list.tile("trails")?.querySelector(".hand-dot.visible")
    ).not.toBeNull();
    expect(list.tile("fire")?.querySelector(".hand-dot.visible")).not.toBeNull();
    expect(
      list.tile("fire")?.querySelector(".hand-dot[data-hand-dot='left']")
        ?.classList.contains("visible")
    ).toBe(false);
    // Left's dot sits on its tile, right's on the other.
    expect(
      list
        .tile("trails")
        ?.querySelector(".hand-dot-slot.left .hand-dot[data-hand-dot='left']")
    ).not.toBeNull();
    expect(
      list
        .tile("fire")
        ?.querySelector(".hand-dot-slot.right .hand-dot[data-hand-dot='right']")
    ).not.toBeNull();
    // The tiles are named for their hand.
    expect(list.tile("trails")?.getAttribute("aria-label")).toContain(
      "left prop"
    );
    expect(list.tile("fire")?.getAttribute("aria-label")).toContain(
      "right prop"
    );

    list.state.setEffectFor(0, "fire");
    await expect.poll(dots).toBe(0);
    // The dots stay mounted, only faded out.
    expect(document.querySelectorAll(".hand-dot-slot").length).toBe(slotCount);
    list.cleanup();
  });

  it("dims the row on the fast clock while Effects is off", async () => {
    const list = await openList();
    const left = () =>
      list.handRadio("left") as HTMLButtonElement;
    expect(getComputedStyle(left()).opacity).toBe("1");
    list.state.setEffectFor("both", "none");
    await expect.poll(() => left().disabled).toBe(true);
    await expect.poll(() => getComputedStyle(left()).opacity).toBe("0.5");
    expect(getComputedStyle(left()).transitionProperty).toContain("opacity");
    list.cleanup();
  });

  it("puts each hand dot exactly on its slot, on dense and picture tiles", async () => {
    const list = await openList();
    list.state.setEffectFor(0, "trails");
    await expect
      .poll(() => document.querySelectorAll(".hand-dot.visible").length)
      .toBeGreaterThanOrEqual(2);
    for (const slot of document.querySelectorAll(".hand-dot-slot")) {
      const a = slot.getBoundingClientRect();
      const b = slot.querySelector(".hand-dot")!.getBoundingClientRect();
      expect([b.left, b.top, b.width, b.height]).toEqual([
        a.left,
        a.top,
        a.width,
        a.height,
      ]);
    }
    list.cleanup();
  });

  it("names one effect when the props match and both when they differ", async () => {
    const list = await openList();
    const names = () =>
      [
        ...document.querySelectorAll(".fx-quick-current .fx-quick-name"),
      ].map((node) => node.textContent);
    await expect.poll(() => names().length).toBe(1);
    expect(list.trigger().querySelector(".sr-only")?.textContent).not.toContain(
      "left prop"
    );

    list.state.setEffectFor(0, "trails");
    await expect.poll(() => names().length).toBe(2);
    expect(list.trigger().querySelector(".sr-only")?.textContent).toContain(
      "on the left prop"
    );
    expect(list.trigger().querySelector(".sr-only")?.textContent).toContain(
      "on the right prop"
    );
    // No word joins the two on screen.
    expect(
      list
        .trigger()
        .querySelector(".fx-quick-pair")
        ?.textContent?.replace(/\s+/g, " ")
        .trim()
    ).toBe(names().join(" "));
    list.cleanup();
  });
});
