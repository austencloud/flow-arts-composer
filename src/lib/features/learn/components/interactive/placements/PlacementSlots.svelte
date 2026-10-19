<!--
  Hand Placements: a slot for each placement on the board's right edge, laid
  out like the Hand Motions map's move slots. Building a placement lights its
  slot and fills it with the learner's own pair (Austen, 2026-10-14: keep
  alpha, beta and gamma on the right edge, the way Hand Motions shows its
  moves). In practice the slot asked for is marked and a wrong try shows the
  fix in it; in free play each slot loads its example onto the board.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { Crossfade, growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    PLACEMENT_TYPE_INFO,
    type PlacementType,
  } from "../../../domain/constants/placement-quiz-data";
  import type { placementPairPreview } from "./hand-placement-lesson";

  export interface PlacementSlot {
    kind: PlacementType;
    /** The pair the slot shows, or null to show only its symbol. */
    picture: ReturnType<typeof placementPairPreview> | null;
    /** Names the pair shown, so a slot only refills when its pair changes. */
    pictureKey: string;
    /** The line under the name, or null for none. */
    caption: string | null;
    checked: boolean;
    target: boolean;
    /** A wrong try: the picture and caption show the fix. */
    correction: boolean;
    selected: boolean;
  }

  interface Props {
    slots: PlacementSlot[];
    /** The placement just built; its slot answers every build. */
    lit: PlacementType | null;
    /** Counts builds, so the lit slot answers each one. */
    builds: number;
    /** Free play: a slot loads its example onto the board. */
    onStudy?: (kind: PlacementType) => void;
  }

  let { slots, lit, builds, onStudy }: Props = $props();
</script>

<ul class="slots" aria-label={t("learn_ui_placement_examples")}>
  {#each slots as slot (slot.kind)}
    {@const info = PLACEMENT_TYPE_INFO[slot.kind]}
    <li
      class:lit={lit === slot.kind || slot.selected}
      class:target={slot.target}
      class:correction={slot.correction}
      class:found={slot.checked}
      class:filled={!!slot.picture}
    >
      <div class="art" aria-hidden="true">
        <!-- A new round empties the slots: each picture fades back into its
             symbol instead of cutting out. -->
        <Crossfade
          key={slot.picture ? slot.pictureKey : "symbol"}
          duration={DURATION.normal}
          fill
        >
          {#if slot.picture}
            <div class="picture">
              <PictographContainer
                pictographData={slot.picture}
                showTKA={true}
                showPlacements={false}
                showReversals={false}
                showTnD={false}
                showElemental={false}
                leftPropTypeOverride={PropType.HAND}
                rightPropTypeOverride={PropType.HAND}
              />
            </div>
          {:else}
            <span class="symbol">{info.symbol}</span>
          {/if}
        </Crossfade>
        {#if lit === slot.kind}
          {#key builds}
            <span class="ping"></span>
          {/key}
        {/if}
      </div>
      <span class="name">{info.label}</span>
      {#if slot.caption}
        <span class="caption" transition:growFade>{slot.caption}</span>
      {/if}
      <i class="fa-solid fa-check check" aria-hidden="true"></i>
      {#if onStudy}
        <button
          type="button"
          class="hit"
          aria-label={t("learn_ui_study_placement_example", {
            placement: info.label,
          })}
          aria-pressed={slot.selected}
          onclick={() => onStudy?.(slot.kind)}
        ></button>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .slots {
    --slot-art: clamp(3.25rem, 9cqw, 6rem);
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* As the Hand Motions slots: the picture over its name. */
  li {
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
      border-color var(--transition-normal),
      box-shadow var(--transition-normal);
  }

  .art {
    grid-area: art;
    position: relative;
    display: grid;
    place-items: center;
    justify-self: center;
    width: var(--slot-art);
    aspect-ratio: 1;
    border-radius: 0.5rem;
    background: color-mix(in srgb, currentColor 5%, transparent);
  }

  /* Stacked under a phone's board, a slot is a small picture over its name;
     its line stays for screen readers so the board keeps its height. */
  .caption {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .name {
    text-align: center;
  }

  /* Beside the board, each slot is a row: picture, then name and line.
     Portrait screens keep the slots stacked under the board. */
  @media (min-aspect-ratio: 1 / 1) {
    @container (min-width: 44.01rem) {
      .slots {
        --slot-art: clamp(4.5rem, 11svh, 7rem);
        grid-template-columns: minmax(0, 1fr);
        gap: 0.6rem;
      }

      li {
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
        text-align: start;
      }

      .caption {
        position: static;
        width: auto;
        height: auto;
        overflow: visible;
        clip: auto;
        white-space: normal;
        align-self: start;
      }

      li .check {
        top: 0.6rem;
        right: 0.6rem;
        width: 1.6rem;
        font-size: 0.8rem;
      }

      li:not(:has(.caption)) .name {
        grid-row: 1 / span 2;
        align-self: center;
      }
    }
  }

  .slots li.lit {
    /* The slot just built stands out from the blue page: a light ring and
       glow rather than a blue tint (Austen, 2026-10-14). */
    background: color-mix(in srgb, var(--theme-text) 12%, transparent);
    border-color: var(--theme-text);
    box-shadow:
      inset 0 0 0 1px var(--theme-text),
      0 0 1.25rem color-mix(in srgb, var(--theme-text) 30%, transparent);
  }

  li.target {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
  }

  li.correction {
    border-color: var(--semantic-error);
    background: color-mix(in srgb, var(--semantic-error) 8%, transparent);
  }

  .picture {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    animation: fill-slot var(--duration-emphasis) var(--ease-standard-out) both;
  }

  /* The crossfade owns the fade; the picture only grows into its slot. */
  @keyframes fill-slot {
    from {
      transform: scale(0.85);
    }
  }

  .symbol {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    font-size: calc(var(--slot-art) * 0.5);
    line-height: 1;
    font-weight: 600;
    color: var(--theme-text-dim);
    opacity: 0.55;
  }

  li.target .symbol {
    color: var(--theme-accent);
    opacity: 1;
  }

  /* Each build answers on its slot, even one already found. */
  .ping {
    position: absolute;
    inset: 0;
    border: 2px solid var(--theme-text);
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
    min-width: 0;
    color: var(--theme-text);
    font-weight: 700;
    line-height: 1.2;
    opacity: 0.55;
    transition: opacity var(--transition-normal);
  }

  .found .name,
  .filled .name,
  .target .name,
  .lit .name {
    opacity: 1;
  }

  .caption {
    grid-area: caption;
    min-width: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.35;
    text-wrap: pretty;
  }

  .correction .caption {
    color: var(--theme-text);
  }

  /* The check's slot is always reserved, so a find moves nothing. */
  .check {
    position: absolute;
    top: 0.3rem;
    right: 0.3rem;
    display: grid;
    place-items: center;
    width: 1.25rem;
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    font-size: 0.65rem;
    opacity: 0;
    transition: opacity var(--transition-normal);
  }

  .found .check {
    opacity: 1;
  }

  .hit {
    position: absolute;
    inset: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
  }

  .hit:hover {
    background: color-mix(in srgb, currentColor 6%, transparent);
  }

  .hit:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    li,
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
</style>
