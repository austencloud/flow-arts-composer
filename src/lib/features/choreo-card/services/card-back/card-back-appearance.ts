import { getSettings } from "$lib/shared/application/state/app-state.svelte";
import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

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
    leftPropType: options.leftPropType ?? settingsService.settings.leftPropType,
    rightPropType: options.rightPropType ?? settingsService.settings.rightPropType,
    primaryPropColors: colors ? { left: colors.left, right: colors.right } : null,
  };
}
