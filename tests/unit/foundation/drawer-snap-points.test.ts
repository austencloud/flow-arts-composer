import { describe, expect, it, vi } from "vitest";
import { SnapPoints } from "$lib/shared/foundation/ui/drawer/snap-points";
import { SwipeToDismiss } from "$lib/shared/foundation/ui/drawer/swipe-to-dismiss";

describe("bottom drawer height stops", () => {
  it("expands on an upward pull and returns through the compact and closed stops", () => {
    const points = new SnapPoints({
      placement: "bottom",
      snapPoints: [0, 300, 760],
      defaultSnapPoint: 1,
    });
    points.initialize(680, 1080);

    expect(points.snapToClosest(-260, 0.2, 1000)).toBe(2);
    expect(points.snapToClosest(260, 0.2, 1000)).toBe(1);
    expect(points.snapToClosest(180, 0.2, 1000)).toBe(0);
  });

  it("keeps content gestures separate from the handle drag", () => {
    document.body.innerHTML =
      '<div id="drawer"><div class="drawer-handle"></div><button>Display</button></div>';
    const drawer = document.querySelector<HTMLElement>("#drawer")!;
    const handle = drawer.querySelector<HTMLElement>(".drawer-handle")!;
    const button = drawer.querySelector<HTMLButtonElement>("button")!;
    const onDragEnd = vi.fn(() => true);
    const swipe = new SwipeToDismiss({
      placement: "bottom",
      dismissible: true,
      onDismiss: vi.fn(),
      onDragEnd,
      allowReverseDrag: true,
      dragHandleOnly: true,
    });
    swipe.attach(drawer);

    const mouse = (target: Element, type: string, y: number) =>
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y })
      );
    mouse(button, "mousedown", 300);
    mouse(drawer, "mousemove", 150);
    mouse(drawer, "mouseup", 150);
    expect(onDragEnd).not.toHaveBeenCalled();

    mouse(handle, "mousedown", 300);
    mouse(drawer, "mousemove", 290);
    mouse(drawer, "mousemove", 150);
    mouse(drawer, "mouseup", 150);
    expect(onDragEnd).toHaveBeenCalledWith(
      -150,
      expect.any(Number),
      expect.any(Number)
    );
    swipe.detach();
  });

  it("keeps the closing direction correct for a top drawer", () => {
    const points = new SnapPoints({
      placement: "top",
      snapPoints: [0, 300, 760],
      defaultSnapPoint: 1,
    });
    points.initialize(680, 1080);

    expect(points.snapToClosest(-180, 0.2, 1000)).toBe(0);
  });
});
