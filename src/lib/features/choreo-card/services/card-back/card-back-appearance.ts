import { getSettings } from "$lib/shared/application/state/app-state.svelte";
import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { getMotionColor } from "$lib/shared/utils/svg-color-utils";

export interface CardBackAppearance {
  leftPropType: PropType;
  rightPropType: PropType;
  primaryPropColors: { left: string; right: string } | null;
}

export function resolveCardBackAppearance(
  options: Partial<CardBackAppearance> = {},
): CardBackAppearance {
  const colors = options.primaryPropColors === undefined
    ? getSettings().primaryPropColors
    : options.primaryPropColors;
  return {
    leftPropType: options.leftPropType ?? settingsService.settings.leftPropType ?? PropType.STAFF,
    rightPropType: options.rightPropType ?? settingsService.settings.rightPropType ?? PropType.STAFF,
    primaryPropColors: colors ? { left: colors.left, right: colors.right } : null,
  };
}

/** Preserve live settings for undefined; pin theme defaults for an explicit null snapshot. */
export function resolveStartPlacementColorOverrides(
  colors: CardBackAppearance["primaryPropColors"] | undefined,
  darkMode: boolean,
): { left: string | undefined; right: string | undefined } {
  if (colors === undefined) return { left: undefined, right: undefined };
  if (colors !== null) return colors;
  const mode = darkMode ? "dark" : "light";
  return {
    left: getMotionColor("left", mode),
    right: getMotionColor("right", mode),
  };
}
