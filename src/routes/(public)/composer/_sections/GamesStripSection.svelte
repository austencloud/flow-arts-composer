<!--
  GamesStripSection — a marketing-demo "whole arcade at a glance": the REAL Play
  arcade game previews laid out as a horizontally-scrolling strip of tiles, one
  per registry game, each on the same 16:10 dark stage the PlayHub cards use.

  This is a TEST-page section (not shipping chrome). It reuses the shipping
  parts rather than re-drawing them:
    - GAME_REGISTRY  — the 8 games, their ids / titles / taglines / accent.
    - preview-map    — the id → *Preview.svelte mapping GameCard/LevelPicker use.
    - GameCard's stage recipe — a `container-type: size` 16:10 dark box with the
      accent glowing up from the floor. The previews are written in cq units, so
      that size container is load-bearing; without it their art renders at 0.
    - PlayHub's shared offscreen-pause observer — one IntersectionObserver
      toggles [data-paused] on each tile; the CSS below freezes every preview
      keyframe under a paused tile. That is the exact [data-paused] rule the
      CSS-animation previews are written against, so as the strip scrolls, only
      the on-screen tiles animate.

  Every preview takes just `accent`; none needs an `active` prop. The performer
  preview owns its own IntersectionObserver and lazy-loads Three.js only once
  its tile nears the viewport, so nothing here has to gate it.

  Lead order: the four games that need zero alphabet knowledge come first
  (mandala-match, motion-to-mandala, performer-word, card-to-mandala), lightly
  highlighted, then the letter/pictograph games in registry order.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { Component } from "svelte";
  import { GAME_REGISTRY } from "$lib/features/learn/play/domain/game-registry";
  import type { GameId } from "$lib/features/learn/play/domain/arcade-types";

  // Lead with the four no-alphabet-knowledge games, in this order, then the
  // rest in registry order. Titles/accents come from the registry — never a
  // hand-maintained second copy.
  const LEAD_ORDER: GameId[] = [
    "mandala-match",
    "motion-to-mandala",
    "performer-word",
    "card-to-mandala",
  ];

  const byId = new Map(GAME_REGISTRY.map((g) => [g.id, g]));
  const leadGames = LEAD_ORDER.map((id) => byId.get(id)).filter(
    (g): g is (typeof GAME_REGISTRY)[number] => g != null
  );
  const restGames = GAME_REGISTRY.filter((g) => !LEAD_ORDER.includes(g.id));
  const orderedGames = [...leadGames, ...restGames];
  const leadCount = leadGames.length;

  // Browser-only + lazy: the previews pull real pictographs, mandalas, choreo
  // cards (and, for the performer, Three.js on demand). Load the preview map
  // only after hydration so the section's SSR/initial payload stays the
  // reserved dark stages plus their titles — no heavy chunks, no layout shift.
  let getPreview = $state<((id: GameId) => Component<{ accent: string }>) | null>(
    null
  );

  onMount(async () => {
    const mod = await import(
      "$lib/features/learn/play/components/previews/preview-map"
    );
    getPreview = mod.getGamePreview;
  });

  // Mirror PlayHub's one shared observer: mark offscreen tiles [data-paused] so
  // every preview keyframe under them freezes. Horizontal scroll moves tiles
  // out of the viewport → they pause; scroll them back → they resume.
  let pauseObserver: IntersectionObserver | null = null;

  function pauseWhenOffscreen(node: HTMLElement) {
    pauseObserver ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        entry.target.toggleAttribute("data-paused", !entry.isIntersecting);
      }
    });
    pauseObserver.observe(node);
    return {
      destroy() {
        pauseObserver?.unobserve(node);
      },
    };
  }

  onDestroy(() => {
    pauseObserver?.disconnect();
    pauseObserver = null;
  });
</script>

