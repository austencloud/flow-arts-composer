import {
  DEFAULT_TRAIL_SETTINGS,
  type TrailSettings,
} from "./types/trail-types";

/** Default trails follow hand colors; deliberately customized trail colors win. */
export function resolveTrailColors(
  settings: TrailSettings,
  colors?: { left: string; right: string } | null
): TrailSettings {
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
