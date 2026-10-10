<script lang="ts">
  import type { Snippet } from "svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  let {
    key,
    title,
    eyebrow,
    children,
  }: {
    key: unknown;
    title: string;
    eyebrow?: string;
    children: Snippet;
  } = $props();
</script>

<div class="lesson-stage-heading">
  <Crossfade {key} duration={DURATION.normal}>
    <div class="heading-copy">
      {#if eyebrow}<span class="eyebrow">{eyebrow}</span>{/if}
      <h1>{title}</h1>
      <div class="description">{@render children()}</div>
    </div>
  </Crossfade>
</div>

<style>
  .lesson-stage-heading {
    min-width: 0;
    text-align: center;
  }

  .heading-copy {
    display: grid;
    justify-items: center;
    gap: 0.35rem;
  }

  .eyebrow {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.12em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: var(--theme-text);
    font-size: clamp(1.75rem, 2.5vw, 2.5rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.05;
  }

  .description {
    min-height: 1.65em;
    color: var(--theme-text-dim);
    font-size: clamp(1rem, 1.4vw, 1.25rem);
    line-height: 1.45;
  }

  .description :global(p) {
    margin: 0;
  }

  .description :global(strong) {
    color: var(--theme-text);
    font-weight: 700;
  }

  @media (max-height: 760px) {
    .heading-copy {
      gap: 0.2rem;
    }

    h1 {
      font-size: clamp(1.5rem, 3.5vh, 1.9rem);
    }

    .description {
      font-size: var(--font-size-min, 0.875rem);
      line-height: 1.3;
    }
  }

  @media (min-width: 2400px) and (min-height: 1300px) {
    .eyebrow {
      font-size: 0.9rem;
    }

    h1 {
      font-size: 3.25rem;
    }

    .description {
      font-size: 1.45rem;
    }
  }
</style>
