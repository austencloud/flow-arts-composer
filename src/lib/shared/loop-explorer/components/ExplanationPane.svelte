<!-- src/lib/shared/loop-explorer/components/ExplanationPane.svelte
  Renders explanation-builder's structured output: intro sentence, one
  interactive citation per step-pair relation, and the closing
  "seed x multiplier = length" line. Each citation is a real <button> (per
  clickables-look-like-buttons) whose hover/click highlights its step pair in
  the showcase grid, mirroring the grid's own step->relation highlight — both
  directions read from the same loop-explorer-state. -->
<script lang="ts">
  import { getLoopExplorerContext } from "../state/loop-explorer-state.svelte";

  const state = getLoopExplorerContext();
</script>

<div class="pane" aria-live="polite">
  {#if state.status === "loading" && !state.explanation}
    <p class="hint">Generating a verified example…</p>
  {:else if state.explanation}
    {@const explanation = state.explanation}
    <p class="intro">{explanation.intro}</p>

    {#if explanation.citations.length > 0}
      <ul class="citations">
        {#each explanation.citations as citation, i (i)}
          <li>
            <button
              type="button"
              class="citation"
              class:active={state.highlightedRelation === i}
              onpointerenter={() => state.hoverRelation(i)}
              onpointerleave={() => state.hoverRelation(null)}
              onclick={() =>
                state.selectRelation(
                  state.highlightedRelation === i ? null : i
                )}
            >
              {citation}
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <p class="length-math">{explanation.lengthMath}</p>
  {:else}
    <p class="hint">
      {state.legality.reason ??
        "Select a legal combination to see how it's built."}
    </p>
  {/if}
</div>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    min-width: 0;
  }

  .intro {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    line-height: 1.5;
    color: var(--theme-text, #fff);
  }

  .hint {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim);
  }

  .citations {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .citation {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.55rem 0.75rem;
    min-height: var(--min-touch-target, 44px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.82rem);
    line-height: 1.4;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
  }

  .citation:hover,
  .citation.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 14%,
      transparent
    );
    border-color: var(--theme-accent, #6366f1);
    color: var(--theme-text, #fff);
  }

  .citation:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .length-math {
    margin: 0;
    padding-top: 0.35rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    font-variant-numeric: tabular-nums;
    font-size: var(--font-size-compact, 0.82rem);
    color: var(--theme-text-dim);
  }

  @media (prefers-reduced-motion: reduce) {
    .citation {
      transition: none;
    }
  }
</style>
