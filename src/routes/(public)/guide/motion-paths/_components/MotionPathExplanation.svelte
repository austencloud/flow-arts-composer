<script lang="ts">
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
  import { DARK_MOTION_BLUE_STROKE } from "$lib/shared/mandala/domain/mandala-constants";
  import {
    INTRO_PATHS,
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
      title: "Two points",
      caption: "It moves from here to here.",
      path: "linear",
    },
    { title: "Arc", caption: "Go around.", path: "arc" },
    { title: "Linear", caption: "Go straight.", path: "linear" },
    { title: "Concave", caption: "Bend inward.", path: "concave" },
    { title: "Three paths", caption: "Same start. Same finish." },
  ];
  const MORPH_DURATION = DURATION.dramatic * 2;
  const TRAVERSE_DURATION = DURATION.dramatic * 4;
  const ARRIVAL_DURATION = DURATION.dramatic * 2;
  const gate = createRenderActivityGate({
    name: "motion-path-intro",
    rootMargin: "0px",
  });

  let stage = $state(0);
  let routePoints = $state<readonly IntroPoint[]>(INTRO_PATHS.linear);
  let hand = $state<IntroPoint>({ x: 0, y: 0 });
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
  const routeVisible = $derived(stage >= 2);
  const endpointsVisible = $derived(stage > 0);
  const traceD = $derived(
    stage >= 2 && traceProgress > 0
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
    const path = stage === 0 ? "linear" : (current.path ?? "concave");
    routePoints = INTRO_PATHS[path];
    traceProgress = stage === 0 ? 0 : 1;
    hand = stage === 0 ? { x: 0, y: 0 } : introPointAt(routePoints, 1);
  }

  function runStage(nextPath: IntroPath): void {
    cancelFrame();
    const epoch = ++stageEpoch;
    const from = routePoints;
    const destination = INTRO_PATHS[nextPath];
    const handOrigin = hand;
    const handStart = introPointAt(destination, 0);
    const start = performance.now();
    traceProgress = 0;

    const animate = (now: number): void => {
      if (epoch !== stageEpoch || !gate.active) return;
      const rawMorphProgress = Math.min(
        1,
        (now - start) / motionDuration(MORPH_DURATION)
      );
      const morphProgress = cubicInOut(rawMorphProgress);
      routePoints = interpolateRoute(from, destination, morphProgress);
      hand = interpolatePoint(handOrigin, handStart, morphProgress);

      if (rawMorphProgress < 1) {
        frame = requestAnimationFrame(animate);
        return;
      }

      const traversalStart = now;
      const traverse = (traverseNow: number): void => {
        if (epoch !== stageEpoch || !gate.active) return;
        const progress = Math.min(
          1,
          (traverseNow - traversalStart) / motionDuration(TRAVERSE_DURATION)
        );
        traceProgress = progress;
        hand = introPointAt(destination, progress);
        if (progress < 1) {
          frame = requestAnimationFrame(traverse);
          return;
        }
        routePoints = destination;
        pulseActive = true;
        pulseTimeout = window.setTimeout(() => {
          if (epoch === stageEpoch) pulseActive = false;
          pulseTimeout = null;
        }, ARRIVAL_DURATION);
        frame = null;
      };
      frame = requestAnimationFrame(traverse);
    };

    frame = requestAnimationFrame(animate);
  }

  function advance(): void {
    if (isFinal) {
      stage = 0;
      stageEpoch += 1;
      settle();
      return;
    }

    stage += 1;
    const nextPath = STAGES[stage]?.path;
    if (!nextPath || isReducedMotion || !gate.active) {
      settle();
      return;
    }
    runStage(nextPath);
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
      viewBox="-220 -130 440 260"
      role="img"
      aria-label={current.caption}
      preserveAspectRatio="xMidYMid meet"
    >
      {#if routeVisible}
        <path class="route-shadow" d={routeD} />
        <path class="route" d={routeD} />
        {#if traceD}<path class="trace" d={traceD} />{/if}
      {/if}

      {#if isFinal}
        {#each ["arc", "linear"] as path}
          <path
            class="comparison-route"
            d={introPathD(INTRO_PATHS[path as IntroPath])}
            in:fade={{ duration: motionDuration(DURATION.normal) }}
          />
        {/each}
        <g in:fade={{ duration: motionDuration(DURATION.normal) }}>
          <text class="route-label arc-label" x="0" y="-84">Arc</text>
          <text class="route-label linear-label" x="0" y="-14">Linear</text>
          <text class="route-label concave-label" x="0" y="96">Concave</text>
        </g>
      {/if}

      {#if endpointsVisible}
        <g in:fade={{ duration: motionDuration(DURATION.normal) }}>
          <circle class="endpoint" cx="-140" cy="0" r="6" />
          <circle class="endpoint" cx="140" cy="0" r="6" />
        </g>
      {/if}
      <foreignObject x={hand.x - 32} y={hand.y - 32} width="64" height="64">
        <div
          class:pulsing={pulseActive}
          class="hand-art"
          xmlns="http://www.w3.org/1999/xhtml"
        >
          <PropCompositionPreview
            propType={PropType.HAND}
            singleHand="left"
            pairedGlyph
            size={64}
            darkBackground
            colors={getSettings().primaryPropColors}
            useSavedOverrides={false}
          />
        </div>
      </foreignObject>
    </svg>
  </div>

  <LessonStageControls
    label={isFinal ? "Start again" : "Next"}
    currentStep={stage + 1}
    totalSteps={STAGES.length}
    onAction={advance}
  />
</section>

<style>
  .motion-path-intro {
    --settings-stage-width: min(100%, 47.5rem);
    width: var(--settings-stage-width);
    min-height: clamp(31.25rem, 62vh, 37.5rem);
    display: grid;
    grid-template-rows: 5.5rem minmax(16rem, 1fr) auto;
    justify-items: center;
    gap: clamp(1rem, 2.5cqw, 1.75rem);
    margin: clamp(2rem, 6vw, 4.5rem) auto;
    container-type: inline-size;
    color: var(--theme-text);
  }

  .intro-copy {
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
    width: min(100%, 34rem);
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: center;
  }

  svg {
    display: block;
    width: 100%;
    max-height: 17.5rem;
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

  .comparison-route {
    stroke: color-mix(in srgb, var(--theme-text-dim) 60%, transparent);
    stroke-width: 2;
  }

  .endpoint {
    fill: var(--theme-panel-bg);
    stroke: color-mix(in srgb, var(--theme-text) 62%, transparent);
    stroke-width: 3;
  }

  .hand-art {
    width: 64px;
    height: 64px;
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
    fill: var(--theme-text-dim);
    font-size: 14px;
    font-weight: 650;
    text-anchor: middle;
  }

  .arc-label {
    fill: color-mix(in srgb, var(--hand-color) 75%, var(--theme-text));
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

  @container (max-width: 440px) {
    .motion-path-intro {
      min-height: 31.25rem;
      grid-template-rows: 5rem minmax(14rem, 1fr) auto;
      margin-block: 2rem;
    }

    h2 {
      font-size: clamp(1.65rem, 8cqw, 2rem);
    }

    .route-stage {
      width: 100%;
    }

    svg {
      max-height: 15rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hand-art.pulsing {
      animation: none;
    }
  }

  :global([data-motion-preference="reduce"]) .hand-art.pulsing {
    animation: none;
  }
</style>
