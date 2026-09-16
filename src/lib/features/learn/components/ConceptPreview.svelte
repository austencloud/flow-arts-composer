<script lang="ts">
  import { TND_ELEMENTS } from "$lib/features/choreo-card/domain/tnd-element";
  import LessonGridDisplay from "$lib/shared/pictograph/grid/components/LessonGridDisplay.svelte";

  let { conceptId } = $props<{ conceptId: string }>();

  // Still previews reuse the Guide and lesson artwork without starting players.
  const guideArt: Record<string, string> = {
    "hand-placements": "hand-placements/α1.png",
    "hand-motions-intro": "hand-motions/shift_north.png",
    "rotation-direction": "double-staff-codex/B.webp",
    "dual-shifts-alpha-beta": "double-staff-codex/G.webp",
    "gamma-motion": "hand-placements/Γ1.png",
    "staff-placements": "staff-placements/alpha_in_out.png",
    "letter-codex-intro": "double-staff-codex/A.webp",
  };
  const artwork = $derived(guideArt[conceptId]);
  const letters = $derived(
    conceptId === "words-alpha-beta"
      ? ["A", "A", "A", "A"]
      : ["A", "B", "C", "G", "H", "I"]
  );
</script>

<div class="concept-preview" aria-hidden="true">
  {#if conceptId === "grid"}
    <LessonGridDisplay type="merged" size="small" />
  {:else if conceptId === "timing-and-direction"}
    <div class="elements">
      {#each TND_ELEMENTS as element}
        <img
          src={element.iconPath}
          alt=""
          width="40"
          height="40"
          loading="lazy"
        />
      {/each}
    </div>
  {:else if artwork}
    <img
      class="guide-art"
      src={`/guide/level-1/images/${artwork}`}
      alt=""
      width="950"
      height="950"
      loading="lazy"
    />
  {:else if conceptId === "type1-abc-ghi" || conceptId === "words-alpha-beta"}
    <div class="letters" class:word={conceptId === "words-alpha-beta"}>
      {#each letters as letter}
        <img
          src={`/images/letters_trimmed/Type1/${letter}.svg`}
          alt=""
          width="36"
          height="42"
          loading="lazy"
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .concept-preview {
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--radius-md, 0.5rem);
    background: var(--theme-panel-bg);
  }
  .guide-art {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .elements,
  .letters {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem;
    width: 100%;
  }
  .elements img,
  .letters img {
    width: 100%;
    height: auto;
    max-height: 2.75rem;
    object-fit: contain;
  }
  .letters {
    background: var(--dm-pictograph-bg, #0a0a0f);
    height: 100%;
  }
  .letters img {
    filter: invert(1);
  }
  .word {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 0.75rem;
  }
</style>
