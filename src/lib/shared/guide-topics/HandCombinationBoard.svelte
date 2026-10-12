<!--
  The six hand combinations as a board. Each cell is the combination's
  two-hand example and its name over a bar in its letter-type colors. The
  colors stay in the bar because purple and green text fail contrast on the
  lesson's dark and light surfaces.

  `found` limits the board to what the learner has found (null shows all). An
  unfound cell keeps its size with its name dimmed and its picture hidden, so
  finding one fills a slot and moves nothing. `lit` marks the combination just
  made. Unfound cells stay out of the accessibility tree; the host announces
  each find. With `namesOnlyWhenNarrow`, a board narrower than 24rem drops the
  pictures, so a phone keeps the board on screen under the grid. `darkMode`
  sets the pictures' colors for a page with its own theme switch; left out,
  they follow the app theme. `printMode` draws them on the white print
  surface, as the Guide's own pictures are in light mode.

  `cellProgress` plays a cell's move: a number from 0 to 1 glides its hands
  from their start points and fades its arrows in, as LessonPictographStage
  plays one; null draws the finished picture. `onCellPlay` reports a pointer
  entering or clicking a found cell, so the host can replay it. Both are off
  unless passed.

  With `onHint`, an unfound cell is a button that asks for a hint toward it,
  named by `hintLabel`; `goal` rings the cell asked for (Austen, 2026-10-12:
  learners could not tell what the six were, so they can tap one for help).

  A host can set `--board-wide-columns` (6 by default) for a wide board.
-->
<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { LETTER_TYPE_COLORS } from "#lib/shared/pictograph/shared/domain/constants/pictograph-constants.js";
  import { startPlacementDeriver } from "#lib/shared/pictograph/shared/services/start-placement-deriver.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import {
    HAND_COMBINATIONS,
    combinationPictographData,
    plainTopicText,
    type HandCombinationId,
  } from "./hand-motions-topic.js";

  interface Props {
    found?: ReadonlySet<HandCombinationId> | null;
    lit?: HandCombinationId | null;
    showDescriptions?: boolean;
    namesOnlyWhenNarrow?: boolean;
    darkMode?: boolean;
    printMode?: boolean;
    label?: string;
    cellProgress?: (id: HandCombinationId) => number | null;
    onCellPlay?: (id: HandCombinationId) => void;
    goal?: HandCombinationId | null;
    onHint?: (id: HandCombinationId) => void;
    hintLabel?: (name: string) => string;
  }

  let {
    found = null,
    lit = null,
    showDescriptions = false,
    namesOnlyWhenNarrow = false,
    darkMode = undefined,
    printMode = false,
    label,
    cellProgress = undefined,
    onCellPlay = undefined,
    goal = null,
    onHint = undefined,
    hintLabel = (name) => name,
  }: Props = $props();

  /** Where the example's hands start, for a cell that plays its move. */
  function startPose(data: PictographData): PictographData | null {
    try {
      return startPlacementDeriver.deriveFromFirstStep(
        data as unknown as StepData
      ) as unknown as PictographData;
    } catch {
      return null;
    }
  }

  const cells = HAND_COMBINATIONS.map((combination) => {
    const data = combinationPictographData(combination);
    return {
      combination,
      data,
      start: startPose(data),
      // The container plays a move only for a step.
      step: createStepData({ ...data, id: data.id }),
      tones: LETTER_TYPE_COLORS[combination.letterType],
    };
  });
</script>

