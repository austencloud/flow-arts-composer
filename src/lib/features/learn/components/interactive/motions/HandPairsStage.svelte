<!--
  Hand Motions, stage 2: two hands find the six combinations. Each hand has
  its own grid, side by side, blue starting at West and red at East. It is one
  hand's turn at a time: its grid is framed in its colour, while the other
  grid dims and waits. A press picks the point the hand will move to: its
  arrow and a ring mark it, the hand stays put, and the pick holds for the
  round. Blue picks first, then red. Once both have picked, the two grids
  glide together and grow into one larger picture, and each arrow settles
  where the combination's own pictograph draws it. Only then, with the
  picture still, do both hands follow their arrows. The combination is named
  and its board cell fills; a pair with the hands swapped lands on the cell
  it already filled. After a short hold the picture splits back into the two
  grids, and the next round starts where the hands ended. A tap or Enter ends
  the hold early. Reduced motion swaps the grids for the picture with the
  hands already moved.

  Austen, 2026-10-11: two grids that fuse into one picture, like Fuse,
  instead of one grid where a hand's arrow could lie over the other hand.
  Then: a pick stays picked, only the hand whose turn it is is lit, and the
  grids move together and resize. Then: a pick shows only its arrow, and the
  hands move once the grids have fused, never while they fuse.
  Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { handGlides } from "#lib/features/create/shared/components/method-previews/method-preview-glide.js";
  import HandCombinationBoard from "#lib/shared/guide-topics/HandCombinationBoard.svelte";
  import MotionMapArrows from "#lib/shared/guide-topics/MotionMapArrows.svelte";
  import {
    HAND_COMBINATIONS,
    combinationFor,
    handPairLetter,
    handPairPictographData,
    plainTopicText,
    type HandCombination,
    type HandCombinationId,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import PropPlacementGrid from "#lib/shared/pictograph/grid/components/PropPlacementGrid.svelte";
  import {
    GridLocation,
    GridMode,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { getPlacementGridPoints } from "#lib/shared/pictograph/grid/services/placement-grid-points.js";
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
    roundTravel,
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
  const POINTS = getPlacementGridPoints(GridMode.DIAMOND);
  /** Red's arrow shows, so both picks are seen before they play. */
  const LAND_MS = DURATION.dramatic;
  /**
   * How far, in grid widths, an arrow moves when the picture draws it on the
   * other side of the grid; a nudge moves it far less.
   */
  const SIDE_CHANGE = 0.1;
  /** The longest the grids wait for the picture to lay out a new pair. */
  const LAYOUT_WAIT_MS = DURATION.scene;
  /**
   * The grids glide together and grow, and each arrow settles where the
   * combination's picture draws it.
   */
  const FLIGHT_MS = DURATION.scene;
  /** The picture takes over from the two grids laid on each other. */
  const MERGE_MS = DURATION.fast;
  /** The fused picture holds still a moment before the hands move. */
  const STILL_MS = DURATION.dramatic;
  /** Both hands follow their arrows. */
  const MOVE_MS = DURATION.scene;
  /** The picture splits back into the two grids. */
  const SPLIT_MS = DURATION.scene;
  /** The same easing as the hands' travel (cubicInOut). */
  const IN_OUT = "cubic-bezier(0.65, 0, 0.35, 1)";
  const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

  interface Arrow {
    from: GridLocation;
    to: GridLocation | null;
  }

  let duo: HTMLDivElement;
  let halvesBox: HTMLDivElement;
  let fusedFrame: HTMLDivElement;
  const halves: Partial<Record<HandSide, HTMLDivElement>> = {};
  const backdrops: Partial<Record<HandSide, HTMLDivElement>> = {};

  /** Whose pick it is; null while the two hands play together. */
  let turn = $state<HandSide | null>(BLUE);
  let round = $state<PairRound>(startRound(START[BLUE], START[RED]));
  /**
   * Where each grid's hand stands: the round's start, then, once the grids
   * are hidden under the picture, where the hand ends.
   */
  let rest = $state<Spots>({ ...START });
  let arrows = $state<Record<HandSide, Arrow>>({
    [BLUE]: { from: START[BLUE], to: null },
    [RED]: { from: START[RED], to: null },
  });
  /** The grids are gliding together, and stay laid on each other until the split. */
  let flying = $state(false);
  /** The two grids are one picture. */
  let together = $state(false);
  /** Where the picture's hands stand: the round's start until they move. */
  let fusedAt = $state<Spots>({ ...START });
  /** Both hands' moves, played on the picture once it has fused. */
  let fusedMove = $state<PlacementMotionMove | null>(null);
  /** The picture's static hands, which have a halo instead of an arrow. */
  let stillHands = $state<HandSide[]>([]);
  let pairData = $state<PictographData | null>(null);
  /** Asks the picture to report once it has laid out the new pair. */
  let pairEpoch = $state(0);
  let pairLaidOut: (() => void) | null = null;
  /** Counts fusions, so a pair laid out after the stage moved on is dropped. */
  let fusion = 0;
  let shown = $state<{
    combination: HandCombination;
    mirror: boolean;
    key: number;
  } | null>(null);
  let lit = $state<HandCombinationId | null>(null);
  let announcement = $state("");
  let pending: { combination: HandCombination; pair: HandPair } | null = null;
  let holding = false;
  /** The hands have moved and the pair is named; a tap may end the hold. */
  let landed = false;
  let travelEpoch = 0;
  let stillHold: ReturnType<typeof setTimeout> | undefined;
  let flight: Animation[] = [];

  const hold = createBuildSequence();
  const foundIds = $derived(new Set(Object.keys(found) as HandCombinationId[]));
  const strip = HAND_COMBINATIONS.map((combination) => ({
    id: combination.id,
    tones: LETTER_TYPE_COLORS[combination.letterType],
  }));

  function setArrow(hand: HandSide, arrow: Arrow) {
    arrows = { ...arrows, [hand]: arrow };
  }

  /** The point a hand picked this round, unless it stays where it is. */
  function pickedPoint(hand: HandSide): GridLocation | null {
    const to = round.moves[hand]?.to ?? null;
    return to === round.start[hand] ? null : to;
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

  /** From a grid's own place to the picture's: centred on it, at its size. */
  function landingFor(half: HTMLElement): string | null {
    const picture = fusedFrame.getBoundingClientRect();
    const place = half.getBoundingClientRect();
    if (!place.width) return null;
    // A zoomed lesson measures in screen pixels but moves in its own.
    const zoom = place.width / (half.offsetWidth || place.width);
    const dx =
      (picture.left + picture.width / 2 - (place.left + place.width / 2)) /
      zoom;
    const dy =
      (picture.top + picture.height / 2 - (place.top + place.height / 2)) /
      zoom;
    return `translate(${dx}px, ${dy}px) scale(${picture.width / place.width})`;
  }

  /** A grid and the backdrop under it, which travel as one. */
  function gridLayers(hand: HandSide): HTMLElement[] {
    return [halves[hand], backdrops[hand]].filter(
      (layer): layer is HTMLDivElement => layer !== undefined
    );
  }

  /** Both grids glide onto the picture, the hands where they started. */
  function flyTogether() {
    cancelFlight();
    for (const hand of HANDS) {
      for (const layer of gridLayers(hand)) {
        const met = landingFor(layer);
        if (!met) continue;
        flight.push(
          layer.animate([{ transform: "none" }, { transform: met }], {
            duration: FLIGHT_MS,
            easing: IN_OUT,
            fill: "forwards",
          })
        );
      }
    }
  }

  /** Where an element sits in a frame, in frame widths from its centre. */
  function spotIn(element: Element, frame: Element): [number, number] {
    const box = element.getBoundingClientRect();
    const area = frame.getBoundingClientRect();
    return [
      (box.left + box.width / 2 - area.left - area.width / 2) / area.width,
      (box.top + box.height / 2 - area.top - area.height / 2) / area.width,
    ];
  }

  /**
   * An arrow the picture draws across its grid's centre from where it lies
   * alone, as a Cross-Shift's dash moving off the other hand's end point. A
   * glide there would sweep it over both hands.
   */
  function crossesOver(arrow: Element, target: Element, half: Element) {
    const [x0, y0] = spotIn(arrow, half);
    const [x1, y1] = spotIn(target, fusedFrame);
    return Math.hypot(x1 - x0, y1 - y0) > SIDE_CHANGE;
  }

  /**
   * A grid lays its one hand out alone, and the picture lays the pair out by
   * the combination's own placement: an arrow on the other side of its
   * point, a hand nudged off the other hand's on a shared point. Each glides
   * there while the grids fly, so the picture takes over without a jump. An
   * arrow that changes sides fades out and back in on its new side instead.
   */
  function settleIntoPicture() {
    for (const hand of HANDS) {
      const half = halves[hand];
      if (!half) continue;
      const pairs = [
        [
          half.querySelector(".pictograph-layer"),
          fusedFrame.querySelector(".pictograph-layer"),
        ],
        [
          half.querySelector(".motion-map-arrows .layer.shown"),
          fusedFrame.querySelector(".pair-arrows"),
        ],
      ];
      for (const [from, to] of pairs) {
        if (!from || !to) continue;
        const arrow = `.${hand}-arrow-svg`;
        const target = to.querySelector(arrow);
        for (const { element, keyframes } of handGlides(from, to, hand)) {
          if (
            target &&
            element.matches(arrow) &&
            crossesOver(element, target, half)
          ) {
            const [start, end] = keyframes;
            flight.push(
              element.animate(
                [
                  { ...start, opacity: 1, offset: 0, easing: EASE },
                  { ...start, opacity: 0, offset: 0.35 },
                  { ...end, opacity: 0, offset: 0.5, easing: EASE },
                  { ...end, opacity: 1, offset: 0.85 },
                  { ...end, opacity: 1, offset: 1 },
                ],
                { duration: FLIGHT_MS, fill: "forwards" }
              )
            );
            continue;
          }
          flight.push(
            element.animate(keyframes, {
              duration: FLIGHT_MS,
              easing: IN_OUT,
              fill: "forwards",
            })
          );
        }
      }
    }
  }

  /** The picture fades in over the two grids, which now match it. */
  function merge() {
    flight.push(
      fusedFrame.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: MERGE_MS,
        easing: "ease-out",
        fill: "forwards",
      })
    );
  }

  /** The picture splits back into the two grids, which slide to their places. */
  function flyApart() {
    cancelFlight();
    if (reducedMotion()) return;
    for (const hand of HANDS) {
      for (const layer of gridLayers(hand)) {
        const met = landingFor(layer);
        if (!met) continue;
        flight.push(
          layer.animate(
            [
              { transform: met, opacity: 0, offset: 0 },
              { transform: met, opacity: 0, offset: 0.2 },
              { transform: met, opacity: 1, offset: 0.5, easing: EASE },
              { transform: "none", opacity: 1, offset: 1 },
            ],
            SPLIT_MS
          )
        );
      }
    }
    flight.push(
      fusedFrame.animate(
        [
          { opacity: 1, offset: 0 },
          { opacity: 1, offset: 0.15 },
          { opacity: 0, offset: 0.55 },
          { opacity: 0, offset: 1 },
        ],
        SPLIT_MS
      )
    );
  }

  async function focusGrid(hand: HandSide) {
    await tick();
    halves[hand]
      ?.querySelector<HTMLElement>('button, [role="button"][tabindex="0"]')
      ?.focus({ preventScroll: true });
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

  function part() {
    const refocus = document.activeElement === duo;
    together = false;
    if (refocus) void focusGrid(BLUE);
  }

  /** Resolves once the picture has laid out its new pair, or after a wait. */
  function layOutPair(data: PictographData): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(giveUp);
        pairLaidOut = null;
        resolve();
      };
      const giveUp = setTimeout(done, LAYOUT_WAIT_MS);
      pairLaidOut = done;
      pairData = data;
      pairEpoch += 1;
    });
  }

  /**
   * The picture draws the pair by its letter, which only the second pick
   * settles: alone, blue's dash takes its usual side, and the letter can put
   * it on the other, clear of where red's hand ends (a Cross-Shift). The
   * letter and the picture's layout come first, so the glide carries each
   * arrow to where the picture draws it.
   */
  function fuse() {
    const pair = roundPair(round);
    const hands = roundHands(round);
    if (!pair || !hands) return;
    pending = { combination: combinationFor(pair.blue, pair.red), pair };
    holding = true;
    turn = null;
    stillHands = HANDS.filter((hand) => round.moves[hand]?.move === "static");
    const ends: Spots = { [BLUE]: hands.left.to, [RED]: hands.right.to };
    const current = ++fusion;
    const picked = performance.now();
    void handPairLetter(hands.left, hands.right).then(async (letter) => {
      if (current !== fusion) return;
      await layOutPair(handPairPictographData(hands.left, hands.right, letter));
      if (current !== fusion) return;
      playFusion(ends, Math.max(0, LAND_MS - (performance.now() - picked)));
    });
  }

  /**
   * After red's arrow has shown for `landMs`, the grids glide together, the
   * picture takes over, and then both hands follow their arrows.
   */
  function playFusion(ends: Spots, landMs: number) {
    if (reducedMotion()) {
      fusedAt = ends;
      rest = ends;
      join();
      landed = true;
      reveal();
      stillHold = setTimeout(split, BUILD_BEAT_PAUSE_MS * 3);
      return;
    }
    hold.play(
      [
        { pause: landMs },
        {
          act: () => {
            flying = true;
            flyTogether();
            settleIntoPicture();
          },
        },
        { pause: FLIGHT_MS },
        { act: merge },
        { pause: MERGE_MS },
        {
          act: () => {
            join();
            // The grids are hidden now, so their hands can stand where the
            // round ends, ready for the split.
            rest = ends;
          },
        },
        { pause: STILL_MS },
        {
          act: () => {
            // The hands travel from the round's start while the picture's
            // spots move to the end, so they stay there when the travel ends.
            fusedMove = roundTravel(round, ++travelEpoch, MOVE_MS);
            fusedAt = ends;
          },
        },
        { pause: MOVE_MS },
        {
          act: () => {
            landed = true;
            reveal();
          },
        },
        { pause: BUILD_BEAT_PAUSE_MS * 2 },
      ],
      split
    );
  }

  /** Back to two grids; the next round starts where the hands ended. */
  function split() {
    if (!holding) return;
    holding = false;
    landed = false;
    hold.cancel();
    clearTimeout(stillHold);
    reveal();
    rest = { ...fusedAt };
    round = startRound(fusedAt[BLUE], fusedAt[RED]);
    for (const hand of HANDS) setArrow(hand, { from: fusedAt[hand], to: null });
    flying = false;
    turn = BLUE;
    part();
    flyApart();
  }

  /** Once the hands have moved, a tap or Enter ends the hold at once. */
  function takeOver() {
    if (holding && landed) split();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") takeOver();
  }

  /** A hand's pick holds for the round; blue's passes the turn to red. */
  function pick(hand: HandSide, to: GridLocation) {
    if (turn !== hand) return;
    const next = placeHand(round, hand, to);
    if (!next.moves[hand]) return;
    round = next;
    setArrow(hand, { from: round.start[hand], to });
    if (hand === RED) {
      fuse();
      return;
    }
    const refocus = halves[BLUE]?.contains(document.activeElement) ?? false;
    turn = RED;
    if (refocus) void focusGrid(RED);
  }

  onMount(() => {
    duo.addEventListener("pointerdown", takeOver, { capture: true });
    duo.addEventListener("keydown", handleKeydown, { capture: true });
    return () => {
      duo.removeEventListener("pointerdown", takeOver, { capture: true });
      duo.removeEventListener("keydown", handleKeydown, { capture: true });
      fusion += 1;
      hold.cancel();
      clearTimeout(stillHold);
      cancelFlight();
    };
  });
