<!--
  One blue hand tracing Zan's Diamond on the diamond grid: the eight moves in
  turn, each one's arrow first and then the hand along it, the lines it has
  drawn so far staying on the grid until the loop restarts. Built on the same
  pieces as the Hand Motions map (PropPlacementGrid, MotionMapArrows) so the
  hand, the grid and the arrows look exactly as they do there. Starts once it
  is drawn and on screen; reduced motion shows the finished path with the hand
  at rest.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import PropPlacementGrid from "#lib/shared/pictograph/grid/components/PropPlacementGrid.svelte";
  import MotionMapArrows from "#lib/shared/guide-topics/MotionMapArrows.svelte";
  import { handMoveDirection } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import { getPlacementGridPoints } from "#lib/shared/pictograph/grid/services/placement-grid-points.js";
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
  import { ZANS_DIAMOND_PATH } from "#lib/shared/guide-topics/zans-diamond-topic.js";

  interface Props {
    /** The move being shown, by index into ZANS_DIAMOND_PATH; null between loops. */
    lit?: number | null;
    label: string;
  }

  let { lit = $bindable(null), label }: Props = $props();

  const HOME = ZANS_DIAMOND_PATH[0]!.from;
  /** The pause the hand holds on each point before the next arrow draws. */
  const HOLD_MS = BUILD_BEAT_PAUSE_MS;
  /** Rest with the whole diamond drawn before the loop clears and restarts. */
  const REST_MS = 2400;

  const point = new Map(
    getPlacementGridPoints(GridMode.DIAMOND).map((p) => [p.location, p])
  );
  const segments = ZANS_DIAMOND_PATH.map((move) => ({
    from: point.get(move.from)!,
    to: point.get(move.to)!,
    kind: move.kind,
  }));

  let host: HTMLDivElement;
  let handAt = $state<GridLocation>(HOME);
  let arrowFrom = $state<GridLocation>(HOME);
  let arrowTo = $state<GridLocation | null>(null);
  let motionMove = $state<PlacementMotionMove | null>(null);
  /** How many moves have been drawn this loop; their lines stay on the grid. */
  let traced = $state(0);
  let showHand = $state(false);
  let ready = false;
  let onScreen = false;
  let started = false;

  const build = createBuildSequence();

  function moveBeats(index: number): BuildBeat[] {
    const move = ZANS_DIAMOND_PATH[index]!;
    return [
      {
        act: () => {
          lit = index;
          arrowFrom = move.from;
          arrowTo = move.to;
        },
      },
      { pause: HOLD_MS },
      {
        act: () => {
          motionMove = {
            epoch: (motionMove?.epoch ?? 0) + 1,
            color: HandSide.LEFT,
            from: move.from,
            to: move.to,
            direction: handMoveDirection(move.from, move.to),
            path: move.kind === "dash" ? "dash" : "arc",
            durationMs: DURATION.scene,
          };
          handAt = move.to;
        },
      },
      { pause: DURATION.scene },
      {
        act: () => {
          traced = index + 1;
          arrowTo = null;
        },
      },
    ];
  }

  function loop() {
    build.play(
      [
        { act: () => (showHand = true) },
        { pause: HOLD_MS },
        ...ZANS_DIAMOND_PATH.flatMap((_, i) => moveBeats(i)),
        { act: () => (lit = null) },
        { pause: REST_MS },
        { act: () => (traced = 0) },
        { pause: DURATION.normal },
      ],
      loop
    );
  }

  function play() {
    if (started || !ready || !onScreen) return;
    started = true;
    loop();
  }

  onMount(() => {
    if (reducedMotion()) {
      showHand = true;
      traced = ZANS_DIAMOND_PATH.length;
      return;
    }
    const stopWatching = whenOnScreen(host, () => {
      onScreen = true;
      play();
    });
    return () => {
      stopWatching();
      build.cancel();
    };
  });
</script>

<div class="path-figure" bind:this={host} role="img" aria-label={label}>
  <!-- inert: the grid is a picture here, not a control; its points take no taps or focus. -->
  <div class="stage" inert>
    <PropPlacementGrid
      gridMode={GridMode.DIAMOND}
      hands="left"
      leftPropType={PropType.HAND}
      rightPropType={PropType.HAND}
      promptText=""
      renderTray={false}
      showUndo={false}
      initialLeftLocation={handAt}
      initialRightLocation={null}
      {motionMove}
      showProps={showHand}
      editAfterCompletion={false}
      dragLocations={false}
      animateContent={true}
      onReady={() => {
        ready = true;
        play();
      }}
    >
      {#snippet figureLayer()}
        <svg class="trace" viewBox="0 0 950 950" aria-hidden="true">
          {#each segments as segment, i (i)}
            <line
              class="segment {segment.kind}"
              class:traced={i < traced}
              x1={segment.from.x}
              y1={segment.from.y}
              x2={segment.to.x}
              y2={segment.to.y}
            />
          {/each}
        </svg>
        <MotionMapArrows from={arrowFrom} to={arrowTo} />
      {/snippet}
    </PropPlacementGrid>
  </div>
</div>

<style>
  .path-figure {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
  }
  .stage {
    width: 100%;
    height: 100%;
  }
  .trace {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .segment {
    stroke: var(--prop-blue, #3b82f6);
    stroke-width: 10;
    stroke-linecap: round;
    opacity: 0;
    transition: opacity var(--transition-normal, 240ms);
  }
  .segment.traced {
    opacity: 0.32;
  }
  .segment.dash.traced {
    opacity: 0.2;
  }
</style>
