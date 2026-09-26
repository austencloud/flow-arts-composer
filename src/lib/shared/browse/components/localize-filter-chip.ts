import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "$lib/shared/i18n/i18n-types.js";
import { localizedModeName } from "$lib/shared/shape-matrix/domain/shape-matrix-display";
import {
  MODE_FAMILY_ID,
  type VtgMode,
} from "$lib/shared/shape-matrix/services/shape-matrix-realizations";

/** Translate built-in chip copy at display time; saved labels and user names stay intact. */
export function localizeFilterChip(filter: {
  type: string;
  label: string;
  value?: unknown;
}): string {
  switch (filter.type) {
    case BrowseFilterType.DIFFICULTY:
      return filter.value != null
        ? t("browse_filter_level", { level: String(filter.value) })
        : filter.label.replace(/^Level /, `${t("browse_chip_level")} `);
    case BrowseFilterType.FAVORITES:
      return t("browse_filter_favorites");
    case BrowseFilterType.LENGTH:
      return filter.value != null
        ? t("browse_n_steps", { count: Number(filter.value) })
        : filter.label.replace(/ steps$/, ` ${t("browse_audit_chip_steps")}`);
    case BrowseFilterType.MAX_TURN_INTENSITY:
      return filter.value != null
        ? t("browse_audit_chip_at_most_turns", { turns: String(filter.value) })
        : filter.label.replace(/ turns$/, ` ${t("browse_audit_chip_turns")}`);
    case BrowseFilterType.PERFORMANCE_AVAILABILITY:
      if (
        filter.value === "has-public-performance" ||
        filter.label === "With a public performance"
      )
        return t("browse_audit_with_public_performance");
      if (
        filter.value === "no-public-performance" ||
        filter.label === "Without a public performance"
      )
        return t("browse_audit_without_public_performance");
      return filter.label;
    case BrowseFilterType.RECENT_PERFORMANCE:
      return t("browse_audit_recently_performed");
    case BrowseFilterType.LOOP_TYPE: {
      const key =
        LOOP_LABEL_KEYS[String(filter.value)] ?? LOOP_LABEL_KEYS[filter.label];
      return key ? t(key) : filter.label;
    }
    case BrowseFilterType.GRID_MODE:
      if (filter.value === "box") return t("browse_audit_box");
      if (filter.value === "diamond") return t("browse_audit_diamond");
      return filter.label;
    case BrowseFilterType.TND_FAMILY: {
      const mode = FAMILY_MODE_BY_ID[String(filter.value)];
      return mode ? localizedModeName(mode) : filter.label;
    }
    default:
      return filter.label;
  }
}

const FAMILY_MODE_BY_ID: Readonly<Record<string, VtgMode>> = Object.fromEntries(
  (Object.entries(MODE_FAMILY_ID) as [VtgMode, string][]).map(([mode, id]) => [
    id,
    mode,
  ])
);

const LOOP_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
  "component:rotated_halved": "browse_audit_chip_rotated_halved",
  "component:rotated_quartered": "browse_audit_chip_rotated_quartered",
  "component:mirrored": "browse_audit_chip_mirrored",
  "component:flipped": "browse_audit_chip_flipped",
  "component:swapped": "browse_audit_chip_swapped",
  "component:inverted": "browse_audit_chip_inverted",
  "component:rewound": "browse_audit_chip_rewound",
  "Rotated Halved": "browse_audit_chip_rotated_halved",
  "Rotated Quartered": "browse_audit_chip_rotated_quartered",
  "Rotated (halved)": "browse_audit_chip_rotated_halved",
  "Rotated (quartered)": "browse_audit_chip_rotated_quartered",
  Mirrored: "browse_audit_chip_mirrored",
  Flipped: "browse_audit_chip_flipped",
  Swapped: "browse_audit_chip_swapped",
  Inverted: "browse_audit_chip_inverted",
  Rewound: "browse_audit_chip_rewound",
};
