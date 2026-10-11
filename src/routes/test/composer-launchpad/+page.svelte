<script lang="ts">
  // Test harness for the composer bento launchpad (spec:
  // docs/superpowers/specs/2026-07-20-composer-launchpad-morph-design.md, Phase 2).
  //
  // Renders the DECOUPLED LaunchpadGrid (variant="composer") with the 9 composer
  // tile defs so the bento + live preview media can be eyeballed. No dive/morph
  // animation yet — a later phase adds the Motion animateView() takeover; here
  // onActivate just records the tile id (local $state) and logs it, so the
  // action-mode <button> wiring is verifiably firing.
  //
  // Inherits ssr=false + prerender=false from /test (+layout.ts). The tile
  // preview media mount CLIENT-ONLY through the grid's own IntersectionObserver
  // -> LazyMount, so nothing drags the heavy pictograph/zod graph through SSR.
  import LaunchpadGrid from "#lib/shared/landing/components/launchpad/LaunchpadGrid.svelte";
  import { COMPOSER_TILES } from "../../(public)/composer/_launchpad/composer-launchpad-tiles";
  import type { LaunchpadTileDef } from "#lib/shared/landing/components/launchpad/launchpad-tiles.js";

  // Stands in for the eventual expanded-tile / takeover state. A later phase
  // turns this into the hash-synced dive; for now it's just a readout.
  let expandedId = $state<string | null>(null);

  function onActivate(tile: LaunchpadTileDef) {
    expandedId = tile.id;
    // eslint-disable-next-line no-console
    console.log("activate", tile.id);
  }
</script>

<svelte:head>
  <title>Composer launchpad — layout test</title>
</svelte:head>

<div class="page">
  <div class="wrap">
    <p class="harness-note">Test harness · not live</p>
    <h1 class="title">Composer Launchpad</h1>
    <p class="sub">
      9 per-section tiles, 16 cells, tinted by the five wing colors. Click a tile
      to fire its action-mode button (no dive yet).
    </p>

    <p class="readout" aria-live="polite">
      Last activated: <strong>{expandedId ?? "—"}</strong>
    </p>

    <LaunchpadGrid
      tiles={COMPOSER_TILES}
      variant="composer"
      showStrip={false}
      ariaLabel="Composer"
      {onActivate}
    />
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    color: #e7e9f5;
    background: radial-gradient(
      120% 80% at 50% -8%,
      #171a3a 0%,
      #0e1024 45%,
      #0a0b16 100%
    );
    background-attachment: fixed;
    font-family: "Inter", system-ui, sans-serif;
  }

  .wrap {
    max-width: 1220px;
    margin: 0 auto;
    padding: 24px 1.4rem 4rem;
  }

  .harness-note {
    text-align: center;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #f0a83c;
    margin: 0 0 0.6rem;
  }

  .title {
    text-align: center;
    font-size: clamp(1.6rem, 1.3rem + 1.2vw, 2.4rem);
    font-weight: 760;
    letter-spacing: -0.01em;
    margin: 0 0 0.5rem;
  }

  .sub {
    text-align: center;
    max-width: 46rem;
    margin: 0 auto 1rem;
    color: #9aa0c4;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .readout {
    text-align: center;
    margin: 0 0 1.6rem;
    color: #6b7099;
    font-size: 0.85rem;
    /* Reserve the strong slot's width against changing ids so the line never
       reflows its neighbors (no-layout-shift). */
    font-variant-numeric: tabular-nums;
  }
  .readout strong {
    color: #e7e9f5;
  }
</style>
