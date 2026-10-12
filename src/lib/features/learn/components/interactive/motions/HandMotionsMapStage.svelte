<!--
  Hand Motions, stage 1: the motion map beside its three moves. The map builds
  itself once on screen, then the learner drags the blue hand; each move they
  make gets its found mark. The stage is done once all three are found.
  Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import MotionMapFigure from "#lib/shared/guide-topics/MotionMapFigure.svelte";
  import {
    MOTION_MAP_MOVES,
    handMotionsTopicText,
    type HandMove,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";

  interface Props {
    found: readonly HandMove[];
    onFind?: (move: HandMove) => void;
  }

  let { found, onFind }: Props = $props();

  let lit = $state<HandMove | null>(null);
  let announcement = $state("");

  function moved(move: HandMove, by: "demo" | "learner") {
    if (by === "demo") return;
    if (!found.includes(move)) onFind?.(move);
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
      <MotionMapFigure interactive bind:lit onMove={moved} />
    </div>
    <ul class="moves">
      {#each MOTION_MAP_MOVES as move (move.id)}
        <li class:lit={lit === move.id} class:found={found.includes(move.id)}>
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
    display: grid;
    justify-items: center;
    align-items: center;
    gap: var(--map-gap);
    width: 100%;
  }

  /* Sized by the window's height too, so the heading, map, moves and the
     lesson controls fit one screen. Stacked, the moves sit under the map and
     the controls are taller, so the map gives up more height. */
  .figure {
    width: min(100%, max(17rem, calc(100svh - 30rem)), 44rem);
  }

  .moves {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.4rem;
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .moves li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 1rem;
    grid-template-areas:
      "name check"
      "caption caption";
    align-items: start;
    gap: 0.2rem 0.25rem;
    padding: 0.5rem 0.55rem;
    border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
    border-radius: 0.75rem;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
  }

  @container hand-map (min-width: 40rem) {
    /* The map takes its full size first; the moves get what is left. */
    .map-layout {
      grid-template-columns:
        min(
          max(17rem, calc(100svh - 21rem)),
          44rem,
          calc(100% - 14rem - var(--map-gap))
        )
        minmax(14rem, 22rem);
      justify-content: center;
    }

    .figure {
      width: 100%;
    }

    .moves {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.5rem;
      width: min(100%, 22rem);
    }

    .moves li {
      grid-template-columns: minmax(0, 1fr) 1.25rem;
      grid-template-areas:
        "name check"
        "caption check";
      align-items: center;
      gap: 0 0.75rem;
      padding: 0.65rem 0.9rem;
    }
  }

  .moves li.lit {
    background: color-mix(in srgb, var(--prop-blue, #3b82f6) 16%, transparent);
    border-color: color-mix(
      in srgb,
      var(--prop-blue, #3b82f6) 55%,
      transparent
    );
  }

  .name {
    grid-area: name;
    color: var(--theme-text);
    font-weight: 700;
  }

  .caption {
    grid-area: caption;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
  }

  /* The check's slot is always reserved, so a find moves nothing. */
  .check {
    grid-area: check;
    color: var(--theme-text);
    opacity: 0;
    transition: opacity var(--transition-normal);
  }

  .found .check {
    opacity: 1;
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
