import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SwipeToDismiss } from "#lib/shared/foundation/ui/drawer/swipe-to-dismiss.js";

/**
 * Regression cover for the swallowed-tap bug behind the PostHog rage-clicks on
 * the inbox header toggle and the card-export chips (both live inside a Drawer).
 *
 * The drawer's swipe handler starts a drag on the FIRST touch point, so any
 * finger jitter during a tap used to set `hasMoved`, which set `justDragged`,
 * which made the capture-phase click handler cancel the click outright. The
 * button flipped nothing and the user hammered it.
 */

// The shared vitest setup replaces document.createElement with a plain-object
// mock (for the canvas paths). This suite needs real DOM nodes — event
// dispatch, closest(), capture-phase listeners — so it goes through the
// prototype directly.
function createReal<K extends keyof HTMLElementTagNameMap>(
  tag: K
): HTMLElementTagNameMap[K] {
  return Document.prototype.createElement.call(
    document,
    tag
  ) as HTMLElementTagNameMap[K];
}

function touchEvent(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: [{ clientX: x, clientY: y }],
  });
  return event;
}

describe("SwipeToDismiss tap slop", () => {
  let drawer: HTMLDivElement;
  let button: HTMLButtonElement;
  let handler: SwipeToDismiss;
  let onDismiss: () => void;
  let clicks: number;

  beforeEach(() => {
    drawer = createReal("div");
    button = createReal("button");
    drawer.appendChild(button);
    document.body.appendChild(drawer);

    clicks = 0;
    button.addEventListener("click", () => {
      clicks++;
    });

    onDismiss = vi.fn();
    handler = new SwipeToDismiss({
      placement: "right",
      dismissible: true,
      onDismiss,
    });
    handler.attach(drawer);
  });

  afterEach(() => {
    handler.detach();
    drawer.remove();
  });

  function tapWithDrift(dx: number, dy: number): void {
    button.dispatchEvent(touchEvent("touchstart", 100, 100));
    button.dispatchEvent(touchEvent("touchmove", 100 + dx, 100 + dy));
    button.dispatchEvent(touchEvent("touchend", 100 + dx, 100 + dy));
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
  }

  it("keeps the click when a tap drifts a few px off the dismiss axis", () => {
    // 8px of vertical thumb roll on a right-placed drawer. Not a dismiss
    // gesture on any axis that matters — the tap must survive.
    tapWithDrift(0, 8);
    expect(clicks).toBe(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("keeps the click when a tap drifts within tap slop on the dismiss axis", () => {
    tapWithDrift(9, 0);
    expect(clicks).toBe(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("cancels the click once the finger clearly drags along the dismiss axis", () => {
    // Past tap slop: this is a deliberate drag on the control, so the click is
    // correctly forfeited (it would otherwise fire at the end of a swipe).
    tapWithDrift(40, 0);
    expect(clicks).toBe(0);
  });

  it("still dismisses on a full swipe that starts on a control", () => {
    button.dispatchEvent(touchEvent("touchstart", 100, 100));
    button.dispatchEvent(touchEvent("touchmove", 260, 100));
    button.dispatchEvent(touchEvent("touchend", 260, 100));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it.each(["left", "right"] as const)(
    "lets vertical scrolling with diagonal drift continue in a %s drawer",
    (placement) => {
      handler.detach();
      handler = new SwipeToDismiss({ placement, dismissible: true, onDismiss });
      handler.attach(drawer);
      const direction = placement === "left" ? -1 : 1;
      button.dispatchEvent(touchEvent("touchstart", 200, 100));
      const move = touchEvent("touchmove", 200 + direction * 20, 200);
      button.dispatchEvent(move);

      expect(move.defaultPrevented).toBe(false);
      // Once scrolling wins, later drift must not turn it into dismissal.
      button.dispatchEvent(touchEvent("touchmove", 200 + direction * 160, 220));
      button.dispatchEvent(touchEvent("touchend", 200 + direction * 160, 220));
      expect(onDismiss).not.toHaveBeenCalled();
    }
  );

  it("leaves selection drags inside a swipe-blocked form to the form", () => {
    const form = createReal("main");
    form.setAttribute("data-swipe-block", "");
    const textarea = createReal("textarea");
    form.appendChild(textarea);
    drawer.appendChild(form);

    textarea.dispatchEvent(touchEvent("touchstart", 100, 100));
    textarea.dispatchEvent(touchEvent("touchmove", 100, 250));
    textarea.dispatchEvent(touchEvent("touchend", 100, 250));

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
