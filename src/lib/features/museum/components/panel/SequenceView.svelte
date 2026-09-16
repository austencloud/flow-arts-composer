<script lang="ts">
  import "../museum-theme.css";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { MUSEUM_EXHIBIT_SEQUENCES } from "../../data/museum-exhibit-sequences";

  interface Props {
    sequenceId: string;
  }

  let { sequenceId }: Props = $props();

  let sequence = $derived(MUSEUM_EXHIBIT_SEQUENCES[sequenceId] ?? null);
</script>

{#if sequence}
  <div class="sequence-strip museum-gold-scope">
    <div class="strip-cells">
      {#if sequence.startPlacement}
        <div class="cell start-cell">
          <PictographContainer
            pictographData={sequence.startPlacement}
            showGrid={true}
            showTKA={true}
            showPlacements={true}
            showReversals={false}
          />
        </div>
      {/if}
      {#each sequence.steps as step (step.id)}
        <div class="cell">
          <PictographContainer
            pictographData={step}
            showGrid={true}
            showTKA={true}
            showPlacements={true}
            showReversals={false}
          />
        </div>
      {/each}
    </div>
    <p class="strip-label">
      "{sequence.word}" - {sequence.steps.length} beats
    </p>
  </div>
{:else}
  <div class="sequence-unknown">
    <i class="fas fa-film" aria-hidden="true"></i>
    <p class="unknown-id">{sequenceId}</p>
  </div>
{/if}

<style>
  .sequence-strip {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .strip-cells {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    padding: 8px 0;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, var(--museum-gold-20)) transparent;
  }

  .cell {
    flex-shrink: 0;
    width: 80px;
    height: 80px;
    border-radius: 4px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--museum-gold-10);
  }

  .start-cell {
    opacity: 0.6;
    border-style: dashed;
  }

  .strip-label {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: var(--font-size-compact, 12px);
    color: var(--museum-gold-45);
    text-align: center;
    letter-spacing: 0.03em;
  }

  .sequence-unknown {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 20px;
    color: var(--museum-gold-25);
  }

  .sequence-unknown i {
    font-size: 1.2rem;
  }

  .unknown-id {
    margin: 0;
    font-family: monospace;
    font-size: var(--font-size-compact, 12px);
  }
</style>
