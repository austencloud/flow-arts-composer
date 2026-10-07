<script lang="ts">
  /**
   * SequencePicker (shared, Task 12)
   *
   * A grid of the user's saved sequences rendered as first-step pictograph
   * thumbnails. Clicking one fires onPick(sequenceId). Pure presentational +
   * selection — owns no curation state. Reused by both the out-of-world
   * assignment panel (Task 11) and the in-world placement picker (Task 12) so
   * the thumbnail-grid markup/styling lives in one place.
   */
  import { sequenceFirstStep } from "../services/sequence-first-step";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { LibrarySequence } from "$lib/shared/library/domain/models/library-sequence";

  interface Props {
    /** Ordered sequence ids to offer (favorites first, host-ordered). */
    sequenceIds: string[];
    /** Sequence data for thumbnails + names. */
    seqById: Map<string, LibrarySequence>;
    /** Human label for a sequence id. */
    displayName: (seq: LibrarySequence) => string;
    /** Fired when the user picks a sequence. */
    onPick: (sequenceId: string) => void;
    /** When true, every tile is non-interactive (e.g. no slot armed). */
    disabled?: boolean;
    /** Sequence id currently shown in the target slot (highlighted as "current"). */
    currentId?: string | null;
    /** Empty-state copy. */
    emptyLabel?: string;
  }

  let {
    sequenceIds,
    seqById,
    displayName,
    onPick,
    disabled = false,
    currentId = null,
    emptyLabel = "Favorite some sequences to hang them here.",
  }: Props = $props();

  function firstStep(id: string): PictographData | null {
    const seq = seqById.get(id);
    return sequenceFirstStep(seq);
  }

  function nameFor(id: string): string {
    const seq = seqById.get(id);
    return seq ? displayName(seq) : id;
  }
</script>

{#if sequenceIds.length === 0}
  <p class="picker-empty">{emptyLabel}</p>
{:else}
  <ul class="picker-grid" class:is-disabled={disabled}>
    {#each sequenceIds as seqId (seqId)}
      <li>
        <button
          class="pick"
          class:current={currentId === seqId}
          type="button"
          {disabled}
          aria-pressed={currentId === seqId}
          aria-label="Place {nameFor(seqId)}{currentId === seqId ? ' (currently shown)' : ''}"
          onclick={() => onPick(seqId)}
        >
          <span class="thumb">
            {#if firstStep(seqId)}
              <PictographContainer pictographData={firstStep(seqId)} disableTransitions />
            {/if}
          </span>
          <span class="pick-name">{nameFor(seqId)}</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .picker-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
    gap: 0.75rem;
  }

  .pick {
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: inherit;
    cursor: pointer;
    transition:
      border-color 150ms ease,
      background 150ms ease;
  }
  .pick:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }
  @media (hover: hover) {
    .pick:not(:disabled):hover {
      border-color: color-mix(in srgb, var(--theme-accent, #f59e0b) 45%, transparent);
    }
  }
  .picker-grid.is-disabled .pick {
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }
  .pick.current {
    border-color: var(--theme-accent, #f59e0b);
    background: color-mix(in srgb, var(--theme-accent, #f59e0b) 14%, transparent);
  }
  .pick:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .thumb {
    width: 100%;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.25);
    border-radius: 8px;
    overflow: hidden;
  }

  .pick-name {
    width: 100%;
    text-align: center;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .picker-empty {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(242, 239, 230, 0.7));
  }

  @media (prefers-reduced-motion: reduce) {
    .pick {
      transition: none;
    }
  }
</style>
