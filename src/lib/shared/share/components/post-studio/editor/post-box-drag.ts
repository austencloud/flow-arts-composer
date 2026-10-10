import {
  POST_MIN_BOX_SIZE,
  clampBox,
  wrapDegrees,
  type PostBox,
} from "#lib/shared/media-composition/domain/post-project.js";

/**
 * Moving, resizing and turning an item's box on the preview. All values are
 * shares of the frame, so the math is the same at any preview size. A turned
 * box needs the frame's shape too, since a turn is the same angle in pixels
 * whatever the frame's width and height.
 */

export type BoxHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export const BOX_CORNERS = ["nw", "ne", "sw", "se"] as const;
export const BOX_SIDES = ["n", "e", "s", "w"] as const;

/** How close, as a share of the frame, a moved box snaps to a guide. */
export const BOX_SNAP_THRESHOLD = 0.015;

export interface BoxGuides {
  /** The box is centred across the frame. */
  vertical: boolean;
  /** The box is centred down the frame. */
  horizontal: boolean;
  /** The safe area's side that the box's left or right edge rests on. */
  safeX: "left" | "right" | null;
  /** The safe area's side that the box's top or bottom edge rests on. */
  safeY: "top" | "bottom" | null;
}

export interface DraggedBox {
  box: PostBox;
  guides: BoxGuides;
}

