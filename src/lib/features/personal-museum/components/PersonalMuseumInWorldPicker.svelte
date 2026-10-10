<script lang="ts">
  /**
   * Personal Museum In-World Picker (Task 12)
   *
   * In-world curation surface. While walking the 3D museum, the player faces a
   * wall slot and presses E — DimensionFlipProof reports the focused slot's
   * refId up to the host, which opens this overlay for that slot. The player
   * picks one of their saved sequences to hang there (or clears an explicit
   * placement), then the overlay closes.
   *
   * Pure prop consumer: mutations go through museumState (assign/clear); the
   * host's onSnapshot keeps the 3D scene + out-of-world panel in sync.
   *
   * Visible only when focusedSlot is non-null. Closes on Escape, backdrop click,
   * or after a pick/clear, via onClose.
   */
  import { sequenceFirstStep } from "../services/sequence-first-step";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SequencePicker from "./SequencePicker.svelte";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
  import type { PersonalMuseumState } from "../state/personal-museum-state.svelte";

  interface Props {
    museumState: PersonalMuseumState;
    /** The focused wall slot's refId, or null when the overlay is closed. */
    focusedSlot: string | null;
    /** Sequence data for thumbnails + names (favorites + placed ids). */
    seqById: Map<string, LibrarySequence>;
    /** Human label for a sequence id (host derives word/name). */
    displayName: (seq: LibrarySequence) => string;
    /** Dismiss the overlay (host sets focusedSlot back to null). */
    onClose: () => void;
  }

  let { museumState, focusedSlot, seqById, displayName, onClose }: Props = $props();

  const favorites = $derived(museumState.favoritesOrdered);
  const resolved = $derived(museumState.resolvedSlots);
  const placements = $derived(museumState.doc.placements);

  // What the focused slot currently shows (resolved = explicit OR auto-filled).
  const currentId = $derived(focusedSlot ? (resolved[focusedSlot] ?? null) : null);
  // Only an explicit placement can be cleared (auto-fill has nothing to unpin).
  const isPinned = $derived(!!focusedSlot && !!placements[focusedSlot]);

  function firstStep(id: string | null): PictographData | null {
    if (!id) return null;
    const seq = seqById.get(id);
    return sequenceFirstStep(seq);
  }

  function nameFor(id: string | null): string {
    if (!id) return "Empty";
    const seq = seqById.get(id);
    return seq ? displayName(seq) : id;
  }

  async function place(sequenceId: string) {
    if (!focusedSlot) return;
    await museumState.assign(focusedSlot, sequenceId);
    onClose();
  }

  async function clearSlot() {
    if (!focusedSlot) return;
    await museumState.clear(focusedSlot);
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window onkeydowncapture={focusedSlot ? handleKeyDown : undefined} />

{#if focusedSlot}
  <div
    class="picker-backdrop"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <section class="picker-sheet" aria-label="Hang a sequence in this frame">
      <header class="sheet-head">
        <div class="head-text">
          <h2>Hang a sequence</h2>
          <p>Pick one of your sequences for this frame.</p>
        </div>
        <button class="close" type="button" aria-label="Close" onclick={onClose}>
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>
      </header>

      <div class="current">
        <span class="current-thumb" class:empty={!currentId}>
          {#if firstStep(currentId)}
            <PictographContainer pictographData={firstStep(currentId)} disableTransitions />
          {:else}
            <i class="fas fa-image" aria-hidden="true"></i>
          {/if}
        </span>
        <div class="current-meta">
          <span class="current-label">Currently</span>
          <span class="current-name">{nameFor(currentId)}</span>
        </div>
        {#if isPinned}
          <button class="clear-action" type="button" onclick={clearSlot}>
            <i class="fas fa-xmark" aria-hidden="true"></i>
            Clear
          </button>
        {/if}
      </div>

      <header class="sheet-head sub">
        <h3>Your sequences</h3>
      </header>

      <div class="picker-scroll">
        <SequencePicker
          sequenceIds={favorites}
          {seqById}
          {displayName}
          onPick={place}
          {currentId}
        />
      </div>
    </section>
  </div>
{/if}

<style>
  .picker-backdrop {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
  }

  .picker-sheet {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: min(32rem, 100%);
    max-height: min(80vh, 40rem);
    padding: 1.25rem;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    color: var(--theme-text, #f2efe6);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 16px;
    container-type: inline-size;
    overflow: hidden;
  }

  .sheet-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .sheet-head h2,
  .sheet-head h3 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }
  .sheet-head p {
    margin: 0.25rem 0 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(242, 239, 230, 0.7));
  }
  .sheet-head.sub {
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    padding-top: 1rem;
  }

  .close {
    flex: none;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 50%;
    color: inherit;
    cursor: pointer;
  }

  .current {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }
  .current-thumb {
    flex: none;
    width: 4rem;
    height: 4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    overflow: hidden;
  }
  .current-thumb.empty {
    color: var(--theme-text-dim, rgba(242, 239, 230, 0.45));
    font-size: 1.4rem;
  }
  .current-meta {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .current-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(242, 239, 230, 0.6));
  }
  .current-name {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .clear-action {
    flex: none;
    min-height: var(--min-touch-target, 44px);
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.85rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 10px;
    color: inherit;
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
  }

  .close:focus-visible,
  .clear-action:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }
  @media (hover: hover) {
    .close:hover,
    .clear-action:hover {
      border-color: color-mix(in srgb, var(--theme-accent, #f59e0b) 45%, transparent);
    }
  }

  .picker-scroll {
    overflow-y: auto;
    min-height: 0;
  }
</style>
