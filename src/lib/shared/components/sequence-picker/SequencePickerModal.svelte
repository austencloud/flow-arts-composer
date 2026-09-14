<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { createBrowseEngine } from "$lib/shared/browse/engine/create-browse-engine.svelte";
  import BrowsePanel from "$lib/shared/browse/components/BrowsePanel.svelte";
  import FilterWorkspace from "$lib/features/browse/gallery-home/FilterWorkspace.svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { hydrateSequence as hydrateSequenceData } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
  import { onDestroy } from "svelte";
  import type { SequenceSource } from "$lib/shared/browse/engine/types";

  interface Props {
    open: boolean;
    onClose: () => void;
    onSelect: (sequence: SequenceData, source: SequenceSource) => void;
    requiredBeatCount?: number | null;
    title?: string;
    showSourceToggle?: boolean;
    initialSource?: SequenceSource;
  }

  let {
    open = $bindable(false),
    onClose,
    onSelect,
    requiredBeatCount = null,
    title = "Select Sequence",
    showSourceToggle = true,
    initialSource = "community",
  }: Props = $props();

  // Engine created once at init. createBrowseEngine registers an internal
  // $effect, so it must run in component-init scope — never inside $derived/
  // $effect (that throws effect_in_teardown when the computation re-runs).
  // Constraints capture the initial prop values, which are fixed per modal open.
  const engine = createBrowseEngine({
    persistKey: null,
    constraints:
      requiredBeatCount != null
        ? [
            {
              type: BrowseFilterType.LENGTH,
              value: requiredBeatCount,
              label: `${requiredBeatCount} steps`,
            },
          ]
        : undefined,
    allowSourceToggle: showSourceToggle,
    sources: ["community", "my-library"],
    initialSource,
  });

  let initialized = $state(false);
  let isSelectingSequence = $state(false);
  let showResults = $state(false);

  $effect(() => {
    if (open && !initialized) {
      engine.initialize();
      initialized = true;
    } else if (open && initialized) {
      engine.refresh();
    }

    if (!open) showResults = false;
  });

  onDestroy(() => engine.destroy());

  async function handleSelect(sequence: SequenceData) {
    isSelectingSequence = true;
    try {
      const fullData = await hydrateSequenceData(sequence);
      onSelect(fullData ?? sequence, engine.source);
      onClose();
    } finally {
      isSelectingSequence = false;
    }
  }

  /**
   * The split pane needs its left column to hold the catalog plus one whole
   * editor row: below the 1680px seam that is 445px of tiles + 68px header +
   * 166px card + gaps and padding (about 780px of drill); above it, 512 + 68 +
   * 212 (about 890px). A dialog at 90dvh gives the drill 734px at 1440×900 and
   * 896px at 1920×1080, so the laptop tier takes the step-through flow (three
   * level cards across, then a full-width grid) instead of a split pane that
   * shows 83% of one card, and 1080p keeps the live results beside the editor.
   */
  const SPLIT_MIN_HEIGHT = 780;

  function openResults(apply: () => void): void {
    apply();
    showResults = true;
  }
</script>

<BaseModal
  bind:open
  onclose={() => onClose()}
  size="xl"
  class="sequence-picker-modal"
  labelledBy="sequence-picker-title"
