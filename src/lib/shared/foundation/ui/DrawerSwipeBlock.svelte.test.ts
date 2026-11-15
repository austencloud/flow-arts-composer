/**
 * A drag that starts in a region that owns its own vertical gestures must not
 * close the sheet around it.
 *
 * Silent when it regresses: the sheet still opens and the region still works,
 * until someone drags down on the 3D view to orbit the camera and the whole
 * sequence viewer slides away. The sheet's swipe handler lives in
 * `@austencloud/drawer` and does not read `data-swipe-block`, so these run
 * against the real Drawer with a real finger, not against a stand-in.
 */
import { render } from "vitest-browser-svelte";
import { commands } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloseReason } from "@austencloud/drawer";

import DrawerSwipeBlockTestHarness from "./DrawerSwipeBlockTestHarness.svelte";

type OnClose = (event: CustomEvent<{ reason: CloseReason }>) => void;

function settle(ms = 200) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function drawer(): HTMLDialogElement | null {
  return document.querySelector<HTMLDialogElement>("dialog.drawer-content");
}

// The dialog stays mounted and `open` through its exit slide; `data-state`
// flips on the tick the close is accepted.
function isDismissed(): boolean {
  const dialog = drawer();
  if (!dialog) return true;
  return dialog.dataset.state === "closed" || !dialog.open;
}

function centreOf(testId: string) {
  const rect = document
    .querySelector<HTMLElement>(`[data-testid="${testId}"]`)!
    .getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** A quick 200px pull down, well past the sheet's dismiss threshold. */
async function touchDragDown(testId: string) {
  const from = centreOf(testId);
  const to = { x: from.x, y: Math.min(from.y + 200, innerHeight - 4) };
  await commands.dispatchRealTouchDrag(from, to, {
    steps: 10,
    stepDelayMs: 16,
  });
}

function mouseDragDown(testId: string) {
  const target = document.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`
  )!;
  const from = centreOf(testId);
  const fire = (type: string, y: number) =>
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: type === "mouseup" ? 0 : 1,
        clientX: from.x,
        clientY: y,
      })
    );
  fire("mousedown", from.y);
  for (let step = 1; step <= 8; step++) fire("mousemove", from.y + step * 25);
  fire("mouseup", from.y + 200);
}

describe("Drawer swipe-to-close and regions that own their drags", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("still closes on a touch drag down over ordinary sheet content", async () => {
    const onclose = vi.fn<OnClose>();
    render(DrawerSwipeBlockTestHarness, { isOpen: true, onclose });
    await settle(500);

    await touchDragDown("plain");
    await settle(300);

    // The control: the gesture in these tests is one the sheet does act on.
    expect(isDismissed(), "sheet closes from ordinary content").toBe(true);
    expect(onclose.mock.calls[0]?.[0].detail.reason).toBe("swipe");
  });

  it("stays open on a touch drag down that starts in the blocked region", async () => {
    const onclose = vi.fn<OnClose>();
    render(DrawerSwipeBlockTestHarness, { isOpen: true, onclose });
    await settle(500);
    const dialog = drawer()!;
    let followedTheFinger = false;
    const watch = new MutationObserver(() => {
      if (dialog.classList.contains("dragging")) followedTheFinger = true;
    });
    watch.observe(dialog, { attributes: true, attributeFilter: ["class"] });

    await touchDragDown("stage-canvas");
    await settle(300);
    watch.disconnect();

    expect(isDismissed(), "sheet survives a drag on the region").toBe(false);
    expect(onclose).not.toHaveBeenCalled();
    // Not closing is not enough: a sheet that slides with the finger and
    // springs back still fights the region's own drag.
    expect(followedTheFinger, "sheet never moved with the finger").toBe(false);
  });

  it("stays open on a mouse drag down that starts in the blocked region", async () => {
    const onclose = vi.fn<OnClose>();
    render(DrawerSwipeBlockTestHarness, { isOpen: true, onclose });
    await settle(500);

    mouseDragDown("stage-canvas");
    await settle(300);

    expect(isDismissed(), "sheet survives a mouse drag on the region").toBe(
      false
    );
    expect(onclose).not.toHaveBeenCalled();
  });

  it("leaves the region's own input alone", async () => {
    render(DrawerSwipeBlockTestHarness, { isOpen: true });
    await settle(500);
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="stage-canvas"]'
    )!;
    const seen: string[] = [];
    for (const type of [
      "pointerdown",
      "pointermove",
      "touchstart",
      "mousedown",
    ]) {
      canvas.addEventListener(type, () => {
        if (!seen.includes(type)) seen.push(type);
      });
    }

    await touchDragDown("stage-canvas");
    mouseDragDown("stage-canvas");

    // Blocking the sheet must not swallow what the region itself listens to.
    expect(seen).toEqual(
      expect.arrayContaining([
        "pointerdown",
        "pointermove",
        "touchstart",
        "mousedown",
      ])
    );
  });
});
