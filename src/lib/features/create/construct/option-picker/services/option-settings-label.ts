import {
  formatTurnValue,
  type TurnLevel,
  type TurnValue,
} from "#lib/shared/create/services/level-turn-values.js";
import { t } from "#lib/shared/i18n/i18n.svelte.js";

/** What the option settings are set to, for a button that keeps them shut. */
export function optionSettingsLabel(settings: {
  showFilter: boolean;
  isContinuousOnly: boolean;
  showTurnControls: boolean;
  level: TurnLevel;
  leftTurns: TurnValue;
  rightTurns: TurnValue;
}): string {
  const details = [t("create_ui_option_settings")];
  if (settings.showFilter) {
    const mode = settings.isContinuousOnly
      ? t("create_option_continuous")
      : t("create_option_all");
    details.push(t("create_deep_showing_mode", { mode }));
  }
  if (settings.showTurnControls) {
    details.push(
      t("create_deep_level_number", { level: settings.level }),
      t("create_deep_left_turns_value", {
        turns: formatTurnValue(settings.leftTurns),
      }),
      t("create_deep_right_turns_value", {
        turns: formatTurnValue(settings.rightTurns),
      })
    );
  }
  return details.join(". ");
}
