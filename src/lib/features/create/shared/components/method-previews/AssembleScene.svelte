<script lang="ts">
  /**
   * AssembleScene
   *
   * Mirrors: Assemble. The grid is Assemble's own GridSvg (diamond), cropped
   * to its points and framed like Assemble's builder. The props are the
   * artwork Assemble's grid draws (loadBuilderPropArt: the user's prop type,
   * look and hand colors), and every hop is Assemble's own arc motion
   * (SvgPropAnimator, one builder hop long). The hops are the demo's N and M
   * steps, read through Assemble's own sequence loader (assembleHops).
   *
   * Blue adds its points first: the finger taps each point and blue hops to
   * it, glowing like InteractiveGrid's active prop. Then the hands switch:
   * blue stays on its start point as InteractiveGrid's dimmed ghost, red
   * appears on its own start point, and as red hops to each tapped point the
   * ghost repeats blue's hop for that beat, as InteractiveGrid animates its
   * ghost. The props begin on their start points, as after each hand's first
   * tap: a turn has room for four taps, not six. Rest poses come from the
   * same animator at zero length, so nothing jumps when a hop lands.
   *
   * InteractiveGrid itself is not reused: it takes taps and needs a live
   * Assemble state.
   *
   * Finished picture: as on Assemble's Complete phase, both props rest on
   * their final points (blue on east, red on south) at InteractiveGrid's prop
   * opacity. Long props (600-unit artwork) are clipped at the frame.
   */
  import { onDestroy, untrack } from "svelte";
  import { loadBuilderPropArt } from "$lib/features/assemble-lab/services/builder-prop-art";
  import {
    BUILDER_HOP_MS,
    SvgPropAnimator,
  } from "$lib/features/assemble-lab/services/svg-prop-animator";
  import type { BuilderStep } from "$lib/features/assemble-lab/state/assemble-state-types";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { GhostState } from "$lib/shared/attract/services/attract-ghost.svelte";
  import GridSvg from "$lib/shared/pictograph/grid/components/GridSvg.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { PropRenderData } from "$lib/shared/pictograph/prop/domain/models/prop-render-data";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import {
    ASSEMBLE_VIEW_BOX,
    assembleHops,
    assemblePoint,
    standingHop,
  } from "./method-preview-assemble";
  import { assembleLayout } from "./method-preview-compositions";
  import { DEMO_SEQUENCE } from "./method-preview-demo";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";

  // Trust boundary: the artwork below is injected with {@html}. It comes from
  // loadBuilderPropArt, which reads propSvgLoader's bundled static prop SVGs,
  // never user or external input (InteractiveGrid's own note).

  let {
    playing,
    turn,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  /** InteractiveGrid's fallback circle, shown when a prop's artwork is missing. */
  const FALLBACK_RADIUS = 28;

  const blueHops = assembleHops(DEMO_SEQUENCE, HandSide.LEFT);
  const redHops = assembleHops(DEMO_SEQUENCE, HandSide.RIGHT);
  const blueAnimator = new SvgPropAnimator();
  const redAnimator = new SvgPropAnimator();

  let root = $state<HTMLElement | null>(null);
  let pose = $state.raw<GhostState | null>(null);
  /** rest: the finished picture. blue, red: that hand is adding its points. */
  let phase = $state<"rest" | "blue" | "red">("rest");
  let gridLoaded = $state(false);
  let blueArt = $state.raw<PropRenderData | null>(null);
  let redArt = $state.raw<PropRenderData | null>(null);
  let blueSettled = $state(false);
  let redSettled = $state(false);
  let blueGroup = $state<SVGGElement | null>(null);
  let redGroup = $state<SVGGElement | null>(null);

  const layout = $derived(assembleLayout(width, height));

  let running = false;
  let announced = false;

  onDestroy(() => {
    blueAnimator.cancel();
    redAnimator.cancel();
  });

  // The artwork Assemble's grid draws, reloaded when the prop settings change.
  $effect(() => {
    const settings = getSettings();
    let current = true;
    loadBuilderPropArt(HandSide.LEFT, settings)
      .then((data) => {
        if (current) blueArt = data;
      })
      .catch(() => {
        /* SVG unavailable; the fallback circle shows */
      })
      .finally(() => {
        if (current) blueSettled = true;
      });
    loadBuilderPropArt(HandSide.RIGHT, settings)
      .then((data) => {
        if (current) redArt = data;
      })
      .catch(() => {
        /* SVG unavailable; the fallback circle shows */
      })
      .finally(() => {
        if (current) redSettled = true;
      });
    return () => {
      current = false;
    };
  });

  /** Where a prop's artwork turns about: 0,0 for the fallback circle. */
  function centerOf(art: PropRenderData | null): { x: number; y: number } {
    return art?.svgData?.center ?? { x: 0, y: 0 };
  }

  /** Stand a prop on the start or the end of a hand's hops, at once. */
  function place(
    animator: SvgPropAnimator,
    element: SVGGElement | null,
    hops: readonly BuilderStep[],
    art: PropRenderData | null,
    at: "start" | "end"
  ): void {
    const hop = at === "start" ? hops[0] : hops.at(-1);
    if (!element || !hop) return;
    void animator.animate({
      ...(at === "start" ? standingHop(hop) : hop),
      element,
      durationMs: 0,
      propCenter: centerOf(art),
    });
  }

  /** The finished picture: both props on their final points. */
  function placeFinished(): void {
    place(blueAnimator, blueGroup, blueHops, blueArt, "end");
    place(redAnimator, redGroup, redHops, redArt, "end");
  }

  // Show the finished picture before the first turn, and again when new
  // artwork arrives between turns. The card is ready once the grid and both
  // props are in.
  $effect(() => {
    if (!gridLoaded || !blueSettled || !redSettled) return;
    if (!blueGroup || !redGroup) return;
    // Read before the running check, so new artwork reruns this at rest.
    void blueArt;
    void redArt;
    if (running) return;
    placeFinished();
    if (announced) return;
    announced = true;
    untrack(() => onready());
  });

  function settle(): void {
    blueAnimator.cancel();
    redAnimator.cancel();
    running = false;
    pose = null;
    phase = "rest";
    placeFinished();
  }

  async function play(run: SceneRun): Promise<void> {
    const box = layout;
    const blue = blueGroup;
    const red = redGroup;
    if (!box || !blue || !red) return;
    running = true;
    // The clear: red fades out, and blue stands on its start point.
    phase = "blue";
    place(blueAnimator, blue, blueHops, blueArt, "start");
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const first = blueHops[0];
    const start = first ? assemblePoint(box, first.startLocation) : null;
    if (start) placeGhost(finger, start.x, start.y);

    // Blue adds its points: each tap sends blue along Assemble's arc.
    let landed: Promise<void> = Promise.resolve();
    for (const step of blueHops) {
      const point = assemblePoint(box, step.endLocation);
      if (!point || !(await tapAt(finger, run, point.x, point.y))) return;
      landed = blueAnimator.animate({
        ...step,
        element: blue,
        durationMs: BUILDER_HOP_MS,
        propCenter: centerOf(blueArt),
      });
    }

    // The hands switch once blue lands: blue stays on its start point as the
    // dimmed ghost, and red appears on its own.
    const switched = landed.then(() => {
      if (run.aborted) return;
      place(blueAnimator, blue, blueHops, blueArt, "start");
      place(redAnimator, red, redHops, redArt, "start");
      phase = "red";
    });

    // Red adds its points, and the ghost repeats blue's hop for that beat.
    let last: Promise<unknown> = switched;
    for (const [index, step] of redHops.entries()) {
      const point = assemblePoint(box, step.endLocation);
      if (!point || !(await tapAt(finger, run, point.x, point.y))) return;
      await switched;
      if (run.aborted) return;
      const ghost = blueHops[index];
      last = Promise.all([
        redAnimator.animate({
          ...step,
          element: red,
          durationMs: BUILDER_HOP_MS,
          propCenter: centerOf(redArt),
        }),
        ghost
          ? blueAnimator.animate({
              ...ghost,
              element: blue,
              durationMs: BUILDER_HOP_MS,
              propCenter: centerOf(blueArt),
            })
          : undefined,
      ]);
    }
    finger.ghost.visible = false;
    await last;
    if (run.aborted) return;
    settle();
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div class="scene" bind:this={root} style:--accent={accent} data-phase={phase}>
  {#if layout}
    <svg
      class="grid"
      viewBox={ASSEMBLE_VIEW_BOX}
      style:left="{layout.x}px"
      style:top="{layout.y}px"
      style:width="{layout.size}px"
      style:height="{layout.size}px"
      aria-hidden="true"
    >
      <GridSvg
        gridMode={GridMode.DIAMOND}
        onLoaded={() => (gridLoaded = true)}
        onError={(message) =>
          console.warn(
            "[method preview] Assemble could not load its grid",
            message
          )}
      />
      <g class="prop blue" bind:this={blueGroup}>
        <g class="art">
          {#if blueArt?.svgData}
            {@html blueArt.svgData.svgContent}
          {:else}
            <circle r={FALLBACK_RADIUS} class="fallback" />
          {/if}
        </g>
      </g>
      <g class="prop red" bind:this={redGroup}>
        <g class="art">
          {#if redArt?.svgData}
            {@html redArt.svgData.svgContent}
          {:else}
            <circle r={FALLBACK_RADIUS} class="fallback" />
          {/if}
        </g>
      </g>
    </svg>
  {/if}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  /* Assemble's builder frame (InteractiveGrid's border), on a corner scaled
     to the card. The outline keeps the grid's box the size the points were
     placed for. */
  .grid {
    position: absolute;
    display: block;
    overflow: hidden;
    border-radius: 12%;
    outline: 1px solid
      var(
        --assemble-builder-stroke,
        var(--theme-stroke, rgba(255, 255, 255, 0.12))
      );
    outline-offset: -1px;
  }

  /* InteractiveGrid's prop opacity at rest (its Complete phase). The
     animator owns each prop's transform, so only opacity transitions. */
  .prop {
    opacity: 0.85;
    pointer-events: none;
    transition: opacity var(--duration-fast, 150ms) ease-out;
  }

  /* The hand adding its points shows at full strength and glows, like
     InteractiveGrid's active prop. */
  .scene[data-phase="blue"] .prop.blue,
  .scene[data-phase="red"] .prop.red {
    opacity: 1;
  }

  .scene[data-phase="blue"] .prop.blue .art {
    filter: drop-shadow(0 0 6px var(--prop-blue, #2e8bf0));
  }

  .scene[data-phase="red"] .prop.red .art {
    filter: drop-shadow(0 0 6px var(--prop-red, #ed1c24));
  }

  /* Red has no points yet while blue adds its own. */
  .scene[data-phase="blue"] .prop.red {
    opacity: 0;
  }

  /* InteractiveGrid's dimmed ghost. */
  .scene[data-phase="red"] .prop.blue {
    opacity: 0.35;
  }

  .prop.blue .fallback {
    fill: var(--prop-blue, #2e8bf0);
  }

  .prop.red .fallback {
    fill: var(--prop-red, #ed1c24);
  }
</style>
