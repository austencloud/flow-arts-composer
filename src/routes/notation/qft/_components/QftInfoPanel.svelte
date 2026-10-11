<script lang="ts">
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { SOURCES, TIMELINE } from "#lib/shared/notation/qft/qft-guide.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import { getQftAppContext } from "../_context/qft-app-context";

  const app = getQftAppContext();
  let closeButton = $state<HTMLButtonElement>();

  onMount(() => closeButton?.focus());

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") app.closeInfo();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<button
  type="button"
  class="scrim"
  aria-label="Close information about QfT notation"
  onclick={app.closeInfo}
  transition:fade={{ duration: DURATION.fast }}
></button>

<div
  class="info-panel themed-scrollbar"
  role="dialog"
  aria-modal="true"
  aria-labelledby="qft-info-title"
  transition:fly={{ x: 80, duration: DURATION.normal }}
>
  <header>
    <h2 id="qft-info-title">QfT Notation</h2>
    <button
      type="button"
      class="close"
      onclick={app.closeInfo}
      bind:this={closeButton}>Close</button
    >
  </header>

  <p>
    Charlie Cushing devised this poi notation, and Ben "DrexFactor" Drexler
    wrote it up in 2011. QfT is Quantized Field Theory, Charlie's broader idea;
    the notation is one application. Charlie writes QfT, while Drex writes QFT.
  </p>
  <p>
    The guide was posted to the Home of Poi forum and Drex's blog. The forum
    copy has lost its images. The blog still serves them. Each motion here runs
    through a model built from the published rules.
  </p>
  <p class="note">
    The article credits Charlie with devising the system and does not identify
    the diagram artist, so the diagrams are attributed to the guide.
  </p>

  <h3>Sources</h3>
  <ul>
    {#each SOURCES as source (source.href)}
      <li>
        <LinkChip href={source.href}>{source.label}</LinkChip>
      </li>
    {/each}
  </ul>

  <h3>Dates</h3>
  <ol class="timeline">
    {#each TIMELINE as entry (entry.when)}
      <li>
        <span>{entry.when}</span>
        <p>{entry.what}</p>
      </li>
    {/each}
  </ol>

  <p class="note">
    The published direction column has two variants. This app uses Drex's rule,
    where direction remains on the eight-point compass. The source model keeps
    both variants for comparison.
  </p>
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

  .info-panel {
    position: fixed;
    inset-block: 0;
    inset-inline-end: 0;
    z-index: 6;
    width: min(34rem, 94vw);
    overflow-y: auto;
    padding: 1.25rem;
    background: var(--theme-panel-bg, #111426);
    color: var(--theme-text, #fff);
    box-shadow: -1rem 0 3rem rgb(0 0 0 / 0.35);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 1.45rem;
  }

  h3 {
    margin-top: 1.35rem;
    color: var(--theme-text, #fff);
    font-size: 1rem;
  }

  p,
  li {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.55;
  }

  .info-panel > p + p {
    margin-top: 0.8rem;
  }

  .note {
    padding: 0.75rem;
    border-left: 0.2rem solid var(--theme-accent, #8b5cf6);
    background: var(--theme-card-bg, rgb(255 255 255 / 0.04));
  }

  ul,
  ol {
    display: grid;
    gap: 0.55rem;
    padding-inline-start: 1.25rem;
  }

  .timeline li {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr);
    gap: 0.65rem;
  }

  .timeline li > span {
    color: var(--theme-text, #fff);
    font-weight: 700;
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

  @media (max-width: 30rem) {
    .info-panel {
      width: 100vw;
    }

    .timeline li {
      grid-template-columns: 1fr;
      gap: 0.15rem;
    }
  }
</style>
