import {
  POST_MIN_BOX_SIZE,
  clampBox,
  type PostBox,
} from "$lib/shared/media-composition/domain/post-project";

/**
 * Moving and resizing an item's box on the preview. All values are shares of
 * the frame, so the math is the same at any preview size.
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
}

export interface DraggedBox {
  box: PostBox;
  guides: BoxGuides;
}

const NO_GUIDES: BoxGuides = { vertical: false, horizontal: false };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The box after dragging a handle by (dx, dy). A move snaps to the frame's
 * centre lines and edges; a corner scales about the opposite corner and keeps
 * the box's shape; a side moves that edge alone. The box never leaves the
 * frame or gets smaller than can be grabbed.
 */
export function dragBox(
  start: PostBox,
  handle: BoxHandle,
  dx: number,
  dy: number,
  snap = true
): DraggedBox {
  if (handle === "move") return moveBox(start, dx, dy, snap);
  const box = isCorner(handle)
    ? scaleBox(start, handle, dx, dy)
    : resizeSide(start, handle, dx, dy);
  return { box, guides: NO_GUIDES };
}

function isCorner(handle: BoxHandle): handle is (typeof BOX_CORNERS)[number] {
  return (BOX_CORNERS as readonly string[]).includes(handle);
}

function moveBox(start: PostBox, dx: number, dy: number, snap: boolean): DraggedBox {
  const moved = clampBox({ ...start, x: start.x + dx, y: start.y + dy });
  if (!snap) return { box: moved, guides: NO_GUIDES };
  const x = snapAxis(moved.x, moved.width);
  const y = snapAxis(moved.y, moved.height);
  return {
    box: { ...moved, x: x.value, y: y.value },
    guides: { vertical: x.centred, horizontal: y.centred },
  };
}

/** Snaps one axis to the frame's centre, then to its edges. */
function snapAxis(
  position: number,
  size: number
): { value: number; centred: boolean } {
  const centred = (1 - size) / 2;
  if (Math.abs(position - centred) <= BOX_SNAP_THRESHOLD) {
    return { value: centred, centred: true };
  }
  if (Math.abs(position) <= BOX_SNAP_THRESHOLD) return { value: 0, centred: false };
  if (Math.abs(position + size - 1) <= BOX_SNAP_THRESHOLD) {
    return { value: 1 - size, centred: false };
  }
  return { value: position, centred: false };
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
