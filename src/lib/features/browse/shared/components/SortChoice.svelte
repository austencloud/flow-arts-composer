<!--
  SortChoice - Every sort order as a visible button

  A segmented row of the available orders. Each button shows its icon; the
  selected one also shows its name (a wide host can show every name), so the
  row stays one line on a phone while every choice is a single tap away.
  Replaces the old sort dropdown.

  The option set is injectable: without one it offers the gallery's
  sequence orders (A-Z / date added / length / mandala); the Library rail
  passes its own collection orders. The id type follows whatever the caller
  passes.
-->
<script module lang="ts">
  export interface SortChoiceOption<T extends string = string> {
    id: T;
    /** Full name, read by screen readers and shown on hover. */
    label: string;
    /** Short name shown on the selected button. */
    chipLabel: string;
    icon: string;
  }
</script>

<script lang="ts" generics="T extends string">
  import { BrowseSortMethod } from "../domain/enums/browse-enums";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  interface Props {
    currentMethod: T;
    onSortChange: (method: T) => void;
    /** The orders to offer. Omit for the gallery's sequence orders. */
    options?: readonly SortChoiceOption<T>[];
  }

  let { currentMethod, onSortChange, options }: Props = $props();

  // The gallery's sequence orders. A caller that omits `options` is sorting
  // sequences, so its T is BrowseSortMethod; the cast records that contract.
  function gallerySortOptions(): SortChoiceOption<T>[] {
    const gallery: SortChoiceOption<BrowseSortMethod>[] = [
      {
        id: BrowseSortMethod.ALPHABETICAL,
        label: t("browse_sort_alphabetical"),
        chipLabel: "A-Z",
        icon: "fa-font",
      },
      {
        id: BrowseSortMethod.DATE_ADDED,
        label: t("browse_sort_date_added"),
        chipLabel: "Date",
        icon: "fa-clock",
      },
      {
        id: BrowseSortMethod.SEQUENCE_LENGTH,
        label: t("browse_sort_length"),
        chipLabel: "Length",
        icon: "fa-ruler",
      },
      {
        id: BrowseSortMethod.DENSITY,
        label: t("browse_sort_mandala"),
        chipLabel: "Mandala",
        icon: "fa-dharmachakra",
      },
    ];
    return gallery as unknown as SortChoiceOption<T>[];
  }

  const sortOptions = $derived(options ?? gallerySortOptions());
  const segments = $derived(
    sortOptions.map((option) => ({
      value: option.id,
      label: option.label,
      ariaLabel: option.label,
    }))
  );
</script>

<div class="sort-choice">
  <SegmentedControl
    options={segments}
    value={currentMethod}
    onchange={onSortChange}
    color="accent"
    density="compact"
    semantics="radiogroup"
    ariaLabel={t("browse_sort_options")}
  >
    {#snippet optionContent(id: T)}
      {@const option = sortOptions.find((candidate) => candidate.id === id)}
      <span class="sort-segment" title={option?.label}>
        <i class="fas {option?.icon}" aria-hidden="true"></i>
        <span class="sort-name" class:rest={id !== currentMethod}
          >{option?.chipLabel}</span
        >
      </span>
    {/snippet}
  </SegmentedControl>
</div>

<style>
  .sort-choice {
    flex-shrink: 0;
    min-height: var(--min-touch-target);
    display: flex;
  }

  .sort-choice :global(.segmented-control) {
    width: auto;
  }

  .sort-segment {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  /* Unselected names hide until a host has the room to show them all. */
  .sort-name.rest {
    display: none;
  }

  .sort-segment i {
    width: 14px;
    text-align: center;
  }
</style>
