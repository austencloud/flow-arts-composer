<!--
  Dev-only review page for the Hand Motions motion map draft (the /test
  layout guards it out of production). The figure is the shared
  MotionMapFigure; the prompt and caption list stand in for the lesson stage
  that follows once Austen approves this draft.
-->
<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import MotionMapFigure from "#lib/shared/guide-topics/MotionMapFigure.svelte";
  import {
    MOTION_MAP_MOVES,
    handMotionsTopicText,
    type HandMove,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";

  let take = $state(0);
  let lit = $state<HandMove | null>(null);
  let found = $state<readonly HandMove[]>([]);
  let announcement = $state("");

  function moved(move: HandMove, by: "demo" | "learner") {
    if (by === "demo") return;
    if (!found.includes(move)) found = [...found, move];
    const entry = MOTION_MAP_MOVES.find((candidate) => candidate.id === move);
    if (!entry) return;
    announcement = t("learn_motion_path_aria", {
      name: handMotionsTopicText(entry.name),
      caption: handMotionsTopicText(entry.caption),
    });
  }

  function replay() {
    take += 1;
    lit = null;
    found = [];
    announcement = "";
  }
</script>

<main class="motion-map-review">
  <p class="prompt">{handMotionsTopicText("mapPrompt")}</p>
  <div class="stage">
    <div class="figure">
      {#key take}
        <MotionMapFigure interactive bind:lit onMove={moved} />
      {/key}
    </div>
    <ul class="moves">
      {#each MOTION_MAP_MOVES as move (move.id)}
        <li class:lit={lit === move.id}>
          <span class="name">{handMotionsTopicText(move.name)}</span>
          <span class="caption">{handMotionsTopicText(move.caption)}</span>
          <i
            class="fa-solid fa-check found"
            class:shown={found.includes(move.id)}
            aria-hidden="true"
          ></i>
        </li>
      {/each}
    </ul>
  </div>
  <PanelButton onclick={replay}>Play again</PanelButton>
  <span class="sr-only" aria-live="polite">{announcement}</span>
</main>

<style>
  .motion-map-review {
    container-type: inline-size;
    display: grid;
    justify-items: center;
    gap: 1.25rem;
    padding: 1.5rem 1rem 2rem;
    color: var(--theme-text, #f5f5f5);
  }
  .prompt {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
  }
  .stage {
    display: grid;
    gap: 1.5rem;
    justify-items: center;
    align-items: center;
    width: 100%;
  }
  .figure {
    width: min(100%, 34rem);
  }
  @container (min-width: 52rem) {
    .stage {
      grid-template-columns: minmax(0, 34rem) minmax(0, 20rem);
      justify-content: center;
    }
  }
  .moves {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.5rem;
    width: min(100%, 20rem);
  }
  .moves li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 1.25rem;
    grid-template-areas:
      "name found"
      "caption found";
    align-items: center;
    padding: 0.6rem 0.85rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
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
    font-weight: 700;
  }
  .caption {
    grid-area: caption;
    opacity: 0.85;
  }
  /* The check's slot is always reserved, so finding a move moves nothing. */
  .found {
    grid-area: found;
    opacity: 0;
    transition: opacity var(--transition-normal);
  }
  .found.shown {
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
