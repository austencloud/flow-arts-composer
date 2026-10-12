<script lang="ts">
  /**
   * CandidateGrid
   *
   * The 2×3 grid of candidate stance cards plus the action bar below.
   * Replaces the old single-stance slider-first labeling flow.
   *
   * ## UX flow
   *
   *   1. Land on a pose → state factory generates six diverse candidates,
   *      cached on the pose. This component reads them via context.
   *   2. Reviewer scans the grid. Clicks a card → `pickCandidate(i)`,
   *      which applies the candidate's stance to the live sliders (the
   *      main viewer shows the exact same pose at full size) and marks
   *      the card as picked.
   *   3. Reviewer decides:
   *      - "Clear" / "Needs adjustment" - commits a label with the
   *        current stance + the full candidate history.
   *      - "Different options" - throws out the six cards and generates
   *        six fresh diverse ones (with existing history preserved).
   *      - "Refine" - (only after a pick) generates six small
   *        perturbations around the picked stance.
   *      - "Give up on this pose" - labels as unreachable with the
   *        full history, auto-advances to the next pose.
   *
   * The main viewer (PoseViewport) reads the same stance state, so
   * picking a candidate smoothly previews it at full fidelity with no
   * additional plumbing.
   */

  import { getCollisionLabContext } from "../context/collision-lab-context";
  import CandidateCard from "./CandidateCard.svelte";

  const labCtx = getCollisionLabContext();

  const pose = $derived(labCtx.state.currentPose);
  const candidateSet = $derived(labCtx.state.currentCandidateSet);
  const pickedIndex = $derived(candidateSet?.pickedIndex ?? null);
  const hasPicked = $derived(pickedIndex !== null);
  const mode = $derived(candidateSet?.mode ?? "diverse");

  function handlePick(index: number) {
    labCtx.state.pickCandidate(index);
  }

  function handleDifferent() {
    labCtx.state.regenerateDiverse();
  }

  function handleRefine() {
    labCtx.state.regenerateRefine();
  }

  function handleGiveUp() {
    labCtx.state.giveUpOnPose();
  }
</script>

{#if pose && candidateSet}
  <div class="candidate-grid-panel">
    <header class="grid-header">
      <span class="header-title">
        Six takes for
        <span class="pose-id">{pose.id}</span>
      </span>
      {#if mode === "refine"}
        <span class="mode-indicator">Refining picked</span>
      {/if}
    </header>

    <div class="card-grid">
      {#each candidateSet.candidates as candidate (candidate.index)}
        <CandidateCard
          {candidate}
          {pose}
          picked={pickedIndex === candidate.index}
          onPick={handlePick}
        />
      {/each}
    </div>

    <div class="action-bar">
      <button
        type="button"
        class="action-button secondary"
        onclick={handleDifferent}
        title="Discard these six and generate six new ones from different starting seeds."
      >
        Different options
      </button>

      {#if hasPicked}
        <button
          type="button"
          class="action-button secondary"
          onclick={handleRefine}
          title="Generate six small variations around the picked stance."
        >
          Refine
        </button>
      {/if}

      <button
        type="button"
        class="action-button danger"
        onclick={handleGiveUp}
        title="Label this pose as unreachable. The full candidate history is saved for later analysis."
      >
        Give up on this pose
      </button>
    </div>
  </div>
{:else if pose && !candidateSet}
  <div class="candidate-grid-panel">
    <div class="loading-message">Generating candidates…</div>
  </div>
{/if}

<style>
  .candidate-grid-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    background: var(--theme-panel-bg, rgba(10, 10, 20, 0.6));
    border-radius: 12px;
    container-type: inline-size;
    /* Fill the outer grid area so the 2×3 layout can use the full
       available height instead of collapsing to content. */
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
  }

  .grid-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 0 4px;
    flex-shrink: 0;
  }

  .header-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--theme-text-primary, #f0f0f0);
  }

  .pose-id {
    font-family: var(--font-mono, monospace);
    color: var(--theme-accent, #7bc3ff);
    font-weight: 500;
  }

  .mode-indicator {
    font-size: 11px;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    font-style: italic;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 10px;
    /* Let the card grid fill the remaining space between header and
       action bar so thumbnails scale with the available area instead
       of being locked to their min-height. */
    flex: 1;
    min-height: 0;
  }

  /* Stack to a single column when the panel is narrow (mobile / narrow
     sidebar). Uses container queries so layout responds to the panel
     itself, not the viewport. */
  @container (max-width: 520px) {
    .card-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(3, minmax(0, 1fr));
    }
  }
  @container (max-width: 320px) {
    .card-grid {
      grid-template-columns: 1fr;
      grid-template-rows: repeat(6, minmax(0, 1fr));
    }
  }

  .action-bar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 4px 0;
  }

  .action-button {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text-primary, #f0f0f0);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }

  .action-button:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-accent, #7bc3ff);
  }

  .action-button:focus-visible {
    outline: 2px solid var(--theme-accent, #7bc3ff);
    outline-offset: 2px;
  }

  .action-button.danger:hover {
    border-color: #f87171;
    color: #f87171;
  }

  .loading-message {
    padding: 24px;
    text-align: center;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    font-size: 13px;
  }
</style>
