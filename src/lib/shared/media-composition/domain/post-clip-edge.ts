import {
  POST_EDGE_COLORS,
  POST_MAX_EDGE_BORDER,
  POST_MAX_EDGE_CORNERS,
  POST_PLAIN_EDGE,
  type PostClipEdge,
  type PostEdgeColor,
} from "$lib/shared/media-composition/domain/post-project";
import type { RegionEdge } from "$lib/shared/media-composition/domain/media-layout-schema";

/**
 * A clip's edges: rounded corners, a border and a drop shadow. A clip with
 * none of them stores no `edge`, so plain clips stay as they were saved.
 */

/** Each border colour as the export and the preview paint it. */
export const POST_EDGE_COLOR_HEX: Record<PostEdgeColor, string> = {
  white: "#ffffff",
  black: "#000000",
  red: "#ef3b3b",
  orange: "#ff8a1f",
  gold: "#f5b82e",
  blue: "#3b82f6",
  violet: "#9b5de5",
};

/** The border a colour pick adds when the clip has none yet: 6 pixels. */
export const POST_DEFAULT_EDGE_BORDER = 6 / 1080;

/** The clip's edges, plain when it stores none. */
export function edgeOf(item: { edge?: PostClipEdge }): PostClipEdge {
  return item.edge ?? POST_PLAIN_EDGE;
}

/** No corners, border or shadow: nothing to draw, so nothing to store. */
export function isPlainEdge(edge: PostClipEdge): boolean {
  return edge.corners === 0 && edge.border === 0 && edge.shadow === 0;
}

function clampShare(
  value: number | undefined,
  fallback: number,
  max: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(0, value));
}

/**
 * `current` with `patch` laid over it, each amount kept in range, or null
 * when the result draws nothing.
 */
export function mergeEdge(
  current: PostClipEdge,
  patch: Partial<PostClipEdge>
): PostClipEdge | null {
  const borderColor =
    patch.borderColor && POST_EDGE_COLORS.includes(patch.borderColor)
      ? patch.borderColor
      : current.borderColor;
  const next: PostClipEdge = {
    corners: clampShare(patch.corners, current.corners, POST_MAX_EDGE_CORNERS),
    border: clampShare(patch.border, current.border, POST_MAX_EDGE_BORDER),
    borderColor,
    shadow: clampShare(patch.shadow, current.shadow, 1),
  };
  return isPlainEdge(next) ? null : next;
}

/** The region edge the compiled preset draws, or undefined for plain edges. */
export function regionEdge(
  edge: PostClipEdge | undefined
): RegionEdge | undefined {
  if (!edge || isPlainEdge(edge)) return undefined;
  return {
    cornerRadius: edge.corners,
    borderWidth: edge.border,
    borderColor: POST_EDGE_COLOR_HEX[edge.borderColor],
    shadow: edge.shadow,
  };
}
