import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
import {
  normalizeHandHexColor,
  resolveHandColorPair,
  type HandColorPair,
} from "@tka/render-composition";

export type ViewerCustomColorHand = HandSide;

export type ViewerCustomColorPair = HandColorPair;

export const DEFAULT_VIEWER_CUSTOM_COLORS: ViewerCustomColorPair = {
  left: getMotionColor(HandSide.LEFT, "dark"),
  right: getMotionColor(HandSide.RIGHT, "dark"),
};

export function normalizeViewerHexColor(
  value: unknown,
  fallback: string
): string {
  return normalizeHandHexColor(value, fallback);
}

export function resolveViewerCustomColorPair(
  value: unknown,
  fallback: ViewerCustomColorPair = DEFAULT_VIEWER_CUSTOM_COLORS
): ViewerCustomColorPair {
  return resolveHandColorPair(value, fallback);
}

export function viewerCustomColorPairsEqual(
  left: ViewerCustomColorPair,
  right: ViewerCustomColorPair
): boolean {
  return (
    left.left.toLowerCase() === right.left.toLowerCase() &&
    left.right.toLowerCase() === right.right.toLowerCase()
  );
}
