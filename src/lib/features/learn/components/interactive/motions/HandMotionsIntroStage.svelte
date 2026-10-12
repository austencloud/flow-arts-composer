<!--
  Hand Motions, stage 1: the three hand motions before the learner touches
  the grid (Austen, 2026-10-12: "we should be introduced to the three
  concepts first"). It is the Guide's own flowchart (HandMotionsPage.svelte):
  the blue hand's start, then a branch to each motion with its name and
  caption, ending at real pictographs of the move from that start: both
  shifts, the dash, and static. Once on screen each plays in turn, its arrow
  first and then the hand along it. A pointer over one, or a tap, plays it
  again once it has finished, as the Guide's six cards do (Austen,
  2026-10-12, preferred hover to clicking). Under the
  chart, the book's own two lines say what the arrow and the hand show.
  Reduced motion shows the finished pictures.
  Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { cubicInOut } from "svelte/easing";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import {
    MOTION_MAP_HOME,
    handMotionsTopicLines,
    handMotionsTopicText,
    handMovePictographData,
    motionMapTargets,
    type HandMotionsTopicUnit,
    type HandMove,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import {
    GridMode,
    type GridLocation,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { getPlacementGridPoints } from "#lib/shared/pictograph/grid/services/placement-grid-points.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { whenOnScreen } from "#lib/shared/transitions/build-sequence.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  /** The arrow fades in, then the hand follows it, as on the grid. */
  const ARROW_MS = DURATION.dramatic;
  const FOLLOW_DELAY_MS = DURATION.normal;
  const TRAVEL_MS = DURATION.scene;
  const PLAY_MS = FOLLOW_DELAY_MS + TRAVEL_MS;
  /** Each picture starts this long after the one before. */
  const STAGGER_MS = DURATION.scene * 0.75;

  const start = MOTION_MAP_HOME;
  const [shiftOne, shiftTwo, dash] = motionMapTargets(start);
  const startPoint = getPlacementGridPoints(GridMode.DIAMOND).find(
    (point) => point.location === start
  );

  interface Picture {
    id: string;
    data: PictographData;
    step: StepData;
  }

  interface Branch {
    id: HandMove;
    name: HandMotionsTopicUnit;
    caption: HandMotionsTopicUnit;
    pictures: Picture[];
  }

  /**
   * Every move starts from the hand at rest on the start point. The start
   * deriver wants both hands, so one-hand pictures build their start pose
   * here as the Start box's static hand.
   */
  const startPose = handMovePictographData(start, start)!;

  function picture(to: GridLocation): Picture {
    const data = handMovePictographData(start, to)!;
    return {
      id: `${start}-${to}`,
      data,
      // The container plays a move only for a step.
      step: createStepData({ ...data, id: data.id }),
    };
  }

  const branches: Branch[] = [
    {
      id: "shift",
      name: "shiftName",
      caption: "shiftCaption",
      pictures: [shiftOne, shiftTwo]
        .filter((target) => target !== undefined)
        .map((target) => picture(target.to)),
    },
    {
      id: "dash",
      name: "dashName",
      caption: "dashCaption",
      pictures: dash ? [picture(dash.to)] : [],
    },
    {
      id: "static",
      name: "staticName",
      caption: "staticCaption",
      pictures: [picture(start)],
    },
  ];
  const startPicture: StepData = createStepData({
    ...startPose,
    id: `hand-motions-start-${start}`,
    stepNumber: 0,
  });
  /** The book's lines under its chart; the first is the stage's heading. */
  const notes = handMotionsTopicLines("intro").slice(1);

  /**
   * How far each picture has played: its arrow's fade and its hand's travel,
   * 0 to 1. A played picture holds 1, the finished picture, as the Guide's
   * board does: dropping the start pose at the end would re-prepare the
   * picture, and a replay would then run out before it was ready.
   */
  const SHOWN = { arrow: 1, hand: 1 };
  let playing = $state<Record<string, { arrow: number; hand: number }>>(
    Object.fromEntries(
      branches
        .flatMap((branch) => branch.pictures)
        .map((entry) => [
          entry.id,
          reducedMotion() ? SHOWN : { arrow: 0, hand: 0 },
        ])
    )
  );
  /** Counts each static picture's plays, so its ring settles in each time. */
  let pulses = $state<Record<string, number>>({});
  const frames = new Map<string, number>();
  /** When each picture last started, so a replay waits for it to finish. */
  const lastPlayed = new Map<string, number>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let host: HTMLDivElement;

  function play(entry: Picture, move: HandMove) {
    lastPlayed.set(entry.id, performance.now());
    if (move === "static") {
      pulses[entry.id] = (pulses[entry.id] ?? 0) + 1;
      playing[entry.id] = SHOWN;
      return;
    }
    if (reducedMotion()) {
      playing[entry.id] = SHOWN;
      return;
    }
    cancelAnimationFrame(frames.get(entry.id) ?? 0);
    const startedAt = performance.now();
    const step = (now: number) => {
      const elapsed = now - startedAt;
      const arrow = Math.min(1, elapsed / ARROW_MS);
      const hand = cubicInOut(
        Math.min(1, Math.max(0, elapsed - FOLLOW_DELAY_MS) / TRAVEL_MS)
      );
      if (elapsed >= PLAY_MS) {
        frames.delete(entry.id);
        playing[entry.id] = SHOWN;
        return;
      }
      playing[entry.id] = { arrow, hand };
      frames.set(entry.id, requestAnimationFrame(step));
    };
    playing[entry.id] = { arrow: 0, hand: 0 };
    frames.set(entry.id, requestAnimationFrame(step));
  }

  /**
   * Plays a picture again unless it is still playing. A tap on a touch screen
   * both enters and clicks, so it plays once.
   */
  function replay(entry: Picture, move: HandMove) {
    const last = lastPlayed.get(entry.id);
    if (last !== undefined && performance.now() - last < PLAY_MS) return;
    play(entry, move);
  }

  function playAll() {
    let delay = DURATION.dramatic;
    for (const branch of branches) {
      for (const entry of branch.pictures) {
        timers.push(setTimeout(() => replay(entry, branch.id), delay));
        delay += STAGGER_MS;
      }
    }
  }

  onMount(() => {
    if (reducedMotion()) return;
    const stopWatching = whenOnScreen(host, playAll);
    return () => {
      stopWatching();
      for (const timer of timers) clearTimeout(timer);
      for (const frame of frames.values()) cancelAnimationFrame(frame);
    };
  });
</script>

<div class="intro-stage" bind:this={host}>
  <div class="flowchart">
    <div class="start" aria-hidden="true">
      <PictographContainer
        pictographData={startPicture}
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
      />
    </div>
    <span class="spine" aria-hidden="true"></span>
    {#each branches as branch (branch.id)}
      <div class="branch {branch.id}">
        <span class="name">{handMotionsTopicText(branch.name)}</span>
        <span class="line" aria-hidden="true"></span>
        <span class="caption">{handMotionsTopicText(branch.caption)}</span>
      </div>
      <div class="pictures {branch.id}">
        {#each branch.pictures as entry (entry.id)}
          {@const progress = playing[entry.id] ?? SHOWN}
          <button
            type="button"
            class="picture"
            aria-label={t("learn_motion_path_aria", {
              name: handMotionsTopicText(branch.name),
              caption: handMotionsTopicText(branch.caption),
            })}
            onpointerenter={() => replay(entry, branch.id)}
            onclick={() => replay(entry, branch.id)}
          >
            <PictographContainer
              pictographData={entry.data}
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
              motionStep={entry.step}
              motionStartData={startPose}
              motionProgress={progress.hand}
              arrowOpacity={progress.arrow}
            />
            {#if branch.id === "static" && startPoint}
              <svg class="ring" viewBox="0 0 950 950" aria-hidden="true">
                {#key pulses[entry.id] ?? 0}
                  <circle
                    cx={startPoint.x}
                    cy={startPoint.y}
                    r="78"
                    class:shown={reducedMotion() || (pulses[entry.id] ?? 0) > 0}
                  />
                {/key}
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    {/each}
  </div>
  {#if notes.length > 0}
    <p class="notes">
      {#each notes as line, index (index)}
        {#if index > 0}<br />{/if}{line}
      {/each}
    </p>
  {/if}
</div>

<style>
  .intro-stage {
    container: hand-intro / inline-size;
    display: grid;
    justify-items: center;
    gap: clamp(1rem, calc(2.5 * var(--lesson-vh, 1svh)), 2rem);
    width: 100%;
  }

  /* The book's chart: the start, a spine, and one branch per motion. */
  .flowchart {
    /* Three rows of pictures share the height left by the heading, the
       book's lines and the controls; the lines and the words grow with
       them. */
    --box: clamp(
      4.5rem,
      min(calc((100 * var(--lesson-vh, 1svh) - 32rem) / 3), 21cqw),
      22rem
    );
    --line: max(0.18rem, calc(var(--box) * 0.012));
    --line-color: color-mix(in srgb, currentColor 55%, transparent);
    --head: max(0.55rem, calc(var(--box) * 0.04));
    display: grid;
    grid-template-columns: var(--box) minmax(7rem, calc(var(--box) * 1.3)) auto;
    grid-template-rows: repeat(3, var(--box));
    grid-template-areas:
      ".     shift-branch  shift-pictures"
      "start dash-branch   dash-pictures"
      ".     static-branch static-pictures";
    row-gap: clamp(0.75rem, calc(2 * var(--lesson-vh, 1svh)), 1.5rem);
    position: relative;
  }

  .start {
    grid-area: start;
  }

  .spine {
    grid-column: 2;
    grid-row: 1 / 4;
    justify-self: start;
    width: var(--line);
    margin-block: calc(var(--box) / 2 - var(--line) / 2);
    background: var(--line-color);
  }

  .branch {
    display: grid;
    grid-template-rows: 1fr auto 1fr;
    align-items: center;
    padding-right: 0.5rem;
    min-width: 0;
  }

  .branch.shift {
    grid-area: shift-branch;
  }

  .branch.dash {
    grid-area: dash-branch;
  }

  .branch.static {
    grid-area: static-branch;
  }

  .pictures.shift {
    grid-area: shift-pictures;
  }

  .pictures.dash {
    grid-area: dash-pictures;
  }

  .pictures.static {
    grid-area: static-pictures;
  }

  .name {
    align-self: end;
    padding: 0 0 0.3rem 0.75rem;
    color: var(--theme-text);
    font-size: clamp(1rem, calc(var(--box) * 0.1), 1.6rem);
    font-weight: 700;
    line-height: 1.2;
  }

  /* A branch line ending in a solid arrowhead at its picture. */
  .line {
    position: relative;
    height: var(--line);
    margin-right: var(--head);
    background: var(--line-color);
  }

  .line::after {
    content: "";
    position: absolute;
    top: 50%;
    right: calc(var(--head) * -1);
    translate: 0 -50%;
    border-block: calc(var(--head) * 0.75) solid transparent;
    border-left: var(--head) solid var(--line-color);
  }

  .caption {
    align-self: start;
    padding: 0.3rem 0 0 0.75rem;
    color: var(--theme-text-dim);
    font-size: clamp(
      var(--font-size-min, 0.875rem),
      calc(var(--box) * 0.075),
      1.3rem
    );
    font-style: italic;
    line-height: 1.35;
    text-wrap: pretty;
  }

  .pictures {
    display: flex;
    gap: 0.5rem;
  }

  .picture {
    position: relative;
    width: var(--box);
    aspect-ratio: 1;
    padding: 0;
    border: none;
    border-radius: 0.5rem;
    background: none;
    color: inherit;
    cursor: pointer;
    transition: transform var(--transition-normal);
  }

  .picture:hover {
    transform: translateY(-2px);
  }

  .picture:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
  }

  .ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .ring circle {
    fill: color-mix(in srgb, var(--prop-blue, #3b82f6) 14%, transparent);
    stroke: var(--prop-blue, #3b82f6);
    stroke-width: 5;
    stroke-opacity: 0.8;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
  }

  /* Static has no arrow; its ring settles in and stays, as on the map. */
  .ring circle.shown {
    opacity: 1;
    animation: hold-ring var(--duration-dramatic) var(--ease-standard-out) both;
  }

  @keyframes hold-ring {
    from {
      opacity: 0;
      transform: scale(0.6);
    }
  }

  .notes {
    margin: 0;
    max-width: 40ch;
    color: var(--theme-text-dim);
    text-align: center;
    line-height: 1.5;
    text-wrap: balance;
  }

  /* Narrow: the start on top, the branches side by side under it. */
  @container hand-intro (max-width: 35.99rem) {
    .flowchart {
      --box: clamp(3.5rem, calc(25cqw - 0.75rem), 7rem);
      grid-template-columns: 2fr 1fr 1fr;
      grid-template-rows: auto auto auto;
      grid-template-areas:
        "start          start         start"
        "shift-branch   dash-branch   static-branch"
        "shift-pictures dash-pictures static-pictures";
      row-gap: 0;
      width: 100%;
    }

    .start {
      justify-self: center;
      width: var(--box);
    }

    /* The spine runs across, from the shift branch's middle to static's. */
    .spine {
      grid-column: 1 / 4;
      grid-row: 2;
      align-self: start;
      justify-self: stretch;
      width: auto;
      height: var(--line);
      margin: 0 12.5% 0 25%;
    }

    .branch {
      grid-template-rows: auto auto auto;
      align-content: start;
      justify-items: center;
      align-items: start;
      padding: 0 0.25rem 0.5rem;
      text-align: center;
    }

    .name {
      order: 2;
      align-self: auto;
      padding: 0.35rem 0 0;
    }

    .line {
      order: 1;
      width: var(--line);
      height: 1.5rem;
      margin: 0 0 var(--head);
    }

    .line::after {
      top: auto;
      right: auto;
      bottom: calc(var(--head) * -1);
      left: 50%;
      translate: -50% 0;
      border-inline: calc(var(--head) * 0.75) solid transparent;
      border-block: 0;
      border-top: var(--head) solid var(--line-color);
    }

    .caption {
      order: 3;
      align-self: auto;
      padding: 0.15rem 0 0;
    }

    .pictures {
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .picture {
      transition: none;
    }

    .picture:hover {
      transform: none;
    }

    .ring circle.shown {
      animation: none;
    }
  }
</style>
