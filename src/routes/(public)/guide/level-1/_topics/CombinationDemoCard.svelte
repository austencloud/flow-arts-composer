<!--
  One hand combination's example as a card (2026-10-31), tinted with the
  combination's first colour the way the Dual-Shift mode cards wear their
  element. Since 2026-11-01 (Austen: the Guide never relies on pictographs
  alone) it has the mode cards' shape: the example playing as a moving
  animation on top, from the start position to the end and back after a
  short hold at each end, and under it the notation, the start box joined
  to the count with a hairline, the box playing ringed. Hands only, no
  letters; the pair is laid out by its letter, as the Hand Motions board
  lays out its examples, so a Cross-Shift's dash never lies under the
  shifting hand, and the spoken descriptions leave the letter out.

  It opens on the record's example (the book's). "Another example", in the
  Composer's Generate look, draws a fresh example of the same combination,
  never the one showing, and the animation and the notation crossfade to it
  together. A page mounts one card and hands it the screen's combination;
  the card goes back to that combination's own example when it changes.

  Cross-Shift's breakdown (2026-11-01) is the same card animated: the
  cross-shift plays on top with a hold at the start, at the halfway point
  and at the end, and under it the book's four boxes in one joined row
  (Start, halfway, end, combined), the box ringed following the animation
  (combined while the hands move), the book's caption small beneath. The
  player cannot hold inside a count, so the card drives it with its own
  clock (externalStep) through the one count: halfway is the count's 50 %
  point, which is the book's halfway pose (the dash hand at the centre,
  the shift hand on the diagonal).
