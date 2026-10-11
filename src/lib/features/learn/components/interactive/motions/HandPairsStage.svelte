<!--
  Hand Motions, stage 2: two hands find the six combinations. Each hand has
  its own grid, side by side, blue starting at West and red at East. Blue
  moves first; red's grid waits until it has. Each arrow is drawn on its own
  hand's grid, so no arrow lies over the other hand. Once both have moved,
  the two grids slide together into one larger picture: both arrows, laid out
  as the pair's own pictograph, and both hands travelling them from the
  round's start. The combination is named and its board cell fills; a pair
  with the hands swapped lands on the cell it already filled. After a short
  hold the picture splits back into the two grids, and the next round starts
  where the hands ended. A tap or Enter ends the hold early. Reduced motion
  swaps the grids for the picture without the slide or the travel.

  Austen, 2026-10-11: two grids that fuse into one picture, like Fuse,
  instead of one grid where a hand's arrow could lie over the other hand.
  Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import HandCombinationBoard from "#lib/shared/guide-topics/HandCombinationBoard.svelte";
  import MotionMapArrows from "#lib/shared/guide-topics/MotionMapArrows.svelte";
  import {
    HAND_COMBINATIONS,
    combinationFor,
    handPairPictographData,
    plainTopicText,
    type HandCombination,
    type HandCombinationId,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import PropPlacementGrid from "#lib/shared/pictograph/grid/components/PropPlacementGrid.svelte";
  import type { PropPlacementChange } from "#lib/shared/pictograph/grid/domain/prop-placement.js";
  import {
    GridLocation,
    GridMode,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PlacementMotionMove } from "#lib/shared/pictograph/grid/state/prop-placement-motion.svelte.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { LETTER_TYPE_COLORS } from "#lib/shared/pictograph/shared/domain/constants/pictograph-constants.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import {
    BUILD_BEAT_PAUSE_MS,
    createBuildSequence,
  } from "#lib/shared/transitions/build-sequence.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    isMirrorPair,
    placeHand,
    roundHands,
    roundPair,
    roundReplay,
    startRound,
    type HandPair,
    type PairRound,
  } from "./hand-pairs-round";

  interface Props {
    /** Each combination found so far, with the pair that first made it. */
    found: Partial<Record<HandCombinationId, HandPair>>;
    onFind?: (id: HandCombinationId, pair: HandPair) => void;
  }

  let { found, onFind }: Props = $props();

  type Spots = Record<HandSide, GridLocation>;
  const BLUE = HandSide.LEFT;
  const RED = HandSide.RIGHT;
  const HANDS = [BLUE, RED] as const;
  const START: Spots = {
    [BLUE]: GridLocation.WEST,
    [RED]: GridLocation.EAST,
  };
  /** The two grids sliding together into one picture, or apart again. */
  const SLIDE_MS = DURATION.scene;
  const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

  interface Arrow {
    from: GridLocation;
    to: GridLocation | null;
  }

  let duo: HTMLDivElement;
  let halvesBox: HTMLDivElement;
  let fusedFrame: HTMLDivElement;
  const halves: Partial<Record<HandSide, HTMLDivElement>> = {};

  /** Where each hand stands now; the next round starts there. */
  const handsAt: Spots = { ...START };
  let round = $state<PairRound>(startRound(START[BLUE], START[RED]));
  let arrows = $state<Record<HandSide, Arrow>>({
    [BLUE]: { from: START[BLUE], to: null },
    [RED]: { from: START[RED], to: null },
  });
  /** The two grids are one picture. */
  let together = $state(false);
  /** Where the picture's hands stand: the round's start, then its end. */
  let fusedAt = $state<Spots>({ ...START });
  let fusedMove = $state<PlacementMotionMove | null>(null);
  let pairData = $state<PictographData | null>(null);
  let shown = $state<{
    combination: HandCombination;
    mirror: boolean;
    key: number;
  } | null>(null);
  let lit = $state<HandCombinationId | null>(null);
  let announcement = $state("");
  let pending: { combination: HandCombination; pair: HandPair } | null = null;
  let holding = false;
  let replayEpoch = 0;
  let stillHold: ReturnType<typeof setTimeout> | undefined;
  let flight: Animation[] = [];

  const hold = createBuildSequence();
  const blueMoved = $derived(round.moves[BLUE] !== undefined);
  const foundIds = $derived(new Set(Object.keys(found) as HandCombinationId[]));
  const strip = HAND_COMBINATIONS.map((combination) => ({
    id: combination.id,
    tones: LETTER_TYPE_COLORS[combination.letterType],
  }));

  function setArrow(hand: HandSide, arrow: Arrow) {
    arrows = { ...arrows, [hand]: arrow };
  }

  function roundArrow(hand: HandSide): Arrow {
    return { from: round.start[hand], to: round.moves[hand]?.to ?? null };
  }

  function reveal() {
    if (!pending) return;
    const { combination, pair } = pending;
    pending = null;
    const first = found[combination.id];
    const mirror = !!first && isMirrorPair(first, pair);
    shown = { combination, mirror, key: (shown?.key ?? 0) + 1 };
    lit = combination.id;
    if (!first) onFind?.(combination.id, pair);
    const named = t("learn_motion_path_aria", {
      name: plainTopicText(combination.name),
      caption: plainTopicText(combination.description),
    });
    announcement = mirror
      ? `${named} ${t("learn_motion_pairs_mirror")}`
      : named;
  }

  function cancelFlight() {
    for (const animation of flight) animation.cancel();
    flight = [];
  }

  /**
   * Slides each grid between its own place and the picture's, growing to the
   * picture's size, while the picture dissolves in (or out). Only the slide
   * eases; the fades are even. Under reduced motion the swap is instant.
   */
  function fly(joining: boolean) {
    cancelFlight();
    if (reducedMotion()) return;
    const picture = fusedFrame.getBoundingClientRect();
    for (const hand of HANDS) {
      const half = halves[hand];
      const place = half?.getBoundingClientRect();
      if (!half || !place?.width) continue;
      const dx =
        picture.left + picture.width / 2 - (place.left + place.width / 2);
      const dy =
        picture.top + picture.height / 2 - (place.top + place.height / 2);
      const met = `translate(${dx}px, ${dy}px) scale(${picture.width / place.width})`;
      const keyframes: Keyframe[] = joining
        ? [
            { transform: "none", opacity: 1, offset: 0, easing: EASE },
            { transform: met, opacity: 1, offset: 0.5 },
            { transform: met, opacity: 0, offset: 0.8 },
            { transform: met, opacity: 0, offset: 1 },
          ]
        : [
            { transform: met, opacity: 0, offset: 0 },
            { transform: met, opacity: 0, offset: 0.2 },
            { transform: met, opacity: 1, offset: 0.5, easing: EASE },
            { transform: "none", opacity: 1, offset: 1 },
          ];
      flight.push(half.animate(keyframes, SLIDE_MS));
    }
    const dissolve: Keyframe[] = joining
      ? [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: 0.45 },
          { opacity: 1, offset: 0.85 },
          { opacity: 1, offset: 1 },
        ]
      : [
          { opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.15 },
          { opacity: 0, offset: 0.55 },
          { opacity: 0, offset: 1 },
        ];
    flight.push(fusedFrame.animate(dissolve, SLIDE_MS));
  }

  /**
   * The grids go inert while they are one picture, so a keyboard user's focus
   * waits on the picture and comes back to blue's grid after the split.
   */
  function join() {
    if (halvesBox.contains(document.activeElement))
      duo.focus({ preventScroll: true });
    together = true;
  }

  async function part() {
    const refocus = document.activeElement === duo;
    together = false;
    if (!refocus) return;
    await tick();
    halves[BLUE]?.querySelector<HTMLElement>(
      'button, [role="button"][tabindex="0"]'
    )?.focus({ preventScroll: true });
  }

  /** The picture's hands where this round's moves end. */
  function settle() {
    const hands = roundHands(round);
    if (hands) fusedAt = { [BLUE]: hands.left.to, [RED]: hands.right.to };
  }

  function fuse() {
    const pair = roundPair(round);
    const hands = roundHands(round);
    if (!pair || !hands) return;
    pending = { combination: combinationFor(pair.blue, pair.red), pair };
    holding = true;
    pairData = handPairPictographData(hands.left, hands.right);
    fusedAt = { [BLUE]: hands.left.from, [RED]: hands.right.from };
    const travel = roundReplay(round, ++replayEpoch, DURATION.scene);
    if (reducedMotion()) {
      join();
      settle();
      reveal();
      stillHold = setTimeout(split, BUILD_BEAT_PAUSE_MS * 3);
      return;
    }
    hold.play(
      [
        // Let the dropped hand land first.
        { pause: DURATION.normal },
        {
          act: () => {
            join();
            fly(true);
          },
        },
        { pause: SLIDE_MS + DURATION.normal },
        {
          act: () => {
            settle();
            fusedMove = travel;
          },
        },
        { pause: travel ? DURATION.scene : 0 },
        { act: reveal },
        { pause: BUILD_BEAT_PAUSE_MS * 2 },
      ],
      split
    );
  }

  /** Back to two grids; the next round starts where the hands ended. */
  function split() {
    if (!holding) return;
    holding = false;
    hold.cancel();
    clearTimeout(stillHold);
    reveal();
    settle();
    round = startRound(handsAt[BLUE], handsAt[RED]);
    for (const hand of HANDS) setArrow(hand, { from: handsAt[hand], to: null });
    void part();
    fly(false);
  }

  /** A tap or Enter on the picture ends the hold at once. */
  function takeOver() {
    if (holding && together) split();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") takeOver();
  }

  /** A drag aims a hand at a point: draw the move it would make this round. */
  function aimed(hand: HandSide, target: GridLocation | null) {
    setArrow(
      hand,
      target === null
        ? roundArrow(hand)
        : { from: round.start[hand], to: target }
    );
  }

  function changed(hand: HandSide, change: PropPlacementChange) {
    const to = hand === BLUE ? change.leftLocation : change.rightLocation;
    // Picked up (tap or Enter) but not yet put down.
    if (change.placedHand !== hand || !to) return;
    handsAt[hand] = to;
    round = placeHand(round, hand, to);
    setArrow(hand, roundArrow(hand));
    if (roundPair(round)) fuse();
  }

  onMount(() => {
    duo.addEventListener("pointerdown", takeOver, { capture: true });
    duo.addEventListener("keydown", handleKeydown, { capture: true });
    return () => {
      duo.removeEventListener("pointerdown", takeOver, { capture: true });
      duo.removeEventListener("keydown", handleKeydown, { capture: true });
      hold.cancel();
      clearTimeout(stillHold);
      cancelFlight();
    };
  });
