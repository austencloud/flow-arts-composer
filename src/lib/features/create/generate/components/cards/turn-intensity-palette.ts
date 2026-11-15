/**
 * The colour ramp that reports how hard a sequence turns: cool green for a
 * gentle setting, through lime and amber, to red at the top of the range.
 *
 * It lives here rather than inside a card because two cards read it — the
 * intensity stepper and the Turns tile that opens the turn drawer — and a card
 * that showed a different shade of the same number would read as a different
 * setting.
 */

import { t } from "#lib/shared/i18n/i18n.svelte.js";

/** Plain-language reading of an intensity ceiling, in the visitor's language. */
export function describeTurnIntensity(value: number): string {
  if (value <= 0.5) return t("generator_turns_minimal");
  if (value <= 1.0) return t("generator_turns_gentle");
  if (value <= 1.5) return t("generator_turns_light");
  if (value <= 2.0) return t("generator_turns_moderate");
  if (value <= 2.5) return t("generator_turns_strong");
  return t("generator_turns_intense");
}

/** Green through red, for the ordinary dark backgrounds. */
function defaultRamp(value: number): string {
  if (value <= 0.5) {
    return "radial-gradient(ellipse at top left, #a7f3d0 0%, #6ee7b7 40%, #34d399 100%)";
  } else if (value <= 1.0) {
    return "radial-gradient(ellipse at top left, #4ade80 0%, var(--semantic-success) 40%, #16a34a 100%)";
  } else if (value <= 1.5) {
    return "radial-gradient(ellipse at top left, #bef264 0%, #a3e635 40%, #84cc16 100%)";
  } else if (value <= 2.0) {
    return "radial-gradient(ellipse at top left, var(--semantic-warning) 0%, var(--semantic-warning) 40%, #d97706 100%)";
  } else if (value <= 2.5) {
    return "radial-gradient(ellipse at top left, #fb923c 0%, #f97316 40%, #ea580c 100%)";
  }
  return "radial-gradient(ellipse at top left, var(--semantic-error) 0%, var(--semantic-error) 40%, var(--semantic-error) 100%)";
}

/** The same ramp, deepened so it still reads on Aurora and Ember. */
function brightBackgroundRamp(value: number): string {
  if (value <= 0.5) {
    return "radial-gradient(ellipse at top left, #34d399 0%, #10b981 40%, #059669 100%)";
  } else if (value <= 1.0) {
    return "radial-gradient(ellipse at top left, #22c55e 0%, #16a34a 40%, #15803d 100%)";
  } else if (value <= 1.5) {
    return "radial-gradient(ellipse at top left, #a3e635 0%, #84cc16 40%, #65a30d 100%)";
  } else if (value <= 2.0) {
    return "radial-gradient(ellipse at top left, #fbbf24 0%, #f59e0b 40%, #d97706 100%)";
  } else if (value <= 2.5) {
    return "radial-gradient(ellipse at top left, #fb923c 0%, #f97316 40%, #ea580c 100%)";
  }
  return "radial-gradient(ellipse at top left, #f87171 0%, #ef4444 40%, #dc2626 100%)";
}

export function turnIntensityColor(
  value: number,
  useDarkColors: boolean
): string {
  return useDarkColors ? brightBackgroundRamp(value) : defaultRamp(value);
}

/**
 * Text fades from black to white across the amber-to-orange stretch, where the
 * tile stops being light enough to carry dark type.
 */
export function turnIntensityTextColor(
  value: number,
  useDarkColors: boolean
): string {
  if (useDarkColors) {
    return value > 2.5 ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)";
  }

  const transitionStart = 2.0;
  const transitionEnd = 2.5;

  if (value <= transitionStart) return "rgb(0, 0, 0)";
  if (value >= transitionEnd) return "rgb(255, 255, 255)";

  const progress =
    (value - transitionStart) / (transitionEnd - transitionStart);
  const grayValue = Math.round(progress * 255);
  return `rgb(${grayValue}, ${grayValue}, ${grayValue})`;
}
