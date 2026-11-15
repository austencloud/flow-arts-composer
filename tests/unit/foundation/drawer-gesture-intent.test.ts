// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwipeToDismiss } from "@austencloud/drawer";

/**
 * A sheet moves only once a gesture has shown it is a drag along the sheet's
 * own axis, and a gesture that is not is let go for good. A phone visitor kept
 * nudging the sequence viewer while tapping buttons and swiping sideways: the
 * sheet followed the first pixel of every touch. The wobble is a few frames of
 * motion that a test can pin and an eye easily misses.
 *
 * Elements come from innerHTML because the shared test setup stubs
 * document.createElement.
 */

type Point = [number, number];

function touch(target: Element, type: string, points: Point[]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: points.map(([clientX, clientY]) => ({ clientX, clientY })),
  });
  target.dispatchEvent(event);
  return event;
}

function mouse(target: Element, type: string, [clientX, clientY]: Point) {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 })
  );
}

const handlers: SwipeToDismiss[] = [];

function mount(placement: "bottom" | "right" = "bottom") {
  document.body.innerHTML = `
    <div id="sheet">
      <div class="drawer-handle" id="handle"></div>
      <div id="content"><button id="button">Browse</button></div>
    </div>`;
  const el = document.querySelector<HTMLElement>("#sheet")!;
  const onDismiss = vi.fn();
  const onDragChange = vi.fn();
  const handler = new SwipeToDismiss({ placement, dismissible: true, onDismiss, onDragChange });
  handler.attach(el);
  handlers.push(handler);
  const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
  /** Offsets reported while the sheet was being dragged. */
  const dragOffsets = () =>
    onDragChange.mock.calls
      .filter(([, , dragging]) => dragging)
      .map(([offset]) => offset as number);
  return { handler, onDismiss, onDragChange, dragOffsets, $ };
}

