<script lang="ts">
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { loadSoloLibrarySequences } from "$lib/features/browse/shared/services/solo-library-sequence-loader";
  import { isStructuredSoloLoop } from "../services/solo-loop-generator";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";

  let {
    open = $bindable(false),
    side,
    length,
    onSelect,
    onClose,
  }: {
    open: boolean;
    side: FuseSide;
    length: number;
    onSelect: (sequence: SequenceData) => void;
    onClose: () => void;
  } = $props();

  let sequences = $state<readonly SequenceData[]>([]);
  let loading = $state(true);
  let loadError = $state(false);

  $effect(() => {
    if (!open) return;
    let active = true;
    loading = true;
    loadError = false;
    void loadSoloLibrarySequences({
      subject: "props",
      granularity: "solo",
      hand: side,
    })
      .then((loaded) => {
        if (!active) return;
        sequences = loaded.filter((sequence) => {
          const solo =
            side === "left" ? sequence.leftSoloProp : sequence.rightSoloProp;
          return !!solo && solo.length === length && isStructuredSoloLoop(solo);
        });
      })
      .catch(() => {
        if (active) loadError = true;
      })
      .finally(() => {
        if (active) loading = false;
      });
    return () => {
      active = false;
    };
  });

  function select(sequence: SequenceData): void {
    onClose();
    onSelect(sequence);
  }
</script>

<BaseModal
  bind:open
  onclose={onClose}
  size="xl"
  class="fuse-solo-loop-picker"
  labelledBy="solo-loop-title"
>
  {#snippet header()}
    <div class="picker-header">
      <div>
        <h2 id="solo-loop-title">Choose a saved one-hand LOOP</h2>
        <p>Only {length}-step paths that close cleanly are shown.</p>
      </div>
      <button class="close-button" onclick={onClose} aria-label="Close">
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  {/snippet}

  <div class="picker-body">
    {#if loading}
      <p class="status" role="status">Loading saved LOOPs…</p>
    {:else if loadError}
      <p class="status error" role="alert">Saved LOOPs could not be loaded.</p>
    {:else if sequences.length === 0}
      <div class="empty-state">
        <i class="fas fa-repeat" aria-hidden="true"></i>
        <p>No saved {length}-step one-hand LOOPs yet.</p>
        <span>Generate a path in Fuse, then use Save LOOP.</span>
      </div>
    {:else}
      <div class="loop-grid">
        {#each sequences as sequence, index (sequence.id)}
          <button
            class="loop-option"
            onclick={() => select(sequence)}
            aria-label={`Select saved LOOP ${index + 1}: ${sequence.name || "Untitled LOOP"}`}
          >
            <ChoreoCard
              {sequence}
              browseViewMode={{
                subject: "props",
                granularity: "solo",
                hand: side,
              }}
              columnCount={Math.min(4, length)}
              includeStartPlacement={false}
              showWord={false}
              showStepNumbers={true}
              showDifficultyLevel={false}
              showNotes={false}
              showLoopGlyph={true}
              darkMode={true}
              hideSoloHeader={true}
              fitWidth={true}
            />
            <span>{sequence.name || "Saved LOOP"}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</BaseModal>

<style>
  :global(dialog.base-modal.fuse-solo-loop-picker) {
    background:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)),
      color-mix(in srgb, var(--theme-text) 8%, black);
  }

  .picker-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--theme-text, white);
    font-size: var(--font-size-lg, 18px);
  }

  .picker-header p {
    margin-top: 3px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
  }

  .close-button,
  .loop-option {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, white);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    cursor: pointer;
  }

  .close-button {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border-radius: 50%;
  }

  .picker-body {
    min-height: 320px;
    max-height: 65vh;
    padding: 4px 18px 20px;
    overflow: auto;
  }

  .loop-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }

  .loop-option {
    display: grid;
    gap: 9px;
    min-height: 180px;
    padding: 10px;
    overflow: hidden;
    border-radius: var(--settings-radius-md, 14px);
    text-align: left;
  }

  .loop-option > span {
    overflow: hidden;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status,
  .empty-state {
    display: grid;
    place-items: center;
    min-height: 280px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    text-align: center;
  }

  .empty-state {
    align-content: center;
    gap: 12px;
  }

  .empty-state i {
    font-size: 28px;
  }

  .empty-state span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.56));
    font-size: var(--font-size-compact, 12px);
  }

  .error {
    color: var(--semantic-error, #fca5a5);
  }

  .loop-option:hover,
  .close-button:hover {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #7dd3fc) 58%,
      var(--theme-stroke)
    );
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
  }

  button:focus-visible {
    outline: 2px solid var(--theme-accent, #7dd3fc);
    outline-offset: 2px;
  }
</style>
