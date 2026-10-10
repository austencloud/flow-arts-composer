<script lang="ts">
  import { Canvas } from "@threlte/core";
  import { AgXToneMapping, PCFSoftShadowMap } from "three";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import {
    BASIN_PERFORMER,
    CEILING_Y,
    ICE_PERFORMER,
    SHALLOWS_PERFORMER,
    WATERLINE_Y,
    grottoCeilingAt,
    grottoRelationToWater,
    grottoSurfaceAt,
  } from "#lib/features/water-traverse/data/water-grotto-terrain.js";
  import WaterGrottoWalkScene from "./WaterGrottoWalkScene.svelte";

  let resetToken = $state(0);
  let position = $state({ x: -15, y: -1.6, z: -7 });

  /**
   * Names the surface you are standing on, not the room. In a single-room
   * exhibit "where am I" is answered by which part of the one pool you are in —
   * that is the only thing that changes as you walk.
   */
  const SURFACE_LABEL: Record<string, string> = {
    "sump-floor": "The sump",
    "sump-rise": "Surfacing",
    "apron-south": "The apron · south",
    "apron-west": "The apron · west",
    "apron-east-lower": "The apron · east",
    "apron-east-upper": "The apron · east",
    "apron-north": "The apron · north",
    "apron-north-west-wing": "The apron · north",
    "apron-north-east-wing": "The apron · north",
    "pool-ice": "The ice · A",
    "ice-mouth-ramp": "Stepping onto the ice",
    "pool-ice-ramp": "The slope off the ice",
    "pool-basin": "The basin · B",
    "pool-basin-ramp": "The slope out of the basin",
    "pool-shallows": "The shallows · C",
    "exit-bay": "The exit bay",
    "exit-ramp": "Climbing out",
  };

  const RELATIONSHIP = {
    on: "on the water",
    in: "in the water",
    under: "under the water",
    above: "above the water",
  } as const;

  const STATIONS = [
    { letter: "A", ...ICE_PERFORMER },
    { letter: "B", ...BASIN_PERFORMER },
    { letter: "C", ...SHALLOWS_PERFORMER },
  ];

  const surface = $derived(grottoSurfaceAt(position.x, position.z));
  const place = $derived(SURFACE_LABEL[surface] ?? "The grotto");
  const relation = $derived(
    grottoRelationToWater(position.y, position.x, position.z)
  );
  const relativeToLine = $derived(position.y - WATERLINE_Y);
  const headroom = $derived(grottoCeilingAt(position.x, position.z) - position.y);

  /**
   * Distance to each performer, always all three. The one number the traverse
   * could not show — there, the answer was "the next one, in a straight line."
   * Here it should read as three things standing in a room around you.
   */
  const ranges = $derived(
    STATIONS.map((station) => ({
      letter: station.letter,
      metres: Math.hypot(station.x - position.x, station.z - position.z),
    }))
  );
  const nearest = $derived(
    ranges.reduce((a, b) => (b.metres < a.metres ? b : a))
  );
</script>

<svelte:head>
  <title>Walk the Water Grotto</title>
  <meta
    name="description"
    content="First-person graybox of the Water Grotto: one room, one pool, three temperaments."
  />
</svelte:head>

<main
  class="walk-page"
  data-player-x={position.x.toFixed(2)}
  data-player-y={position.y.toFixed(2)}
  data-player-z={position.z.toFixed(2)}
  data-surface={surface}
  data-relation={relation}
  data-headroom={headroom.toFixed(1)}