/** Moves one finger through `points` and lifts it at the last one. */
function swipe(target: Element, points: Point[]) {
  touch(target, "touchstart", [points[0]!]);
  for (const point of points.slice(1)) touch(target, "touchmove", [point]);
  touch(target, "touchend", []);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  for (const handler of handlers.splice(0)) handler.detach();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("drawer gesture intent", () => {
  it("a tap that wobbles 6 px down reports no drag and keeps its click", () => {
    const sheet = mount();
    let clicks = 0;
    sheet.$("#button").addEventListener("click", () => clicks++);

    swipe(sheet.$("#button"), [
      [100, 100],
      [100, 103],
      [100, 106],
    ]);
    sheet.$("#button").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(sheet.dragOffsets()).toEqual([]);
    expect(clicks).toBe(1);
  });

  it("a sideways swipe that drifts down never moves a bottom sheet, even if it turns straight down later", () => {
    const sheet = mount();
    const content = sheet.$("#content");
    touch(content, "touchstart", [[100, 100]]);
    touch(content, "touchmove", [[120, 104]]);
    const sideways = touch(content, "touchmove", [[140, 112]]);
    expect(sideways.defaultPrevented).toBe(false);
    expect(sheet.dragOffsets().filter((offset) => offset > 0)).toEqual([]);

    // Released is final: a straight pull afterwards is still the sideways swipe.
    touch(content, "touchmove", [[140, 200]]);
    touch(content, "touchmove", [[140, 320]]);
    touch(content, "touchend", []);
    expect(sheet.dragOffsets().filter((offset) => offset > 0)).toEqual([]);
    expect(sheet.onDismiss).not.toHaveBeenCalled();
  });

  it("a straight pull starts at 0 at the claim and grows without jumping by the slop", () => {
    const sheet = mount();
    const path: Point[] = [];
    for (let y = 100; y <= 140; y += 5) path.push([100, y]);
    swipe(sheet.$("#content"), path);

    const offsets = sheet.dragOffsets();
    expect(offsets[0]).toBe(0);
    expect(offsets.length).toBeGreaterThan(2);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]! - offsets[i - 1]!).toBeGreaterThan(0);
      expect(offsets[i]! - offsets[i - 1]!).toBeLessThanOrEqual(5);
    }
  });

  it("a pull on the handle claims after 4 px even 45 degrees off axis; the same move on content does not", () => {
    const sheet = mount();
    touch(sheet.$("#handle"), "touchstart", [[100, 100]]);
    expect(sheet.handler.getIsDragging()).toBe(false);
    touch(sheet.$("#handle"), "touchmove", [[104, 104]]);
    expect(sheet.handler.getIsDragging()).toBe(true);
    touch(sheet.$("#handle"), "touchend", []);

    touch(sheet.$("#content"), "touchstart", [[100, 100]]);
    touch(sheet.$("#content"), "touchmove", [[108, 108]]);
    expect(sheet.handler.getIsDragging()).toBe(false);
    touch(sheet.$("#content"), "touchend", []);
  });

  it("two fingers down never drag the sheet", () => {
    const sheet = mount();
    const content = sheet.$("#content");
    touch(content, "touchstart", [
      [100, 100],
      [200, 100],
    ]);
    touch(content, "touchmove", [
      [100, 250],
      [200, 250],
    ]);
    touch(content, "touchend", []);
    expect(sheet.dragOffsets()).toEqual([]);
    expect(sheet.onDismiss).not.toHaveBeenCalled();
  });

  it("a second finger during a claimed drag springs the sheet back without dismissing", () => {
    const sheet = mount();
    const content = sheet.$("#content");
    touch(content, "touchstart", [[100, 100]]);
    touch(content, "touchmove", [[100, 120]]);
    touch(content, "touchmove", [[100, 200]]);
    expect(Math.max(...sheet.dragOffsets())).toBeGreaterThan(0);

    touch(content, "touchstart", [
      [100, 200],
      [200, 200],
    ]);
    expect(sheet.onDragChange.mock.lastCall).toEqual([0, 1, false]);
    expect(sheet.handler.getIsDragging()).toBe(false);

    touch(content, "touchmove", [[100, 300]]);
    touch(content, "touchend", []);
    expect(sheet.onDismiss).not.toHaveBeenCalled();
  });

  it("claimed pulls keep the dismiss thresholds: 120 px dismisses, a fast 60 px dismisses, a slow 60 px does not", () => {
    const pull = (distance: number, durationMs: number) => {
      const sheet = mount();
      const content = sheet.$("#content");
      touch(content, "touchstart", [[100, 100]]);
      touch(content, "touchmove", [[100, 120]]);
      vi.advanceTimersByTime(durationMs);
      touch(content, "touchmove", [[100, 100 + distance]]);
      touch(content, "touchend", []);
      return sheet.onDismiss.mock.calls.length;
    };
    expect(pull(120, 1000)).toBe(1);
    expect(pull(60, 200)).toBe(1);
    expect(pull(60, 1000)).toBe(0);
  });

  it("side drawer: a mostly vertical move is let go, a mostly horizontal one toward dismiss is claimed", () => {
    const sheet = mount("right");
    const content = sheet.$("#content");
    touch(content, "touchstart", [[100, 100]]);
    touch(content, "touchmove", [[112, 140]]);
    expect(sheet.handler.getIsDragging()).toBe(false);
    expect(sheet.dragOffsets()).toEqual([]);
    touch(content, "touchend", []);

    touch(content, "touchstart", [[100, 100]]);
    touch(content, "touchmove", [[140, 112]]);
    expect(sheet.handler.getIsDragging()).toBe(true);
    touch(content, "touchend", []);
  });

  describe("a press that starts on a control needs a longer pull", () => {
    it("20 px straight down on a button reports nothing and keeps the click", () => {
      const sheet = mount();
      let clicks = 0;
      const button = sheet.$("#button");
      button.addEventListener("click", () => clicks++);
      swipe(button, [
        [100, 100],
        [100, 110],
        [100, 120],
      ]);
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(sheet.dragOffsets()).toEqual([]);
      expect(clicks).toBe(1);
    });

    it("60 px straight down on a button claims past 24 px and grows from 0 without a jump", () => {
      const sheet = mount();
      const path: Point[] = [];
      for (let y = 100; y <= 160; y += 2) path.push([100, y]);
      swipe(sheet.$("#button"), path);

      const offsets = sheet.dragOffsets();
      expect(offsets[0]).toBe(0);
      for (let i = 1; i < offsets.length; i++) {
        expect(offsets[i]! - offsets[i - 1]!).toBeGreaterThan(0);
        expect(offsets[i]! - offsets[i - 1]!).toBeLessThanOrEqual(2);
      }
      // Claimed at 26 px of travel, so the sheet ends 34 px down, not 60.
      expect(offsets.at(-1)).toBeGreaterThanOrEqual(30);
      expect(offsets.at(-1)).toBeLessThanOrEqual(36);
    });

    it("a fast 80 px pull that starts on a button still dismisses", () => {
      const sheet = mount();
      swipe(sheet.$("#button"), [
        [100, 100],
        [100, 120],
        [100, 180],
      ]);
      expect(sheet.onDismiss).toHaveBeenCalledOnce();
    });
  });

  describe("a floating layer over the sheet is not the sheet", () => {
    function mountLayered() {
      document.body.innerHTML = `
        <div id="sheet" role="dialog">
          <div id="sheet-content">Sequence</div>
          <div role="dialog" class="dialog-content"><div id="in-body-dialog">Save to library</div></div>
          <div id="popover" style="position: fixed"><div><div id="in-fixed">Motion</div></div></div>
          <div role="menu"><button id="in-menu">Left</button></div>
        </div>`;
      const el = document.querySelector<HTMLElement>("#sheet")!;
      const onDismiss = vi.fn();
      const onDragChange = vi.fn();
      const handler = new SwipeToDismiss({
        placement: "bottom",
        dismissible: true,
        onDismiss,
        onDragChange,
        // Not a marker: it must not switch the floating-layer rule off.
        ignoreSwipeBlock: true,
      });
      handler.attach(el);
      handlers.push(handler);
      const dragged = () => onDragChange.mock.calls.some(([, , dragging]) => dragging);
      return { onDismiss, dragged };
    }
    const straightPull: Point[] = [
      [100, 100],
      [100, 130],
      [100, 240],
    ];

    it.each(["#in-fixed", "#in-menu"])("a 140 px pull starting in %s leaves the sheet still", (selector) => {
      const sheet = mountLayered();
      const target = document.querySelector(selector)!;
      touch(target, "touchstart", [straightPull[0]!]);
      const move = touch(target, "touchmove", [straightPull[1]!]);
      touch(target, "touchmove", [straightPull[2]!]);
      touch(target, "touchend", []);
      expect(move.defaultPrevented).toBe(false);
      expect(sheet.dragged()).toBe(false);
      expect(sheet.onDismiss).not.toHaveBeenCalled();
    });

    it("a pull on the sheet's own dialog root still claims and dismisses", () => {
      const sheet = mountLayered();
      swipe(document.querySelector("#sheet-content")!, straightPull);
      expect(sheet.dragged()).toBe(true);
      expect(sheet.onDismiss).toHaveBeenCalledOnce();
    });

    it("a pull inside an in-flow dialog wrapping the sheet's body still claims and dismisses", () => {
      // Save to library, the inbox and the share and record sheets wrap their
      // whole body this way; pulling on it must still close them.
      const sheet = mountLayered();
      swipe(document.querySelector("#in-body-dialog")!, straightPull);
      expect(sheet.dragged()).toBe(true);
      expect(sheet.onDismiss).toHaveBeenCalledOnce();
    });

    it("a mouse drag inside the floating layer does not move the sheet", () => {
      const sheet = mountLayered();
      const target = document.querySelector("#in-fixed")!;
      mouse(target, "mousedown", [100, 100]);
      mouse(target, "mousemove", [100, 130]);
      mouse(target, "mousemove", [100, 240]);
      mouse(target, "mouseup", [100, 240]);
      expect(sheet.dragged()).toBe(false);
      expect(sheet.onDismiss).not.toHaveBeenCalled();
    });
  });

  it("mouse: a 30 px sideways drag with 8 px down does not move a bottom sheet", () => {
    const sheet = mount();
    const content = sheet.$("#content");
    mouse(content, "mousedown", [100, 100]);
    mouse(content, "mousemove", [130, 108]);
    mouse(content, "mousemove", [130, 220]);
    mouse(content, "mouseup", [130, 220]);
    expect(sheet.dragOffsets().filter((offset) => offset > 0)).toEqual([]);
    expect(sheet.onDismiss).not.toHaveBeenCalled();
  });
});
