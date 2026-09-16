<!--
  ExtendView.svelte

  Chrome-free sequence-extension body, rendered INLINE inside the Sequence
  Actions panel as a drill-down view (no Drawer wrapper).

  Two-phase flow:
  1. Directly loopable → show LOOPPicker immediately
  2. Not directly loopable → show bridge pictograph grid; selecting a bridge
     appends it, the parent re-analyzes, and the LOOPPicker appears.

  The header title/subtitle are owned by the panel's shared sub-view header
  (it holds the analysis state); this view renders the options body only.
-->
<script lang="ts">
  import LOOPPicker from "$lib/shared/components/loop-picker/LOOPPicker.svelte";
  import BridgePictographGrid from "$lib/shared/components/loop-picker/BridgePictographGrid.svelte";
  import type { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type {
    ExtensionAnalysis,
    CircularizationOption,
  } from "../../services/sequence-extender";
  import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";

  interface Props {
    analysis: ExtensionAnalysis | null;
    circularizationOptions?: CircularizationOption[];
    directUnavailableReason?: string | null;
    isApplying: boolean;
    onBridgeAppend: (bridgeLetter: Letter) => void;
    onApply: (loopType: LOOPType) => void;
    onOrientationRepeat: () => void;
  }

  let {
    analysis,
    circularizationOptions = [],
    directUnavailableReason = null,
    isApplying,
    onBridgeAppend,
    onApply,
    onOrientationRepeat,
  }: Props = $props();

  const availableDirectOptions = $derived(analysis?.availableLOOPOptions ?? []);
  const orientationRepeat = $derived(analysis?.orientationRepeat ?? null);
  const isDirectlyLoopable = $derived(
    availableDirectOptions.length > 0 || orientationRepeat !== null
  );

  // The header's one-line read of where the sequence actually stands. Closing
  // in placement is not the same as closing in orientation, and the difference
  // is exactly what decides whether the repeat option is worth clicking.
  const statusLine = $derived.by(() => {
    if (!analysis) return "";
    const end = analysis.currentEndPlacement;
    if (analysis.extensionType !== "already_complete") {
      return `Ends at ${end}. Choose a closing pattern.`;
    }
    if (orientationRepeat) {
      return `Returns to ${end} after ${orientationRepeat.count} repeats.`;
    }
    return "Placement and orientation both close.";
  });

  function handleBridgeSelect(option: CircularizationOption) {
    if (isApplying) return;
    const bridgeLetter = option.bridgeLetters[0];
    if (!bridgeLetter) return;
    onBridgeAppend(bridgeLetter);
  }

  function handleLoopSelect(_bridgeLetter: Letter | null, loopType: LOOPType) {
    if (isApplying) return;
    onApply(loopType);
  }
</script>

{#if !analysis || (!isDirectlyLoopable && circularizationOptions.length === 0)}
  <div class="no-options">
    <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
    <p>No extension patterns available for this sequence.</p>
  </div>
{:else}
  <div class="options-container">
    <div class="status-header">
      <div class="placement-info">
        <div class="placement-row">
          <span class="label">Start</span>
          <span class="placement">{analysis.startPlacement}</span>
        </div>
        <span class="placement-arrow" aria-hidden="true">→</span>
        <div class="placement-row">
          <span class="label">End</span>
          <span class="placement">{analysis.currentEndPlacement}</span>
        </div>
      </div>

      <!--
        The status line changes as the sequence does, and its variants differ
        in width. Hidden copies of every variant hold the box open to the
        longest so switching sequences never resizes the header and shoves
        the option grid (no-layout-shift.md).
      -->
      <p class="status-line" class:open={orientationRepeat !== null}>
        <span class="status-sizer" aria-hidden="true">
          <span
            >Ends at {analysis.currentEndPlacement}. Choose a closing pattern.</span
          >
          <span
            >Returns to {analysis.currentEndPlacement} after
            {orientationRepeat?.count ?? 8} repeats.</span
          >
          <span>Placement and orientation both close.</span>
        </span>
        <span class="status-live">{statusLine}</span>
      </p>
    </div>

    {#if !isDirectlyLoopable}
      <BridgePictographGrid
        options={circularizationOptions}
        onSelect={handleBridgeSelect}
        isLoading={isApplying}
      />
    {:else}
      <LOOPPicker
        directOptions={availableDirectOptions}
        circularizationOptions={[]}
        onSelect={handleLoopSelect}
        directUnavailableReason={null}
        {orientationRepeat}
        {onOrientationRepeat}
        {isApplying}
      />
    {/if}
  </div>
{/if}

<style>
  .no-options {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px 24px;
    text-align: center;
    color: var(--theme-text-dim);
    flex: 1;
  }

  .no-options i {
    font-size: var(--font-size-2xl, 2rem);
    opacity: 0.6;
  }

  /* The status stays pinned above a picker that centers its compact choice shelf. */
  .options-container {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 8px 10px 10px;
    gap: 8px;
    overflow: hidden;
  }

  .options-container > :global(.loop-picker) {
    flex: 1;
    min-height: 0;
  }

  .status-header {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.625rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 8px);
    flex-shrink: 0;
  }

  .placement-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--font-size-sm, 14px);
  }

  .placement-row {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
  }

  .label {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .placement {
    font-family: monospace;
    /* Placements swap between sequences; equal digit widths keep the row still. */
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--theme-accent);
  }

  .placement-arrow {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  /* Ghost-sizer: the cell sizes to the longest variant, the live text overlays it. */
  .status-line {
    display: inline-grid;
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.4;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    min-width: 0;
  }

  .status-line.open {
    color: var(--semantic-warning, #f5c542);
  }

  .status-sizer,
  .status-live {
    grid-area: 1 / 1;
  }

  /*
   * The variants overlap in a single cell rather than stacking, so the sizer
   * contributes the WIDEST variant's width at one line's height — not three
   * lines of dead space.
   */
  .status-sizer {
    visibility: hidden;
    display: grid;
  }

  .status-sizer > span {
    grid-area: 1 / 1;
  }

  @container sequence-action-subview (max-width: 340px) {
    .status-header {
      grid-template-columns: 1fr;
      gap: 0.375rem;
    }
  }
</style>