>
  {#snippet header()}
    <div class="picker-header">
      <h2 id="sequence-picker-title">{title}</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  {/snippet}

  <div class="picker-body">
    {#if showResults}
      <div class="picker-results">
        <BrowsePanel
          {engine}
          layout="compact"
          onSelect={handleSelect}
          onBack={() => (showResults = false)}
          backLabel="Filters"
          showFilterBar={false}
          hideFilterChips
          {showSourceToggle}
          eager
        />
      </div>
    {:else}
      <FilterWorkspace
        {engine}
        onEject={openResults}
        {resultsPane}
        splitMinHeight={SPLIT_MIN_HEIGHT}
      />
    {/if}

    {#if isSelectingSequence}
      <div class="loading-overlay">
        <ProgressRing percent={-1} size={40} />
      </div>
    {/if}
  </div>
</BaseModal>

{#snippet resultsPane()}
  <div class="picker-results">
    <BrowsePanel
      {engine}
      layout="compact"
      onSelect={handleSelect}
      showFilterBar={false}
      hideFilterChips
      {showSourceToggle}
      eager
    />
  </div>
{/snippet}

<style>
  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md, 12px) var(--spacing-lg, 16px);
  }

  .picker-header h2 {
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    color: var(--theme-text, white);
    font-weight: 600;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  .close-btn:hover {
    color: var(--theme-text, white);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  /* The body takes whatever the dialog gives it. It used to be `60vh` with a
   * 300px floor, which sized the workspace to the window instead of to the
   * dialog: 30% of every desktop viewport became empty bands above and below
   * the modal while the split pane inside starved (the value editor fell
   * below the dialog's bottom edge from 1440×900 up), and at 412px tall the
   * floor overshot the dialog by 5px so two scrollbars fought. */
  .picker-body {
    position: relative;
    display: flex;
    height: 100%;
    min-height: 0;
    min-width: 0;
  }

  .picker-results {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .picker-results :global(.browse-panel) {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10;
    border-radius: inherit;
  }

  /* The picker is a live workspace now, so the dialog is the height budget:
   * BaseModal only caps an xl dialog, and a content-sized box let the 60vh
   * body above decide the height. Same expression as the cap, so the modal
   * never exceeds what BaseModal allows. Below the phone seam BaseModal
   * already makes xl dialogs full-screen; this rule stays out of its way. */
  @media (min-width: 521px) {
    :global(dialog.base-modal.sequence-picker-modal[data-size="xl"]) {
      height: min(
        90dvh,
        calc(
          var(--viewport-height, 100dvh) - 32px - env(safe-area-inset-top, 0px) -
            env(safe-area-inset-bottom, 0px)
        )
      );
    }
  }

  /* On large displays the filter catalog and sequence grid need room to stay
   * side by side instead of floating as a narrow modal in the middle of the
   * canvas. The bands follow the drill's own wide-canvas ceiling
   * (`.drill.fluid-wide-canvas .drill-stage`, 156rem) rather than stopping
   * short of it: the old 112rem/132rem steps left 379px of dead rail per side
   * at 2560×1440 and 859px at 3840×2160. */
  @media (min-width: 1680px) {
    :global(dialog.base-modal.sequence-picker-modal[data-size="xl"]) {
      width: min(calc(100dvw - 4rem), 132rem);
    }
  }

  @media (min-width: 2600px) {
    :global(dialog.base-modal.sequence-picker-modal[data-size="xl"]) {
      width: min(calc(100dvw - 6rem), 160rem);
    }
  }

  /* Short landscape (a phone on its side is 412px tall): the dialog gets
   * 371px, and header + toolbar + prop control + grid gutters spent 240 of
   * them before the first card, so the result rows were cut at 136px and a
   * 190px card never showed whole. Tightening the chrome to its touch
   * floors and the gutters to the phone value returns 70px, one full row.
   * Controls keep their 44px targets; only padding around them shrinks. */
  @media (max-height: 480px) {
    .picker-header {
      padding: 4px var(--spacing-lg, 16px);
    }

    .picker-body :global(.browse-toolbar) {
      padding-top: 4px;
      padding-bottom: 4px;
    }

    .picker-body :global(.viewing-control) {
      padding-top: 0;
      padding-bottom: 0;
    }

    .picker-body :global(.browse-panel .grid-area) {
      padding: var(--spacing-sm, 8px);
    }

    .picker-body :global(.gallery-rule-strip) {
      padding-top: 0.3rem;
      padding-bottom: 0.3rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .close-btn {
      transition: none;
    }
  }
</style>
