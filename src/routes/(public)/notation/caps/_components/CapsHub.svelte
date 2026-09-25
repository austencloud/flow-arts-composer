<!--
  CapsHub: the single-viewport Bento hero for /notation/caps. Sides-only frame,
  live CAP demo centered and square, six compact destination tiles framing it,
  height-locked to one viewport (minus the 64px SiteHeader) so the depth
  sections start below the fold. Tiles anchor-scroll to those sections; the
  "CAPs and LOOPs" tile scrolls to #relationship. Verified at 1920/2350/3840.
  No em dashes. No background fill: the cosmic BackgroundHost shows through.
-->
<script lang="ts">
  import LaunchpadTile from "$lib/shared/landing/components/launchpad/LaunchpadTile.svelte";
  import type { LaunchpadTileDef } from "$lib/shared/landing/components/launchpad/launchpad-tiles";
  import YutaCapLiveDemo from "./YutaCapLiveDemo.svelte";

  // DOM order == reading order (row by row across the demo). Left column = odd
  // entries, right column = even entries (placed in CSS).
  const TILES: LaunchpadTileDef[] = [
    {
      id: "what-is",
      href: "#what-is",
      heading: "What is a CAP?",
      descriptor:
        "One prop traces a closed loop built from two or more simpler patterns.",
      span: "1x1",
      color: "#38bdf8",
      icon: "fa-infinity",
    },
    {
      id: "breakdown",
      href: "#math-assembled",
      heading: "How this CAP is built",
      descriptor: "Four steps, two halves.",
      span: "1x1",
      color: "#a78bfa",
      icon: "fa-scissors",
    },
    {
      id: "watch",
      href: "#watch",
      heading: "Watch CAPs",
      descriptor: "CAPs on video, 2009 to now.",
      span: "1x1",
      color: "#fbbf24",
      icon: "fa-circle-play",
    },
    {
      id: "relationship",
      href: "#relationship",
      heading: "CAPs and LOOPs",
      descriptor: "CAPs follow one prop; LOOPs join two-hand letters.",
      span: "1x1",
      color: "#22d3ee",
      icon: "fa-diagram-project",
    },
    {
      id: "math",
      href: "#math",
      heading: "Underlying math",
      descriptor: "Trochoids on nested circles.",
      span: "1x1",
      color: "#34d399",
      icon: "fa-compass-drafting",
    },
    {
      id: "origin",
      href: "#origin",
      heading: "Where it came from",
      descriptor: "Damien coined the term on Home of Poi in 2009.",
      span: "1x1",
      color: "#f472b6",
      icon: "fa-clock-rotate-left",
    },
  ];
</script>

