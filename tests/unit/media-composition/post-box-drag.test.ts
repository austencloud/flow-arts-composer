import { describe, expect, it } from "vitest";
import {
  BOX_SNAP_THRESHOLD,
  NO_GUIDES,
  TURN_SNAP_DEGREES,
  TURN_STEP_DEGREES,
  boxContains,
  dragBox,
  handleCursor,
  intoTurnedBox,
  turnBox,
  turnHandleSide,
  typeBox,
} from "#lib/shared/share/components/post-studio/editor/post-box-drag.js";
import {
  POST_MIN_BOX_SIZE,
  PostBoxSchema,
  type PostBox,
} from "#lib/shared/media-composition/domain/post-project.js";
import { postSafeArea } from "#lib/shared/media-composition/domain/post-canvas.js";

const box = { x: 0.2, y: 0.3, width: 0.4, height: 0.2 };

/** A 9:16 frame's width over its height. */
const TALL = 9 / 16;

function close(actual: number, expected: number) {
  expect(actual).toBeCloseTo(expected, 9);
}

/**
 * Where a point of a box shows on the frame, turn and all, as shares of the
 * frame: `across` and `down` run -1 to 1 over its own width and height.
 */
function pointOf(
  b: PostBox,
  across: number,
  down: number,
  aspect = 1
): [number, number] {
  const radians = ((b.turn ?? 0) * Math.PI) / 180;
  const u = (across * b.width * aspect) / 2;
  const v = (down * b.height) / 2;
  const x =
    (b.x + b.width / 2) * aspect +
    u * Math.cos(radians) -
    v * Math.sin(radians);
  const y = b.y + b.height / 2 + u * Math.sin(radians) + v * Math.cos(radians);
  return [x / aspect, y];
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

describe("dragBox on a turned box", () => {
  const turned: PostBox = { x: 0.3, y: 0.4, width: 0.4, height: 0.2, turn: 30 };

  it("moves it by its centre alone, since its sides are not the frame's", () => {
    const tilted = { ...box, turn: 30 };
    // A straight box this near the left edge snaps onto it.
    const nearEdge = dragBox(tilted, "move", -0.19, 0);
    close(nearEdge.box.x, 0.01);
    expect(nearEdge.box.turn).toBe(30);
    const nearCentre = dragBox(tilted, "move", 0.1 - BOX_SNAP_THRESHOLD / 2, 0);
    close(nearCentre.box.x, 0.3);
    expect(nearCentre.guides.vertical).toBe(true);
    // Where a straight box rests on the safe area's sides, a turned one stays put.
    const nearSafe = dragBox(
      tilted,
      "move",
      -0.13,
      -0.155,
      true,
      postSafeArea("9:16")
    );
    close(nearSafe.box.x, 0.07);
    close(nearSafe.box.y, 0.145);
    expect(nearSafe.guides).toEqual(NO_GUIDES);
  });

  it("holds the point opposite the handle where it was, turn and all", () => {
    const handles = [
      ["se", 1, 1],
      ["nw", -1, -1],
      ["ne", 1, -1],
      ["e", 1, 0],
      ["n", 0, -1],
      ["w", -1, 0],
    ] as const;
    for (const [handle, across, down] of handles) {
      const resized = dragBox(turned, handle, 0.02, 0.01, true, null, TALL).box;
      expect(resized.turn).toBe(30);
      const [x, y] = pointOf(resized, -across, -down, TALL);
      const [startX, startY] = pointOf(turned, -across, -down, TALL);
      close(x, startX);
      close(y, startY);
    }
  });

  it("scales from a corner along the box's own diagonal, keeping its shape", () => {
    // Turned a quarter, the se corner sits at (0.4, 0.7) and the nw at
    // (0.6, 0.3). Pulled a tenth further along that line, the box grows a
    // tenth.
    const quarter: PostBox = { ...turned, turn: 90 };
    const grown = dragBox(quarter, "se", -0.02, 0.04).box;
    close(grown.width, 0.44);
    close(grown.height, 0.22);
    close(grown.x, 0.27);
    close(grown.y, 0.41);
    expect(grown.turn).toBe(90);
  });

  it("moves one side along the box's own width, however the frame is shaped", () => {
    // Turned a quarter on a tall frame, the east side faces down the frame.
    const bar: PostBox = {
      x: 0.25,
      y: 0.45,
      width: 0.5,
      height: 0.1,
      turn: 90,
    };
    const longer = dragBox(bar, "e", 0, 0.05, true, null, TALL).box;
    close(longer.width, 0.5 + 0.05 / TALL);
    close(longer.height, 0.1);
    close(longer.x + longer.width / 2, 0.5);
    close(longer.y, 0.475);
    const [westX, westY] = pointOf(longer, -1, 0, TALL);
    const [startX, startY] = pointOf(bar, -1, 0, TALL);
    close(westX, startX);
    close(westY, startY);
  });

  it("stops where the unturned box would leave the frame, still valid", () => {
    for (const handle of ["se", "nw", "e", "s"] as const) {
      const huge = dragBox(turned, handle, 5, 5, true, null, TALL).box;
      expect(PostBoxSchema.safeParse(huge).success).toBe(true);
      expect(huge.turn).toBe(30);
      const tiny = dragBox(turned, handle, -5, -5, true, null, TALL).box;
      expect(PostBoxSchema.safeParse(tiny).success).toBe(true);
      expect(Math.min(tiny.width, tiny.height)).toBeGreaterThanOrEqual(
        POST_MIN_BOX_SIZE - 1e-9
      );
    }
    const huge = dragBox(turned, "se", 5, 5, true, null, TALL).box;
    const [x, y] = pointOf(huge, -1, -1, TALL);
    const [startX, startY] = pointOf(turned, -1, -1, TALL);
    close(x, startX);
    close(y, startY);
    close(huge.width / huge.height, 2);
  });

  it("resizes a barely turned box as a straight one", () => {
    const drags = [
      ["se", 0.2, 0],
      ["nw", 0.2, 0],
      ["e", 0.1, 0.3],
      ["w", -0.5, 0],
      ["n", 0, 0.5],
      ["se", 5, 5],
      ["se", -5, -5],
    ] as const;
    for (const [handle, dx, dy] of drags) {
      const straight = dragBox(box, handle, dx, dy).box;
      const barely = dragBox(
        { ...box, turn: 1e-9 },
        handle,
        dx,
        dy,
        true,
        null,
        TALL
      ).box;
      for (const field of ["x", "y", "width", "height"] as const) {
        expect(barely[field]).toBeCloseTo(straight[field], 6);
      }
    }
  });
});

describe("turnBox", () => {
  it("snaps to straight or a quarter turn when near one", () => {
    expect(turnBox(box, 3, "snap")).toBe(0);
    expect(turnBox(box, 88, "snap")).toBe(90);
    expect(turnBox(box, 90 + TURN_SNAP_DEGREES, "snap")).toBe(90);
    expect(turnBox(box, 95, "snap")).toBe(95);
    expect(turnBox({ ...box, turn: 45 }, 44, "snap")).toBe(90);
  });

  it("turns in steps with Shift and freely with Alt", () => {
    expect(TURN_STEP_DEGREES).toBe(15);
    expect(turnBox(box, 22, "step")).toBe(15);
    expect(turnBox(box, 23, "step")).toBe(30);
    expect(turnBox(box, 3, "free")).toBe(3);
    expect(turnBox({ ...box, turn: 45 }, 10, "free")).toBe(55);
  });

  it("wraps past half a turn to the other side", () => {
    expect(turnBox({ ...box, turn: 170 }, 30, "free")).toBe(-160);
    expect(turnBox({ ...box, turn: 170 }, 12, "snap")).toBe(180);
    expect(turnBox({ ...box, turn: 10 }, 350, "snap")).toBe(0);
  });
});

describe("boxContains", () => {
  it("finds a point on the box as it shows, turned", () => {
    // Turned a quarter, a wide bar stands upright.
    const bar: PostBox = { x: 0.3, y: 0.45, width: 0.4, height: 0.1, turn: 90 };
    expect(boxContains(bar, 0.5, 0.35)).toBe(true);
    expect(boxContains(bar, 0.35, 0.5)).toBe(false);
    expect(
      boxContains({ x: 0.3, y: 0.45, width: 0.4, height: 0.1 }, 0.35, 0.5)
    ).toBe(true);
  });

  it("measures the turn in pixels on a frame of any shape", () => {
    // 0.5 of a 9:16 frame's width is 0.28 of its height: stood upright, the
    // bar reaches 0.14 above and below its centre, and 0.05 of the height,
    // about 0.089 of the width, to each side.
    const bar: PostBox = {
      x: 0.25,
      y: 0.45,
      width: 0.5,
      height: 0.1,
      turn: 90,
    };
    expect(boxContains(bar, 0.5, 0.64, TALL)).toBe(true);
    expect(boxContains(bar, 0.5, 0.65, TALL)).toBe(false);
    expect(boxContains(bar, 0.58, 0.5, TALL)).toBe(true);
    expect(boxContains(bar, 0.6, 0.5, TALL)).toBe(false);
  });
});

describe("handleCursor", () => {
  it("points each handle's usual way on a straight box", () => {
    expect(handleCursor("e", 0)).toBe("ew-resize");
    expect(handleCursor("w", 0)).toBe("ew-resize");
    expect(handleCursor("n", 0)).toBe("ns-resize");
    expect(handleCursor("s", 0)).toBe("ns-resize");
    expect(handleCursor("nw", 0)).toBe("nwse-resize");
    expect(handleCursor("se", 0)).toBe("nwse-resize");
    expect(handleCursor("ne", 0)).toBe("nesw-resize");
    expect(handleCursor("sw", 0)).toBe("nesw-resize");
  });

  it("turns with the box to the nearest of the four", () => {
    expect(handleCursor("e", 90)).toBe("ns-resize");
    expect(handleCursor("n", 90)).toBe("ew-resize");
    expect(handleCursor("nw", 90)).toBe("nesw-resize");
    expect(handleCursor("e", 45)).toBe("nwse-resize");
    expect(handleCursor("n", 45)).toBe("nesw-resize");
    expect(handleCursor("e", -45)).toBe("nesw-resize");
    expect(handleCursor("e", 170)).toBe("ew-resize");
  });
});

describe("turnHandleSide", () => {
  const stage = { width: 360, height: 640 };

  it("sits above the box, or below it where the top has no room", () => {
    expect(
      turnHandleSide({ x: 0.3, y: 0.4, width: 0.4, height: 0.2 }, stage)
    ).toBe("above");
    expect(
      turnHandleSide({ x: 0.3, y: 0, width: 0.4, height: 0.2 }, stage)
    ).toBe("below");
    expect(turnHandleSide({ x: 0, y: 0, width: 1, height: 1 }, stage)).toBe(
      "inside"
    );
  });

  it("follows the box's own top as it turns", () => {
    // Upside down at the bottom, its top faces the frame's bottom edge.
    expect(
      turnHandleSide(
        { x: 0.3, y: 0.8, width: 0.4, height: 0.2, turn: 180 },
        stage
      )
    ).toBe("below");
    // A quarter turn at the right edge points its top off the frame.
    expect(
      turnHandleSide(
        { x: 0.6, y: 0.4, width: 0.4, height: 0.2, turn: 90 },
        stage
      )
    ).toBe("below");
  });
});

describe("intoTurnedBox", () => {
  it("turns a step across the frame into the box's own axes", () => {
    const [alongWidth, alongHeight] = intoTurnedBox(1, 0, 90);
    close(alongWidth, 0);
    close(alongHeight, -1);
    expect(intoTurnedBox(0.3, -0.2, 0)).toEqual([0.3, -0.2]);
    // Out of the box and back again.
    const radians = (30 * Math.PI) / 180;
    const [back, down] = intoTurnedBox(
      2 * Math.cos(radians) - 1 * Math.sin(radians),
      2 * Math.sin(radians) + 1 * Math.cos(radians),
      30
    );
    close(back, 2);
    close(down, 1);
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