export const NO_GUIDES: BoxGuides = {
  vertical: false,
  horizontal: false,
  safeX: null,
  safeY: null,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** How far a box is turned, in degrees clockwise; a straight box is 0. */
export function boxTurn(box: PostBox): number {
  return box.turn ?? 0;
}

/**
 * A step across the frame turned back into the axes of a box turned `turn`
 * degrees, so what moves inside the box follows the pointer. The step must
 * be in square units, such as pixels.
 */
export function intoTurnedBox(
  dx: number,
  dy: number,
  turn: number
): [alongWidth: number, alongHeight: number] {
  if (!turn) return [dx, dy];
  const radians = (turn * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [dx * cos + dy * sin, -dx * sin + dy * cos];
}

/**
 * The box after dragging a handle by (dx, dy). A move snaps to the frame's
 * centre lines and edges, and to the sides of `safe`, the part of the post
 * nothing covers once it is up; a turned box's sides are not the frame's,
 * so it snaps by its centre alone. A corner scales about the opposite corner
 * and keeps the box's shape; a side moves that edge alone. The box never
 * leaves the frame or gets smaller than can be grabbed. `aspect` is the
 * frame's width over its height, which resizing a turned box needs.
 */
export function dragBox(
  start: PostBox,
  handle: BoxHandle,
  dx: number,
  dy: number,
  snap = true,
  safe: PostBox | null = null,
  aspect = 1
): DraggedBox {
  if (handle === "move") return moveBox(start, dx, dy, snap, safe);
  if (boxTurn(start) !== 0) {
    return { box: resizeTurned(start, handle, dx, dy, aspect), guides: NO_GUIDES };
  }
  const box = isCorner(handle)
    ? scaleBox(start, handle, dx, dy)
    : resizeSide(start, handle, dx, dy);
  return { box, guides: NO_GUIDES };
}

function isCorner(handle: BoxHandle): handle is (typeof BOX_CORNERS)[number] {
  return (BOX_CORNERS as readonly string[]).includes(handle);
}

function moveBox(
  start: PostBox,
  dx: number,
  dy: number,
  snap: boolean,
  safe: PostBox | null
): DraggedBox {
  const moved = clampBox({ ...start, x: start.x + dx, y: start.y + dy });
  if (!snap) return { box: moved, guides: NO_GUIDES };
  const sides = boxTurn(start) === 0;
  const x = snapAxis(
    moved.x,
    moved.width,
    sides && safe ? [safe.x, safe.x + safe.width] : null,
    sides
  );
  const y = snapAxis(
    moved.y,
    moved.height,
    sides && safe ? [safe.y, safe.y + safe.height] : null,
    sides
  );
  return {
    box: { ...moved, x: x.value, y: y.value },
    guides: {
      vertical: x.line === "centre",
      horizontal: y.line === "centre",
      safeX: x.line === "safe-start" ? "left" : x.line === "safe-end" ? "right" : null,
      safeY: y.line === "safe-start" ? "top" : y.line === "safe-end" ? "bottom" : null,
    },
  };
}

type SnapLine = "centre" | "safe-start" | "safe-end" | "edge";

/**
 * Snaps one axis to the nearest line in reach: the frame's centre, a side of
 * the safe area, or a frame edge; the centre wins a tie. A line the box
 * could only rest on by leaving the frame is never the nearest, since the
 * frame's own edge is nearer. Without `edges` only the centre snaps.
 */
function snapAxis(
  position: number,
  size: number,
  safe: readonly [start: number, end: number] | null,
  edges = true
): { value: number; line: SnapLine | null } {
  const targets: { value: number; line: SnapLine }[] = [
    { value: (1 - size) / 2, line: "centre" },
  ];
  if (safe) {
    targets.push(
      { value: safe[0], line: "safe-start" },
      { value: safe[1] - size, line: "safe-end" }
    );
  }
  if (edges) {
    targets.push({ value: 0, line: "edge" }, { value: 1 - size, line: "edge" });
  }

  let snapped: { value: number; line: SnapLine | null } = { value: position, line: null };
  let nearest = Infinity;
  for (const target of targets) {
    const distance = Math.abs(position - target.value);
    if (distance <= BOX_SNAP_THRESHOLD && distance < nearest) {
      snapped = target;
      nearest = distance;
    }
  }
  return snapped;
}

function resizeSide(
  start: PostBox,
  side: (typeof BOX_SIDES)[number],
  dx: number,
  dy: number
): PostBox {
  const right = start.x + start.width;
  const bottom = start.y + start.height;
  switch (side) {
    case "e":
      return {
        ...start,
        width: clamp(start.width + dx, POST_MIN_BOX_SIZE, 1 - start.x),
      };
    case "w": {
      const x = clamp(start.x + dx, 0, right - POST_MIN_BOX_SIZE);
      return { ...start, x, width: right - x };
    }
    case "s":
      return {
        ...start,
        height: clamp(start.height + dy, POST_MIN_BOX_SIZE, 1 - start.y),
      };
    case "n": {
      const y = clamp(start.y + dy, 0, bottom - POST_MIN_BOX_SIZE);
      return { ...start, y, height: bottom - y };
    }
  }
}

function scaleBox(
  start: PostBox,
  corner: "ne" | "nw" | "se" | "sw",
  dx: number,
  dy: number
): PostBox {
  const east = corner.endsWith("e");
  const south = corner.startsWith("s");
  // The axis the pointer moved further along, relative to the box, sets the
  // scale, so a drag along either edge feels the same.
  const alongX = (start.width + (east ? dx : -dx)) / start.width;
  const alongY = (start.height + (south ? dy : -dy)) / start.height;
  const wanted = Math.abs(alongX - 1) >= Math.abs(alongY - 1) ? alongX : alongY;

  // The fixed corner, and the room the frame leaves on the growing sides.
  const anchorX = east ? start.x : start.x + start.width;
  const anchorY = south ? start.y : start.y + start.height;
  const roomX = east ? 1 - anchorX : anchorX;
  const roomY = south ? 1 - anchorY : anchorY;
  const smallest = Math.max(
    POST_MIN_BOX_SIZE / start.width,
    POST_MIN_BOX_SIZE / start.height
  );
  const largest = Math.min(roomX / start.width, roomY / start.height);
  const scale = clamp(wanted, Math.min(smallest, largest), largest);

  const width = start.width * scale;
  const height = start.height * scale;
  return {
    x: east ? anchorX : anchorX - width,
    y: south ? anchorY : anchorY - height,
    width,
    height,
  };
}

/** Which way each handle points along the box's own width and height. */
const HANDLE_DIRECTION: Record<
  Exclude<BoxHandle, "move">,
  readonly [across: number, down: number]
> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
  ne: [1, -1],
  nw: [-1, -1],
  se: [1, 1],
  sw: [-1, 1],
};

/**
 * Resizing a turned box. Its handles move along the box's own sides, so the
 * pointer's drag is turned back onto them first. The point opposite the
 * handle stays put, as it does for a straight box, and the box stops growing
 * where its unturned rect would leave the frame. The math runs in frame
 * heights, so a turn keeps its angle in a frame of any shape.
 */
function resizeTurned(
  start: PostBox,
  handle: Exclude<BoxHandle, "move">,
  dx: number,
  dy: number,
  aspect: number
): PostBox {
  const wide = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const [across, down] = HANDLE_DIRECTION[handle];
  const radians = (boxTurn(start) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // A step along the box's own width and height, turned onto the frame.
  const onFrame = (u: number, v: number) => [u * cos - v * sin, u * sin + v * cos] as const;

  const startWidth = start.width * wide;
  const startHeight = start.height;
  const [alongWidth, alongHeight] = intoTurnedBox(dx * wide, dy, boxTurn(start));

  // The new size rides on one number: the scale for a corner, which keeps
  // the box's shape, or the width or height, as a share, for a side.
  let wanted: number;
  let smallest: number;
  let size: (t: number) => readonly [width: number, height: number];
  if (across !== 0 && down !== 0) {
    const byWidth = (startWidth + across * alongWidth) / startWidth;
    const byHeight = (startHeight + down * alongHeight) / startHeight;
    wanted = Math.abs(byWidth - 1) >= Math.abs(byHeight - 1) ? byWidth : byHeight;
    smallest = Math.max(POST_MIN_BOX_SIZE / start.width, POST_MIN_BOX_SIZE / start.height);
    size = (t) => [startWidth * t, startHeight * t];
  } else if (across !== 0) {
    wanted = (startWidth + across * alongWidth) / wide;
    smallest = POST_MIN_BOX_SIZE;
    size = (t) => [t * wide, startHeight];
  } else {
    wanted = startHeight + down * alongHeight;
    smallest = POST_MIN_BOX_SIZE;
    size = (t) => [startWidth, t];
  }

  const [backX, backY] = onFrame((-across * startWidth) / 2, (-down * startHeight) / 2);
  const anchorX = (start.x + start.width / 2) * wide + backX;
  const anchorY = start.y + start.height / 2 + backY;
  const rectAt = (t: number) => {
    const [width, height] = size(t);
    const [outX, outY] = onFrame((across * width) / 2, (down * height) / 2);
    return {
      left: anchorX + outX - width / 2,
      top: anchorY + outY - height / 2,
      width,
      height,
    };
  };
  // The unturned rect's room to each frame edge. Each is a straight line in
  // t, so its ends at 0 and 1 give the t where it runs out.
  const room = (t: number) => {
    const rect = rectAt(t);
    return [
      rect.left,
      wide - rect.left - rect.width,
      rect.top,
      1 - rect.top - rect.height,
    ];
  };
  const atZero = room(0);
  const atOne = room(1);
  let lowest = smallest;
  let largest = Infinity;
  atZero.forEach((value, index) => {
    const slope = atOne[index]! - value;
    if (slope > 1e-12) lowest = Math.max(lowest, -value / slope);
    else if (slope < -1e-12) largest = Math.min(largest, value / -slope);
  });
  const rect = rectAt(clamp(wanted, Math.min(lowest, largest), largest));
  return clampBox({
    x: rect.left / wide,
    y: rect.top,
    width: rect.width / wide,
    height: rect.height,
    turn: boxTurn(start),
  });
}

/** Arrow-key nudges: one step, or a larger one with Shift. */
export const BOX_NUDGE = { step: 0.005, large: 0.05 } as const;

/** A value typed for a box: its left or top edge, its width or its height. */
export type BoxField = "x" | "y" | "width" | "height";

/**
 * A box with one value typed, as a share of the frame. A move keeps the
 * size and a resize keeps the top left corner; `keepShape` holds the box's
 * proportions, so the other side follows. The box stays in the frame and
 * above the smallest size, shifted back inside rather than cut.
 */
export function typeBox(
  start: PostBox,
  field: BoxField,
  value: number,
  keepShape: boolean
): PostBox {
  if (!Number.isFinite(value)) return start;
  if (field === "x") return clampBox({ ...start, x: value });
  if (field === "y") return clampBox({ ...start, y: value });
  if (!keepShape) {
    return clampBox(
      field === "width" ? { ...start, width: value } : { ...start, height: value }
    );
  }
  const wanted = field === "width" ? value / start.width : value / start.height;
  const smallest = Math.max(
    POST_MIN_BOX_SIZE / start.width,
    POST_MIN_BOX_SIZE / start.height
  );
  const largest = Math.min(1 / start.width, 1 / start.height);
  const scale = clamp(wanted, Math.min(smallest, largest), largest);
  return clampBox({
    ...start,
    width: start.width * scale,
    height: start.height * scale,
  });
}

/** How near, in degrees, a turn comes before it snaps straight or square. */
export const TURN_SNAP_DEGREES = 4;

/** The steps a turn takes with Shift held, in degrees. */
export const TURN_STEP_DEGREES = 15;

/**
 * How a turn lands: by default it snaps straight or to a quarter turn when
 * near one, in steps holds it to 15° steps, and free leaves it where the
 * pointer is.
 */
export type TurnMode = "snap" | "step" | "free";

/**
 * The box's turn after the pointer sweeps `swept` degrees clockwise about
 * its centre, wrapped to -180 to 180.
 */
export function turnBox(start: PostBox, swept: number, mode: TurnMode): number {
  const turn = boxTurn(start) + swept;
  if (mode === "step") {
    return wrapDegrees(Math.round(turn / TURN_STEP_DEGREES) * TURN_STEP_DEGREES);
  }
  if (mode === "snap") {
    const square = Math.round(turn / 90) * 90;
    if (Math.abs(turn - square) <= TURN_SNAP_DEGREES) return wrapDegrees(square);
  }
  return wrapDegrees(turn);
}

/**
 * Whether a point, as shares of the frame, lies on the box as it is shown,
 * turn and all. `aspect` is the frame's width over its height.
 */
export function boxContains(box: PostBox, x: number, y: number, aspect = 1): boolean {
  const wide = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const [alongWidth, alongHeight] = intoTurnedBox(
    (x - box.x - box.width / 2) * wide,
    y - box.y - box.height / 2,
    boxTurn(box)
  );
  return (
    Math.abs(alongWidth) <= (box.width * wide) / 2 &&
    Math.abs(alongHeight) <= box.height / 2
  );
}

/** Each handle's direction out of the box, in degrees clockwise from east. */
const HANDLE_ANGLE: Record<Exclude<BoxHandle, "move">, number> = {
  e: 0,
  se: 45,
  s: 90,
  sw: 135,
  w: 180,
  nw: -135,
  n: -90,
  ne: -45,
};

const RESIZE_CURSORS = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"] as const;

/** The resize cursor that points the way a handle pulls once the box is turned. */
export function handleCursor(
  handle: Exclude<BoxHandle, "move">,
  turn: number
): (typeof RESIZE_CURSORS)[number] {
  const angle = (((HANDLE_ANGLE[handle] + turn) % 180) + 180) % 180;
  return RESIZE_CURSORS[Math.round(angle / 45) % 4]!;
}

/** How far the turn handle sits past the box's top edge, in pixels. */
export const TURN_HANDLE_GAP = 36;

/** The least room kept between the turn handle and the frame's edge, in pixels. */
const TURN_HANDLE_MARGIN = 16;

/**
 * Where the turn handle goes on a box shown on a stage this many pixels
 * wide and high: past the box's top edge, as its turn has it, or past the
 * bottom when the top would put it off the frame, or just inside the top
 * when neither fits.
 */
export function turnHandleSide(
  box: PostBox,
  stage: { width: number; height: number }
): "above" | "below" | "inside" {
  const radians = (boxTurn(box) * Math.PI) / 180;
  const centreX = (box.x + box.width / 2) * stage.width;
  const centreY = (box.y + box.height / 2) * stage.height;
  const reach = (box.height * stage.height) / 2 + TURN_HANDLE_GAP;
  // The box's own up, on the stage.
  const upX = Math.sin(radians);
  const upY = -Math.cos(radians);
  const fits = (x: number, y: number) =>
    x >= TURN_HANDLE_MARGIN &&
    x <= stage.width - TURN_HANDLE_MARGIN &&
    y >= TURN_HANDLE_MARGIN &&
    y <= stage.height - TURN_HANDLE_MARGIN;
  if (fits(centreX + upX * reach, centreY + upY * reach)) return "above";
  if (fits(centreX - upX * reach, centreY - upY * reach)) return "below";
  return "inside";
}
