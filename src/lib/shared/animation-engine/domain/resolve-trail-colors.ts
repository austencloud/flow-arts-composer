import { DEFAULT_TRAIL_SETTINGS } from "./types/trail-types";

/**
 * Default trails follow hand colors; deliberately customized trail colors win.
 * Shared by the 2D trail settings and the 3D trail intent.
 */
export function resolveTrailColors<
  T extends { leftColor: string; rightColor: string },
>(settings: T, colors?: { left: string; right: string } | null): T {
  if (!colors) return settings;
  const leftColor =
    settings.leftColor.toLowerCase() ===
    DEFAULT_TRAIL_SETTINGS.leftColor.toLowerCase()
      ? colors.left
      : settings.leftColor;
  const rightColor =
    settings.rightColor.toLowerCase() ===
    DEFAULT_TRAIL_SETTINGS.rightColor.toLowerCase()
      ? colors.right
      : settings.rightColor;
  if (leftColor === settings.leftColor && rightColor === settings.rightColor)
    return settings;
  return { ...settings, leftColor, rightColor };
}
