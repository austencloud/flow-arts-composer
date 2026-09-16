<!--
  Picture This — hub preview. The game's actual selection flow, acted out:
  the REAL TKA letter asks the question, the ring considers two wrong
  pictographs, then lands on the right one — press, lock, dim the rest —
  and resets. All four answers are REAL pictographs (PictographContainer,
  same CSV data the game quizzes from). One shared 8s CSS timeline, windows
  baked into per-role keyframes, so [data-paused] freezes the whole story
  and reduced-motion shows the final locked-in frame.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { loadPreviewPictographs } from "./preview-pictographs";

  let { accent }: { accent: string } = $props();

  /* First letter = the question AND the correct tile the ring settles on. */
  const LETTERS = ["B", "D", "J", "P"];
  let pictos = $state<PictographData[]>([]);

  onMount(() => {
    loadPreviewPictographs(LETTERS).then((loaded) => {
      pictos = loaded;
    });
  });

  const answerPicto = $derived(pictos[0] ?? null);
</script>

<div class="stage" style="--accent: {accent}" aria-hidden="true">
  {#if answerPicto && pictos.length >= 4}
    <span class="question tka-font">{String(answerPicto.letter)}</span>
    <div class="options">
      {#each pictos as picto, i (String(picto.letter))}
        <div
          class="tile"
          class:target={i === 0}
          class:visit-one={i === 1}
          class:visit-two={i === 2}
        >
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
          <span class="ring"></span>
          <span class="shade"></span>
        </div>
      {/each}
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
    gap: 8cqi;
  }

  .question {
    font-family: "TKA Letters", var(--font-sans, sans-serif);
    font-feature-settings: "liga" 1, "dlig" 1;
    font-size: 46cqh;
    line-height: 1;
    color: var(--accent);
    text-shadow: 0 0 22px color-mix(in srgb, var(--accent) 55%, transparent);
  }

  .options {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4cqh;
    height: 82cqh;
    aspect-ratio: 1;
  }

  .tile {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(10, 10, 15, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  /* One 8s selection story, shared phase across every layer:
     0-14%   question breathes, board neutral
     16-28%  ring considers wrong tile 1
     30-42%  ring considers wrong tile 2
     46-52%  lands on the answer (press)
     52-88%  locked in, other tiles shaded
     92-100% reset */
  .ring,
  .shade {
    position: absolute;
    inset: 0;
    border-radius: 8px;
    opacity: 0;
    pointer-events: none;
  }

  .ring {
    border: 2px solid var(--accent);
  }

  .shade {
    background: rgba(5, 6, 10, 0.55);
  }

  .tile.visit-one .ring {
    animation: consider-one 8s linear infinite;
  }

  .tile.visit-two .ring {
    animation: consider-two 8s linear infinite;
  }

  .tile.target .ring {
    animation: lock-in 8s linear infinite;
  }

  .tile.target {
    animation: press 8s linear infinite;
  }

  .tile:not(.target) .shade {
    animation: shade-others 8s linear infinite;
  }

  @keyframes consider-one {
    0%, 16% { opacity: 0; }
    19%, 26% { opacity: 0.8; }
    28%, 100% { opacity: 0; }
  }

  @keyframes consider-two {
    0%, 30% { opacity: 0; }
    33%, 40% { opacity: 0.8; }
    42%, 100% { opacity: 0; }
  }

  @keyframes lock-in {
    0%, 46% { opacity: 0; }
    50%, 88% { opacity: 1; }
    92%, 100% { opacity: 0; }
  }

  @keyframes press {
    0%, 46% { transform: scale(1); }
    49% { transform: scale(0.94); }
    52%, 100% { transform: scale(1); }
  }

  @keyframes shade-others {
    0%, 50% { opacity: 0; }
    56%, 88% { opacity: 1; }
    92%, 100% { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .tile,
    .tile .ring,
    .tile .shade {
      animation: none;
    }

    /* Static frame: the answer locked in. */
    .tile.target .ring {
      opacity: 1;
    }

    .tile:not(.target) .shade {
      opacity: 1;
    }
  }
</style>
