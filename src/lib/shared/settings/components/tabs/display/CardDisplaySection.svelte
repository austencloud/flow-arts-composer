<!--
  Settings → Display: the card section. The shared ChoreoCard of the example
  loop (CardDisplayStage), drawn from the same composition, image-theme and
  pictograph managers the viewer's card panel writes, with CardContentToggles
  (the switches that panel shows) under it: picture tiles in the columns
  tier, labelled rows of small chips on a drill-down screen (`compact`).

  Columns, the start lane and the info-cell choice are stored per step count,
  so a length chooser (4 · 8 · 16) decides which card the switches edit and
  shows the multi-cell case. It is a view choice, not a preference: it is not
  stored.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import ChoreoCardContextMenuHost from "#lib/shared/sequence-viewer/components/choreo-card-context-menu/ChoreoCardContextMenuHost.svelte";
  import CardContentToggles from "#lib/shared/share/components/CardContentToggles.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import {
    CARD_VISIBILITY_KEYS,
    getVisibilityStateManager,
  } from "#lib/shared/pictograph/shared/state/visibility-state.svelte.js";
  import {
    DEFAULT_IMAGE_OPTIONS,
    getExportOptionsState,
  } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import type { ResolvedAutoLayout } from "#lib/shared/render/services/container-aware-layout.js";
  import DisplaySection from "./DisplaySection.svelte";
  import CardDisplayStage from "./CardDisplayStage.svelte";
  import {
    CARD_LENGTHS,
    type CardLength,
    type DisplayExample,
  } from "./display-example-data";

  let {
    example,
    onBack,
    compact = false,
    cell = false,
  }: {
    example: DisplayExample | null;
    onBack?: () => void;
    /** Labelled chip rows instead of picture tiles (the drill-down tier). */
    compact?: boolean;
    /** A cell of the tab's wide tier (DisplaySection `cell`). */
    cell?: boolean;
  } = $props();

  const composition = getImageCompositionManager();
  const exportOptions = getExportOptionsState();
  const vm = getVisibilityStateManager();

  let length = $state<CardLength>(4);
  const sequence = $derived(example?.cards[length] ?? null);
  // The live card reports the grid Auto picked, which decides its info cells.
  let autoLayout = $state<ResolvedAutoLayout | null>(null);

  /** What the card shows goes back to its defaults: the card's own switches,
   *  its theme, and the two pictograph-manager marks only a card draws. */
  function reset(): void {
    composition.resetDisplayDefaults();
    exportOptions.setImageDarkMode(DEFAULT_IMAGE_OPTIONS.darkMode);
    vm.resetKeysToDefaults(CARD_VISIBILITY_KEYS);
  }

  const lengthOptions = CARD_LENGTHS.map((value) => ({
    value: String(value),
    label: String(value),
  }));

  let menuHost: ChoreoCardContextMenuHost | undefined = $state();
  const uid = $props.id();
</script>

<DisplaySection
  kind="card"
  icon="fas fa-id-card"
  title={t("settings_display_card")}
  caption={t("settings_display_card_caption")}
  onReset={reset}
  {onBack}
  {cell}
>
  {#snippet stage()}
    {#if sequence}
      <CardDisplayStage
        {sequence}
        onAutoLayoutResolved={(layout) => (autoLayout = layout)}
        onContextMenu={(x, y) => menuHost?.openContextMenu(x, y)}
      />
    {/if}
  {/snippet}
  {#snippet controls()}
    <CardContentToggles
      stepCount={length}
      resolvedAutoLayout={autoLayout}
      {compact}
    >
      {#snippet lead()}
        <span class="group-label" id="{uid}-length"
          >{t("settings_display_card_length")}</span
        >
        <SegmentedControl
          options={lengthOptions}
          value={String(length)}
          onchange={(value) => (length = Number(value) as CardLength)}
          color="accent"
          size={compact ? "sm" : "md"}
          density={compact ? "compact" : "standard"}
          ariaLabelledby="{uid}-length"
        />
      {/snippet}
    </CardContentToggles>
  {/snippet}
</DisplaySection>

<ChoreoCardContextMenuHost
  bind:this={menuHost}
  stepCount={length}
  isExportMode
  {exportOptions}
/>

<style>
  .group-label {
    color: var(--theme-text-dim);
    font-size: var(--font-size-xs, 0.75rem);
    font-weight: 600;
    text-align: center;
  }

  /* One frame for all three lengths, so a length change never moves the
     switches; each card contains itself in it and crossfades its own
     content. The shape is measured against the three cards (see the spec's
     audit revision). */
  :global([data-display-section="card"]) {
    --stage-ratio: 1.2;
    --stage-max-w: 22rem;
  }

  /* On a screen of its own the frame is width-capped, and a 16-step card
     (a 5 by 4 grid under a header row) is squarer than the 1.2 frame: at
     1.1 both lengths fill the width instead of the 16-step card shrinking
     to the frame's height. */
  :global([data-display-section="card"].screen) {
    --stage-ratio: 1.1;
  }

  /* In a cell's 17rem pane a 4.5rem label column leaves Word, Level and
     LOOP (and Step numbers with Reversals) too little room, and each row
     folded in two. A narrower column keeps every row on one line; "Card
     length" takes two lines in it. */
  :global([data-display-section="card"].cell) {
    --card-row-label-w: 3.5rem;
    /* The tile deck is the tallest of the four cells; the tighter rhythm
       CardContentToggles offers a short host keeps it to 387px at its
       smallest tiles, so a 1920×1080 cell (390px of stage) draws tiles. */
    --card-toggles-row-gap: 0.5rem;
    --card-toggles-label-gap: 0.2rem;
  }
</style>
