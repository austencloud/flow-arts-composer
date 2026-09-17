<script lang="ts">
  import { browser } from "$app/environment";
  import { onDestroy, onMount } from "svelte";
  import { cubicInOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import LessonStageControls from "$lib/features/learn/components/interactive/LessonStageControls.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    createRenderActivityGate,
    renderGateTarget,
  } from "$lib/shared/render-gating/render-activity-gate";
  import {
    motionDuration,
    reducedMotion,
  } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { PATH_SHAPE_COLORS } from "$lib/shared/animation-engine/domain/path-shape-colors";
  import { DARK_MOTION_BLUE_STROKE } from "$lib/shared/mandala/domain/mandala-constants";
  import GridSvg from "$lib/shared/pictograph/grid/components/GridSvg.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    INTRO_CENTER,
    INTRO_PATHS,
    INTRO_RADIUS,
    introPathD,
    introPointAt,
    type IntroPath,
    type IntroPoint,
  } from "../_data/motion-path-intro";

  interface StageCopy {
    title: string;
    caption: string;
    path?: IntroPath;
  }

  const STAGES: readonly StageCopy[] = [
    { title: "Your hand", caption: "This is your hand." },
    {
      title: "Your grid",
      caption: "The grid has a center.",
    },
    // Level 1 already taught the shift. Arc names it once for readers who
    // arrive from the animation settings without that page, then the three
    // paths share those two endpoints.
    {
      title: "Arc",
      caption: "One shift. Follow the circle around the center.",
      path: "arc",
    },
    {
      title: "Linear",
      caption: "Take a straight path between the points.",
      path: "linear",
    },
    {
      title: "Concave",
      caption: "Curve inward toward the center.",
      path: "concave",
    },
    { title: "Three paths", caption: "Same shift. Different paths." },
  ];
  const COMPARISON_PATHS: readonly IntroPath[] = ["arc", "linear", "concave"];
  const LEGEND: readonly { path: IntroPath; x: number; label: string }[] = [
    { path: "arc", x: -118, label: "Arc" },
    { path: "linear", x: -30, label: "Linear" },
    { path: "concave", x: 66, label: "Concave" },
  ];
  const MORPH_DURATION = DURATION.dramatic * 2;
  const TRAVERSE_DURATION = DURATION.dramatic * 4;
  const ARRIVAL_DURATION = DURATION.dramatic * 2;
  const gate = createRenderActivityGate({
    name: "motion-path-intro",
    rootMargin: "0px",
  });

  let stage = $state(0);
  let routePoints = $state<readonly IntroPoint[]>(INTRO_PATHS.arc);
  let hand = $state<IntroPoint>(INTRO_CENTER);
  let traceProgress = $state(0);
  let pulseActive = $state(false);
  let isReducedMotion = $state(reducedMotion());
  let frame: number | null = null;
  let pulseTimeout: number | null = null;
  let stageEpoch = 0;

  const current = $derived(STAGES[stage]!);
  const isFinal = $derived(stage === STAGES.length - 1);
  const handColor = $derived(
    getSettings().primaryPropColors?.left ?? DARK_MOTION_BLUE_STROKE
  );
  const routeD = $derived(introPathD(routePoints));
  const gridVisible = $derived(stage >= 1);
  const FIRST_PATH_STAGE = 2;
  const endpointsVisible = $derived(stage >= FIRST_PATH_STAGE);
  const routeVisible = $derived(stage >= FIRST_PATH_STAGE && !isFinal);
  // The destination pulses while Arc waits at its start, before the hand moves.
  const destinationPending = $derived(
    stage === FIRST_PATH_STAGE && traceProgress === 0
  );
  const shiftStart = introPointAt(INTRO_PATHS.arc, 0);
  const shiftEnd = introPointAt(INTRO_PATHS.arc, 1);
  const traceD = $derived(
    stage >= FIRST_PATH_STAGE && traceProgress > 0
      ? introPathD(
          routePoints.slice(
            0,
            Math.max(2, Math.ceil(traceProgress * routePoints.length))
          )
        )
      : ""
  );

  function cancelFrame(): void {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    if (pulseTimeout !== null) window.clearTimeout(pulseTimeout);
    pulseTimeout = null;
    pulseActive = false;
  }

  function interpolateRoute(
    from: readonly IntroPoint[],
    to: readonly IntroPoint[],
    progress: number
  ): readonly IntroPoint[] {
    return from.map((point, index) => {
      const destination = to[index]!;
      return {
        x: point.x + (destination.x - point.x) * progress,
        y: point.y + (destination.y - point.y) * progress,
      };
    });
  }

  function interpolatePoint(
    from: IntroPoint,
    to: IntroPoint,
    progress: number
  ): IntroPoint {
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
  }

  function settle(): void {
    cancelFrame();
    pulseActive = false;
    const path = current.path ?? (isFinal ? "concave" : "arc");
    routePoints = INTRO_PATHS[path];
    traceProgress = stage >= FIRST_PATH_STAGE ? 1 : 0;
    hand =
      stage === 0
        ? INTRO_CENTER
        : stage < FIRST_PATH_STAGE
          ? introPointAt(routePoints, 0)
          : introPointAt(routePoints, 1);
  }

  function moveHandToStart(): void {
    cancelFrame();
    const epoch = ++stageEpoch;
    const origin = hand;
    const destination = introPointAt(INTRO_PATHS.arc, 0);
    const start = performance.now();

    const animate = (now: number): void => {
      if (epoch !== stageEpoch || !gate.active) return;
      const progress = Math.min(
        1,
        (now - start) / motionDuration(ARRIVAL_DURATION)
      );
      hand = interpolatePoint(origin, destination, cubicInOut(progress));
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        frame = null;
      }
    };

    frame = requestAnimationFrame(animate);
  }

  function runStage(nextPath: IntroPath, retrace = false): void {
    cancelFrame();
    const epoch = ++stageEpoch;
    const from = routePoints;
    const destination = INTRO_PATHS[nextPath];
    const handOrigin = hand;
    const nearest = from.reduce(
      (best, point, index) =>
        Math.hypot(point.x - hand.x, point.y - hand.y) <
        Math.hypot(from[best]!.x - hand.x, from[best]!.y - hand.y)
          ? index
          : best,
      0
    );
    const startProgress = nearest / (from.length - 1);
    const start = performance.now();
    traceProgress = retrace ? 1 : 0;

    const animate = (now: number): void => {
      if (epoch !== stageEpoch || !gate.active) return;
      const rawMorphProgress = Math.min(
        1,
        (now - start) / motionDuration(MORPH_DURATION)
      );
      const morphProgress = cubicInOut(rawMorphProgress);
      routePoints = interpolateRoute(from, destination, morphProgress);
      hand = interpolatePoint(
        handOrigin,
        introPointAt(destination, startProgress),
        morphProgress
      );

      if (rawMorphProgress < 1) {
        frame = requestAnimationFrame(animate);
        return;
      }

      const traversalStart = now;
      const traverse = (traverseNow: number): void => {
        if (epoch !== stageEpoch || !gate.active) return;
        const rawProgress = Math.min(
          1,
          (traverseNow - traversalStart) / motionDuration(TRAVERSE_DURATION)
        );
        const progress = retrace
          ? startProgress * (1 - rawProgress)
          : startProgress + (1 - startProgress) * rawProgress;
        traceProgress = progress;
        hand = introPointAt(destination, progress);
        if (rawProgress < 1) {
          frame = requestAnimationFrame(traverse);
          return;
        }
        if (retrace) {
          const redrawStart = traverseNow;
          const redraw = (redrawNow: number): void => {
            if (epoch !== stageEpoch || !gate.active) return;
            const redrawProgress = Math.min(
              1,
              (redrawNow - redrawStart) / motionDuration(TRAVERSE_DURATION)
            );
            traceProgress = redrawProgress;
            hand = introPointAt(destination, redrawProgress);
            if (redrawProgress < 1) {
              frame = requestAnimationFrame(redraw);
              return;
            }
            completeRoute(epoch, destination);
          };
          frame = requestAnimationFrame(redraw);
          return;
        }
        completeRoute(epoch, destination);
      };
      frame = requestAnimationFrame(traverse);
    };

    frame = requestAnimationFrame(animate);
  }

  function completeRoute(
    epoch: number,
    destination: readonly IntroPoint[]
  ): void {
    routePoints = destination;
    pulseActive = true;
    pulseTimeout = window.setTimeout(() => {
      if (epoch === stageEpoch) pulseActive = false;
      pulseTimeout = null;
    }, ARRIVAL_DURATION);
    frame = null;
  }

  function advance(): void {
    if (isFinal) {
      stage = 0;
      stageEpoch += 1;
      settle();
      return;
    }

    stage += 1;
    if (stage === 1) {
      if (isReducedMotion || !gate.active) settle();
      else moveHandToStart();
      return;
    }
    const nextPath = STAGES[stage]?.path;
    if (!nextPath || isReducedMotion || !gate.active) {
      settle();
      return;
    }
    runStage(nextPath, stage > FIRST_PATH_STAGE);
  }

  onMount(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = (): void => {
      isReducedMotion = reducedMotion();
      if (isReducedMotion) settle();
    };
    const observer = new MutationObserver(updateMotionPreference);
    media.addEventListener("change", updateMotionPreference);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-motion-preference"],
    });
    const unsubscribe = gate.subscribe((active) => {
      if (!active) settle();
    });

    return () => {
      media.removeEventListener("change", updateMotionPreference);
      observer.disconnect();
      unsubscribe();
    };
  });

  onDestroy(() => {
    cancelFrame();
    gate.dispose();
  });
