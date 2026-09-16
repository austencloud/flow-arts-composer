<!--
  Name That Pictograph — hub preview.

  The game's actual rhythm, played by real components: a REAL pictograph
  (PictographContainer on the same CSV data the quiz draws from) holds the
  stage, then its answer letter stamps in beside it in the real TKA Letters
  font. Three question/answer beats loop as three stacked layers with offset
  opacity keyframes — pure CSS, so the shared [data-paused] rule freezes it
  offscreen and reduced-motion pins the first beat as a static frame.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { loadPreviewPictographs } from "./preview-pictographs";

  let { accent }: { accent: string } = $props();

  const LETTERS = ["A", "G", "K"];
  let pictos = $state<PictographData[]>([]);

  onMount(() => {
    loadPreviewPictographs(LETTERS).then((loaded) => {
      pictos = loaded;
    });
  });
</script>

<div class="stage" style="--accent: {accent}" aria-hidden="true">
  {#each pictos as picto, i (String(picto.letter))}
    <div class="beat" class:first={i === 0} style="--beat: {i}; --beats: {pictos.length}">
      <div class="picto-frame">
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
      <span class="answer tka-font">{String(picto.letter)}</span>
    </div>
  {/each}
</div>

<style>
  .stage {
    position: absolute;
    inset: 0;
    container-type: size;
  }

  /* Each beat = one question/answer cycle. Layers share the stage; opacity
     keyframes give each one an equal slice of the loop. */
  .beat {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6cqi;
    opacity: 0;
    animation: beat-cycle calc(var(--beats) * 4s) linear infinite;
    animation-delay: calc(var(--beat) * 4s);
  }

  .picto-frame {
    height: 78cqh;
    aspect-ratio: 1;
    border-radius: 10px;
    overflow: hidden;
    background: rgba(10, 10, 15, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  /* The answer letter lands after the pictograph has had its "question"
     moment — its keyframes sit inside the beat's visible window. */
  .answer {
    font-family: "TKA Letters", var(--font-sans, sans-serif);
    font-feature-settings: "liga" 1, "dlig" 1;
    font-size: 30cqh;
    line-height: 1;
    color: var(--accent);
    text-shadow: 0 0 18px color-mix(in srgb, var(--accent) 55%, transparent);
    opacity: 0;
    animation: answer-stamp calc(var(--beats) * 4s) linear infinite;
    animation-delay: calc(var(--beat) * 4s);
  }

  /* Visible for roughly one 4s slice of the loop (fractions tuned for the
     3-beat cycle; hidden outside the window regardless of beat count). */
  @keyframes beat-cycle {
    0% { opacity: 0; }
    3% { opacity: 1; }
    30% { opacity: 1; }
    33.3% { opacity: 0; }
    100% { opacity: 0; }
  }

  @keyframes answer-stamp {
    0%, 12% { opacity: 0; transform: scale(1.3); }
    17% { opacity: 1; transform: scale(1); }
    30% { opacity: 1; }
    33.3% { opacity: 0; }
    100% { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .beat,
    .answer {
      animation: none;
    }

    /* Static frame: first question/answer pair, settled. */
    .beat.first,
    .beat.first .answer {
      opacity: 1;
      transform: none;
    }
  }
</style>