>
  <div class="viewport" aria-label="The Water Grotto, first person">
    <!--
      renderMode="always": this is a walk, so the camera moves every frame, and
      Threlte's default on-demand mode only redraws when something it watches
      invalidates. A camera mutated inside useTask is not that, so the canvas
      froze on its first frame — two completely different vantage points
      screenshotted as the same image.
    -->
    <Canvas
      dpr={1}
      renderMode="always"
      shadows={PCFSoftShadowMap}
      toneMapping={AgXToneMapping}
    >
      <WaterGrottoWalkScene
        {resetToken}
        onPositionChange={(next) => (position = next)}
      />
    </Canvas>
  </div>

  <header class="review-hud">
    <div class="review-label">
      <p>Water · grotto graybox</p>
      <h1>{place}</h1>
      <span class="relationship">
        You are <strong>{RELATIONSHIP[relation]}</strong> ·
        {relativeToLine >= 0 ? "+" : ""}{relativeToLine.toFixed(1)} m from the
        surface
      </span>

      <dl class="readout">
        <div>
          <dt>Nearest</dt>
          <dd>{nearest.letter} <em>· {nearest.metres.toFixed(0)} m away</em></dd>
        </div>
        <div>
          <dt>Headroom</dt>
          <dd>{headroom.toFixed(0)} <em>m to ceiling</em></dd>
        </div>
      </dl>

      <!-- All three, always. The point of a room is that nobody is "next". -->
      <ul class="stations">
        {#each ranges as range (range.letter)}
          <li class:near={range.letter === nearest.letter}>
            <span class="letter">{range.letter}</span>
            <span class="metres">{range.metres.toFixed(0)} m</span>
          </li>
        {/each}
      </ul>
    </div>
    <ActionButton
      label="Back to the sump"
      icon="fa-arrow-rotate-left"
      color="fuse"
      onclick={() => (resetToken += 1)}
    />
  </header>

  <p class="ceiling-note">Roof {CEILING_Y} m · pool 22 × 28 m · room 38 × 41 m</p>
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #15181a;
  }

  /* app.css sets `scrollbar-gutter: stable` on the root, which would leave a
     strip of page background down the right edge of every frame. */
  :global(html) {
    scrollbar-gutter: auto;
  }

  /* The 4K lockstep ramp, same formula as app.css (which scopes itself to
     `.mkt-shell` / `.legal-container` and so never reaches a /test route).
     Every measure here is in rem, so the whole panel grows by one multiplier.
     See .claude/rules/4k-native-layout.md. */
  @media (min-width: 1680px) {
    :global(html) {
      font-size: clamp(16px, calc(16px + (100vw - 1680px) * 8 / 2160), 24px);
    }
  }

  .walk-page {
    --theme-accent: #e08640;
    --theme-card-bg: rgba(18, 21, 23, 0.86);
    --theme-card-hover-bg: rgba(32, 36, 39, 0.94);
    --theme-stroke: rgba(226, 232, 236, 0.18);
    --theme-stroke-strong: rgba(224, 134, 64, 0.6);
    --theme-text: #eef1f3;
    --theme-text-on-accent: #17110a;
    --min-touch-target: 44px;
    --duration-normal: 160ms;
    position: fixed;
    inset: 0;
    min-inline-size: 20rem;
    overflow: hidden;
    color: var(--theme-text);
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .viewport {
    position: absolute;
    inset: 0;
  }

  .review-hud {
    position: absolute;
    inset-block-start: clamp(0.8rem, 1.5vw, 1.5rem);
    inset-inline: clamp(0.8rem, 1.5vw, 1.5rem);
    z-index: 60;
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
    pointer-events: none;
  }

  .review-hud :global(button) {
    pointer-events: auto;
  }

  .review-label {
    min-inline-size: min(24rem, calc(100vw - 12rem));
    padding: 0.75rem 1rem 0.9rem;
    border: 1px solid rgba(226, 232, 236, 0.16);
    border-radius: 0.9rem;
    background: rgba(16, 19, 21, 0.78);
    box-shadow:
      0 1rem 3rem rgba(0, 0, 0, 0.4),
      inset 0 1px rgba(255, 255, 255, 0.045);
    backdrop-filter: blur(0.7rem);
  }

  .review-label p,
  .review-label h1 {
    margin: 0;
  }

  .review-label p {
    color: #e08640;
    font-size: 0.72rem;
    font-weight: 760;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .review-label h1 {
    margin-block: 0.16rem 0.1rem;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.45rem, 1.8vw, 2.25rem);
    font-weight: 540;
    line-height: 1;
  }

  .relationship {
    color: #b3bcc2;
    font-size: 0.88rem;
    font-variant-numeric: tabular-nums;
  }

  .review-label strong {
    color: #eef1f3;
    font-weight: 640;
  }

  .readout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.45rem 1rem;
    margin: 0.7rem 0 0;
  }

  .readout dt {
    color: #8c959b;
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .readout dd {
    margin: 0.1rem 0 0;
    color: #eef1f3;
    font-size: 1.05rem;
    font-weight: 620;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
  }

  .readout em {
    color: #98a1a7;
    font-size: 0.76rem;
    font-style: normal;
    font-weight: 500;
  }

  .stations {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
    margin: 0.7rem 0 0;
    padding: 0;
    list-style: none;
  }

  .stations li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 0.28rem 0.5rem;
    border: 1px solid rgba(226, 232, 236, 0.14);
    border-radius: 0.5rem;
    background: rgba(226, 232, 236, 0.05);
  }

  .stations li.near {
    border-color: rgba(224, 134, 64, 0.6);
    background: rgba(224, 134, 64, 0.14);
  }

  .letter {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1rem;
    font-weight: 600;
  }

  .metres {
    color: #98a1a7;
    font-size: 0.76rem;
    /* Distances count every frame; tabular digits keep the row still. */
    font-variant-numeric: tabular-nums;
  }

  .ceiling-note {
    position: absolute;
    inset-block-end: clamp(0.8rem, 1.5vw, 1.5rem);
    inset-inline-start: clamp(0.8rem, 1.5vw, 1.5rem);
    z-index: 60;
    margin: 0;
    color: rgba(226, 232, 236, 0.45);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
    pointer-events: none;
  }

  @media (min-width: 1680px) {
    .review-label {
      padding: 0.95rem 1.2rem 1.1rem;
    }

    .review-label p {
      font-size: 0.8rem;
    }

    .relationship {
      font-size: 1rem;
    }

    .readout dd {
      font-size: 1.2rem;
    }
  }

  @media (min-width: 2600px) {
    .review-hud {
      inset-block-start: 2rem;
      inset-inline: 2rem;
    }

    .review-label {
      min-inline-size: 32rem;
      padding: 1.35rem 1.65rem 1.6rem;
      border-radius: 1.4rem;
    }

    .review-label p {
      font-size: 1.05rem;
    }

    .review-label h1 {
      margin-block: 0.28rem 0.2rem;
      font-size: 3.2rem;
    }

    .relationship {
      font-size: 1.35rem;
    }

    .readout dt {
      font-size: 0.92rem;
    }

    .readout dd {
      font-size: 1.7rem;
    }

    .readout em,
    .metres {
      font-size: 1.05rem;
    }

    .letter {
      font-size: 1.5rem;
    }

    .ceiling-note {
      font-size: 1.05rem;
    }

    .review-hud :global(button) {
      min-block-size: 4.25rem;
      padding: 1.15rem 2rem;
      border-radius: 1.6rem;
      font-size: 1.25rem;
    }
  }

  @media (max-width: 42rem) {
    .review-hud {
      align-items: stretch;
      flex-direction: column;
    }
  }

  /* Wide and SHORT — a folded Fold, a phone in landscape. Vertical space is
     the scarce one; spend width instead. */
  @media (max-height: 30rem) {
    .review-label {
      min-inline-size: min(32rem, calc(100vw - 14rem));
      padding: 0.45rem 0.75rem 0.55rem;
      border-radius: 0.7rem;
    }

    .review-label p {
      font-size: 0.66rem;
    }

    .review-label h1 {
      margin-block: 0.08rem 0.04rem;
      font-size: 1.15rem;
    }

    .relationship {
      font-size: 0.78rem;
    }

    .readout {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.2rem 0.7rem;
      margin-block-start: 0.45rem;
    }

    .readout dt {
      font-size: 0.6rem;
    }

    .readout dd {
      margin-block-start: 0.02rem;
      font-size: 0.92rem;
    }

    .readout em {
      font-size: 0.66rem;
    }

    .stations {
      margin-block-start: 0.45rem;
      gap: 0.3rem;
    }

    .stations li {
      padding: 0.18rem 0.4rem;
    }
  }
</style>
