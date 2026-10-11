import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { SwipeToDismiss } from "#lib/shared/foundation/ui/drawer/swipe-to-dismiss.js";

/**
 * Desktop-Safari regression lock for the swipe-to-dismiss TouchEvent bug.
 *
 * Safari on macOS does NOT define the `TouchEvent` global. The handler binds
 * to BOTH mousedown and touchstart, so a bare `event instanceof TouchEvent`
 * threw `ReferenceError: Can't find variable: TouchEvent` on every desktop
 * mouse interaction inside a swipe-dismiss drawer — leaving drag state
 * uninitialized and letting the capture-phase click interceptor swallow the
 * real click (dead sequence-viewer tempo buttons; 78 console errors + rage
 * clicks in a real user's session, 2026-07-08).
 *
 * We force `TouchEvent` to be undefined for the duration of this suite, which
 * reproduces the exact Safari-desktop condition on any OS — no Safari (or Mac)
 * required. The fix (`"touches" in event`) never references the global, so it
 * works whether or not `TouchEvent` exists.
 *
 * Note: the global test setup stubs `document.createElement`, so elements are
 * built via `document.body.innerHTML` to obtain real jsdom nodes whose
 * addEventListener/dispatchEvent actually fire.
 */
describe("SwipeToDismiss — desktop Safari (no TouchEvent global)", () => {
  const hadTouchEvent = "TouchEvent" in globalThis;
  const originalTouchEvent = (globalThis as Record<string, unknown>).TouchEvent;

  beforeAll(() => {
    // Guarantee the Safari-desktop condition regardless of the jsdom version.
    Object.defineProperty(globalThis, "TouchEvent", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });
  afterAll(() => {
    if (hadTouchEvent) {
      Object.defineProperty(globalThis, "TouchEvent", {
        value: originalTouchEvent,
        configurable: true,
        writable: true,
      });
    } else {
      delete (globalThis as Record<string, unknown>).TouchEvent;
    }
  });

  let el: HTMLElement;
  let handler: SwipeToDismiss;
  const onDismiss = vi.fn();

  beforeEach(() => {
    onDismiss.mockClear();
    document.body.innerHTML = `<div id="drawer" style="height:400px"></div>`;
    el = document.body.querySelector("#drawer") as HTMLElement;
    handler = new SwipeToDismiss({
      placement: "bottom",
      dismissible: true,
      onDismiss,
    });
    handler.attach(el);
  });
  afterEach(() => {
    handler.detach();
    document.body.innerHTML = "";
  });

  const mouse = (type: string, x: number, y: number) =>
    el.dispatchEvent(
      new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true })
    );

  it("environment mirrors desktop Safari: TouchEvent is undefined", () => {
    expect(typeof TouchEvent).toBe("undefined");
  });

  it("a mousedown inside the drawer does not throw ReferenceError", () => {
    // Pre-fix, the `instanceof TouchEvent` on this path threw.
    expect(() => mouse("mousedown", 100, 100)).not.toThrow();
  });

  it("mouse drag still initializes and tracks after the fix", () => {
    mouse("mousedown", 100, 100);
    // First move past the 5px threshold promotes the pending mouse drag.
    mouse("mousemove", 100, 120);
    expect(handler.getIsDragging()).toBe(true);
    // Second move updates the offset from clientY (the else branch the fix
    // now reaches instead of throwing).
    mouse("mousemove", 100, 160);
    expect(handler.getDragOffsetY()).toBeGreaterThan(0);
    mouse("mouseup", 100, 160);
  });
});
