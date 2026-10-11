<!--
  Hand Motions, stage 2: two hands find the six combinations. Blue starts at
  West and red at East. Each hand lands where it is dropped, and its one
  arrow stays drawn from where the round began (dropping a hand back there
  makes it static). Once both hands have moved, both moves replay together
  from the round's start, the combination is named and its board cell fills.
  A pair with the hands swapped lands on the cell it already filled. After a
  short hold the arrows fade and the next round starts where the hands are;
  grabbing a hand ends the hold early. Reduced motion names the result
  without the replay.

  The spec put a ghost hand at each target; the grid commits a hand where it
  is dropped, as stage 1 does, so the hands land instead (plan, "Deviation").
  Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import HandCombinationBoard from "#lib/shared/guide-topics/HandCombinationBoard.svelte";
  import MotionMapArrows from "#lib/shared/guide-topics/MotionMapArrows.svelte";
  import {
    combinationFor,
    handMoveDirection,
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
  import { LETTER_TYPE_COLORS } from "#lib/shared/pictograph/shared/domain/constants/pictograph-constants.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    BUILD_BEAT_PAUSE_MS,
    createBuildSequence,
    type BuildBeat,
  } from "#lib/shared/transitions/build-sequence.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    isMirrorPair,
    placeHand,
    roundPair,
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

  const HANDS = [HandSide.LEFT, HandSide.RIGHT] as const;
  const START_LEFT = GridLocation.WEST;
  const START_RIGHT = GridLocation.EAST;

  interface Arrow {
    from: GridLocation;
    to: GridLocation | null;
  }

  let host: HTMLDivElement;
  let handsAt: Record<HandSide, GridLocation> = {
    [HandSide.LEFT]: START_LEFT,
    [HandSide.RIGHT]: START_RIGHT,
  };
  let round: PairRound = startRound(START_LEFT, START_RIGHT);
  let arrows = $state<Record<HandSide, Arrow>>({
    [HandSide.LEFT]: { from: START_LEFT, to: null },
    [HandSide.RIGHT]: { from: START_RIGHT, to: null },
  });
  let aimingHand: HandSide | null = null;
  let motionMove = $state<PlacementMotionMove | null>(null);
  let shown = $state<{
    combination: HandCombination;
    mirror: boolean;
    key: number;
  } | null>(null);
  let lit = $state<HandCombinationId | null>(null);
  let announcement = $state("");
  let pending: { combination: HandCombination; pair: HandPair } | null = null;
  let holding = false;

  const hold = createBuildSequence();
  const foundIds = $derived(new Set(Object.keys(found) as HandCombinationId[]));

  function setArrow(hand: HandSide, arrow: Arrow) {
    arrows = { ...arrows, [hand]: arrow };
  }

  /** A fresh round still shows the last round's arrows; the first aim clears them. */
  function clearStaleArrows(except: HandSide) {
    for (const hand of HANDS) {
      if (hand === except || round.moves[hand]) continue;
      if (arrows[hand].to !== null)
        setArrow(hand, { ...arrows[hand], to: null });
    }
  }

  function clearArrows() {
    for (const hand of HANDS) setArrow(hand, { ...arrows[hand], to: null });
  }

  /** Both hands' moves from the round's start, the moving ones travelling. */
  function replayMove(): PlacementMotionMove | null {
    const travels = HANDS.flatMap((hand) => {
      const made = round.moves[hand];
      if (!made || made.move === "static") return [];
      const from = round.start[hand];
      return [
        {
          hand,
          from,
          to: made.to,
          direction: handMoveDirection(from, made.to),
          path: made.move === "dash" ? ("dash" as const) : ("arc" as const),
        },
      ];
    });
    const [first, second] = travels;
    if (!first) return null;
    return {
      epoch: (motionMove?.epoch ?? 0) + 1,
      color: first.hand,
      from: first.from,
      to: first.to,
      direction: first.direction,
      path: first.path,
      durationMs: DURATION.scene,
      partner: second
        ? {
            from: second.from,
            to: second.to,
            direction: second.direction,
            path: second.path,
          }
        : undefined,
    };
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

  /** The next round starts where the hands are. */
  function endHold() {
    reveal();
    round = startRound(handsAt[HandSide.LEFT], handsAt[HandSide.RIGHT]);
    holding = false;
  }

  function resolve(pair: HandPair) {
    pending = { combination: combinationFor(pair.blue, pair.red), pair };
    holding = true;
    const travel = replayMove();
    const beats: BuildBeat[] = [
      // Let the dropped hand land before both replay from the start.
      { pause: DURATION.normal },
      ...(travel
        ? [{ act: () => (motionMove = travel) }, { pause: DURATION.scene }]
        : []),
      { act: reveal },
      { pause: BUILD_BEAT_PAUSE_MS * 2 },
      { act: clearArrows },
    ];
    hold.play(beats, endHold);
  }

  /** Grabbing a hand during the hold ends it at once. */
  function takeOver() {
    if (!holding) return;
    hold.cancel();
    clearArrows();
    endHold();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") takeOver();
  }

  /** A drag aims a hand at a point: draw the move it would make this round. */
  function aimed(target: GridLocation | null, hand: HandSide | null) {
    if (target === null || hand === null) {
      if (aimingHand === null) return;
      const was = aimingHand;
      aimingHand = null;
      setArrow(was, {
        from: round.start[was],
        to: round.moves[was]?.to ?? null,
      });
      return;
    }
    takeOver();
    aimingHand = hand;
    clearStaleArrows(hand);
    setArrow(hand, { from: round.start[hand], to: target });
  }

  function changed(change: PropPlacementChange) {
    takeOver();
    if (change.leftLocation) handsAt[HandSide.LEFT] = change.leftLocation;
    if (change.rightLocation) handsAt[HandSide.RIGHT] = change.rightLocation;
    const hand = change.placedHand;
    if (!hand) return;
    aimingHand = null;
    const to = handsAt[hand];
    round = placeHand(round, hand, to);
    clearStaleArrows(hand);
    setArrow(hand, {
      from: round.start[hand],
      to: round.moves[hand]?.to ?? null,
    });
    const pair = roundPair(round);
    if (pair) resolve(pair);
  }

  onMount(() => {
    // Capture, so the hold ends before the grid starts a drag.
    host.addEventListener("pointerdown", takeOver, { capture: true });
    host.addEventListener("keydown", handleKeydown, { capture: true });
    return () => {
      host.removeEventListener("pointerdown", takeOver, { capture: true });
      host.removeEventListener("keydown", handleKeydown, { capture: true });
      hold.cancel();
    };
  });
</script>

<div class="pairs-stage">
  <div class="pairs-layout">
    <div class="figure" bind:this={host}>
      <PropPlacementGrid
        gridMode={GridMode.DIAMOND}
        leftPropType={PropType.HAND}
        rightPropType={PropType.HAND}
        leftNoun="blue hand"
        rightNoun="red hand"
        promptText=""
        renderTray={false}
        showUndo={false}
        initialLeftLocation={START_LEFT}
        initialRightLocation={START_RIGHT}
        {motionMove}
        editAfterCompletion={true}
        dragLocations={true}
        animateContent={true}
        onDragTarget={aimed}
        onChange={changed}
      >
        {#snippet figureLayer()}
          {#each HANDS as hand (hand)}
            <MotionMapArrows
              from={arrows[hand].from}
              to={arrows[hand].to}
              {hand}
            />
          {/each}
        {/snippet}
      </PropPlacementGrid>
    </div>

    <div class="results">
      <div class="readout" aria-hidden="true">
        {#if shown}
          {@const tones = LETTER_TYPE_COLORS[shown.combination.letterType]}
          <Crossfade key={shown.key}>
            <div
              class="readout-copy"
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
      <HandCombinationBoard found={foundIds} {lit} namesOnlyWhenNarrow />
    </div>
  </div>
  <span class="sr-only" aria-live="polite">{announcement}</span>
</div>

<style>
  .pairs-stage {
    container: hand-pairs / inline-size;
    width: 100%;
  }

  .pairs-layout {
    --pairs-grid: min(max(17rem, calc(100svh - 21rem)), 44rem);
    display: grid;
    justify-items: center;
    align-items: center;
    gap: clamp(1rem, 2.5vw, 2.5rem);
    width: 100%;
  }

  .figure {
    width: min(100%, var(--pairs-grid));
    aspect-ratio: 1;
  }

  .results {
    display: grid;
    gap: 1rem;
    align-content: center;
    width: min(100%, 30rem);
    min-width: 0;
  }

  @container hand-pairs (min-width: 50rem) {
    .pairs-layout {
      grid-template-columns: minmax(0, var(--pairs-grid)) minmax(18rem, 30rem);
      justify-content: center;
    }

    .figure {
      width: 100%;
    }
  }

  .readout {
    min-height: 5.75rem;
  }

  .readout-copy {
    display: grid;
    justify-items: start;
    gap: 0.35rem;
  }

  .readout-name {
    color: var(--theme-text);
    font-size: clamp(1.25rem, 1.8vw, 1.6rem);
    font-weight: 800;
    line-height: 1.1;
  }

  .bar {
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
    color: var(--theme-text-dim);
    line-height: 1.4;
    text-wrap: pretty;
  }

  .mirror {
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