</script>

<div class="pairs-stage">
  <div class="pairs-layout">
    <div class="duo" class:together bind:this={duo} tabindex="-1">
      <div class="halves" inert={together} bind:this={halvesBox}>
        {#each HANDS as hand (hand)}
          {@const red = hand === RED}
          <div class="half" bind:this={halves[hand]}>
            <PropPlacementGrid
              gridMode={GridMode.DIAMOND}
              hands={red ? "right" : "left"}
              leftPropType={PropType.HAND}
              rightPropType={PropType.HAND}
              leftNoun="blue hand"
              rightNoun="red hand"
              promptText=""
              renderTray={false}
              showUndo={false}
              initialLeftLocation={red ? null : START[BLUE]}
              initialRightLocation={red ? START[RED] : null}
              disabled={red && !blueMoved}
              editAfterCompletion={true}
              dragLocations={true}
              animateContent={true}
              onDragTarget={(target) => aimed(hand, target)}
              onChange={(change) => changed(hand, change)}
            >
              {#snippet figureLayer()}
                <MotionMapArrows
                  from={arrows[hand].from}
                  to={arrows[hand].to}
                  {hand}
                />
              {/snippet}
            </PropPlacementGrid>
          </div>
        {/each}
      </div>

      <div class="fused" bind:this={fusedFrame} inert>
        <PropPlacementGrid
          gridMode={GridMode.DIAMOND}
          leftPropType={PropType.HAND}
          rightPropType={PropType.HAND}
          leftNoun="blue hand"
          rightNoun="red hand"
          promptText=""
          renderTray={false}
          showUndo={false}
          initialLeftLocation={fusedAt[BLUE]}
          initialRightLocation={fusedAt[RED]}
          motionMove={fusedMove}
          editAfterCompletion={false}
          dragLocations={false}
          animateContent={true}
        >
          {#snippet figureLayer()}
            {#if pairData}
              <div class="pair-arrows">
                <PictographContainer
                  pictographData={pairData}
                  gridMode={GridMode.DIAMOND}
                  leftPropTypeOverride={PropType.HAND}
                  rightPropTypeOverride={PropType.HAND}
                  showGrid={false}
                  showProps={false}
                  transparentBackground={true}
                  showTKA={false}
                  showReversals={false}
                  showTnD={false}
                  showElemental={false}
                  showPlacements={false}
                  showNonRadialPoints={false}
                  showHandPoints={false}
                  stepNumberOverride={false}
                />
              </div>
            {/if}
          {/snippet}
        </PropPlacementGrid>
      </div>
    </div>

    <div class="results">
      <div class="readout" aria-hidden="true">
        {#if shown}
          {@const tones = LETTER_TYPE_COLORS[shown.combination.letterType]}
          <Crossfade key={shown.key}>
            <div
              class="readout-copy"
              class:mirrored={shown.mirror}
              style:--tone-a={tones[0]}
              style:--tone-b={tones[1]}
            >
              <span class="readout-name"
                >{plainTopicText(shown.combination.name)}</span
              >
              <span class="bar"></span>
              <span class="readout-description"
                >{plainTopicText(shown.combination.description)}</span
              >
              {#if shown.mirror}
                <span class="mirror">{t("learn_motion_pairs_mirror")}</span>
              {/if}
            </div>
          </Crossfade>
        {/if}
      </div>
      <div class="board-slot">
        <HandCombinationBoard found={foundIds} {lit} namesOnlyWhenNarrow />
      </div>
      <!-- Stacked on a phone, the board would fall under the lesson controls;
           a row of six bars in the combinations' colors stands in for it. -->
      <ul class="found-strip" aria-hidden="true">
        {#each strip as { id, tones } (id)}
          <li
            class:found={foundIds.has(id)}
            class:lit={lit === id}
            style:--tone-a={tones[0]}
            style:--tone-b={tones[1]}
          ></li>
        {/each}
      </ul>
    </div>
  </div>
  <span class="sr-only" aria-live="polite">{announcement}</span>
</div>

<style>
  .pairs-stage {
    container: hand-pairs / inline-size;
    width: 100%;
  }

  /* Two grids side by side, and the larger picture they fuse into: 1.4 times
     a grid. Stacked, the result line and the bars sit under the grids and the
     lesson controls are taller, so the picture gives up more of the window's
     height. */
  .pairs-layout {
    --pairs-gap: clamp(1rem, 2.5vw, 2.5rem);
    --half-gap: clamp(0.75rem, 2cqi, 1.5rem);
    --room: 100cqi;
    --tall: max(17rem, calc(100svh - 30rem));
    --half: min(
      calc((var(--room) - var(--half-gap)) / 2),
      calc(var(--tall) / 1.4),
      30rem
    );
    --fused: min(calc(var(--half) * 1.4), var(--room));
    display: grid;
    justify-items: center;
    align-items: center;
    gap: var(--pairs-gap);
    width: 100%;
  }

  .duo {
    position: relative;
    display: grid;
    place-items: center;
    width: calc(2 * var(--half) + var(--half-gap));
    height: var(--fused);
    outline: none;
  }

  .halves {
    display: grid;
    grid-template-columns: repeat(2, var(--half));
    gap: var(--half-gap);
  }

  .half {
    width: var(--half);
    aspect-ratio: 1;
    transform-origin: center;
  }

  .fused {
    position: absolute;
    top: 50%;
    left: 50%;
    width: var(--fused);
    aspect-ratio: 1;
    translate: -50% -50%;
    opacity: 0;
    pointer-events: none;
  }

  .together .halves {
    opacity: 0;
  }

  .together .fused {
    opacity: 1;
  }

  .pair-arrows {
    position: absolute;
    inset: 0;
  }

  .results {
    display: grid;
    gap: 0.6rem;
    align-content: center;
    width: 100%;
    min-width: 0;
  }

  .readout {
    min-height: 4.4rem;
  }

  .readout-copy {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      "name bar"
      "description description"
      "mirror mirror";
    align-items: center;
    justify-items: start;
    gap: 0.25rem 0.6rem;
  }

  /* No room for both lines stacked: a mirrored pair's note replaces the
     description it already showed. */
  .readout-copy.mirrored .readout-description {
    display: none;
  }

  .board-slot {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .found-strip {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .found-strip li {
    height: 0.4rem;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--tone-a) 0 50%,
      var(--tone-b) 50% 100%
    );
    opacity: 0.2;
    transition:
      opacity var(--transition-normal),
      box-shadow var(--transition-normal);
  }

  .found-strip li.found {
    opacity: 1;
  }

  .found-strip li.lit {
    box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--tone-a) 35%, transparent);
  }

  @container hand-pairs (min-width: 52rem) {
    .pairs-layout {
      /* The grids take their full size first; the results get what is left. */
      --room: calc(100cqi - 18rem - var(--pairs-gap));
      --tall: max(17rem, calc(100svh - 21rem));
      grid-template-columns: auto minmax(18rem, 30rem);
      justify-content: center;
    }

    .results {
      gap: 1rem;
    }

    .readout {
      min-height: 5.75rem;
    }

    .readout-copy {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "name"
        "bar"
        "description"
        "mirror";
      gap: 0.35rem;
    }

    .readout-copy.mirrored .readout-description {
      display: block;
    }

    .board-slot {
      position: static;
      width: auto;
      height: auto;
      overflow: visible;
      clip: auto;
      white-space: normal;
    }

    .found-strip {
      display: none;
    }
  }

  .readout-name {
    grid-area: name;
    color: var(--theme-text);
    font-size: clamp(1.25rem, 1.8vw, 1.6rem);
    font-weight: 800;
    line-height: 1.1;
  }

  .bar {
    grid-area: bar;
    width: 3.5rem;
    height: 0.3rem;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--tone-a) 0 50%,
      var(--tone-b) 50% 100%
    );
  }

  .readout-description {
    grid-area: description;
    color: var(--theme-text-dim);
    line-height: 1.4;
    text-wrap: pretty;
  }

  .mirror {
    grid-area: mirror;
    color: var(--theme-text);
    font-weight: 600;
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
