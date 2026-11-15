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
