<!--
  What Comes Next — hub preview. A real sequence-reading moment: two REAL
  pictographs settled in a row, and the third slot auditioning two REAL
  candidates (stacked, crossfading) until the accent ring lands. Same
  PictographContainer + CSV data as the game itself. Pure CSS motion.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { loadPreviewPictographs } from "./preview-pictographs";

  let { accent }: { accent: string } = $props();

  /* First two = the settled sequence; last two = the auditioning candidates. */
  const LETTERS = ["C", "H", "M", "S"];
  let pictos = $state<PictographData[]>([]);

  onMount(() => {
    loadPreviewPictographs(LETTERS).then((loaded) => {
      pictos = loaded;
    });
  });

  const settled = $derived(pictos.slice(0, 2));
  const candidates = $derived(pictos.slice(2));
</script>

<div class="stage" style="--accent: {accent}" aria-hidden="true">
  {#if pictos.length >= 3}
    <div class="strip">
      {#each settled as picto (String(picto.letter))}
        <div class="tile">
          <PictographContainer
            pictographData={picto}
            disableTransitions
            showTKA={false}
            showReversals={false}
            showNonRadialPoints={false}
            showTnD={false}
            showElemental={false}
            showPlacements={false}
            showHandPoints={false}
          />
        </div>
      {/each}

      <span class="arrow">→</span>

      <div class="tile candidate-slot">
        {#each candidates as picto, i (String(picto.letter))}
          <div class="candidate" style="--cand: {i}">
            <PictographContainer
              pictographData={picto}
              disableTransitions
              showTKA={false}
              showReversals={false}
              showNonRadialPoints={false}
              showTnD={false}
              showElemental={false}
              showPlacements={false}
              showHandPoints={false}
            />
          </div>
        {/each}
        <span class="ring"></span>
      </div>
    </div>
  {/if}
</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
    container-type: size;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .strip {
    display: flex;
    align-items: center;
    gap: 3.5cqi;
  }

  .tile {
    position: relative;
    height: 58cqh;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(10, 10, 15, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .arrow {
    font-size: 16cqh;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  /* The open slot auditions two real candidates. */
  .candidate {
    position: absolute;
    inset: 0;
    opacity: 0;
    animation: audition 6s ease-in-out infinite;
    animation-delay: calc(var(--cand) * 3s);
  }

  .ring {
    position: absolute;
    inset: 0;
    border: 2px solid var(--accent);
    border-radius: 8px;
    opacity: 0;
    animation: ring-land 6s linear infinite;
    pointer-events: none;
  }

  @keyframes audition {
    0% { opacity: 0; }
    8% { opacity: 1; }
    46% { opacity: 1; }
    54% { opacity: 0; }
    100% { opacity: 0; }
  }

  /* Ring lands as each candidate settles, releases during the swap. */
  @keyframes ring-land {
    0%, 20% { opacity: 0; }
    32%, 42% { opacity: 1; }
    50%, 70% { opacity: 0; }
    82%, 92% { opacity: 1; }
    100% { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .candidate,
    .ring {
      animation: none;
    }

    .candidate[style*="--cand: 0"] {
      opacity: 1;
    }

    .ring {
      opacity: 1;
    }
  }
</style>
