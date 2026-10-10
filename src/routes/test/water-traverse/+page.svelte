<script lang="ts">
  import { Canvas } from "@threlte/core";
  import { AgXToneMapping, PCFSoftShadowMap } from "three";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import {
    TOTAL_LENGTH_M,
    ceilingAt,
    hallHalfWidthAt,
    regionAt,
    relationToWater,
    waterLevelAt,
  } from "#lib/features/water-traverse/data/water-traverse-terrain.js";
  import WaterTraverseWalkScene from "./WaterTraverseWalkScene.svelte";

  let resetToken = $state(0);
  let position = $state({ x: 0, y: 1.28, z: 6 });

  /**
   * The title names the ROOM; the line under it names the visitor's
   * relationship to the nearest surface. Those are two different questions —
   * four rooms in a row all answer "under the water", and the springs answer
   * three different ways across their own thirty-four metres.
   */
  const REGION_LABEL = {
    snowfield: "The frozen river",
    sea: "The trench",
    cave: "The cave",
    canyon: "The canyon",
    sump: "The sump",
    springs: "The springs",
  } as const;

  /**
   * Keyed off the eye and the floor rather than off the leg. The leg-keyed
   * version was a fact about the route, not about the person walking it, and
   * it was wrong at both ends of the sea: still claiming "under the water"
   * 22 m after the head broke the surface, and claiming "in the water" while
   * standing 0.7 m above it.
   *
   * "Above" is the one the walk now ENDS on, and it used to be missing: the
   * springs shore is dry rock four metres over its pool, and calling that "on
   * the water" gave it the same words as the frozen river, where the floor and
   * the surface are the same plane.
   */
  const RELATIONSHIP = {
    on: "on the water",
    in: "in the water",
    under: "under the water",
    above: "above the water",
  } as const;

  /**
   * The walker's speed, from UnifiedCameraController's `moveSpeed` in the
   * scene. Every time below is distance ÷ this, NOT a wall clock — the question
   * is how long the route takes to walk, which should not change because
   * somebody stopped to look at a wall.
   */
  const WALK_SPEED = 4.2;

  const relation = $derived(relationToWater(position.y, position.z));
  const region = $derived(regionAt(position.z));
  const walked = $derived(Math.max(0, Math.min(position.z, TOTAL_LENGTH_M)));
  const progress = $derived(Math.round((walked / TOTAL_LENGTH_M) * 100));
  /**
   * Eye height against the surface that is actually here.
   *
   * Not against WATERLINE_Y. The springs chamber has its own pool 23 m lower,
   * and measured from the sea the last twelve metres of the walk read as
   * "-27.4 m from the waterline" while the visitor stands on dry rock in air —
   * a number that flatly contradicts what they can see.
   */
  const relativeToLine = $derived(position.y - waterLevelAt(position.z));
  /** Ceiling above the eye. The answer to "is there a roof, and how high". */
  const headroom = $derived(ceilingAt(position.z) - position.y);
  /** Wall to wall, here. Steps six times inside the cave alone. */
  const hallWidth = $derived(Math.round(hallHalfWidthAt(position.z) * 2));
  const secondsWalked = $derived(walked / WALK_SPEED);
  const secondsLeft = $derived((TOTAL_LENGTH_M - walked) / WALK_SPEED);

  function clock(seconds: number): string {
    const whole = Math.round(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }
</script>

<svelte:head>
  <title>Walk the Water Traverse</title>
  <meta
    name="description"
    content="First-person review of the Water Traverse: one waterline, walked on, under, and in."
  />
</svelte:head>

<main
  class="walk-page"
  data-player-x={position.x.toFixed(2)}
  data-player-y={position.y.toFixed(2)}
  data-player-z={position.z.toFixed(2)}
  data-relation={relation}
  data-region={region}
  data-headroom={headroom.toFixed(1)}
  data-hall={hallWidth}
>
  <div class="viewport" aria-label="The Water Traverse, first person">
    <Canvas dpr={1} shadows={PCFSoftShadowMap} toneMapping={AgXToneMapping}>
      <WaterTraverseWalkScene
        {resetToken}
        onPositionChange={(next) => (position = next)}
      />
    </Canvas>
  </div>

  <header class="review-hud">
    <div class="review-label">
      <p>Water · graybox</p>
      <h1>{REGION_LABEL[region]}</h1>
      <span class="relationship">
        You are <strong>{RELATIONSHIP[relation]}</strong> ·
        {relativeToLine >= 0 ? "+" : ""}{relativeToLine.toFixed(1)} m from the
        surface
      </span>

      <!--
        The four numbers this pass exists to answer. Nothing here is decoration:
        pacing is walked/left, sizing is headroom and hall width, and each is a
        thing you cannot judge by eye at this scale.
      -->
      <dl class="readout">
        <div>
          <dt>Walked</dt>
          <dd>{walked.toFixed(0)} <em>of {TOTAL_LENGTH_M} m</em></dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{clock(secondsWalked)} <em>· {clock(secondsLeft)} left</em></dd>
        </div>
        <div>
          <dt>Headroom</dt>
          <dd>{headroom.toFixed(0)} <em>m to ceiling</em></dd>
        </div>
        <div>
          <dt>Hall</dt>
          <dd>{hallWidth} <em>m wall to wall</em></dd>
        </div>
      </dl>

      <div
        class="progress"
        role="img"
        aria-label={`${progress}% of the way along the traverse`}
      >
        <span style:inline-size={`${Math.max(0, Math.min(100, progress))}%`}
        ></span>
      </div>
    </div>
    <ActionButton
      label="Return to the snowfield"
      icon="fa-arrow-rotate-left"
      color="fuse"
      onclick={() => (resetToken += 1)}
    />
  </header>
</main>

<style>
  /* The panel is deliberately neutral. A teal-and-cyan HUD over a grey room
     puts a mood back on a pass whose entire purpose is having no mood — and
     worse, it flatters the frames. Grey chrome, orange for the numbers, which
     is the same orange the rulers in the scene are painted. */
  :global(html),
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #15181a;
  }

  /* app.css sets `scrollbar-gutter: stable` on the root, which shrinks the
     initial containing block by the scrollbar's width whether or not one is
     showing. On a full-bleed page that put a 10 px strip of page background
     down the right edge of every frame — the fixed shell measured 810 against
     an 820 viewport. The forest-scene review page opts out the same way. */
  :global(html) {
    scrollbar-gutter: auto;
  }

  /* The 4K lockstep ramp, same formula as app.css (which scopes it to
     `.mkt-shell` / `.legal-container` and so never reaches a /test route).
     Every measure in this HUD is already in rem, so ramping the root grows the
     card, the type, the padding and the button by one multiplier — nothing can
     outgrow its neighbours. Without it the readout sat at a 557 px card and
     16 px type in a 3840 px field, which is the size Austen has to lean in to
     read while judging a room. See .claude/rules/4k-native-layout.md. */
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
    min-inline-size: min(25rem, calc(100vw - 12rem));
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
    /* The distance readout changes every frame; tabular digits keep the row
       from twitching as it counts. */
    font-variant-numeric: tabular-nums;
  }

  .review-label strong {
    color: #eef1f3;
    font-weight: 640;
  }

  /* Two fixed columns, not auto-fit: the values change every frame, and a grid
     that resizes to its content would shove the whole panel around as the
     numbers gain and lose digits. */
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

  .progress {
    margin-block-start: 0.7rem;
    block-size: 0.25rem;
    border-radius: 999px;
    background: rgba(226, 232, 236, 0.16);
  }

  .progress span {
    display: block;
    block-size: 100%;
    border-radius: inherit;
    background: #e08640;
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
      min-inline-size: 34rem;
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

    .readout em {
      font-size: 1.05rem;
    }

    .progress {
      block-size: 0.4rem;
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

  /* Wide and SHORT — a folded Fold, a phone in landscape, a laptop with the
     browser half-height. Vertical space is the scarce one here, and a panel
     stacked five rows deep ate over half the frame at 960x412. Spend the width
     instead: one row of four, tighter type, less padding. */
  @media (max-height: 30rem) {
    .review-label {
      min-inline-size: min(34rem, calc(100vw - 14rem));
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
      grid-template-columns: repeat(4, 1fr);
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

    .progress {
      margin-block-start: 0.45rem;
      block-size: 0.2rem;
    }
  }
</style>
