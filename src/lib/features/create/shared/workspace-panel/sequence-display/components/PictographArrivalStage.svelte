<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { flushSync, onDestroy, onMount, untrack } from "svelte";
  import { opaqueFade } from "#lib/shared/transitions/motion.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    bootProfiler,
    isBootProfileVerbose,
  } from "#lib/shared/analytics/boot-profiler.js";
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
  import {
    shouldInterruptArrivalOnTap,
    type PictographArrivalPresentation,
  } from "../domain/pictograph-arrival-presentation";
  import type { PictographStageRequest } from "../state/step-grid-display-state.svelte";
  import type { GridJoin } from "@tka/tka-types";
  import { gridJoinCellResolver } from "@tka/render-core";
  import { portal } from "#lib/features/create/generate/components/modals/portal.js";
  import {
    takeArrivalOrigin,
    type ArrivalOrigin,
  } from "../services/arrival-origin";

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
  /** The tapped option growing into the stage: the emphasis beat, like the start morph. */
  const ORIGIN_FLIGHT_MS = DURATION.emphasis;

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
    gridJoin = null,
    presentation = "workspace",
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
    /** The workspace sequence's join, so the arriving step lands as drawn. */
    gridJoin?: GridJoin | null;
    /** Play inside the step grid, or over the whole screen (phone Construct). */
    presentation?: PictographArrivalPresentation;
  } = $props();

  // The stage is remounted for every request, so one request keeps the
  // presentation it started with even if the screen is rotated mid-flight.
  const stagePresentation = untrack(() => presentation);
  const playsOnScreen = stagePresentation === "screen";

  const withGridJoin = $derived(gridJoinCellResolver({ conjoined: gridJoin }));
  const rawStep = $derived(sequence.steps[request.stepIndex] ?? null);
  const step = $derived(rawStep && gridJoin ? withGridJoin(rawStep) : rawStep);
  const propMotionDurationMs = $derived(
    step
      ? getPictographArrivalPropMotionDurationMs(step)
      : PICTOGRAPH_ARRIVAL_PROP_MOTION_MIN_MS
  );
  const motionStartData = $derived.by(() => {
    const start =
      request.stepIndex > 0
        ? (sequence.steps[request.stepIndex - 1] ?? null)
        : (sequence.startPlacement ?? sequence.startingPlacement ?? null);
    return start && gridJoin ? withGridJoin(start) : start;
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
  /** The tapped option's picture, riding on the card while it flies in. */
  let originPicture: HTMLElement | null = null;
  let activeAnimations: Animation[] = [];
  let finishRequestSpan:
    | ((
        outcome?: "ok" | "error" | "cancelled",
        detail?: Record<string, string | number | boolean>
      ) => void)
    | null = null;
  let finishPhaseSpan:
    | ((
        outcome?: "ok" | "error" | "cancelled",
        detail?: Record<string, string | number | boolean>
      ) => void)
    | null = null;
  let measuredPhase: ArrivalPhase | null = null;
  let profileFrame: number | null = null;
  let profileStartedAt = 0;
  let previousFrameAt = 0;
  let maxFrameGapMs = 0;
  let delayedFrameCount = 0;

  function sampleFrame(timestamp: number) {
    if (timestamp - profileStartedAt > 10_000) {
      profileFrame = null;
      return;
    }
    if (previousFrameAt) {
      const gap = timestamp - previousFrameAt;
      maxFrameGapMs = Math.max(maxFrameGapMs, gap);
      if (gap > 50) delayedFrameCount++;
    }
    previousFrameAt = timestamp;
    profileFrame = requestAnimationFrame(sampleFrame);
  }

  function profilePhase(next: ArrivalPhase) {
    if (measuredPhase === next) return;
    finishPhaseSpan?.();
    measuredPhase = next;
    finishPhaseSpan = bootProfiler.startSpan(`construct:arrival:${next}`, {
      requestId: activeRequestId,
      intent: request.intent,
    });
  }

  function finishProfile(outcome: "ok" | "error" | "cancelled") {
    finishPhaseSpan?.(outcome);
    finishPhaseSpan = null;
    measuredPhase = null;
    if (profileFrame !== null) cancelAnimationFrame(profileFrame);
    profileFrame = null;
    previousFrameAt = 0;
    finishRequestSpan?.(outcome, {
      lastPhase: phase,
      maxFrameGapMs: Math.round(maxFrameGapMs),
      delayedFrameCount,
    });
    finishRequestSpan = null;
  }

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

  function dropOriginPicture() {
    originPicture?.remove();
    originPicture = null;
  }

  function clearActiveWork() {
    clearPhaseTimer();
    clearAnimationFrame();
    cancelActiveAnimations();
    dropOriginPicture();
    motionStartedAt = null;
  }

  /**
   * The card's settled box: where it sits once entered, ignoring the resting
   * scale its stylesheet holds it at before the entrance.
   */
  function settledCardRect(card: HTMLElement): ArrivalRect | null {
    const parent = card.offsetParent;
    if (!(parent instanceof HTMLElement)) return null;
    const parentBox = parent.getBoundingClientRect();
    return {
      left: parentBox.left + card.offsetLeft,
      top: parentBox.top + card.offsetTop,
      width: card.offsetWidth,
      height: card.offsetHeight,
    };
  }

  /**
   * Grow the card out of the tapped option: from that option's box to its own,
   * with the option's picture (finished pose and arrows) on top fading out to
   * reveal the start pose underneath. Returns null when there is no box to fly
   * between, and the caller enters the usual way.
   */
  function flyFromOrigin(
    card: HTMLElement,
    origin: ArrivalOrigin
  ): Animation[] | null {
    const settled = settledCardRect(card);
    const transform = settled
      ? calculatePictographArrivalTransform(settled, origin.rect)
      : null;
    if (!settled || !transform) return null;

    // The card scales about its centre, so travel centre to centre.
    const dx = transform.translateX + (origin.rect.width - settled.width) / 2;
    const dy = transform.translateY + (origin.rect.height - settled.height) / 2;
    const flight = card.animate(
      [
        {
          opacity: 1,
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(${transform.scaleX}, ${transform.scaleY})`,
          boxShadow: "0 0 0 rgba(0, 0, 0, 0)",
        },
        {
          opacity: 1,
          transform: "translate3d(0, 0, 0) scale(1, 1)",
          boxShadow: "0 18px 55px rgba(0, 0, 0, 0.46)",
        },
      ],
      {
        duration: ORIGIN_FLIGHT_MS,
        easing: PICTOGRAPH_ARRIVAL_LANDING_EASING,
        fill: "both",
      }
    );
    const animations = [flight];

    if (origin.picture && typeof origin.picture.animate === "function") {
      const picture = origin.picture;
      picture.classList.add("arrival-origin-picture");
      card.append(picture);
      originPicture = picture;
      animations.push(
        picture.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: ORIGIN_FLIGHT_MS,
          easing: PICTOGRAPH_ARRIVAL_LANDING_EASING,
          fill: "both",
        })
      );
    }
    return animations;
  }

  function handOffToCell(requestId: number, preserveLandedFrame = false) {
    if (request.requestId !== requestId || request.owner !== "stage") return;

    profilePhase("handing-off");
    flushSync(() => {
      phase = "handing-off";
      if (!preserveLandedFrame) entranceComplete = false;
      onBeginHandoff(requestId);
    });

    animationFrame = requestAnimationFrame(() => {
      if (!preserveLandedFrame) {
        animationFrame = null;
        finishProfile("ok");
        onComplete(requestId);
        return;
      }

      // The destination paints underneath the landed stage card for one full
      // frame. Removing the stage on the following frame prevents a blank
      // frame between the two renderers.
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        finishProfile("ok");
        onComplete(requestId);
      });
    });
  }

  async function enterStage(requestId: number) {
    if (request.requestId !== requestId || request.owner !== "stage") return;

    profilePhase("entering");
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
    // Taken even when unused, so a stale tap never reaches a later pick. Only
    // the whole-screen stage flies: inside the step grid the card is clipped
    // to the workspace, and the option it came from sits outside it.
    const origin = isAudition ? null : takeArrivalOrigin();
    const flight =
      origin &&
      playsOnScreen &&
      !reducedMotionEnabled &&
      card &&
      typeof card.animate === "function"
        ? flyFromOrigin(card, origin)
        : null;
    // The flight starts at the tapped card, so the dim starts with it.
    const scrimDelay =
      reducedMotionEnabled || flight ? 0 : SCRIM_ENTER_DELAY_MS;
    const entranceAnimations: Animation[] = flight ?? [];

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

    if (!flight && card && typeof card.animate === "function") {
      entranceAnimations.push(
        card.animate(
          reducedMotionEnabled
            ? // Fade only, at the settled size, so nothing jumps when the
              // entered style takes over.
              [
                { opacity: 0, transform: "translate3d(0, 0, 0) scale(1)" },
                { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
              ]
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

    if (!reducedMotionEnabled && !flight) {
      // The start placement only needs a quick recognition beat. Prop motion
      // begins while the card and background finish settling, so the arrival
      // never feels like it has paused after popping forward. A card flying in
      // from its option plays once it lands: the start pose is still fading in
      // until then.
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
    dropOriginPicture();

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

    profilePhase("landing");
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
    profilePhase("holding");
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
    profilePhase("moving");
    phase = "moving";
    motionStartedAt = null;
    motionProgress = 0;
    arrowOpacity = 0;
    animationFrame = requestAnimationFrame(animateProps);
  }

  function interruptOnTap() {
    const requestId = request.requestId;
    if (
      requestId !== activeRequestId ||
      request.owner !== "stage" ||
      !shouldInterruptArrivalOnTap({
        presentation: stagePresentation,
        intent: request.intent,
        phase,
      })
    ) {
      return;
    }

    const preparing = phase === "preparing";
    clearActiveWork();
    if (preparing) {
      handOffToCell(requestId);
      return;
    }

    // A cancelled entrance falls back to the card's hidden resting style, so
    // settle it at full size first; the landing starts from what was on screen.
    flushSync(() => {
      entranceComplete = true;
    });
    void landInGrid(requestId);
  }

  function attachToScreen(node: HTMLElement) {
    return portal(node).destroy;
  }

  function handleStageReady() {
    const requestId = request.requestId;
    if (requestId !== activeRequestId || request.owner !== "stage") return;

    clearPhaseTimer();
    if (isAudition) onReady(requestId, !reducedMotionEnabled);
    void enterStage(requestId);
  }

  function beginRequest(requestId: number) {
    finishProfile("cancelled");
    clearActiveWork();
    activeRequestId = requestId;
    phase = "preparing";
    entranceComplete = false;
    motionProgress = reducedMotionEnabled ? null : 0;
    arrowOpacity = reducedMotionEnabled ? 1 : 0;
    lastObservedReducedMotion = reducedMotionEnabled;
    maxFrameGapMs = 0;
    delayedFrameCount = 0;
    profileStartedAt = performance.now();
    finishRequestSpan = bootProfiler.startSpan("construct:arrival", {
      requestId,
      stepIndex: request.stepIndex,
      intent: request.intent,
      viewerCanvasMounted: Boolean(
        document.querySelector(".viewer-demo canvas")
      ),
      viewerDialogOpen: Boolean(
        document.querySelector("dialog.composer-3d-modal[open]")
      ),
    });
    profilePhase("preparing");
    if (isBootProfileVerbose())
      profileFrame = requestAnimationFrame(sampleFrame);

    phaseTimer = setTimeout(() => {
      if (isAudition) {
        finishProfile("error");
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
    // Capture phase: the tap still reaches the option or cell under it.
    if (playsOnScreen) {
      window.addEventListener("pointerdown", interruptOnTap, { capture: true });
    }
    return () => {
      query.removeEventListener("change", handleChange);
      window.removeEventListener("pointerdown", interruptOnTap, {
        capture: true,
      });
    };
  });

  onDestroy(() => {
    finishProfile("cancelled");
    clearActiveWork();
  });
</script>

{#if step}
  <div
    class="arrival-overlay"
    class:on-screen={playsOnScreen}
    {@attach playsOnScreen && attachToScreen}
    data-arrival-presentation={stagePresentation}
    data-arrival-request-id={request.requestId}
    data-arrival-intent={request.intent}
    data-arrival-phase={phase}
    data-prop-motion-duration-ms={propMotionDurationMs}
    data-motion-progress={motionProgress === null
      ? undefined
      : motionProgress.toFixed(4)}
    data-arrow-opacity={arrowOpacity.toFixed(4)}
    aria-hidden="true"
    out:opaqueFade={{ duration: reducedMotionEnabled ? 0 : DURATION.fast }}
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
    {t("create_step_added", { number: request.stepIndex + 1 })}
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

  /* The tapped option's picture, over the start pose while the card flies. */
  .arrival-card :global(.arrival-origin-picture) {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  }

  .arrival-card :global(.pictograph-container) {
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
  }

  /* Phone Construct: the step plays over the whole screen, not the short
     workspace band, then lands in its cell. The overlay lives under <body>,
     so the viewport sizes the card. */
  .arrival-overlay.on-screen {
    position: fixed;
    z-index: var(--z-overlay, 500);
  }

  .arrival-overlay.on-screen .arrival-card {
    width: min(88vw, 62dvh, 30rem);
  }

  @container (min-width: 1200px) and (min-height: 800px) {
    .arrival-card {
      width: min(76cqw, 78cqh, 40rem);
    }
  }
</style>
