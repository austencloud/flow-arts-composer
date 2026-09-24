import { afterEach, describe, expect, it, vi } from "vitest";
import { SwipeToDismiss } from "$lib/shared/foundation/ui/drawer/swipe-to-dismiss";

describe("SwipeToDismiss nested swipe blocks", () => {
  let swipe: SwipeToDismiss | undefined;

  afterEach(() => {
    swipe?.detach();
    document.body.innerHTML = "";
  });

  it("lets a rail own touch gestures while the tray still swipes down", () => {
    document.body.innerHTML = `
      <div data-swipe-block>
        <div id="tray">
          <div data-swipe-block><button id="prop">Prop</button></div>
          <button id="handle">Handle</button>
        </div>
      </div>`;
    const tray = document.querySelector<HTMLElement>("#tray")!;
    const onDismiss = vi.fn();
    swipe = new SwipeToDismiss({
      placement: "bottom",
      dismissible: true,
      ignoreSwipeBlock: true,
      onDismiss,
    });
    swipe.attach(tray);

    const touch = (selector: string, type: string, y: number) => {
      const event = new Event(type, {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "touches", {
        value: [{ clientX: 100, clientY: y }],
      });
      document.querySelector(selector)!.dispatchEvent(event);
    };

    touch("#prop", "touchstart", 100);
    touch("#prop", "touchmove", 300);
    touch("#prop", "touchend", 300);
    expect(swipe.getIsDragging()).toBe(false);
    expect(onDismiss).not.toHaveBeenCalled();

    touch("#handle", "touchstart", 100);
    expect(swipe.getIsDragging()).toBe(true);
    touch("#handle", "touchmove", 300);
    touch("#handle", "touchend", 300);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
