<!--
  FuseTnDModePicker — the six timing-and-direction modes as a 3x2 grid.

  Rows are timing (Together, Split, Quarter), columns are direction (Same,
  Opposite). The chips are the same RelationshipChoiceChip the shape matrix
  uses, with the same element accents and icons, so a mode looks the same
  wherever the app names it.
-->
<script lang="ts">
  import RelationshipChoiceChip from "$lib/shared/shape-matrix/components/RelationshipChoiceChip.svelte";
  import {
    MODE_FAMILY_ID,
    MODE_SHORT_WORDS,
    MODE_WORDS,
    type VtgMode,
  } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
  import { TND_BY_FAMILY } from "$lib/features/choreo-card/domain/tnd-element";

  let {
    selected,
    disabled = false,
    onpick,
  }: {
    selected: VtgMode;
    disabled?: boolean;
    onpick: (mode: VtgMode) => void;
  } = $props();

  // Reading order: Together first because it is the default and the simplest,
  // then Split, then Quarter. Same before Opposite on each row.
  const GRID_ORDER: readonly VtgMode[] = ["TS", "TO", "SS", "SO", "QS", "QO"];

  const chips = GRID_ORDER.map((mode) => ({
    mode,
    words: MODE_WORDS[mode],
    shortWords: MODE_SHORT_WORDS[mode],
    el: TND_BY_FAMILY[MODE_FAMILY_ID[mode]],
  })).filter(
    (c): c is typeof c & { el: NonNullable<typeof c.el> } => c.el !== undefined
  );

  function elementName(raw: string): string {
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
</script>

<div class="mode-grid" role="radiogroup" aria-label="Timing and direction">
  {#each chips as c (c.mode)}
    <RelationshipChoiceChip
      compact
      accent={c.el.accentColor}
      icon={c.el.iconPath}
      timing={c.shortWords.timing}
      direction={c.shortWords.direction}
      active={selected === c.mode}
      {disabled}
      ariaLabel={`${c.words.timing} ${c.words.direction}, ${elementName(c.el.element)} (${c.mode})`}
      onpick={() => onpick(c.mode)}
    />
  {/each}
</div>

<style>
  .mode-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    min-width: 0;
  }
</style>
