<!-- src/lib/shared/shape-matrix/components/ElementChipRow.svelte
  The six VTG timing-and-direction modes as elemental pickers. Bespoke rather
  than FilterChipBase/SegmentedControl per chip-primitives.md's keep-separate
  carve-out: per-option element accent colors + icon PNGs + an icon beside a
  timing/direction word stack, plus an at-most-one selection that clears on
  re-click (SegmentedControl cannot represent none-selected). Mode → element
  mapping is diamond-grid-specific (see build-mode-realizations.ts). -->
<script lang="ts">
  import {
    MODE_ORDER,
    MODE_SHORT_WORDS,
    MODE_WORDS,
    type VtgMode,
  } from "../services/shape-matrix-realizations";
  import { FAMILY_BY_MODE } from "../services/build-mode-realizations";
  import { TND_BY_FAMILY } from "$lib/features/choreo-card/domain/tnd-element";
  import RelationshipChoiceChip from "./RelationshipChoiceChip.svelte";

  let {
    selected,
    available = MODE_ORDER,
    availabilityReady = false,
    disabled = false,
    columns = 6,
    compact = false,
    onpick,
  }: {
    selected: VtgMode | null;
    available?: readonly VtgMode[];
    availabilityReady?: boolean;
    disabled?: boolean;
    /** Tracks in the row. The drill wants all six; a popover wants three. */
    columns?: number;
    compact?: boolean;
    onpick: (mode: VtgMode | null) => void;
  } = $props();

  // Matches the guard in build-mode-realizations.ts for the same lookup:
  // FAMILY_BY_MODE/TND_BY_FAMILY are both keyed by generic `string`, so
  // indexing is possibly-undefined to the type checker even though every
  // VtgMode maps to a real family in practice. Filter rather than assert.
  const chips = MODE_ORDER.map((mode) => ({
    mode,
    words: MODE_WORDS[mode],
    shortWords: MODE_SHORT_WORDS[mode],
    el: TND_BY_FAMILY[FAMILY_BY_MODE[mode]],
  })).filter(
    (c): c is typeof c & { el: NonNullable<typeof c.el> } => c.el !== undefined
  );

  function elementName(raw: string): string {
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
</script>

<div
  class="chip-row"
  style="--chip-row-columns: {columns}"
  role="group"
  aria-label="Hand path timing and direction"
>
  {#each chips as c (c.mode)}
    <RelationshipChoiceChip
      {compact}
      accent={c.el.accentColor}
      icon={c.el.iconPath}
      timing={c.shortWords.timing}
      direction={c.shortWords.direction}
      active={selected === c.mode}
      disabled={disabled || (availabilityReady && !available.includes(c.mode))}
      ariaLabel={`${c.words.timing} ${c.words.direction}, ${elementName(c.el.element)} (${c.mode})${
        availabilityReady && !available.includes(c.mode)
          ? ", unavailable for these flowers"
          : ""
      }`}
      onpick={() => onpick(selected === c.mode ? null : c.mode)}
    />
  {/each}
</div>

<style>
  .chip-row {
    display: grid;
    grid-template-columns: repeat(var(--chip-row-columns, 6), minmax(0, 1fr));
    gap: 0.55rem;
  }
  @container shape-matrix-drill (max-width: 30rem) {
    .chip-row {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  @container shape-matrix-drill (min-width: 42rem) and (max-height: 24rem) {
    .chip-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