<section class="caps-hub" aria-label="What are CAPs">
  <a class="hub-back" href="/history">← Flow Arts History</a>

  <header class="hub-head">
    <span class="eyebrow">Continuous Assembly Patterns</span>
    <h1>CAPs</h1>
    <p>Watch a prop trace an extension, then return through antispin.</p>
  </header>

  <div class="hub-stage">
    <div class="frame-grid sides">
      <figure class="demo-cell">
        <span class="demo-hold"><YutaCapLiveDemo /></span>
        <figcaption>The bright path is traced by one prop.</figcaption>
      </figure>
      <ul class="tiles" role="list">
        {#each TILES as tile, i (tile.id)}
          <LaunchpadTile {tile} active={true} index={i} />
        {/each}
      </ul>
    </div>
  </div>
</section>

<style>
  /* Height-lock to one viewport, minus the production SiteHeader (64px), so the
     depth sections start below the fold. No background fill: the page's cosmic
     BackgroundHost shows through. */
  .caps-hub {
    /* MarketingChrome's SiteHeader is position:fixed at 64px, so full-bleed
       content starts at y=0 underneath it. Offset the hub below the header with
       margin, and take the same height off, so it occupies exactly the first
       viewport (header + hub = 100dvh) and the depth begins right below. */
    --caps-chrome: 64px;
    position: relative;
    margin-top: var(--caps-chrome);
    height: calc(100dvh - var(--caps-chrome));
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: clamp(0.5rem, 1.4vh, 1.2rem) clamp(1rem, 3vw, 2.5rem);
    color: #f2f1fb;
  }

  .hub-back {
    position: absolute;
    top: clamp(0.5rem, 1.4vh, 1.2rem);
    left: clamp(1rem, 3vw, 2.5rem);
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
    text-decoration: none;
    z-index: 2;
  }
  .hub-back:hover {
    color: #fff;
  }

  .hub-head {
    flex: 0 0 auto;
    text-align: center;
    margin: 0 auto;
    padding-block: clamp(0.3rem, 1vh, 0.9rem);
  }
  .eyebrow {
    display: block;
    font-size: clamp(0.72rem, 0.9vw, 1.1rem);
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #38bdf8;
  }
  .hub-head h1 {
    margin: 0.1rem 0 0.3rem;
    font-size: clamp(2.2rem, 3.6vw, 5.2rem);
    line-height: 1;
    font-weight: 780;
    letter-spacing: -0.02em;
  }
  .hub-head p {
    margin: 0 auto;
    font-size: clamp(0.9rem, 0.95vw, 1.15rem);
    color: rgba(255, 255, 255, 0.74);
  }

  .hub-stage {
    flex: 1 1 auto;
    min-height: 0;
    container-type: size;
    display: grid;
    place-items: center;
  }

  /* Largest 2:1 box that fits: sized by height (200cqh), capped by width
     (100cqw). Because it is 2:1 and the demo spans the center two of four
     columns across all three rows, the demo cell is inherently square. */
  .frame-grid {
    inline-size: min(100cqw, 200cqh);
    aspect-ratio: 2 / 1;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: clamp(0.6rem, 1.1cqw, 1.4rem);
    list-style: none;
  }

  /* display:contents lifts the six <li> tiles into the band grid; role="list"
     guards Safari's contents-drops-list-semantics bug. */
  .tiles {
    display: contents;
  }

  .demo-cell {
    grid-column: 2 / 4;
    grid-row: 1 / 4;
    margin: 0;
    position: relative;
    container-type: size;
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
  }
  /* Square bound on BOTH axes so it can never top-align in a too-tall wrapper. */
  .demo-hold {
    display: block;
    inline-size: min(100cqw, 100cqh);
    aspect-ratio: 1;
  }
  .demo-cell figcaption {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0.2rem;
    text-align: center;
    font-size: clamp(0.75rem, 0.85vw, 1rem);
    color: rgba(255, 255, 255, 0.6);
    pointer-events: none;
  }

  /* Side tiles nearly fill their rows so the gaps between the three stacked
     tiles stay tight (not big even bands), while still leaving a little breathing
     room top and bottom. */
  .frame-grid :global(.tile) {
    align-self: center;
    block-size: clamp(170px, 30cqh, 320px);
  }
  .frame-grid.sides :global(.tile.t-what-is) {
    grid-column: 1;
    grid-row: 1;
  }
  .frame-grid.sides :global(.tile.t-watch) {
    grid-column: 1;
    grid-row: 2;
  }
  .frame-grid.sides :global(.tile.t-math) {
    grid-column: 1;
    grid-row: 3;
  }
  .frame-grid.sides :global(.tile.t-breakdown) {
    grid-column: 4;
    grid-row: 1;
  }
  .frame-grid.sides :global(.tile.t-relationship) {
    grid-column: 4;
    grid-row: 2;
  }
  .frame-grid.sides :global(.tile.t-origin) {
    grid-column: 4;
    grid-row: 3;
  }

  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    .frame-grid:has(:global(.tile:hover)) :global(.tile:not(:hover)) {
      opacity: 0.6;
      filter: saturate(0.7);
    }
  }

  /* Narrow: drop fit-to-viewport, stack, allow scroll. */
  @media (max-width: 1020px) {
    .caps-hub {
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }
    .hub-stage {
      display: block;
      container-type: normal;
    }
    .frame-grid {
      inline-size: 100%;
      aspect-ratio: auto;
      grid-template-columns: repeat(2, 1fr);
      grid-template-rows: none;
      grid-auto-rows: clamp(150px, 30vw, 220px);
    }
    .frame-grid :global(.tile) {
      align-self: stretch;
      block-size: auto;
    }
    .frame-grid.sides :global(.tile) {
      grid-column: auto !important;
      grid-row: auto !important;
    }
    .demo-cell {
      grid-column: 1 / 3;
      grid-row: auto;
      aspect-ratio: 1;
    }
  }
  @media (max-width: 560px) {
    .frame-grid {
      grid-template-columns: 1fr;
    }
    .demo-cell {
      grid-column: 1;
    }
  }
</style>