-->
<script lang="ts">
  import { browser } from "$app/env";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import HandMotionPlayer from "#lib/features/learn/components/interactive/foundations/HandMotionPlayer.svelte";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    MotionType,
    RotationDirection,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { getGridPlacementFromLocations } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
  import { startPlacementDeriver } from "#lib/shared/pictograph/shared/services/start-placement-deriver.js";
  import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
  import {
    createSequenceData,
    type SequenceData,
  } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
  import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import { LETTER_TYPE_COLORS } from "#lib/shared/pictograph/shared/domain/constants/pictograph-constants.js";
  import {
    handPairLetter,
    handPairPictographData,
    type HandCombination,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import {
    randomCombinationExample,
    type CombinationExample,
  } from "#lib/shared/guide-topics/hand-combination-examples.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { describePictograph } from "#lib/shared/pictograph/shared/domain/utils/pictograph-description.js";
  import { inkOn } from "./hand-type-switcher";

  let {
    combination,
    darkMode,
    breakdown = null,
  }: {
    combination: HandCombination;
    darkMode: boolean;
    /** Cross-Shift broken down: the book's boxes and caption, in place of
     *  the example. */
    breakdown?: { items: readonly PictographData[]; caption: string } | null;
  } = $props();

  type Shown = {
    forId: HandCombination["id"];
    example: CombinationExample;
    /** The count, as the notation draws it. */
    count: StepData;
    /** The start box, as the notation draws it ("Start" in its corner). */
    start: StepData | null;
    /** What the animation plays: hold the start, the count, hold the end. */
    sequence: SequenceData | null;
    /** Bumps on every draw, for the crossfade. */
    draw: number;
  };

  const placement = (
    a: CombinationExample["left"],
    b: typeof a,
    end: boolean
  ) => {
    try {
      return getGridPlacementFromLocations(
        end ? a.to : a.from,
        end ? b.to : b.from
      );
    } catch {
      return null;
    }
  };

  /** A hand holding still where its motion starts or ends. */
  const still = (m: MotionData, at: "start" | "end"): MotionData => {
    const location = at === "start" ? m.startLocation : m.endLocation;
    const orientation = at === "start" ? m.startOrientation : m.endOrientation;
    return {
      ...m,
      motionType: MotionType.STATIC,
      rotationDirection: RotationDirection.NO_ROTATION,
      turns: 0,
      startLocation: location,
      endLocation: location,
      arrowLocation: location,
      startOrientation: orientation,
      endOrientation: orientation,
    };
  };

  function holdStep(count: StepData, at: "start" | "end", n: number): StepData {
    const motions = Object.fromEntries(
      Object.entries(count.motions).map(([side, m]) => [
        side,
        m ? still(m as MotionData, at) : m,
      ])
    ) as StepData["motions"];
    const placementAt =
      at === "start" ? count.startPlacement : count.endPlacement;
    return createStepData({
      ...count,
      id: `${count.id}-hold-${at}`,
      letter: null,
      motions,
      startPlacement: placementAt,
      endPlacement: placementAt,
      stepNumber: n,
    });
  }

  /** The start box and the animation (hold the start, the count, hold the
   *  end) for one count. */
  function playable(
    count: StepData,
    id: string,
    name: string
  ): { start: StepData | null; sequence: SequenceData | null } {
    let begin: StartPlacementData | null = null;
    try {
      begin = startPlacementDeriver.deriveFromFirstStep(count);
    } catch {
      begin = null;
    }
    const start = begin
      ? createStepData({
          ...(begin as unknown as Partial<StepData>),
          id: `${count.id}-start`,
          letter: null,
          stepNumber: 0,
        })
      : null;
    const sequence = begin
      ? createSequenceData({
          id,
          name,
          word: "",
          steps: [
            holdStep(count, "start", 1),
            { ...count, stepNumber: 2 },
            holdStep(count, "end", 3),
          ],
          startPlacement: begin,
          gridMode: GridMode.DIAMOND,
        })
      : null;
    return { start, sequence };
  }

  function shownOf(
    of: HandCombination,
    example: CombinationExample,
    letter: Letter | null,
    draw: number
  ): Shown {
    const { left, right } = example;
    const data = handPairPictographData(
      left,
      right,
      letter,
      `${of.id}-example-${draw}`
    );
    const count = createStepData({
      ...data,
      startPlacement: placement(left, right, false),
      endPlacement: placement(left, right, true),
      stepNumber: 1,
    });
    const { start, sequence } = playable(
      count,
      `${of.id}-example-${draw}`,
      of.id
    );
    return { forId: of.id, example, count, start, sequence, draw };
  }

  // The combination's own example, until "Another example" draws one; a
  // new combination (another screen) starts on its own example again.
  const own = $derived(
    shownOf(combination, combination.demo, combination.demoLetter, 0)
  );
  let drawn = $state<Shown | null>(null);
  const shown = $derived(drawn?.forId === combination.id ? drawn : own);
  let drawing = $state(false);

  async function another(): Promise<void> {
    if (drawing || breakdown) return;
    drawing = true;
    const of = combination;
    const from = shown;
    const example = randomCombinationExample(of, from.example);
    const letter = await handPairLetter(example.left, example.right);
    if (combination.id === of.id)
      drawn = shownOf(of, example, letter, from.draw + 1);
    drawing = false;
  }

  const viewKey = $derived(
    breakdown ? `${combination.id}-breakdown` : `${shown.forId}-${shown.draw}`
  );
  // Which box the animation is on: the start while it holds there, the
  // count while it moves and holds at the end. Kept with its view, so a
  // new example never rings the last one's box.
  let playing = $state<{ key: string; onCount: boolean } | null>(null);
  const onCount = $derived(playing?.key === viewKey && playing.onCount);
  const onStart = $derived(playing?.key === viewKey && !playing.onCount);

  // A page change has the page's own crossfade (the route's): the card then
  // takes its new content at once rather than fading inside the fading page.
  const quiet = $derived.by(() => {
    void viewKey;
    return (
      browser && document.documentElement.classList.contains("route-transition")
    );
  });

  // The breakdown: the book's boxes are start, halfway, end and combined;
  // the animation plays the combined count. The start box wears "Start".
  const broken = $derived.by(() => {
    const [start, half, end, combined] = breakdown?.items ?? [];
    if (!start || !half || !end || !combined) return null;
    const count = createStepData({
      ...(combined as unknown as Partial<StepData>),
      id: `${combined.id}-count`,
      letter: null,
      stepNumber: 1,
    });
    const { sequence } = playable(
      count,
      `${combined.id}-breakdown`,
      "breakdown"
    );
    const cells: (PictographData | StepData)[] = [
      { ...start, stepNumber: 0 } as unknown as StepData,
      half,
      end,
      combined,
    ];
    return { count, sequence, cells };
  });

  // The breakdown's clock, over the count (2 to 3 on the player's step
  // scale): hold the start, move to halfway, hold, move to the end, hold,
  // and again. Reduced motion holds each pose without the moves between.
  type Phase = "start" | "moving" | "half" | "end";
  const BOX_OF: Record<Phase, number> = {
    start: 0,
    half: 1,
    end: 2,
    moving: 3,
  };
  // One beat of the example cards' player (60 BPM): each hold lasts a
  // beat and the count's two halves a beat together, the examples' pace.
  const BEAT = 1000;
  const HOLD = BEAT;
  const MOVE = BEAT / 2;
  let clockStep = $state(2);
  let phase = $state<Phase>("start");
  $effect(() => {
    if (!browser || !broken?.sequence) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const move = still ? 0 : MOVE;
    const legs: { ms: number; from: number; to: number; phase: Phase }[] = [
      { ms: HOLD, from: 2, to: 2, phase: "start" },
      { ms: move, from: 2, to: 2.5, phase: "moving" },
      { ms: HOLD, from: 2.5, to: 2.5, phase: "half" },
      { ms: move, from: 2.5, to: 3, phase: "moving" },
      { ms: HOLD, from: 3, to: 3, phase: "end" },
    ];
    const total = legs.reduce((sum, leg) => sum + leg.ms, 0);
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      let at = (now - began) % total;
      for (const leg of legs) {
        if (at < leg.ms) {
          clockStep = leg.from + (leg.to - leg.from) * (at / leg.ms);
          phase = leg.phase;
          break;
        }
        at -= leg.ms;
      }
      frame = requestAnimationFrame(tick);
    };
    clockStep = 2;
    phase = "start";
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  const tint = $derived(
    inkOn(LETTER_TYPE_COLORS[combination.letterType][0], darkMode)
  );
</script>

{#snippet pictograph(data: PictographData | StepData | null, isStart: boolean)}
  <PictographContainer
    pictographData={data}
    ariaLabel={data ? describePictograph({ ...data, letter: null }) : undefined}
    gridMode={GridMode.DIAMOND}
    leftPropTypeOverride={PropType.HAND}
    rightPropTypeOverride={PropType.HAND}
    showTKA={false}
    showPlacements={!isStart}
    showElemental={false}
    showReversals={false}
    showTnD={false}
    showNonRadialPoints={false}
    stepNumberOverride={true}
    {darkMode}
    printMode={!darkMode}
  />
{/snippet}

<div
  class="demo"
  class:dark={darkMode}
  class:broken={!!(breakdown && broken)}
  style:--tint={tint}
>
  <Crossfade key={viewKey} duration={quiet ? 0 : DURATION.normal}>
    <div class="inside">
      {#if breakdown && broken}
        <figure class="breakdown">
          <div class="square">
            {#if browser && broken.sequence}
              <HandMotionPlayer
                primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
                sequence={broken.sequence}
                ariaLabel={describePictograph({
                  ...broken.count,
                  letter: null,
                })}
                interactive={false}
                externalStep={clockStep}
                externalPlaying={phase === "moving"}
              />
            {/if}
          </div>
          <div class="strip four">
            {#each broken.cells as data, i (data.id)}
              <div class="cell" class:guide-step-active={BOX_OF[phase] === i}>
                {@render pictograph(data, i < 3)}
              </div>
            {/each}
          </div>
          <figcaption>{breakdown.caption}</figcaption>
        </figure>
      {:else}
        <div class="square">
          {#if browser && shown.sequence}
            {@const key = viewKey}
            <HandMotionPlayer
              primaryPropColors={DEFAULT_VIEWER_CUSTOM_COLORS}
              sequence={shown.sequence}
              ariaLabel={describePictograph({ ...shown.count, letter: null })}
              onStepChange={(step) => (playing = { key, onCount: step >= 2 })}
            />
          {/if}
        </div>
        <div class="under strip">
          <div class="cell" class:guide-step-active={onStart}>
            {@render pictograph(shown.start, true)}
          </div>
          <div class="cell" class:guide-step-active={onCount}>
            {@render pictograph(shown.count, false)}
          </div>
        </div>
      {/if}
    </div>
  </Crossfade>
  {#if !breakdown}
    <button type="button" class="another" onclick={another} aria-busy={drawing}>
      <i class="fa-solid fa-dice" aria-hidden="true"></i>
      <span>{t("guide_topic_another_example")}</span>
    </button>
  {/if}
</div>

<style>
  /* The card grows with the window (--fit) like the mode cards and at their
     width, so the run's cards match from page to page, up to about 1100 px
     tall (2026-11-01, Austen's review): past that the card outgrew the
     words beside it on a tall window, so the group stands centred instead. */
  .demo {
    --card-fit: min(var(--fit, 1), 2.4);
    --seam: color-mix(in srgb, var(--tint) 45%, var(--ink, #1a1a1a) 10%);
    display: grid;
    justify-items: center;
    gap: 0.85rem;
    box-sizing: border-box;
    width: min(100%, 68rem, max(17rem, calc(34rem * var(--card-fit))));
    margin: 0 auto;
    padding: clamp(0.75rem, 2cqw, 1.1rem);
    border-radius: 1rem;
    border: 1px solid color-mix(in srgb, var(--tint) 50%, transparent);
    background: color-mix(in srgb, var(--tint) 10%, transparent);
  }
  /* The breakdown, its four boxes across the capped card, reaches the
     same height with a larger square, so the card keeps its size when the
     screen changes. */
  .demo.broken {
    --card-fit: min(var(--fit, 1), 2.7);
  }
  .demo.dark {
    background: color-mix(in srgb, var(--tint) 14%, transparent);
  }
  .demo > :global(.crossfade) {
    justify-self: stretch;
  }
  .inside {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
  }
  /* The example playing, square, at the mode cards' size. */
  .square {
    box-sizing: border-box;
    width: min(100%, calc(17rem * var(--card-fit)));
    aspect-ratio: 1;
  }
  /* The notation (or the breakdown's caption) under it, as wide as it. */
  .under {
    box-sizing: border-box;
    width: min(100%, calc(17rem * var(--card-fit)));
  }
  /* Start and count fused into one block with a hairline seam, the mode
     cards' strip, the ring on the playing box showing on every edge. */
  .strip {
    --round: calc(0.75rem - 1px);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    background: var(--seam);
    border: 1px solid var(--seam);
    border-radius: 0.75rem;
  }
  .strip > .cell:first-child {
    border-radius: var(--round) 0 0 var(--round);
  }
  .strip > .cell:last-child {
    border-radius: 0 var(--round) var(--round) 0;
  }
  /* Until a pictograph draws, its box shows a faint tint in either theme. */
  .cell {
    aspect-ratio: 1;
    overflow: hidden;
    background: color-mix(in srgb, currentColor 5%, transparent);
  }
  .cell :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }
  /* The box playing wears the ring inside its own edge, unscaled: in a
     joined strip a raised box would cover its neighbour's corner label. */
  .strip > .cell {
    position: relative;
  }
  .strip > .cell.guide-step-active {
    z-index: auto;
    transform: none;
    box-shadow: none;
    animation: none;
  }
  .strip > .cell.guide-step-active::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow:
      inset 0 0 0 3px rgba(251, 191, 36, 0.9),
      inset 0 0 12px rgba(251, 191, 36, 0.45);
    pointer-events: none;
  }
  /* Cross-Shift broken down: the animation on top, the book's four boxes
     in one joined row as wide as the card (each about the examples'
     notation box, so the card is as tall as theirs), the book's caption
     small beneath. */
  .breakdown {
    display: grid;
    justify-self: stretch;
    justify-items: center;
    gap: 0.75rem;
    margin: 0;
  }
  .strip.four {
    box-sizing: border-box;
    width: 100%;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .demo figcaption {
    margin: 0;
    color: var(--ink-dim, #555);
    font-size: clamp(0.85rem, 0.75rem + 0.35vh, 1.05rem);
    font-style: italic;
    text-align: center;
    text-wrap: balance;
  }
  /* A phone: the notation stands beside the animation, Start over the
     count, so the card is short enough to sit under the page's words
     above the footer. The breakdown stays stacked: its row of four is
     short already. */
  @container (max-width: 34rem) {
    .inside {
      grid-template-columns: auto auto;
      justify-content: center;
      align-items: start;
      gap: 0.5rem;
    }
    .breakdown {
      gap: 0.5rem;
    }
    /* One line under the narrow card's row of four. */
    .demo figcaption {
      font-size: 0.8rem;
    }
    /* The fit box sizes the pair by height alone; the card's width caps
       them too, two thirds and one third of the row (the card's padding,
       borders and the 0.5rem gap taken out), so a tall phone that grows
       --fit never pushes them past the card's sides (2026-11-03: 54px over
       at 375 wide). */
    .square {
      width: min(
        calc(17rem * var(--card-fit)),
        calc((100cqw - 2.25rem) * 2 / 3)
      );
    }
    .under {
      width: min(
        calc(8.5rem * var(--card-fit)),
        calc((100cqw - 2.25rem) / 3)
      );
    }
    .strip:not(.four) {
      grid-template-columns: minmax(0, 1fr);
    }
    .strip:not(.four) > .cell:first-child {
      border-radius: var(--round) var(--round) 0 0;
    }
    .strip:not(.four) > .cell:last-child {
      border-radius: 0 0 var(--round) var(--round);
    }
  }
  /* The count's position label (alpha to gamma) follows the page, not the
     app: the renderer inverts it whenever the app is dark, which left it
     near-white on the light page. */
  .demo:not(.dark) .cell :global(.placement-glyph) {
    filter: none;
  }
  .demo.dark .cell :global(.placement-glyph) {
    filter: invert(0.9);
  }

  /* The Composer's Generate button (GenerateButtonCard), at pill size: the
     same green gradient, dice and slow pulse, so the control reads the
     same here and in Create. */
  .another {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    min-height: 44px;
    padding: 0.4em 1.2em;
    border: none;
    border-radius: 999px;
    --go: var(--semantic-success, #22c55e);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--go) 85%, #065f46) 0%,
      var(--go) 25%,
      color-mix(in srgb, var(--go) 100%, #a7f3d0) 50%,
      var(--go) 75%,
      color-mix(in srgb, var(--go) 85%, #065f46) 100%
    );
    color: #fff;
    font-family: Inter, system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    cursor: pointer;
    animation: another-pulse 2s ease-in-out infinite;
    transition:
      filter var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }
  .another:hover {
    filter: brightness(1.12) saturate(1.1);
  }
  .another:active {
    transform: scale(0.98);
  }
  .another:focus-visible {
    outline: 2px solid var(--ink, #1a1a1a);
    outline-offset: 2px;
  }
  @keyframes another-pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.015);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .another {
      animation: none;
    }
  }
  /* A short phone: the button takes the phone's 36 px height and the card
     closes up, so the example above it keeps its size. */
  @media (max-width: 520px) and (max-height: 760px), (max-height: 520px) {
    .another {
      min-height: 36px;
      padding-block: 0.25em;
    }
    .demo,
    .inside {
      gap: 0.5rem;
    }
  }
</style>
