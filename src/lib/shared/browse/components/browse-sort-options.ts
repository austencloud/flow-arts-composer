/**
 * The sequence orders a Browse grid offers, as SortChoice options. The toolbar
 * and the phone Filters sheet show the same list. Call it inside a $derived:
 * the labels follow the language.
 */
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
/** One choice, in the shape SortChoice takes. Plain tsc cannot read a type out of a .svelte file. */
interface SortChoiceOption<T extends string> {
  id: T;
  label: string;
  chipLabel: string;
  icon: string;
}

export function browseSortOptions({
  handsMode,
  curatedLabel,
}: {
  /** Hand paths have no level to sort by. */
  handsMode: boolean;
  /** Names a host pool's own order (a collection's). It leads, as the default. */
  curatedLabel?: string | undefined;
}): SortChoiceOption<BrowseSortMethod>[] {
  const all: SortChoiceOption<BrowseSortMethod>[] = [
    {
      id: BrowseSortMethod.ALPHABETICAL,
      label: "A-Z",
      chipLabel: "A-Z",
      icon: "fa-font",
    },
    {
      id: BrowseSortMethod.DATE_ADDED,
      label: t("browse_ui_recent"),
      chipLabel: t("browse_ui_recent"),
      icon: "fa-clock",
    },
    {
      id: BrowseSortMethod.DIFFICULTY_LEVEL,
      label: t("browse_ui_level"),
      chipLabel: t("browse_ui_level"),
      icon: "fa-signal",
    },
    {
      id: BrowseSortMethod.SEQUENCE_LENGTH,
      label: t("browse_ui_length"),
      chipLabel: t("browse_ui_length"),
      icon: "fa-ruler",
    },
    {
      id: BrowseSortMethod.DENSITY,
      label: t("browse_ui_mandala"),
      chipLabel: t("browse_ui_mandala"),
      icon: "fa-dharmachakra",
    },
  ];
  const offered = handsMode
    ? all.filter((option) => option.id !== BrowseSortMethod.DIFFICULTY_LEVEL)
    : all;
  return curatedLabel
    ? [
        {
          id: BrowseSortMethod.CURATED,
          label: curatedLabel,
          chipLabel: curatedLabel,
          icon: "fa-list-ol",
        },
        ...offered,
      ]
    : offered;
}
