<script lang="ts">
  /**
   * Personal Museum Assignment Panel (Task 11)
   *
   * Out-of-world curation surface. Shows the 6 wall slots, what each holds
   * (and whether the placement is explicit/"pinned" or auto-filled from
   * Favorites), and lets the user assign / swap / clear a slot from their
   * saved sequences.
   *
   * Pure prop consumer: never touches Firestore. Mutations go through the
   * museumState methods (assign/clear), which the host's onSnapshot keeps in
   * sync with both this panel and the 3D scene — no manual refresh.
   *
   * Interaction: tap a slot to arm it (highlights), then tap a sequence in the
   * picker to place it there. Tapping the armed slot again disarms.
   */
  import { sequenceFirstStep } from "../services/sequence-first-step";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SequencePicker from "./SequencePicker.svelte";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
  import type { PersonalMuseumState } from "../state/personal-museum-state.svelte";

  interface Props {
    museumState: PersonalMuseumState;
    slotIds: string[];
    /** Sequence data for every favorite + placed id, for thumbnails + names. */
    seqById: Map<string, LibrarySequence>;
    /** Human label for a sequence id (host derives word/name). */
    displayName: (seq: LibrarySequence) => string;
  }

  let { museumState, slotIds, seqById, displayName }: Props = $props();

  let armedSlot = $state<string | null>(null);

  const resolved = $derived(museumState.resolvedSlots);
  const placements = $derived(museumState.doc.placements);
  const favorites = $derived(museumState.favoritesOrdered);

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

  function toggleArm(slotId: string) {
    armedSlot = armedSlot === slotId ? null : slotId;
  }

  async function place(sequenceId: string) {
    if (!armedSlot) return;
    await museumState.assign(armedSlot, sequenceId);
    armedSlot = null;
  }

  async function clearSlot(slotId: string) {
    await museumState.clear(slotId);
    if (armedSlot === slotId) armedSlot = null;
  }
</script>

<section class="assign-panel" aria-label="Curate your gallery">
  <header class="panel-head">
    <h2>Curate your gallery</h2>
    <p>
      {#if armedSlot}Pick a sequence to place into <strong>{slotIds.indexOf(armedSlot) + 1}</strong>.
      {:else}Tap a frame, then tap a sequence to hang it.{/if}
    </p>
  </header>

  <ul class="slot-grid">
    {#each slotIds as slotId, i (slotId)}
      {@const seqId = resolved[slotId] ?? null}
      {@const pinned = !!placements[slotId]}
      <li>
        <button
          class="slot"
          class:armed={armedSlot === slotId}
          class:empty={!seqId}
          type="button"
          aria-pressed={armedSlot === slotId}
          aria-label="Frame {i + 1}: {nameFor(seqId)}{pinned ? ', pinned' : seqId ? ', auto-filled' : ''}"
          onclick={() => toggleArm(slotId)}
        >
          <span class="slot-num">{i + 1}</span>
          <span class="thumb">
            {#if firstStep(seqId)}
              <PictographContainer pictographData={firstStep(seqId)} disableTransitions />
            {:else}
              <i class="fas fa-plus" aria-hidden="true"></i>
            {/if}
          </span>
          <span class="slot-name">{nameFor(seqId)}</span>
          <span class="slot-tag" class:is-pinned={pinned}>
            {#if seqId}
              <i class={pinned ? "fas fa-thumbtack" : "fas fa-wand-magic-sparkles"} aria-hidden="true"></i>
              {pinned ? "Pinned" : "Auto"}
            {:else}Open{/if}
          </span>
        </button>
        {#if pinned}
          <button class="clear" type="button" aria-label="Unpin frame {i + 1}" onclick={() => clearSlot(slotId)}>
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        {/if}
      </li>
    {/each}
  </ul>

  <header class="panel-head sub">
    <h3>Your sequences</h3>
  </header>

  <SequencePicker
    sequenceIds={favorites}
    {seqById}
    {displayName}
    onPick={place}
    disabled={!armedSlot}
  />
</section>

<style>
  .assign-panel {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.96));
    color: var(--theme-text, #f2efe6);
    border-radius: 14px;
    container-type: inline-size;
    overflow-y: auto;
  }

  .panel-head h2,
  .panel-head h3 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }
  .panel-head p {
    margin: 0.25rem 0 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(242, 239, 230, 0.7));
  }
  .panel-head.sub {
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    padding-top: 1rem;
  }

  .slot-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
    gap: 0.75rem;
  }
  .slot-grid li {
    position: relative;
  }

  .slot {
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
      background 150ms ease,
      transform 150ms ease;
  }
  .slot:focus-visible,
  .clear:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }
  @media (hover: hover) {
    .slot:hover {
      border-color: color-mix(in srgb, var(--theme-accent, #f59e0b) 45%, transparent);
    }
  }
  .slot.armed {
    border-color: var(--theme-accent, #f59e0b);
    background: color-mix(in srgb, var(--theme-accent, #f59e0b) 14%, transparent);
  }
  .slot.empty .thumb {
    color: var(--theme-text-dim, rgba(242, 239, 230, 0.5));
    font-size: 1.5rem;
  }

  .slot-num {
    align-self: flex-start;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim, rgba(242, 239, 230, 0.7));
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

  .slot-name {
    width: 100%;
    text-align: center;
    font-size: var(--font-size-compact, 12px);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .slot-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(242, 239, 230, 0.6));
  }
  .slot-tag.is-pinned {
    color: var(--theme-accent, #f59e0b);
  }

  .clear {
    position: absolute;
    top: -0.4rem;
    right: -0.4rem;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.96));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 50%;
    color: var(--theme-text, #f2efe6);
    cursor: pointer;
  }

  @media (prefers-reduced-motion: reduce) {
    .slot,
    .clear {
      transition: none;
    }
  }
</style>