</script>

<div class="pairs-stage">
  <div class="pairs-layout">
    <div class="duo" class:together class:flying bind:this={duo} tabindex="-1">
      <!-- The grids draw no backdrop of their own: these lie under both, so
           while the grids glide onto each other each shows the other's hand. -->
      <div class="backdrops" aria-hidden="true">
        {#each HANDS as hand (hand)}
          <div
            class="backdrop"
            class:waiting={turn !== null && turn !== hand}
            bind:this={backdrops[hand]}
          ></div>
        {/each}
      </div>
      <div class="halves" inert={together} bind:this={halvesBox}>
        {#each HANDS as hand (hand)}
          {@const red = hand === RED}
          {@const picked = pickedPoint(hand)}
          <div
            class="half"
            class:red
            class:turn={turn === hand}
            class:waiting={turn !== null && turn !== hand}
            bind:this={halves[hand]}
          >
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
              initialLeftLocation={red ? null : rest[BLUE]}
              initialRightLocation={red ? rest[RED] : null}
              disabled={turn !== hand}
              editAfterCompletion={true}
              tapToMove={true}
              onPick={pick}
              transparentBackground={true}
              animateContent={true}
            >
              {#snippet figureLayer()}
                <MotionMapArrows
                  from={arrows[hand].from}
                  to={arrows[hand].to}
                  {hand}
                />
                <svg class="picked" viewBox="0 0 950 950" aria-hidden="true">
                  {#each POINTS as point (point.location)}
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="75"
                      class:shown={point.location === picked && !flying}
                    />
                  {/each}
                </svg>
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
          editAfterCompletion={false}
          dragLocations={false}
          motionMove={fusedMove}
          animateContent={true}
        >
          {#snippet figureLayer()}
            {#if pairData}
              <div class="pair-arrows">
                <PictographContainer
                  pictographData={pairData}
                  readyEpoch={pairEpoch}
                  onReady={() => pairLaidOut?.()}
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
            {#each stillHands as hand (hand)}
              <MotionMapArrows from={fusedAt[hand]} to={fusedAt[hand]} {hand} />
            {/each}
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
    --tall: max(17rem, calc(100 * var(--lesson-vh, 1svh) - 30rem));
    --half: min(
      calc((var(--room) - var(--half-gap)) / 2),
      calc(var(--tall) / 1.4),
      40rem
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

  .halves,
  .backdrops {
    grid-area: 1 / 1;
    display: grid;
    grid-template-columns: repeat(2, var(--half));
    gap: var(--half-gap);
  }

  .backdrop {
    width: var(--half);
    aspect-ratio: 1;
    border-radius: 12px;
    background: var(--dm-pictograph-bg, #0a0a0f);
    transform-origin: center;
    transition: opacity var(--transition-normal);
  }

  .half {
    --hand: var(--dm-motion-blue, var(--prop-blue, #3b82f6));
    position: relative;
    width: var(--half);
    aspect-ratio: 1;
    transform-origin: center;
    transition: opacity var(--transition-normal);
  }

  .half.red {
    --hand: var(--dm-motion-red, var(--prop-red, #ef4444));
  }

  /* Whose turn it is: a frame and a glow in the hand's colour. */
  .half::after {
    content: "";
    position: absolute;
    inset: -0.35rem;
    border: 2px solid var(--hand);
    border-radius: 1rem;
    box-shadow: 0 0 1.25rem color-mix(in srgb, var(--hand) 45%, transparent);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-normal);
  }

  .half.turn::after {
    opacity: 1;
  }

  .half.waiting,
  .backdrop.waiting {
    opacity: 0.45;
  }

  /* The halves dim themselves; the grid's own disabled fade would stack. */
  .half :global(.placement-grid.disabled) {
    opacity: 1;
  }

  .picked {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .picked circle {
    fill: color-mix(in srgb, var(--hand) 22%, transparent);
    stroke: var(--hand);
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
    opacity: 0;
    transition: opacity var(--transition-normal);
  }

  .picked circle.shown {
    opacity: 1;
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

  .together .halves,
  .together .backdrops {
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
      --tall: max(
        20rem,
        min(
          calc(100 * var(--lesson-vh, 1svh) - 25rem),
          calc(74 * var(--lesson-vh, 1svh))
        )
      );
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

  /* A phone on its side has the width for the board but not the height: it
     keeps the strip, as a phone held upright does, so the grids stay in
     view. */
  @media (max-height: 35rem) {
    @container hand-pairs (min-width: 52rem) {
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
      }
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
