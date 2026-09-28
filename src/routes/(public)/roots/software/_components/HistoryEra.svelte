<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    id: string;
    number: string;
    period: string;
    title: string;
    children: Snippet;
    media?: Snippet;
  }

  let { id, number, period, title, children, media }: Props = $props();
  const hasMedia = $derived(media !== undefined);
</script>

<section class="history-era" {id}>
  <div class="timeline-rail" aria-hidden="true">
    <span class="timeline-marker">{number}</span>
  </div>

  <div class="entry" class:with-media={hasMedia}>
    <div class="story">
      <header class="entry-header">
        <p class="period">{period}</p>
        <h2>{title}</h2>
      </header>

      <div class="entry-copy">
        {@render children()}
      </div>
    </div>

    {#if media}
      <div class="entry-media">
        {@render media()}
      </div>
    {/if}
  </div>
</section>

<style>
  .history-era {
    position: relative;
    padding: 0 0 clamp(4rem, 3rem + 2vw, 7rem)
      clamp(2.25rem, 1.8rem + 1vw, 3.5rem);
  }

  .timeline-rail {
    position: absolute;
    inset: 0 auto 0 0;
    width: 1.75rem;
    border-left: 1px solid
      color-mix(in oklch, var(--theme-accent, #8b6cff) 38%, transparent);
  }

  .timeline-marker {
    position: absolute;
    top: 0;
    left: 0;
    display: grid;
    place-items: center;
    width: 2rem;
    min-height: 2rem;
    padding-inline: 0.3rem;
    border: 1px solid
      color-mix(in oklch, var(--theme-accent, #8b6cff) 58%, transparent);
    border-radius: 999px;
    background: var(--theme-panel-bg, #10111c);
    color: color-mix(
      in oklch,
      var(--theme-accent, #8b6cff) 76%,
      var(--theme-text, #fff)
    );
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 760;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
    transform: translateX(-50%);
  }

  .entry,
  .story {
    min-width: 0;
  }

  .story {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 1rem);
  }

  .entry-header {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .period {
    margin: 0;
    color: color-mix(
      in oklch,
      var(--theme-accent, #8b6cff) 70%,
      var(--theme-text-dim, #a7a8b5)
    );
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 720;
    letter-spacing: 0.14em;
    line-height: 1.4;
    text-transform: uppercase;
  }

  h2 {
    max-inline-size: 18ch;
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: clamp(1.65rem, 1.35rem + 0.8vw, 2.45rem);
    font-weight: 720;
    letter-spacing: -0.025em;
    line-height: 1.08;
  }

  .entry-copy,
  .entry-media {
    min-width: 0;
  }

  .entry-media {
    margin-top: 1.5rem;
  }

  @media (min-width: 1100px) {
    .history-era {
      padding-left: clamp(3.5rem, 2.8rem + 1.2vw, 5rem);
    }

    .entry.with-media {
      display: grid;
      grid-template-columns: minmax(18rem, 0.78fr) minmax(0, 1.22fr);
      gap: clamp(2.5rem, 4vw, 5.5rem);
      align-items: start;
    }

    .entry-media {
      margin-top: 0;
    }

    .entry:not(.with-media) .story {
      display: grid;
      grid-template-columns: minmax(18rem, 0.72fr) minmax(0, 1.28fr);
      gap: clamp(2.5rem, 4vw, 5.5rem);
      align-items: start;
      max-width: 82rem;
    }
  }
</style>
