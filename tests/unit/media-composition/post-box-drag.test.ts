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
    expect(nearCentre.guides).toEqual({ vertical: true, horizontal: false });
    const clear = dragBox(box, "move", 0.1 - BOX_SNAP_THRESHOLD * 2, 0);
    expect(clear.guides.vertical).toBe(false);
  });

  it("snaps a moved box to a frame edge", () => {
    close(dragBox(box, "move", -0.19, 0).box.x, 0);
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
