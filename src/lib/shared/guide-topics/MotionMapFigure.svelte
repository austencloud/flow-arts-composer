<!--
  The motion map: one diamond grid and the blue hand, showing one move at a
  time (Austen, 2026-10-11: all three moves drawn at once was too many
  arrows). It builds itself once it is drawn and on screen: the grid, then the
  hand, then each move in turn, its arrow first and then the hand along it
  (shift, dash, static). Reduced motion shows the hand at rest.

  With `interactive`, the hand can be grabbed at any time; that ends the
  demonstration. A tap on a point draws the arrow on from the hand to that
  point, the hand follows along it, and the two stay as the finished picture
  until the next move (Austen, 2026-10-12: the arrow showed for under a
  second, so the finished picture never held). While the hand is dragged,
  one arrow runs from its point to the point it would land on; a drop keeps
  it. Dragging and the keyboard both come from PropPlacementGrid; the
  keyboard shows the arrow once the hand is put down. `demo` false skips the
  demonstration, for a lesson that has already shown the three moves.
  Spec: docs/superpowers/specs/2026-10-10-hand-motions-rebuild-design.md
-->
<script lang="ts">
  import { onMount } from "svelte";
  import PropPlacementGrid from "#lib/shared/pictograph/grid/components/PropPlacementGrid.svelte";
  import type { PropPlacementChange } from "#lib/shared/pictograph/grid/domain/prop-placement.js";
  import {
    GridMode,
    type GridLocation,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PlacementMotionMove } from "#lib/shared/pictograph/grid/state/prop-placement-motion.svelte.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    BUILD_BEAT_PAUSE_MS,
    createBuildSequence,
    whenOnScreen,
    type BuildBeat,
  } from "#lib/shared/transitions/build-sequence.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    MOTION_MAP_HOME,
    classifyHandMove,
    handMoveDirection,
    motionMapTargets,
    type HandMove,
    type MotionMapTarget,
  } from "./hand-motions-topic.js";
  import MotionMapArrows from "./MotionMapArrows.svelte";

  interface Props {
    /** Lets the learner drag the hand (or pick it up with Enter) to make a move. */
    interactive?: boolean;
    /** The move being shown right now; the host can light its caption from it. */
    lit?: HandMove | null;
    /** A move was shown, by the demonstration or by the learner. */
    onMove?: (
      move: HandMove,
      by: "demo" | "learner",
      from: GridLocation,
      to: GridLocation
    ) => void;
    leftNoun?: string;
    /** Play the demonstration once the figure is on screen. */
    demo?: boolean;
  }

  let {
    interactive = false,
    lit = $bindable(null),
    onMove,
    leftNoun = "blue hand",
    demo = true,
  }: Props = $props();

  /** A tapped move's arrow draws on, then the hand follows along it. */
  const DRAW_MS = DURATION.dramatic;
  const FOLLOW_DELAY_MS = DURATION.normal;

  let host: HTMLDivElement;
  /** The hand's committed point. */
  let handAt = $state<GridLocation>(MOTION_MAP_HOME);
  /**
   * Where the demonstration last put the hand. The grid re-seeds from it, so
   * learner moves stay out of it: a re-seed would clear the grid's own
   * "moved to" announcement.
   */
  let demoAt = $state<GridLocation>(MOTION_MAP_HOME);
  /** The one move drawn: from where, to where (null: none). */
  let arrowFrom = $state<GridLocation>(MOTION_MAP_HOME);
  let arrowTo = $state<GridLocation | null>(null);
  let showHand = $state(false);
  let motionMove = $state<PlacementMotionMove | null>(null);
  /** The learner's last move, which stays drawn until the next. */
  let lastMove: { from: GridLocation; to: GridLocation } | null = null;
  let building = true;
  let previewing = false;
  let ready = false;
  let onScreen = false;
  let started = false;

  const build = createBuildSequence();

  function showMove(from: GridLocation, to: GridLocation | null) {
    arrowFrom = from;
    arrowTo = to;
  }

  function finishBuild() {
    building = false;
    showHand = true;
    arrowTo = null;
    lit = null;
  }

  /** One move of the demonstration: its arrow, then the hand along it. */
  function demonstrate(
    move: HandMove,
    target: MotionMapTarget | null
  ): BuildBeat[] {
    return [
      {
        act: () => {
          lit = move;
          onMove?.(move, "demo", handAt, target?.to ?? handAt);
          showMove(handAt, target?.to ?? handAt);
        },
      },
      { pause: BUILD_BEAT_PAUSE_MS },
      ...(target
        ? [
            {
              act: () => {
                motionMove = {
                  epoch: (motionMove?.epoch ?? 0) + 1,
                  color: HandSide.LEFT,
                  from: handAt,
                  to: target.to,
                  direction: target.direction,
                  path: target.move === "dash" ? "dash" : "arc",
                  durationMs: DURATION.scene,
                };
                handAt = target.to;
                demoAt = target.to;
              },
            },
            { pause: DURATION.scene },
          ]
        : [{ pause: BUILD_BEAT_PAUSE_MS }]),
      { pause: BUILD_BEAT_PAUSE_MS },
      {
        act: () => {
          arrowTo = null;
          lit = null;
        },
      },
      { pause: DURATION.normal },
    ];
  }

  function play() {
    if (started || !ready || !onScreen || !building) return;
    started = true;
    // Shift out of West, dash across from where it lands, then static there.
    const shift = motionMapTargets(MOTION_MAP_HOME)[0];
    const dash = shift
      ? motionMapTargets(shift.to).find((target) => target.move === "dash")
      : undefined;
    if (!shift || !dash) return;
    build.play(
      [
        { pause: BUILD_BEAT_PAUSE_MS },
        { act: () => (showHand = true) },
        { pause: BUILD_BEAT_PAUSE_MS },
        ...demonstrate("shift", shift),
        ...demonstrate("dash", dash),
        ...demonstrate("static", null),
      ],
      finishBuild
    );
  }

  /** Grabbing the hand ends the demonstration where it stands. */
  function takeOver() {
    if (!interactive || !building) return;
    build.cancel();
    finishBuild();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") takeOver();
  }

  /** A drag aims at a point: draw the one move that would make. */
  function aimed(target: GridLocation | null) {
    if (!interactive) return;
    if (target === null) {
      if (!previewing) return;
      // A cancelled drag puts the last move back.
      previewing = false;
      if (lastMove) {
        showMove(lastMove.from, lastMove.to);
        lit = classifyHandMove(lastMove.from, lastMove.to);
      } else {
        arrowTo = null;
        lit = null;
      }
      return;
    }
    takeOver();
    previewing = true;
    showMove(handAt, target);
    lit = classifyHandMove(handAt, target);
  }

  function changed(change: PropPlacementChange) {
    if (!interactive) return;
    takeOver();
    // Picked up (tap or Enter) but not yet put down.
    if (change.activeHand !== null || change.leftLocation === null) return;
    const dropped = previewing;
    previewing = false;
    const from = handAt;
    const to = change.leftLocation;
    handAt = to;
    const move = classifyHandMove(from, to);
    if (!move) return;
    lastMove = { from, to };
    showMove(from, to);
    lit = move;
    onMove?.(move, "learner", from, to);
    // A dragged hand is already where it was dropped; a tapped one follows
    // its arrow there.
    if (dropped || move === "static") return;
    motionMove = {
      epoch: (motionMove?.epoch ?? 0) + 1,
      color: HandSide.LEFT,
      from,
      to,
      direction: handMoveDirection(from, to),
      path: move === "dash" ? "dash" : "arc",
      durationMs: DURATION.scene,
      delayMs: FOLLOW_DELAY_MS,
    };
  }

  onMount(() => {
    if (reducedMotion() || !demo) finishBuild();
    // Capture, so the demonstration stops before the grid starts a drag.
    host.addEventListener("pointerdown", takeOver, { capture: true });
    host.addEventListener("keydown", handleKeydown, { capture: true });
    const stopWatching = whenOnScreen(host, () => {
      onScreen = true;
      play();
    });
    return () => {
      host.removeEventListener("pointerdown", takeOver, { capture: true });
      host.removeEventListener("keydown", handleKeydown, { capture: true });
      stopWatching();
      build.cancel();
    };
  });
</script>

<div class="motion-map" bind:this={host}>
  <PropPlacementGrid
    gridMode={GridMode.DIAMOND}
    hands="left"
    leftPropType={PropType.HAND}
    rightPropType={PropType.HAND}
    {leftNoun}
    promptText=""
    renderTray={false}
    showUndo={false}
    initialLeftLocation={demoAt}
    initialRightLocation={null}
    {motionMove}
    showProps={showHand}
    editAfterCompletion={interactive}
    dragLocations={interactive}
    tapToMove={true}
    animateContent={true}
    onReady={() => {
      ready = true;
      play();
    }}
    onDragTarget={aimed}
    onChange={changed}
  >
    {#snippet figureLayer()}
      <MotionMapArrows
        from={arrowFrom}
        to={arrowTo}
        drawMs={interactive ? DRAW_MS : 0}
        settleMs={interactive ? FOLLOW_DELAY_MS + DURATION.scene : 0}
      />
    {/snippet}
  </PropPlacementGrid>
</div>

<style>
  .motion-map {
    width: 100%;
    aspect-ratio: 1;
  }
</style>
