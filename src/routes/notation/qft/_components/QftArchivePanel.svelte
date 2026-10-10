<script lang="ts">
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import QftFrames from "#lib/shared/notation/qft/components/QftFrames.svelte";
  import { GUIDE_MOVES } from "#lib/shared/notation/qft/qft-guide.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { getQftAppContext } from "../_context/qft-app-context";

  const app = getQftAppContext();
  let closeButton = $state<HTMLButtonElement>();

  onMount(() => closeButton?.focus());

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") app.closeArchive();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<button
  type="button"
  class="scrim"
  aria-label="Close the 2011 diagrams"
  onclick={app.closeArchive}
  transition:fade={{ duration: DURATION.fast }}
></button>

<div
  class="archive-panel themed-scrollbar"
  role="dialog"
  aria-modal="true"
  aria-labelledby="qft-archive-title"
  transition:fly={{ x: 80, duration: DURATION.normal }}
>
  <header>
    <div>
      <h2 id="qft-archive-title">The 2011 diagrams</h2>
      <p>
        From <LinkChip
          size="inline"
          wrap
          href="https://drexfactor.com/weirdscience/2011/05/18/beginners_guide_poi_qft_notation"
          >A Beginner's Guide to Prop QFT Notation</LinkChip
        >. The forum copy of the same post lost every image.
      </p>
    </div>
    <button
      type="button"
      class="close"
      onclick={app.closeArchive}
      bind:this={closeButton}>Close</button
    >
  </header>

  <div class="archive-grid">
    {#each GUIDE_MOVES as move (move.id)}
      <figure
        class:current={move.id === app.leftPresetId ||
          move.id === app.rightPresetId}
      >
        <div class="frame" style={`--aspect: ${move.aspect}`}>
          <QftFrames
            stem={move.stem}
            step={app.step}
            alt={`${move.title}, as published in Drex's 2011 guide`}
          />
        </div>
        <figcaption>{move.title}</figcaption>
      </figure>
    {/each}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 5;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: rgb(0 0 0 / 0.68);
    cursor: pointer;
  }

  .archive-panel {
    position: fixed;
    inset-block: 0;
    inset-inline-end: 0;
    z-index: 6;
    width: min(64rem, 94vw);
    overflow-y: auto;
    padding: 1rem;
    background: var(--theme-panel-bg, #111426);
    color: var(--theme-text, #fff);
    box-shadow: -1rem 0 3rem rgb(0 0 0 / 0.35);
  }

  header {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin: -1rem -1rem 1rem;
    padding: 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    background: var(--theme-panel-bg, #111426);
  }

  h2,
  p,
  figure {
    margin: 0;
  }

  h2 {
    font-size: 1.35rem;
  }

  header p {
    margin-top: 0.35rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.45;
  }

  .close {
    min-height: var(--min-touch-target, 44px);
    padding-inline: 1rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.16));
    border-radius: 999px;
    background: var(--theme-card-bg, rgb(255 255 255 / 0.06));
    color: var(--theme-text, #fff);
    cursor: pointer;
  }

  .archive-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 0.8rem;
  }

  figure {
    display: grid;
    gap: 0.4rem;
    padding: 0.65rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    border-radius: var(--radius-2026-sm, 0.75rem);
    background: var(--theme-card-bg, rgb(255 255 255 / 0.04));
  }

  figure.current {
    border-color: var(--theme-accent, #8b5cf6);
  }

  .frame {
    display: grid;
    place-items: center;
    min-height: 8rem;
    aspect-ratio: var(--aspect);
    overflow: hidden;
    border-radius: 0.5rem;
    background: #fff;
  }

  figcaption {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
  }

  @media (min-width: 52rem) {
    .archive-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (max-width: 30rem) {
    .archive-panel {
      width: 100vw;
    }

    header {
      align-items: center;
    }

    header p {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .scrim,
    .archive-panel {
      transition: none;
    }
  }
</style>
