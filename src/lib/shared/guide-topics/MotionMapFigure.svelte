<!--
  The motion map: one diamond grid, the blue hand, and every move it can make
  from where it stands, drawn at once (two shifts, the dash, a halo for
  static). It builds itself once it is drawn and on screen: the grid, then
  the hand, then the arrows, then each move out and back along its own arrow,
  then Static. Reduced motion shows the finished map.

  With `interactive`, the hand can be grabbed at any time; that ends the
  demonstration. A drop names the move: its arrows light, and after one beat
  the map redraws around the point where the hand landed. Dragging and the
  keyboard both come from PropPlacementGrid.
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
    onMove?: (move: HandMove, by: "demo" | "learner") => void;
    leftNoun?: string;
  }

  let {
    interactive = false,
    lit = $bindable(null),
    onMove,
    leftNoun = "blue hand",
  }: Props = $props();

  let host: HTMLDivElement;
  /** The hand's committed point. */
  let handAt = $state<GridLocation>(MOTION_MAP_HOME);
  /**
   * Where the demonstration last put the hand. The grid re-seeds from it, so
   * learner moves stay out of it: a re-seed would clear the grid's own
   * "moved to" announcement.
   */
  let demoAt = $state<GridLocation>(MOTION_MAP_HOME);
  /** The point the drawn moves start from. */
  let mapFrom = $state<GridLocation>(MOTION_MAP_HOME);
  let showHand = $state(false);
  let arrowOpacity = $state(0);
  let motionMove = $state<PlacementMotionMove | null>(null);
  let building = true;
  let ready = false;
  let onScreen = false;
  let started = false;

  const build = createBuildSequence();
  const settle = createBuildSequence();

  function finishBuild() {
    building = false;
    showHand = true;
    arrowOpacity = 1;
    lit = null;
  }

  function travel(
    to: GridLocation,
    direction: "clockwise" | "counterclockwise",
    path: "arc" | "dash"
  ): BuildBeat[] {
    return [
      {
        act: () => {
          motionMove = {
            epoch: (motionMove?.epoch ?? 0) + 1,
            color: HandSide.LEFT,
            from: handAt,
            to,
            direction,
            path,
            durationMs: DURATION.scene,
          };
          handAt = to;
          demoAt = to;
        },
      },
      { pause: DURATION.scene },
    ];
  }

  function outAndBack(target: MotionMapTarget): BuildBeat[] {
    const path = target.move === "dash" ? "dash" : "arc";
    const back =
      target.direction === "clockwise" ? "counterclockwise" : "clockwise";
    return [
      {
        act: () => {
          lit = target.move;
          onMove?.(target.move, "demo");
        },
      },
      ...travel(target.to, target.direction, path),
      { pause: BUILD_BEAT_PAUSE_MS },
      ...travel(MOTION_MAP_HOME, back, path),
      { pause: BUILD_BEAT_PAUSE_MS },
    ];
  }

  function play() {
    if (started || !ready || !onScreen || !building) return;
    started = true;
    const [shift, , dash] = motionMapTargets(MOTION_MAP_HOME);
    if (!shift || !dash) return;
    build.play(
      [
        { pause: BUILD_BEAT_PAUSE_MS },
        { act: () => (showHand = true) },
        { pause: BUILD_BEAT_PAUSE_MS },
        { tween: DURATION.emphasis, step: (t) => (arrowOpacity = t) },
        { pause: BUILD_BEAT_PAUSE_MS },
        ...outAndBack(shift),
        ...outAndBack(dash),
        {
          act: () => {
            lit = "static";
            onMove?.("static", "demo");
          },
        },
        { pause: BUILD_BEAT_PAUSE_MS * 2 },
      ],
      finishBuild
    );
  }

  /** Grabbing the hand ends the demonstration where it stands. */
  function takeOver() {
    if (!interactive || !building) return;
    build.cancel();
    finishBuild();
    mapFrom = handAt;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") takeOver();
  }

  function changed(change: PropPlacementChange) {
    if (!interactive) return;
    takeOver();
    // Picked up (tap or Enter) but not yet put down.
    if (change.activeHand !== null || change.leftLocation === null) return;
    const from = handAt;
    const to = change.leftLocation;
    handAt = to;
    const move = classifyHandMove(from, to);
    if (!move) return;
    lit = move;
    onMove?.(move, "learner");
    settle.play([{ pause: BUILD_BEAT_PAUSE_MS }], () => {
      mapFrom = to;
      lit = null;
    });
  }

  onMount(() => {
    if (reducedMotion()) finishBuild();
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
      settle.cancel();
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
    animateContent={true}
    onReady={() => {
      ready = true;
      play();
    }}
    onChange={changed}
  >
    {#snippet figureLayer()}
      <MotionMapArrows from={mapFrom} {lit} opacity={arrowOpacity} />
    {/snippet}
  </PropPlacementGrid>
</div>

<style>
  .motion-map {
    width: 100%;
    aspect-ratio: 1;
  }
</style>