<section class="games-strip">
  <header class="strip-head">
    <h2 class="strip-title">The whole arcade</h2>
    <p class="strip-sub">
      Eight games at a glance. The first four need no alphabet knowledge, so
      start there.
    </p>
  </header>

  <div class="strip-scroll themed-scrollbar" role="list" aria-label="Arcade games">
    {#each orderedGames as game, index (game.id)}
      <article
        class="tile"
        class:lead={index < leadCount}
        style="--game-accent: {game.accentColor}"
        use:pauseWhenOffscreen
        role="listitem"
      >
        <div class="preview-stage" aria-hidden="true">
          {#if getPreview}
            {@const Preview = getPreview(game.id)}
            <div class="stage-fill">
              <Preview accent={game.accentColor} />
            </div>
          {/if}
        </div>

        {#if index < leadCount}
          <span class="lead-badge">No alphabet needed</span>
        {/if}

        <div class="tile-copy">
          <span class="tile-title">{game.title}</span>
          <span class="tile-tagline">{game.tagline}</span>
        </div>
      </article>
    {/each}
  </div>
</section>

<style>
  /* A deliberate dark "arcade wall" so the always-dark preview stages read the
     same in any page theme (the stages are lit machine windows, per GameCard).
     Text is exposed through theme vars with light fallbacks for the dark wall. */
  .games-strip {
    --tile-w: 264px;
    --tile-h: 252px;

    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 1rem);
    padding: var(--spacing-lg, 1.5rem) 0;
    background: linear-gradient(180deg, #0d1018, #090b12);
    border-radius: var(--radius-2026-lg, 18px);
    overflow: hidden;
  }

  .strip-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 var(--spacing-lg, 1.5rem);
  }

  .strip-title {
    margin: 0;
    font-size: var(--font-size-xl, 1.5rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--theme-text, #ffffff);
  }

  .strip-sub {
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .strip-scroll {
    display: flex;
    gap: var(--spacing-md, 1rem);
    overflow-x: auto;
    overflow-y: hidden;
    padding: 4px var(--spacing-lg, 1.5rem) var(--spacing-sm, 0.75rem);
    scroll-snap-type: x proximity;
    scrollbar-gutter: stable;
  }

  /* Fixed tile box — reserved whether or not the preview has mounted yet, so
     hydration adds zero layout shift. content-visibility skips offscreen paint;
     `auto <height>` reserves the exact rendered height so nothing jumps. */
  .tile {
    position: relative;
    flex: 0 0 auto;
    width: var(--tile-w);
    height: var(--tile-h);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 0.75rem);
    padding: var(--spacing-sm, 0.75rem);
    scroll-snap-align: start;
    background: linear-gradient(
      165deg,
      color-mix(in srgb, var(--game-accent) 8%, rgba(255, 255, 255, 0.04)),
      rgba(255, 255, 255, 0.03) 70%
    );
    border: 1px solid color-mix(in srgb, var(--game-accent) 22%, transparent);
    border-radius: var(--radius-2026-lg, 18px);
    content-visibility: auto;
    contain-intrinsic-size: auto var(--tile-h);
  }

  /* The four no-alphabet games get a slightly stronger accent frame + glow to
     draw the eye to the front of the strip. */
  .tile.lead {
    border-color: color-mix(in srgb, var(--game-accent) 45%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--game-accent) 22%, transparent),
      0 10px 26px color-mix(in srgb, var(--game-accent) 14%, transparent);
  }

  /* The lit machine window: fixed 16:10 aspect so the preview mount never
     shifts layout; a size container so cq-unit previews scale to the cell; dark
     in every theme, with the game accent glowing up from the floor. Mirrors
     GameCard's .preview-stage. */
  .preview-stage {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    container-type: size;
    border-radius: var(--radius-2026-md, 14px);
    overflow: hidden;
    background:
      radial-gradient(
        120% 85% at 50% 112%,
        color-mix(in srgb, var(--game-accent) 26%, transparent),
        transparent 62%
      ),
      linear-gradient(180deg, rgba(12, 14, 22, 0.6), rgba(7, 9, 15, 0.82));
    border: 1px solid color-mix(in srgb, var(--game-accent) 15%, transparent);
  }

  /* Transparent to container sizing (fills the stage, sets no container of its
     own) — it only exists to fade the preview in once it mounts. */
  .stage-fill {
    position: absolute;
    inset: 0;
    opacity: 1;
    transition: opacity var(--duration-dramatic, 350ms) var(--ease-out, ease-out);
  }

  @starting-style {
    .stage-fill {
      opacity: 0;
    }
  }

  .lead-badge {
    position: absolute;
    top: calc(var(--spacing-sm, 0.75rem) + 6px);
    left: calc(var(--spacing-sm, 0.75rem) + 6px);
    z-index: 1;
    padding: 3px 8px;
    font-size: var(--font-size-compact, 0.6875rem);
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--game-accent);
    background: color-mix(in srgb, #05060a 78%, transparent);
    border: 1px solid color-mix(in srgb, var(--game-accent) 55%, transparent);
    border-radius: 999px;
    pointer-events: none;
    backdrop-filter: blur(2px);
  }

  .tile-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 var(--spacing-xs, 0.5rem);
    min-height: 0;
  }

  .tile-title {
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--theme-text, #ffffff);
  }

  .tile-tagline {
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* The [data-paused] freeze the previews are written against — one shared
     observer above toggles the attribute, every keyframe under a paused tile
     stops. :global because the attribute is toggled at runtime on nodes Svelte
     would otherwise prune from its scoped selectors. */
  .strip-scroll :global(.tile[data-paused] *) {
    animation-play-state: paused;
  }

  /* Big-screen tier (a 4K monitor at 200% reports ~1920 CSS px): the arcade
     tiles grow so the strip fills a wide canvas instead of parading small
     laptop-sized machines. Matches the composer-4k breakpoint (1680). */
  @media (min-width: 1680px) {
    .games-strip {
      --tile-w: 344px;
      --tile-h: 328px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .stage-fill {
      transition: none;
    }
  }
</style>
