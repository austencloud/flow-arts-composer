<script lang="ts">
  import { flushSync, onDestroy, onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    calculatePictographArrivalTransform,
    type ArrivalRect,
  } from "../domain/pictograph-arrival-geometry";
  import {
    getPictographArrivalPropMotionDurationMs,
    PICTOGRAPH_ARRIVAL_LANDING_EASING,
    PICTOGRAPH_ARRIVAL_LANDING_MS,
    PICTOGRAPH_ARRIVAL_PROP_MOTION_MIN_MS,
  } from "../domain/pictograph-arrival-motion";
  import type { PictographStageRequest } from "../state/step-grid-display-state.svelte";

  type ArrivalPhase =
    | "preparing"
    | "entering"
    | "moving"
    | "holding"
    | "landing"
    | "handing-off";

  const PREPARE_TIMEOUT_MS = 2500;
  const STAGE_ENTER_MS = DURATION.emphasis;
  const SCRIM_ENTER_MS = DURATION.dramatic;
  const SCRIM_ENTER_DELAY_MS = DURATION.normal / 4;
  const SCRIM_PEAK_OPACITY = 0.58;
  const REDUCED_MOTION_ENTER_MS = DURATION.fast;
  const PROP_MOTION_START_DELAY_MS = DURATION.fast;
  const FINISHED_HOLD_MS = 120;
  const REDUCED_MOTION_HOLD_MS = DURATION.dramatic;
  const STAGE_ENTER_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

  let {
    request,
    sequence,
    getDestinationRect,
    onBeginLanding,
    onBeginHandoff,
    onComplete,
    onReady = () => {},
    onMotionComplete = () => {},
    leftPropTypeOverride = undefined,
    rightPropTypeOverride = undefined,
    leftColorOverride = undefined,
    rightColorOverride = undefined,
  }: {
    request: PictographStageRequest;
    sequence: SequenceData;
    getDestinationRect: (stepIndex: number) => ArrivalRect | null;
    onBeginLanding: (requestId: number) => void;
    onBeginHandoff: (requestId: number) => void;
    onComplete: (requestId: number) => void;
    onReady?: (requestId: number, autoplay: boolean) => void;
    onMotionComplete?: (requestId: number) => void;
    leftPropTypeOverride?: PropType;
    rightPropTypeOverride?: PropType;
    leftColorOverride?: string;
    rightColorOverride?: string;
  } = $props();

  const step = $derived(sequence.steps[request.stepIndex] ?? null);
  const propMotionDurationMs = $derived(
    step
      ? getPictographArrivalPropMotionDurationMs(step)
      : PICTOGRAPH_ARRIVAL_PROP_MOTION_MIN_MS
  );
  const motionStartData = $derived.by(() => {
    if (request.stepIndex > 0) {
      return sequence.steps[request.stepIndex - 1] ?? null;
    }
    return sequence.startPlacement ?? sequence.startingPlacement ?? null;
  });

  let phase = $state<ArrivalPhase>("preparing");
  let motionProgress = $state<number | null>(0);
  let arrowOpacity = $state(0);
  let entranceComplete = $state(false);
  let activeRequestId = 0;
  let systemPrefersReducedMotion = $state(false);
  let lastObservedReducedMotion = false;
  let phaseTimer: ReturnType<typeof setTimeout> | null = null;
  let animationFrame: number | null = null;
  let motionStartedAt: number | null = null;
  let cardElement: HTMLElement | null = $state(null);
  let scrimElement: HTMLElement | null = $state(null);
  let activeAnimations: Animation[] = [];

  const reducedMotionEnabled = $derived(
    (getSettings().reducedMotion ?? false) || systemPrefersReducedMotion
  );
  const isAudition = $derived(request.intent === "audition");

  function clearPhaseTimer() {
    if (phaseTimer === null) return;
    clearTimeout(phaseTimer);
    phaseTimer = null;
  }

  function clearAnimationFrame() {
    if (animationFrame === null) return;
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }

  function cancelActiveAnimations() {
    for (const animation of activeAnimations) animation.cancel();
    activeAnimations = [];
  }

  function clearActiveWork() {
    clearPhaseTimer();
    clearAnimationFrame();
    cancelActiveAnimations();
    motionStartedAt = null;
  }

  function handOffToCell(requestId: number, preserveLandedFrame = false) {
    if (request.requestId !== requestId || request.owner !== "stage") return;

    flushSync(() => {
      phase = "handing-off";
      if (!preserveLandedFrame) entranceComplete = false;
      onBeginHandoff(requestId);
    });

    animationFrame = requestAnimationFrame(() => {
      if (!preserveLandedFrame) {
        animationFrame = null;
        onComplete(requestId);
        return;
      }

      // The destination paints underneath the landed stage card for one full
      // frame. Removing the stage on the following frame prevents a blank
      // frame between the two renderers.
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        onComplete(requestId);
      });
    });
  }

  async function enterStage(requestId: number) {
    if (request.requestId !== requestId || request.owner !== "stage") return;

    const card = cardElement;
    const scrim = scrimElement;
    flushSync(() => {
      phase = "entering";
      entranceComplete = false;
    });

    const cardDuration = reducedMotionEnabled
      ? REDUCED_MOTION_ENTER_MS
      : STAGE_ENTER_MS;
    const scrimDuration = reducedMotionEnabled
      ? REDUCED_MOTION_ENTER_MS
      : SCRIM_ENTER_MS;
    const scrimDelay = reducedMotionEnabled ? 0 : SCRIM_ENTER_DELAY_MS;
    const entranceAnimations: Animation[] = [];

    if (scrim && typeof scrim.animate === "function") {
      entranceAnimations.push(
        scrim.animate([{ opacity: 0 }, { opacity: SCRIM_PEAK_OPACITY }], {
          duration: scrimDuration,
          delay: scrimDelay,
          easing: STAGE_ENTER_EASING,
          fill: "both",
        })
      );
    }

    if (card && typeof card.animate === "function") {
      entranceAnimations.push(
        card.animate(
          reducedMotionEnabled
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                {
                  opacity: 0,
                  transform: "translate3d(0, 0, 0) scale(0.92)",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
                },
                {
                  opacity: 1,
                  transform: "translate3d(0, 0, 0) scale(1)",
                  boxShadow: "0 18px 55px rgba(0, 0, 0, 0.46)",
                },
              ],
          {
            duration: cardDuration,
            easing: STAGE_ENTER_EASING,
            fill: "both",
          }
        )
      );
    }

    if (!reducedMotionEnabled) {
      // The start placement only needs a quick recognition beat. Prop motion
      // begins while the card and background finish settling, so the arrival
      // never feels like it has paused after popping forward.
      phaseTimer = setTimeout(() => {
        phaseTimer = null;
        beginPropMotion(requestId);
      }, PROP_MOTION_START_DELAY_MS);
    }

    activeAnimations = entranceAnimations;
    try {
      await Promise.all(
        entranceAnimations.map((animation) => animation.finished)
      );
    } catch {
      return;
    }

    flushSync(() => {
      entranceComplete = true;
    });
    for (const animation of entranceAnimations) animation.cancel();
    if (activeAnimations === entranceAnimations) activeAnimations = [];

    if (request.requestId !== requestId || request.owner !== "stage") return;
    if (reducedMotionEnabled) {
      motionProgress = null;
      arrowOpacity = 1;
      beginHold(requestId);
      return;
    }

    if (phase === "entering") {
      clearPhaseTimer();
      beginPropMotion(requestId);
    }
  }

  async function landInGrid(requestId: number) {
    if (request.requestId !== requestId || request.owner !== "stage") return;

    const card = cardElement;
    const sourceRect = card?.getBoundingClientRect() ?? null;

    // Landing is one transaction. Capture the large card first, release the
    // grid's final layout synchronously, then measure the real destination.
    // This gives the card and every retained grid cell the same start frame.
    flushSync(() => {
      phase = "landing";
      motionProgress = 1;
      arrowOpacity = 1;
      onBeginLanding(requestId);
    });

    const destinationRect = getDestinationRect(request.stepIndex);
    const transform =
      sourceRect && destinationRect
        ? calculatePictographArrivalTransform(sourceRect, destinationRect)
        : null;

    if (reducedMotionEnabled) {
      handOffToCell(requestId);
      return;
    }

    if (!card || typeof card.animate !== "function" || !transform) {
      handOffToCell(requestId);
      return;
    }

    const cardAnimation = card.animate(
      [
        {
          transform: "translate3d(0, 0, 0) scale(1, 1)",
          boxShadow: "0 18px 55px rgba(0, 0, 0, 0.46)",
        },
        {
          transform: `translate3d(${transform.translateX}px, ${transform.translateY}px, 0) scale(${transform.scaleX}, ${transform.scaleY})`,
          boxShadow: "0 0 0 rgba(0, 0, 0, 0)",
        },
      ],
      {
        duration: PICTOGRAPH_ARRIVAL_LANDING_MS,
        easing: PICTOGRAPH_ARRIVAL_LANDING_EASING,
        fill: "forwards",
      }
    );
    activeAnimations = [cardAnimation];

    if (scrimElement && typeof scrimElement.animate === "function") {
      const scrimAnimation = scrimElement.animate(
        [{ opacity: SCRIM_PEAK_OPACITY }, { opacity: 0 }],
        {
          duration: PICTOGRAPH_ARRIVAL_LANDING_MS,
          easing: PICTOGRAPH_ARRIVAL_LANDING_EASING,
          fill: "forwards",
        }
      );
      activeAnimations.push(scrimAnimation);
    }

    try {
      await Promise.all(
        activeAnimations.map((animation) => animation.finished)
      );
    } catch {
      return;
    }

    if (request.requestId !== requestId || request.owner !== "stage") return;
    handOffToCell(requestId, true);
  }

  function beginHold(requestId: number) {
    if (request.requestId !== requestId || request.owner !== "stage") return;
    phase = "holding";
    motionProgress = reducedMotionEnabled ? null : 1;
    arrowOpacity = 1;

    if (isAudition) {
      onMotionComplete(requestId);
      return;
    }

    phaseTimer = setTimeout(
      () => void landInGrid(requestId),
      reducedMotionEnabled ? REDUCED_MOTION_HOLD_MS : FINISHED_HOLD_MS
    );
  }

  function animateProps(timestamp: number) {
    const requestId = activeRequestId;
    if (
      request.requestId !== requestId ||
      request.owner !== "stage" ||
      phase !== "moving"
    ) {
      return;
    }

    motionStartedAt ??= timestamp;
    const linearProgress = Math.min(
      1,
      (timestamp - motionStartedAt) / propMotionDurationMs
    );
    motionProgress = linearProgress;
    arrowOpacity = linearProgress;

    if (linearProgress >= 1) {
      animationFrame = null;
      motionProgress = 1;
      arrowOpacity = 1;
      beginHold(requestId);
      return;
    }

    animationFrame = requestAnimationFrame(animateProps);
  }

  function beginPropMotion(requestId: number) {
    if (request.requestId !== requestId || request.owner !== "stage") return;
    phase = "moving";
    motionStartedAt = null;
    motionProgress = 0;
    arrowOpacity = 0;
    animationFrame = requestAnimationFrame(animateProps);
  }

  function handleStageReady() {
    const requestId = request.requestId;
    if (requestId !== activeRequestId || request.owner !== "stage") return;

    clearPhaseTimer();
    if (isAudition) onReady(requestId, !reducedMotionEnabled);
    void enterStage(requestId);
  }

  function beginRequest(requestId: number) {
    clearActiveWork();
    activeRequestId = requestId;
    phase = "preparing";
    entranceComplete = false;
    motionProgress = reducedMotionEnabled ? null : 0;
    arrowOpacity = reducedMotionEnabled ? 1 : 0;
    lastObservedReducedMotion = reducedMotionEnabled;

    phaseTimer = setTimeout(() => {
      if (isAudition) {
        onComplete(requestId);
        return;
      }
      handOffToCell(requestId);
    }, PREPARE_TIMEOUT_MS);
  }

  $effect(() => {
    const requestId = request.requestId;
    const currentStep = step;
    if (request.owner !== "stage" || !currentStep) return;
    if (requestId === activeRequestId) return;
    beginRequest(requestId);
  });

  $effect(() => {
    const isReduced = reducedMotionEnabled;
    const becameReduced = isReduced && !lastObservedReducedMotion;
    lastObservedReducedMotion = isReduced;
    if (!becameReduced || request.owner !== "stage") return;
    if (phase === "entering" || phase === "moving" || phase === "landing") {
      clearActiveWork();
      motionProgress = null;
      arrowOpacity = 1;
      if (isAudition) {
        beginHold(request.requestId);
      } else {
        handOffToCell(request.requestId);
      }
    }
  });

  onMount(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      systemPrefersReducedMotion = event.matches;
    };
    systemPrefersReducedMotion = query.matches;
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  });

  onDestroy(clearActiveWork);