<div class="board-frame">
  <ul
    class="combination-board"
    class:described={showDescriptions}
    class:names-only-narrow={namesOnlyWhenNarrow}
    aria-label={label}
  >
    {#each cells as { combination, data, start, step, tones } (combination.id)}
      {@const isFound = found === null || found.has(combination.id)}
      {@const hintable = !isFound && !!onHint}
      {@const progress = start
        ? (cellProgress?.(combination.id) ?? null)
        : null}
      <!-- Replay is a pointer extra; every cell has already played on view. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <li
        class="cell"
        class:found={isFound}
        class:lit={lit === combination.id}
        class:hintable
        class:goal={hintable && goal === combination.id}
        style:--tone-a={tones[0]}
        style:--tone-b={tones[1]}
        aria-hidden={isFound || hintable ? undefined : "true"}
        onpointerenter={isFound && onCellPlay
          ? () => onCellPlay(combination.id)
          : undefined}
        onclick={isFound && onCellPlay
          ? () => onCellPlay(combination.id)
          : undefined}
      >
        <div class="art" aria-hidden="true">
          <div class="picture">
            <PictographContainer
              pictographData={data}
              gridMode={GridMode.DIAMOND}
              leftPropTypeOverride={PropType.HAND}
              rightPropTypeOverride={PropType.HAND}
              showTKA={false}
              showPlacements={false}
              showReversals={false}
              showTnD={false}
              showElemental={false}
              showNonRadialPoints={false}
              stepNumberOverride={false}
              {darkMode}
              {printMode}
              motionStep={progress === null ? null : step}
              motionStartData={progress === null ? null : start}
              motionProgress={progress}
              arrowOpacity={progress ?? 1}
            />
          </div>
        </div>
        <div class="label">
          <span class="name">{plainTopicText(combination.name)}</span>
          <span class="bar" aria-hidden="true"></span>
          {#if showDescriptions}
            <span class="description"
              >{plainTopicText(combination.description)}</span
            >
          {/if}
        </div>
        <i class="fa-solid fa-check check" aria-hidden="true"></i>
        {#if hintable}
          <button
            type="button"
            class="hint"
            aria-pressed={goal === combination.id}
            aria-label={hintLabel(plainTopicText(combination.name))}
            onclick={() => onHint?.(combination.id)}
          ></button>
        {/if}
      </li>
    {/each}
  </ul>
</div>

<style>
  .board-frame {
    container: combination-board / inline-size;
    width: 100%;
  }

  .combination-board {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(0.5rem, 1.2vw, 1rem);
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @container combination-board (min-width: 24rem) {
    .combination-board {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* One row on a wide board, so the whole board fits a laptop screen. */
  @container combination-board (min-width: 56rem) {
    .combination-board {
      grid-template-columns: repeat(
        var(--board-wide-columns, 6),
        minmax(0, 1fr)
      );
    }
  }

  @container combination-board (max-width: 23.99rem) {
    .names-only-narrow .art {
      display: none;
    }

    .names-only-narrow .cell {
      padding: 0.45rem 2rem 0.45rem 0.6rem;
    }

    .names-only-narrow .check {
      top: 50%;
      translate: 0 -50%;
    }
  }

  .cell {
    position: relative;
    display: grid;
    grid-template-rows: auto auto;
    align-content: start;
    gap: 0.55rem;
    min-width: 0;
    padding: clamp(0.45rem, 1vw, 0.75rem);
    border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
    border-radius: 0.75rem;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
  }

  .cell.lit {
    background: color-mix(in srgb, var(--tone-a) 12%, transparent);
    border-color: color-mix(in srgb, var(--tone-a) 60%, transparent);
  }

  /* An unfound cell asked for as a hint: ringed and tinted whole, its name
     and bar at full strength while the learner works toward it. */
  .cell.goal {
    background: color-mix(in srgb, var(--tone-a) 10%, transparent);
    border-color: color-mix(in srgb, var(--tone-a) 70%, transparent);
  }

  .goal .name,
  .goal .bar,
  .hintable:hover .name,
  .hintable:hover .bar {
    opacity: 1;
  }

  .hint {
    position: absolute;
    inset: 0;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
  }

  .hint:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }

  .art {
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 0.5rem;
    background: color-mix(in srgb, currentColor 5%, transparent);
  }

  .picture {
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity var(--transition-emphasis);
  }

  .found .picture {
    opacity: 1;
  }

  .label {
    display: grid;
    gap: 0.35rem;
    justify-items: start;
    min-width: 0;
  }

  .name {
    font-weight: 700;
    line-height: 1.2;
    opacity: 0.45;
    transition: opacity var(--transition-normal);
  }

  .found .name {
    opacity: 1;
  }

  .bar {
    width: 2.75rem;
    height: 0.3rem;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--tone-a) 0 50%,
      var(--tone-b) 50% 100%
    );
    opacity: 0.35;
    transition: opacity var(--transition-normal);
  }

  .found .bar {
    opacity: 1;
  }

  .description {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
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

  .described .check {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .cell,
    .picture,
    .name,
    .bar,
    .check {
      transition: none;
    }
  }
</style>
