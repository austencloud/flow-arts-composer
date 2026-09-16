<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

  let {
    letter,
    detail,
    pictograph = null,
    bridge = false,
  }: {
    letter: string;
    detail: string;
    pictograph?: PictographData | null;
    bridge?: boolean;
  } = $props();
</script>

<div class="letter-card" class:bridge aria-label="{letter}. {detail}">
  <div class="pictograph-box" aria-hidden="true">
    {#if pictograph}
      <PictographContainer
        pictographData={pictograph}
        showTKA={false}
        showPlacements={true}
        disableTransitions={true}
      />
    {:else}
      <span class="letter-fallback">{letter}</span>
    {/if}
  </div>
  <strong class="letter-label">{letter}</strong>
  <span class="placement-label">{detail}</span>
</div>

<style>
  .letter-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 0 0 clamp(68px, 16cqi, 112px);
    gap: 0.2rem;
    min-width: 0;
  }

  .pictograph-box {
    display: grid;
    place-items: center;
    width: clamp(64px, 15cqi, 108px);
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: clamp(10px, 2cqi, 16px);
    background: rgba(6, 9, 15, 0.82);
  }

  .letter-card.bridge .pictograph-box {
    border-color: color-mix(in srgb, var(--game-accent) 70%, transparent);
    box-shadow: 0 0 24px -12px var(--game-accent);
  }

  .letter-fallback {
    color: var(--theme-text);
    font-family: "JetBrains Mono", "Fira Code", "SF Mono", monospace;
    font-size: clamp(1.5rem, 6cqi, 2.75rem);
    font-weight: 850;
  }

  .letter-label {
    color: var(--theme-text);
    font-family: "JetBrains Mono", "Fira Code", "SF Mono", monospace;
    font-size: var(--font-size-min, 14px);
    line-height: 1.1;
  }

  .placement-label {
    min-height: 2.5em;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
  }

  @container (max-width: 340px) {
    .letter-card {
      flex-basis: 56px;
    }

    .pictograph-box {
      width: 52px;
    }
  }
</style>