</script>

{#if step}
  <div
    class="arrival-overlay"
    data-arrival-request-id={request.requestId}
    data-arrival-intent={request.intent}
    data-arrival-phase={phase}
    data-prop-motion-duration-ms={propMotionDurationMs}
    data-motion-progress={motionProgress === null
      ? undefined
      : motionProgress.toFixed(4)}
    data-arrow-opacity={arrowOpacity.toFixed(4)}
    aria-hidden="true"
    out:fade={{ duration: reducedMotionEnabled ? 0 : DURATION.fast }}
  >
    <div
      class="arrival-scrim"
      class:entered={entranceComplete}
      bind:this={scrimElement}
    ></div>
    <div
      class="arrival-card"
      class:entered={entranceComplete}
      class:landing={phase === "landing" || phase === "handing-off"}
      bind:this={cardElement}
      data-arrival-card
    >
      {#key request.requestId}
        <PictographContainer
          pictographData={step}
          disableTransitions={true}
          {leftPropTypeOverride}
          {rightPropTypeOverride}
          {leftColorOverride}
          {rightColorOverride}
          {motionStartData}
          {motionProgress}
          {arrowOpacity}
          showTKA={true}
          stepNumberOverride={true}
          onReady={handleStageReady}
        />
      {/key}
    </div>
  </div>
{/if}

{#if !isAudition}
  <span class="sr-only" aria-live="polite" aria-atomic="true">
    Step {request.stepIndex + 1} added
  </span>
{/if}

<style>
  .arrival-overlay {
    position: absolute;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    pointer-events: none;
    overflow: hidden;
  }

  .arrival-scrim {
    position: absolute;
    inset: 0;
    opacity: 0;
    background: var(--theme-overlay-scrim, rgba(4, 4, 9, 0.76));
    -webkit-mask-image: radial-gradient(
      ellipse at center,
      rgba(0, 0, 0, 0.72) 0%,
      rgba(0, 0, 0, 0.9) 68%,
      #000 100%
    );
    mask-image: radial-gradient(
      ellipse at center,
      rgba(0, 0, 0, 0.72) 0%,
      rgba(0, 0, 0, 0.9) 68%,
      #000 100%
    );
  }

  .arrival-scrim.entered {
    opacity: 0.58;
  }

  .arrival-card {
    position: relative;
    z-index: 1;
    width: min(80cqw, 80cqh, 30rem);
    aspect-ratio: 1;
    overflow: hidden;
    transform: translate3d(0, 0, 0) scale(0.92);
    transform-origin: center;
    opacity: 0;
    background: var(--dm-pictograph-bg, #0a0a0f);
    box-shadow: 0 18px 55px rgba(0, 0, 0, 0.46);
    will-change: transform, opacity;
  }

  .arrival-card.entered {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }

  .arrival-card.landing {
    transform-origin: top left;
  }

  .arrival-card :global(.pictograph-container) {
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
  }

  @container (min-width: 1200px) and (min-height: 800px) {
    .arrival-card {
      width: min(76cqw, 78cqh, 40rem);
    }
  }
</style>
