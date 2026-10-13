<!--
  Hand Motions, stage 2: the motion map beside a slot for each of its three
  moves. The learner taps a point (or drags the blue hand); the move's arrow
  draws on, the hand follows it, and the slot it counts for lights. The first
  time, the learner's own move fills the slot as a small picture with its
  name, as the two-hand stage's board fills (Austen, 2026-10-12: the old
  cards were too understated to show when a move was done). The stage is done
  once all three slots are filled.
  Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import MotionMapFigure from "#lib/shared/guide-topics/MotionMapFigure.svelte";
  import {
    MOTION_MAP_MOVES,
    handMotionsTopicText,
    handMovePictographData,
    type ComboHand,
    type HandMove,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { getPlacementGridPoints } from "#lib/shared/pictograph/grid/services/placement-grid-points.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";

  interface Props {
    /** Each move found so far, as the learner first made it. */
    found: Partial<Record<HandMove, ComboHand>>;
    onFind?: (made: ComboHand) => void;
  }

  let { found, onFind }: Props = $props();

  const handPoints = getPlacementGridPoints(GridMode.DIAMOND);

  let lit = $state<HandMove | null>(null);
  /** Counts the learner's moves, so the lit slot answers each one. */
  let moves = $state(0);
  let announcement = $state("");

  function moved(
    move: HandMove,
    by: "demo" | "learner",
    from: GridLocation,
    to: GridLocation
  ) {
    if (by === "demo") return;
    moves += 1;
    if (!found[move]) onFind?.({ move, from, to });
    const entry = MOTION_MAP_MOVES.find((candidate) => candidate.id === move);
    if (!entry) return;
    announcement = t("learn_motion_path_aria", {
      name: handMotionsTopicText(entry.name),
      caption: handMotionsTopicText(entry.caption),
    });
  }
</script>

<div class="map-stage">
  <div class="map-layout">
    <div class="figure">
      <MotionMapFigure interactive demo={false} bind:lit onMove={moved} />
    </div>
    <ul class="moves">
      {#each MOTION_MAP_MOVES as move (move.id)}
        {@const made = found[move.id]}
        {@const picture = made
          ? handMovePictographData(made.from, made.to)
          : null}
        {@const holdPoint =
          made?.move === "static"
            ? handPoints.find((point) => point.location === made.from)
            : undefined}
        <li class:lit={lit === move.id} class:found={!!made}>
          <div class="art" aria-hidden="true">
            {#if picture}
              <div class="picture">
                <PictographContainer
                  pictographData={picture}
                  gridMode={GridMode.DIAMOND}
                  leftPropTypeOverride={PropType.HAND}
                  rightPropTypeOverride={PropType.HAND}
                  visibleHand={HandSide.LEFT}
                  showTKA={false}
                  showPlacements={false}
                  showReversals={false}
                  showTnD={false}
                  showElemental={false}
                  showNonRadialPoints={false}
                  stepNumberOverride={false}
                />
                {#if holdPoint}
                  <!-- Static has no arrow; its ring is the map's halo. -->
                  <svg class="ring" viewBox="0 0 950 950">
                    <circle cx={holdPoint.x} cy={holdPoint.y} r="78" />
                  </svg>
                {/if}
              </div>
            {/if}
            {#if lit === move.id}
              {#key moves}
                <span class="ping"></span>
              {/key}
            {/if}
          </div>
          <span class="name">{handMotionsTopicText(move.name)}</span>
          <span class="caption">{handMotionsTopicText(move.caption)}</span>
          <i class="fa-solid fa-check check" aria-hidden="true"></i>
        </li>
      {/each}
    </ul>
  </div>
  <span class="sr-only" aria-live="polite">{announcement}</span>
</div>

<style>
  .map-stage {
    container: hand-map / inline-size;
    width: 100%;
  }

  .map-layout {
    --map-gap: clamp(1rem, 2.5vw, 2.5rem);
    /* A slot's picture beside the map grows with the screen's height. */
    --slot-art: clamp(4.5rem, calc(12 * var(--lesson-vh, 1svh)), 8rem);
    --slots: calc(var(--slot-art) + 16rem);
    display: grid;
    justify-items: center;
    align-items: center;
    gap: var(--map-gap);
    width: 100%;
  }

  /* Sized by the window's height too, so the heading, map, slots and the
     lesson controls fit one screen. Stacked, the slots sit under the map and
     the controls are taller, so the map gives up more height. */
  .figure {
    width: min(
      100%,
      max(16rem, calc(100 * var(--lesson-vh, 1svh) - 37rem)),
      48rem
    );
  }

  .moves {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* As the two-hand board's cells: the picture's slot over its name. */
  .moves li {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "art"
      "name"
      "caption";
    align-content: start;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.45rem;
    border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
    border-radius: 0.75rem;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
  }

  /* A stacked slot's picture stays small, so a tall tablet keeps the map
     big over the slots. */
  .moves .art {
    justify-self: center;
    max-width: 10rem;
  }

  /* Side by side on a landscape screen; a portrait tablet stacks, since the
     map beside the slots would be a third of its width. */
  @media (min-aspect-ratio: 1 / 1) {
    @container hand-map (min-width: 40rem) {
      /* The map takes its full size first; the slots get what is left. */
      .map-layout {
        grid-template-columns:
          min(
            max(
              17rem,
              min(
                calc(100 * var(--lesson-vh, 1svh) - 25rem),
                calc(72 * var(--lesson-vh, 1svh))
              )
            ),
            calc(100% - 15rem - var(--map-gap))
          )
          minmax(15rem, var(--slots));
        justify-content: center;
      }

      .figure {
        width: 100%;
      }

      .moves {
        grid-template-columns: minmax(0, 1fr);
        gap: 0.6rem;
        width: min(100%, var(--slots));
      }

      .moves .art {
        max-width: none;
      }

      .moves li {
        grid-template-columns: var(--slot-art) minmax(0, 1fr);
        grid-template-areas:
          "art name"
          "art caption";
        align-content: center;
        gap: 0.2rem 0.85rem;
        padding: 0.6rem 2.5rem 0.6rem 0.6rem;
      }

      .name {
        align-self: end;
      }

      .caption {
        align-self: start;
      }
    }
  }

  .moves li.lit {
    background: color-mix(in srgb, var(--prop-blue, #3b82f6) 16%, transparent);
    border-color: color-mix(
      in srgb,
      var(--prop-blue, #3b82f6) 60%,
      transparent
    );
  }

  .art {
    grid-area: art;
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 0.5rem;
    background: color-mix(in srgb, currentColor 5%, transparent);
  }

  .picture {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: inherit;
    animation: fill-slot var(--duration-emphasis) var(--ease-standard-out) both;
  }

  .ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .ring circle {
    fill: color-mix(in srgb, var(--prop-blue, #3b82f6) 14%, transparent);
    stroke: var(--prop-blue, #3b82f6);
    stroke-width: 5;
    stroke-opacity: 0.8;
  }

  @keyframes fill-slot {
    from {
      opacity: 0;
      transform: scale(0.85);
    }
  }

  /* Each move answers on its slot, even one already found. */
  .ping {
    position: absolute;
    inset: 0;
    border: 2px solid var(--prop-blue, #3b82f6);
    border-radius: inherit;
    pointer-events: none;
    animation: ping calc(var(--duration-scene) * 0.75) var(--ease-standard-out)
      both;
  }

  @keyframes ping {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(1.12);
    }
  }

  .name {
    grid-area: name;
    color: var(--theme-text);
    font-weight: 700;
    line-height: 1.2;
    opacity: 0.55;
    transition: opacity var(--transition-normal);
  }

  .found .name {
    opacity: 1;
  }

  .caption {
    grid-area: caption;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.35;
    text-wrap: pretty;
  }

  /* The check's slot is always reserved, so a find moves nothing. */
  .check {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    display: grid;
    place-items: center;
    width: 1.6rem;
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    font-size: 0.8rem;
    opacity: 0;
    transition: opacity var(--transition-normal);
  }

  .found .check {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .moves li,
    .name,
    .check {
      transition: none;
    }

    .picture,
    .ping {
      animation: none;
    }

    .ping {
      display: none;
    }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
