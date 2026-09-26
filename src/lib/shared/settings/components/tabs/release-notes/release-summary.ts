import { t } from "$lib/shared/i18n/i18n.svelte";
import type { AppVersion } from "$lib/shared/versioning/domain/models/version-models";

export function releaseSummary(version: AppVersion): string {
  const entries = version.changelogEntries;
  if (entries?.length) {
    const parts = [
      ["fixed", "settings_fix_count"],
      ["added", "settings_feature_count"],
      ["improved", "settings_improvement_count"],
    ] as const;
    return parts
      .map(([category, key]) => {
        const count = entries.filter((entry) => entry.category === category).length;
        return count ? t(key, { count }) : "";
      })
      .filter(Boolean)
      .join(", ") || t("settings_updates_included");
  }

  const summary = version.feedbackSummary;
  const parts = [
    summary.bugs ? t("settings_bugs_fixed_count", { count: summary.bugs }) : "",
    summary.features ? t("settings_features_added_count", { count: summary.features }) : "",
    summary.general ? t("settings_improvement_count", { count: summary.general }) : "",
  ].filter(Boolean);
  return parts.join(", ") || t("settings_no_changes_recorded");
}
