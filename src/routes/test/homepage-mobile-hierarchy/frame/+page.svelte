<script lang="ts">
  /**
   * Phone-composition variant frame.
   *
   * Rendered inside a phone-sized iframe by the comparison page next door, so
   * the real viewport media queries in HomeHero / LaunchpadGrid / LaunchpadTile
   * fire exactly as they do on a device. Uses the REAL components with real
   * props — the only per-variant deltas are the tile roster, the strip roster,
   * and a wrapper class driving CSS overrides.
   */
  import { page } from "$app/state";
  import HomeHero from "#lib/shared/landing/components/HomeHero.svelte";
  import LaunchpadGrid from "#lib/shared/landing/components/launchpad/LaunchpadGrid.svelte";
  import {
    LAUNCHPAD_TILES,
    STRIP_LINKS,
  } from "#lib/shared/landing/components/launchpad/launchpad-tiles.js";

  const variant = $derived(page.url.searchParams.get("v") ?? "current");

  const tileById = new Map(LAUNCHPAD_TILES.map((t) => [t.id, t]));
  // filter(Boolean) rather than an assertion: an id typo should silently drop a
  // tile from the harness, not crash the frame mid-comparison.
  const pick = (...ids: string[]) =>
    ids
      .map((id) => tileById.get(id))
      .filter((t): t is (typeof LAUNCHPAD_TILES)[number] => t !== undefined);

  const FAQ_LINK = { label: "FAQ", href: "/faq" };
  const GLOSSARY_LINK = { label: "Kinetic Atlas", href: "/atlas" };

  const tiles = $derived(
    variant === "demote"
      ? pick("composer", "choreo-cards", "guide", "notation")
      : variant === "promote"
        ? pick("composer", "choreo-cards", "guide", "notation", "glossary")
        : LAUNCHPAD_TILES
  );

  const stripLinks = $derived(
    variant === "demote"
      ? [FAQ_LINK, GLOSSARY_LINK, ...STRIP_LINKS]
      : variant === "promote"
        ? [FAQ_LINK, ...STRIP_LINKS]
        : STRIP_LINKS
  );
</script>

<div class="landing-page v-{variant}">
  <div class="content-layer">
    <HomeHero />
    <main class="launchpad-main">
      <LaunchpadGrid {tiles} {stripLinks} />
    </main>
  </div>
</div>

<style>
  .landing-page {
    position: relative;
    min-height: 100svh;
    font-family: system-ui, -apple-system, sans-serif;
    --landing-heading-font: "Playfair Display", Georgia, serif;
    color: var(--theme-text, #ffffff);
    line-height: 1.6;
    overflow-x: hidden;
    background: radial-gradient(
      ellipse at 50% 0%,
      oklch(0.22 0.05 280) 0%,
      oklch(0.13 0.03 265) 55%,
      oklch(0.1 0.02 260) 100%
    );
  }

  .launchpad-main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1.25rem;
  }

  /* Mirrors the production portrait tier in src/routes/+page.svelte so each
     variant is judged against the real composition, not an approximation. */
  @media (max-width: 600px) and (min-height: 600px) and (orientation: portrait) {
    .content-layer {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      align-items: stretch;
      width: 100%;
      height: 100svh;
      min-height: 600px;
      padding: 4.25rem 0.5rem 0.5rem;
    }

    .launchpad-main {
      width: 100%;
      height: 100%;
      min-height: 0;
      max-width: none;
      margin: 0;
      padding: 0;
    }


    /* Demo gives back height so the bento can carry rank + meaning. */
    .v-demo :global(.home-hero),
    .v-demote :global(.home-hero),
    .v-promote :global(.home-hero) {
      --hero-demo-max-width: min(100%, clamp(13rem, 32svh, 17rem));
    }

    /* The stranger's entry point comes back from display:none. */
    .v-demo :global(.home-hero .hero-pointer),
    .v-demote :global(.home-hero .hero-pointer),
    .v-promote :global(.home-hero .hero-pointer) {
      display: block;
      margin-top: 0.5rem;
      font-size: 0.8rem;
    }
    .v-demo :global(.home-hero .pointer-link),
    .v-demote :global(.home-hero .pointer-link),
    .v-promote :global(.home-hero .pointer-link) {
      min-height: 36px;
      font-size: 0.8rem;
    }

    /* Descriptors return: the tiles stop being six unexplained nouns. */
    .v-demo :global(.tile.variant-home .body p),
    .v-demote :global(.tile.variant-home .body p),
    .v-promote :global(.tile.variant-home .body p) {
      display: block;
      max-width: 74%;
      margin: 0.15rem 0 0;
      font-size: 0.7rem;
      line-height: 1.25;
      color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    }

    /* Four tiles: two clean rows instead of three cramped ones.
       Selectors carry the full .launchpad.variant-home chain because
       LaunchpadGrid's own portrait rules are 4-class specific and would
       otherwise win (they reset every tile to grid-column/row: auto). */
    .v-demote :global(.launchpad.variant-home .bento) {
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }
    .v-demote :global(.launchpad.variant-home .strip) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    /* Composer takes the full first row — rank restored where 2x2 can't reach. */
    .v-promote :global(.launchpad.variant-home .bento) {
      grid-template-rows: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr);
    }
    .v-promote :global(.launchpad.variant-home .bento .tile.t-composer) {
      grid-column: 1 / -1;
      grid-row: 1;
    }
    .v-promote :global(.launchpad.variant-home .bento .tile.t-composer .body h2) {
      max-width: 100%;
      font-size: 1.1rem;
    }
    .v-promote :global(.launchpad.variant-home .bento .tile.t-composer .body p) {
      max-width: 58%;
      font-size: 0.78rem;
    }
    .v-promote :global(.launchpad.variant-home .strip) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
