<!--
  TnDModeGrid: the six timing-and-direction modes as a 3x2 grid.

  Rows are timing (Together, Split, Quarter), columns are direction (Same,
  Opposite). The chips are the same RelationshipChoiceChip the shape matrix
  uses, with the same element accents and icons, so a mode looks the same
  wherever the app names it. `selected` may be null: a host that offers Free
  renders that as its own chip beside the grid. A mode a host cannot honor
  (the TnD panel under a LOOP that cannot keep it) is disabled with the
  reason on the chip.
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
    disabledModes = [],
    reasons = {},
    ariaLabel = "Timing and direction",
    onpick,
  }: {
    selected: VtgMode | null;
    /** Disables every chip (the host is busy or the control is read-only). */
    disabled?: boolean;
    /** Modes the host cannot honor right now. */
    disabledModes?: readonly VtgMode[];
    /** Why a mode in `disabledModes` is off, shown as its tooltip. */
    reasons?: Partial<Record<VtgMode, string>>;
    ariaLabel?: string;
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

  function isBlocked(mode: VtgMode): boolean {
    return disabledModes.includes(mode);
  }

  // The reason joins the name so a screen reader hears why the chip is off
  // without hunting for the tooltip.
  function chipLabel(c: (typeof chips)[number]): string {
    const base = `${c.words.timing} ${c.words.direction}, ${elementName(c.el.element)} (${c.mode})`;
    const reason = isBlocked(c.mode) ? reasons[c.mode] : undefined;
    return reason ? `${base}, ${reason}` : base;
  }
</script>

<div class="mode-grid" role="radiogroup" aria-label={ariaLabel}>
  {#each chips as c (c.mode)}
    <RelationshipChoiceChip
      compact
      accent={c.el.accentColor}
      icon={c.el.iconPath}
      timing={c.shortWords.timing}
      direction={c.shortWords.direction}
      active={selected === c.mode}
      disabled={disabled || isBlocked(c.mode)}
      title={isBlocked(c.mode) ? (reasons[c.mode] ?? null) : null}
      ariaLabel={chipLabel(c)}
      onpick={() => onpick(c.mode)}
    />
  {/each}
</div>

<style>
  /* Three rows that share whatever height the host gives the grid, so on a
     tall pane the chips grow with it instead of leaving the room below them
     empty. Content-sized when the host is: `1fr` rows never drop under their
     chip. */
  .mode-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: minmax(0, 1fr);
    gap: 8px;
    min-width: 0;
  }

  /* A chip that has grown to twice its natural height with the same 2.1rem
     icon reads as a small chip floating in a big box. The icon and the words
     scale with the room from a tall laptop up, in the same viewport tiers the
     editor uses for its own chrome. */
  @media (min-height: 1100px) {
    .mode-grid :global(.choice-icon) {
      width: 2.75rem;
      height: 2.75rem;
    }

    .mode-grid :global(.choice-copy strong) {
      font-size: var(--font-size-min, 0.875rem);
    }
  }

  @media (min-height: 1400px) {
    .mode-grid :global(.choice-icon) {
      width: 3.25rem;
      height: 3.25rem;
    }

    .mode-grid :global(.choice-copy strong) {
      font-size: var(--font-size-base, 1rem);
    }
  }
</style>
