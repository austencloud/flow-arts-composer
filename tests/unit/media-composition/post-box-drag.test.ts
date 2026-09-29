import { describe, expect, it } from "vitest";
import {
  BOX_SNAP_THRESHOLD,
  dragBox,
  typeBox,
} from "$lib/shared/share/components/post-studio/editor/post-box-drag";
import {
  POST_MIN_BOX_SIZE,
  PostBoxSchema,
} from "$lib/shared/media-composition/domain/post-project";
import { postSafeArea } from "$lib/shared/media-composition/domain/post-canvas";

const box = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 };

function close(actual: number, expected: number) {
  expect(actual).toBeCloseTo(expected, 9);
}

describe("dragBox", () => {
  it("moves a box and keeps it inside the frame", () => {
    const moved = dragBox(box, "move", 0.1, -0.05, false).box;
    close(moved.x, 0.3);
    close(moved.y, 0.25);
    const pushed = dragBox(box, "move", 0.9, 0.9, false).box;
    close(pushed.x, 0.6);
    close(pushed.y, 0.8);
    expect(PostBoxSchema.safeParse(pushed).success).toBe(true);
  });

  it("snaps a moved box to the frame's centre and says so", () => {
    const nearCentre = dragBox(box, "move", 0.1 - BOX_SNAP_THRESHOLD / 2, 0);
    close(nearCentre.box.x, 0.3);
    expect(nearCentre.guides).toEqual({
      vertical: true,
      horizontal: false,
      safeX: null,
      safeY: null,
    });
    const clear = dragBox(box, "move", 0.1 - BOX_SNAP_THRESHOLD * 2, 0);
    expect(clear.guides.vertical).toBe(false);
  });

  it("snaps a moved box to a frame edge", () => {
    close(dragBox(box, "move", -0.19, 0).box.x, 0);
  });

  describe("on a post with a safe area", () => {
    const safe = postSafeArea("9:16")!;

    it("rests a box's edges on the safe area's sides and says which", () => {
      // Left edge near 6%, top edge near 14%.
      const topLeft = dragBox(box, "move", -0.13, -0.155, true, safe);
      close(topLeft.box.x, safe.x);
      close(topLeft.box.y, safe.y);
      expect(topLeft.guides).toMatchObject({ safeX: "left", safeY: "top" });
      // Right edge near 94%, bottom edge near 65%.
      const bottomRight = dragBox(box, "move", 0.335, 0.155, true, safe);
      close(bottomRight.box.x + bottomRight.box.width, safe.x + safe.width);
      close(bottomRight.box.y + bottomRight.box.height, safe.y + safe.height);
      expect(bottomRight.guides).toMatchObject({
        safeX: "right",
        safeY: "bottom",
      });
    });

    it("leaves the box where it was dropped without one, or with Alt held", () => {
      const withoutSafe = dragBox(box, "move", -0.13, 0);
      close(withoutSafe.box.x, 0.07);
      expect(withoutSafe.guides.safeX).toBeNull();
      const altHeld = dragBox(box, "move", -0.13, 0, false, safe);
      close(altHeld.box.x, 0.07);
      expect(altHeld.guides.safeX).toBeNull();
    });

    it("takes the nearest line when several are in reach", () => {
      // 86% wide: centred at 7%, between the safe sides' 6% and 8%.
      const wide = { x: 0.064, y: 0.3, width: 0.86, height: 0.2 };
      const nearLeft = dragBox(wide, "move", 0, 0, true, safe);
      close(nearLeft.box.x, 0.06);
      expect(nearLeft.guides).toMatchObject({ vertical: false, safeX: "left" });
      const nearCentre = dragBox(wide, "move", 0.004, 0, true, safe);
      close(nearCentre.box.x, 0.07);
      expect(nearCentre.guides).toMatchObject({ vertical: true, safeX: null });
    });
  });

  it("moves one edge with a side handle", () => {
    const wider = dragBox(box, "e", 0.1, 0.3).box;
    expect(wider).toMatchObject({ x: 0.2, y: 0.3, height: 0.2 });
    close(wider.width, 0.5);
    const left = dragBox(box, "w", -0.5, 0).box;
    close(left.x, 0);
    close(left.width, 0.6);
    const flat = dragBox(box, "n", 0, 0.5).box;
    close(flat.height, POST_MIN_BOX_SIZE);
    close(flat.y + flat.height, 0.5);
  });

  it("scales from a corner about the opposite corner, keeping the shape", () => {
    const bigger = dragBox(box, "se", 0.2, 0).box;
    close(bigger.x, 0.2);
    close(bigger.y, 0.3);
    close(bigger.width, 0.6);
    close(bigger.height, 0.3);
    const fromTopLeft = dragBox(box, "nw", 0.2, 0).box;
    close(fromTopLeft.width, 0.2);
    close(fromTopLeft.height, 0.1);
    close(fromTopLeft.x + fromTopLeft.width, 0.6);
    close(fromTopLeft.y + fromTopLeft.height, 0.5);
  });

  it("stops a corner scale at the frame and at the smallest box", () => {
    const huge = dragBox(box, "se", 5, 5).box;
    close(huge.width / huge.height, 2);
    expect(huge.x + huge.width).toBeLessThanOrEqual(1 + 1e-9);
    expect(huge.y + huge.height).toBeLessThanOrEqual(1 + 1e-9);
    const tiny = dragBox(box, "se", -5, -5).box;
    close(tiny.height, POST_MIN_BOX_SIZE);
    close(tiny.width, POST_MIN_BOX_SIZE * 2);
    expect(PostBoxSchema.safeParse(tiny).success).toBe(true);
  });
});

describe("typeBox", () => {
  it("moves a box to a typed place and keeps it inside the frame", () => {
    expect(typeBox(box, "x", 0.5, false)).toMatchObject({ x: 0.5, y: 0.3 });
    const pushed = typeBox(box, "x", 0.9, false);
    close(pushed.x, 0.6);
    close(typeBox(box, "y", -1, false).y, 0);
  });

  it("sizes a box from its top-left corner", () => {
    const wider = typeBox(box, "width", 0.5, false);
    expect(wider).toMatchObject({ x: 0.2, y: 0.3, height: 0.2 });
    close(wider.width, 0.5);
    // Too wide to fit where it is: shifted back inside, not cut.
    const widest = typeBox(box, "width", 0.9, false);
    close(widest.x, 0.1);
    close(widest.width, 0.9);
    close(typeBox(box, "height", 0, false).height, POST_MIN_BOX_SIZE);
  });

  it("keeps a shaped box's proportions, within the frame", () => {
    const doubled = typeBox(box, "width", 0.8, true);
    close(doubled.width, 0.8);
    close(doubled.height, 0.4);
    // Wider than the frame allows: as large as it fits, still 2 to 1.
    const largest = typeBox(box, "height", 0.9, true);
    close(largest.x, 0);
    close(largest.width, 1);
    close(largest.height, 0.5);
    const smallest = typeBox(box, "width", 0, true);
    close(smallest.width, 0.1);
    close(smallest.height, POST_MIN_BOX_SIZE);
  });

  it("ignores a value that is not a number", () => {
    expect(typeBox(box, "x", Number.NaN, false)).toBe(box);
  });
});
