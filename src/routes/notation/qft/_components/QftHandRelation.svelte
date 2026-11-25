<!--
  What the two hands are doing to each other right now, read from their paths.

  Two hands on full circles keep one timing and direction. A pendulum's hand
  turns back, so its pair runs through several; every one the pair uses is
  shown, with the current one lit, so a chosen start never reads as the whole
  move (Austen, 2026-11-23).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { MODE_FAMILY_ID, MODE_WORDS, type VtgMode } from "@tka/shape-domain";
  import { TND_BY_FAMILY } from "#lib/features/choreo-card/domain/tnd-element.js";
  import { getQftAppContext } from "../_context/qft-app-context";

  const app = getQftAppContext();

  /* The saved pair is only known in the browser, and hydration keeps a server
     image's src, so the wrong element would stay beside the right name. */
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });

  const words = (mode: VtgMode) =>
    `${MODE_WORDS[mode].timing} ${MODE_WORDS[mode].direction}`;

  const current = $derived(app.handRelations[app.step] ?? null);
  const modes = $derived(
    [...new Set(app.handRelations)].flatMap((mode) => {
      const element = mode ? TND_BY_FAMILY[MODE_FAMILY_ID[mode]] : undefined;
      return mode && element ? [{ mode, element }] : [];
    })
  );
  const label = $derived(
    modes.length === 0
      ? "One hand is still, so the hands have no timing or direction"
      : modes.length === 1
        ? `Hands: ${words(modes[0]!.mode)} throughout`
        : `Hands change between ${modes.map(({ mode }) => words(mode)).join(" and ")}`
  );
</script>

<div class="hand-relation" role="img" aria-label={label}>
  {#if mounted && current && modes.length > 0}
    <span class="icons">
      {#each modes as { mode, element } (mode)}
        <img
          src={element.iconPath}
          alt=""
          class:lit={mode === current}
          style:--accent={element.accentColor}
        />
      {/each}
    </span>
    <!-- Every name is laid out in one cell, so the strip keeps its width. -->
    <span class="words">
      <small>{modes.length > 1 ? "Hands now" : "Hands"}</small>
      {#each modes as { mode } (mode)}
        <strong class:shown={mode === current}>{words(mode)}</strong>
      {/each}
    </span>
  {:else if mounted}
    <span class="words still"
      ><small>Hands</small><strong class="shown">One is still</strong></span
    >
  {/if}
</div>

<style>
  .hand-relation {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    min-height: 2.25rem;
    gap: 0.6rem;
  }

  .icons {
    display: flex;
    gap: 0.3rem;
  }

  img {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    object-fit: contain;
    opacity: 0.32;
    transition:
      opacity var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  img.lit {
    opacity: 1;
    box-shadow: 0 0 0 2px var(--accent);
  }

  .words {
    display: grid;
    line-height: 1.25;
  }

  small {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
  }

  strong {
    grid-area: 2 / 1;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
    white-space: nowrap;
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-standard);
  }

  strong.shown {
    opacity: 1;
  }

  @media (max-width: 48rem) {
    .hand-relation {
      min-height: 1.5rem;
      gap: 0.4rem;
    }

    img {
      width: 1.5rem;
      height: 1.5rem;
    }

    .words {
      grid-template-columns: auto auto;
      align-items: baseline;
      gap: 0.35rem;
    }

    strong {
      grid-area: 1 / 2;
      font-size: var(--font-size-compact, 0.75rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    img,
    strong {
      transition: none;
    }
  }
</style>
