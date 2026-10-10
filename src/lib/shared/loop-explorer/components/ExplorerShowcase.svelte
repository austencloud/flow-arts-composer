<!-- src/lib/shared/loop-explorer/components/ExplorerShowcase.svelte
  The generated-example stage: a sized box (aspect reserved before any
  pictograph loads, per no-layout-shift) holding a step grid — 16-count
  renders 4x4, 8-count renders 4x2 (the multiplier the selection resolved to
  determines which). Each cell is a `.tka-seq-cell` primitive wrapping the
  shared PictographContainer renderer; a transparent hit button drives the
  bidirectional step<->relation highlight owned by loop-explorer-state.
  Crossfade (fill mode) covers example swaps so a refresh/selection change
  never reflows the stage. Word display goes through simplifyRepeatedWord. -->
<script lang="ts">
  import "#lib/shared/selection/selection.css";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { getLoopExplorerContext } from "../state/loop-explorer-state.svelte";

  const state = getLoopExplorerContext();

  // 16-count -> 4x4, 8-count -> 4x2 (spec's "default aspiration"); 4 columns
  // either way, row count follows the actual generated length.
  const columns = 4;
  const rows = $derived.by(() => {
    const count = state.example?.sequence.steps.length ?? 16;
    return Math.max(1, Math.ceil(count / columns));
  });

  function handleRefresh() {
    void state.refresh();
  }
</script>

<div class="showcase">
  <div class="showcase-header">
    <div class="word">
      {#if state.example}
        {simplifyRepeatedWord(state.example.sequence.word)}
      {:else}
        &nbsp;
      {/if}
    </div>
    <ActionButton
      label="New example"
      icon="fa-arrows-rotate"
      color="cyan"
      busy={state.status === "loading"}
      busyLabel="Generating…"
      disabled={!state.legality.legal}
      onclick={handleRefresh}
    />
  </div>

  <div class="stage" style={`--cols:${columns}; --rows:${rows}`}>
    <Crossfade key={state.example?.sequence.word ?? state.status} fill>
      {#if state.status === "loading" && !state.example}
        <div class="stage-status" role="status">Generating a verified example…</div>
      {:else if state.status === "empty"}
        <div class="stage-status">
          {state.legality.legal
            ? "Couldn't verify an example for this selection yet. Try Refresh."
            : (state.legality.reason ?? "Select a legal combination to see an example.")}
        </div>
      {:else if state.example}
        {@const example = state.example}
        <div class="grid">
          {#each example.sequence.steps as step, i (step.id)}
            {@const stepNumber = i + 1}
            {@const isHighlighted =
              state.highlightedStep === stepNumber ||
              (state.highlightedRelation != null &&
                state.stepsForRelation(state.highlightedRelation).includes(stepNumber))}
            <div
              class="cell tka-seq-cell"
              class:is-hovered={isHighlighted}
            >
              <PictographContainer pictographData={step} disableTransitions cellIndex={i} />
              <button
                type="button"
                class="tka-seq-hit"
                aria-label={`Step ${stepNumber}`}
                aria-pressed={state.highlightedStep === stepNumber}
                onpointerenter={() => state.hoverStep(stepNumber)}
                onpointerleave={() => state.hoverStep(null)}
                onclick={() =>
                  state.selectStep(state.highlightedStep === stepNumber ? null : stepNumber)}
              ></button>
              <span class="step-number">{stepNumber}</span>
            </div>
          {/each}
        </div>
      {/if}
    </Crossfade>
  </div>
</div>

<style>
  .showcase {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
  }

  .showcase-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .word {
    font-family: var(--font-tka, inherit);
    font-size: clamp(1.1rem, 2.4cqw, 1.6rem);
    font-weight: 700;
    color: var(--theme-text, #fff);
    min-height: 1.6em;
  }

  /* Aspect reserved up front — the grid box never resizes as pictographs
     stream in or the example swaps (no-layout-shift rule). */
  .stage {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 16px;
    background: var(--theme-panel-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    overflow: hidden;
  }

  .stage-status {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    text-align: center;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
  }

  .grid {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    grid-template-rows: repeat(var(--rows), 1fr);
    gap: 2px;
    padding: 2px;
  }

  .cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border-radius: 6px;
    min-width: 0;
    min-height: 0;
  }

  .cell :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }

  .step-number {
    position: absolute;
    top: 4px;
    left: 6px;
    z-index: 3;
    font-size: var(--font-size-compact, 0.7rem);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim);
    pointer-events: none;
  }
</style>