</script>

<div class="intro-frame">
<section
  class="motion-path-intro"
  aria-labelledby="motion-path-intro-heading"
  use:renderGateTarget={gate}
  style:--hand-color={handColor}
  style:--arrival-duration={`${ARRIVAL_DURATION}ms`}
>
  <div class="intro-copy" aria-live="polite">
    <Crossfade key={stage} duration={DURATION.normal} mode="swap" motion="step">
      <div class="copy-layer">
        <h2 id="motion-path-intro-heading">{current.title}</h2>
        <p>{current.caption}</p>
      </div>
    </Crossfade>
  </div>

  <div class="route-stage">
    <svg
      viewBox="-165 -165 330 330"
      role="img"
      aria-label={current.caption}
      preserveAspectRatio="xMidYMid meet"
    >
      {#if gridVisible}
        <g
          class="grid-art"
          in:fade={{ duration: motionDuration(DURATION.normal) }}
        >
          <g transform={`scale(${INTRO_RADIUS / 300}) translate(-475 -475)`}>
            <GridSvg
              gridMode={GridMode.DIAMOND}
              darkMode={true}
              handPointVisibility="none"
              showNonRadialPoints={false}
            />
          </g>
          <circle
            class="center-circle"
            cx={INTRO_CENTER.x}
            cy={INTRO_CENTER.y}
            r={INTRO_RADIUS}
          />
          <text class="center-label" x="-12" y="-14" text-anchor="end"
            >Center</text
          >
        </g>
      {/if}

      {#if isFinal}
        {#each COMPARISON_PATHS as path (path)}
          <path
            class="comparison-route"
            style:stroke={PATH_SHAPE_COLORS[path]}
            d={introPathD(INTRO_PATHS[path])}
            in:fade={{ duration: motionDuration(DURATION.normal) }}
          />
        {/each}
      {/if}

      {#if routeVisible}
        <path class="route-shadow" d={routeD} />
        <path class="route" d={routeD} />
        {#if traceD}<path class="trace" d={traceD} />{/if}
      {/if}

      {#if isFinal}
        <g
          class="route-legend"
          in:fade={{ duration: motionDuration(DURATION.normal) }}
        >
          {#each LEGEND as item (item.path)}
            <g transform={`translate(${item.x} 148)`}>
              <path
                class="legend-line"
                style:stroke={PATH_SHAPE_COLORS[item.path]}
                d="M0 0h20"
              />
              <text class="route-label" x="26" y="5">{item.label}</text>
            </g>
          {/each}
        </g>
      {/if}

      <foreignObject x={hand.x - 24} y={hand.y - 24} width="48" height="48">
        <div
          class:pulsing={pulseActive}
          class="hand-art"
          xmlns="http://www.w3.org/1999/xhtml"
        >
          <PropCompositionPreview
            propType={PropType.HAND}
            singleHand="left"
            pairedGlyph
            size={48}
            darkBackground
            colors={getSettings().primaryPropColors}
            useSavedOverrides={false}
          />
        </div>
      </foreignObject>

      {#if endpointsVisible}
        <!-- Drawn after the hand so the point stays visible when the hand lands on it. -->
        <g
          class="endpoints"
          in:fade={{ duration: motionDuration(DURATION.normal) }}
        >
          <circle
            class="endpoint start"
            cx={shiftStart.x}
            cy={shiftStart.y}
            r="7"
          />
          <circle
            class="endpoint end"
            class:arriving={destinationPending}
            cx={shiftEnd.x}
            cy={shiftEnd.y}
            r="7"
          />
        </g>
      {/if}
    </svg>
  </div>

  <!-- The production SSR build stubs every features/learn component to null,
       so the controls only render in the browser; the explanation itself still
       prerenders. -->
  <div class="intro-controls">
    {#if browser}
      <LessonStageControls
        label={isFinal ? "Start again" : "Next"}
        currentStep={stage + 1}
        totalSteps={STAGES.length}
        progressAppearance="steps"
        onAction={advance}
      />
    {/if}
  </div>
</section>
</div>

<style>
  .intro-frame {
    width: 100%;
    min-width: 0;
    container-type: inline-size;
  }

  /* Portrait: copy, drawing, controls stacked in one column. */
  .motion-path-intro {
    --settings-stage-width: min(100%, 47.5rem);
    width: var(--settings-stage-width);
    min-height: clamp(36rem, 70vh, 44rem);
    display: grid;
    grid-template-rows: 5.5rem minmax(22rem, 1fr) auto;
    grid-template-areas: "copy" "stage" "controls";
    justify-items: center;
    gap: clamp(1rem, 2.5cqw, 1.75rem);
    margin: clamp(2rem, 6vw, 4.5rem) auto;
    container-type: inline-size;
    color: var(--theme-text);
  }

  .intro-controls {
    grid-area: controls;
    width: 100%;
    min-height: 5.75rem;
    display: grid;
    justify-items: center;
    align-items: start;
  }

  .intro-copy {
    grid-area: copy;
    width: 100%;
    min-height: 5.5rem;
    display: grid;
    place-items: end center;
    text-align: center;
  }

  .copy-layer {
    display: grid;
    justify-items: center;
    gap: 0.35rem;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: clamp(1.75rem, 5cqw, 2.5rem);
    line-height: 1.1;
    letter-spacing: -0.035em;
  }

  p {
    min-height: 1.5em;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.5;
  }

  .route-stage {
    grid-area: stage;
    width: min(100%, 40rem);
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: center;
  }

  svg {
    display: block;
    width: 100%;
    max-height: 24rem;
    overflow: visible;
  }

  .route-shadow,
  .route,
  .trace,
  .comparison-route {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .route-shadow {
    stroke: color-mix(in srgb, var(--hand-color) 22%, transparent);
    stroke-width: 12;
  }

  .route {
    stroke: color-mix(in srgb, var(--hand-color) 72%, var(--theme-text));
    stroke-width: 3;
  }

  .trace {
    stroke: var(--hand-color);
    stroke-width: 4;
  }

  /* Three equal choices: same weight, each in the color the path panel uses. */
  .comparison-route,
  .legend-line {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
  }

  .endpoint {
    fill: var(--theme-bg, #0b0b0f);
    stroke: var(--hand-color);
    stroke-width: 2.5;
  }

  .endpoint.start {
    fill: var(--hand-color);
  }

  .endpoint.arriving {
    animation: endpoint-pulse var(--arrival-duration) var(--ease-out, ease-out)
      infinite;
  }

  .grid-art {
    pointer-events: none;
  }

  .center-circle {
    fill: none;
    stroke: color-mix(in srgb, var(--theme-text-dim) 44%, transparent);
    stroke-width: 1.5;
  }

  .center-label {
    fill: var(--theme-text-dim);
    font-size: 14px;
    font-weight: 650;
  }

  .hand-art {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    filter: drop-shadow(
      0 0 0.35rem color-mix(in srgb, var(--hand-color) 50%, transparent)
    );
    transform-origin: center;
  }

  .hand-art.pulsing {
    animation: arrival-pulse var(--arrival-duration) var(--ease-out, ease-out) 1;
  }

  .route-label {
    fill: var(--theme-text);
    font-size: 15px;
    font-weight: 650;
  }

  @keyframes endpoint-pulse {
    0%,
    100% {
      r: 7;
      stroke-opacity: 1;
    }
    50% {
      r: 11;
      stroke-opacity: 0.55;
    }
  }

  @keyframes arrival-pulse {
    0% {
      transform: scale(1);
      filter: drop-shadow(
        0 0 0.35rem color-mix(in srgb, var(--hand-color) 50%, transparent)
      );
    }
    45% {
      transform: scale(1.13);
      filter: drop-shadow(
        0 0 0.8rem color-mix(in srgb, var(--hand-color) 78%, transparent)
      );
    }
    100% {
      transform: scale(1);
      filter: drop-shadow(
        0 0 0.35rem color-mix(in srgb, var(--hand-color) 50%, transparent)
      );
    }
  }

  /* Landscape: the words and the button sit beside the drawing instead of
     leaving both rails empty. The copy and controls cluster at the vertical
     center of the stage. */
  @container (min-width: 52rem) {
    .motion-path-intro {
      width: 100%;
      min-height: 0;
      grid-template-columns: minmax(18rem, 0.9fr) minmax(0, 1.1fr);
      grid-template-rows: auto auto;
      grid-template-areas:
        "copy stage"
        "controls stage";
      align-content: center;
      column-gap: clamp(2rem, 5cqw, 5rem);
      row-gap: clamp(1rem, 2cqw, 1.5rem);
      margin-block: clamp(1.5rem, 4vw, 3rem);
    }

    .intro-copy {
      align-self: end;
    }

    .intro-controls {
      align-self: start;
      min-height: 0;
    }

    .route-stage {
      width: 100%;
      align-self: center;
    }

    svg {
      max-height: min(30rem, 62vh);
    }
  }

  @container (max-width: 440px) {
    .motion-path-intro {
      min-height: 31.25rem;
      grid-template-rows: 5rem minmax(18rem, 1fr) auto;
      margin-block: 2rem;
    }

    h2 {
      font-size: clamp(1.65rem, 8cqw, 2rem);
    }

    .route-stage {
      width: 100%;
    }

    svg {
      max-height: 19rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hand-art.pulsing,
    .endpoint.arriving {
      animation: none;
    }
  }

  :global([data-motion-preference="reduce"]) .hand-art.pulsing,
  :global([data-motion-preference="reduce"]) .endpoint.arriving {
    animation: none;
  }
</style>
