/**
 * Step Grid Display State Factory
 *
 * Svelte 5 runes-based state management for step grid display animations.
 * Handles entrance/exit animations, sequential reveals, and animation coordination.
 * This is for DISPLAY animations (how steps appear in grid), NOT playback animations.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type {
  AnimationMode,
  AnimationTiming,
} from "../domain/models/step-grid-display-models";
import { DEFAULT_ANIMATION_TIMING } from "../domain/models/step-grid-display-models";

export interface PictographArrivalRequest {
  intent: "commit";
  stepIndex: number;
  requestId: number;
  owner: "stage" | "cell";
  phase: "preview" | "landing";
}

export interface PictographAuditionRequest {
  intent: "audition";
  stepIndex: number;
  requestId: number;
  owner: "stage";
  phase: "preview";
}

export type PictographStageRequest =
  | PictographArrivalRequest
  | PictographAuditionRequest;

/**
 * Global flag to indicate a generation is pending.
 * This is set when the prepare-sequence-animation event fires, BEFORE the StepGrid
 * component might be mounted (since the workspace transitions from empty to visible).
 * Used to distinguish between:
 * - First generation: flag is true, should animate
 * - Loading saved sequence: flag is false, should NOT animate
 */
let pendingGenerationAnimation = false;

export function setPendingGenerationAnimation(pending: boolean) {
  pendingGenerationAnimation = pending;
}

export function isPendingGenerationAnimation(): boolean {
  return pendingGenerationAnimation;
}

/**
 * How long past its scheduled band a cell may hold the reveal open waiting for
 * its pictograph to finish painting. Beyond this the wave is treated as done
 * whether or not every cell reported in, so a single stuck prepare cannot leave
 * the grid hidden.
 */
const MAX_CONTENT_GATE_MS = 2000;

export function createStepGridDisplayState() {
  // Animation state
  let newlyAddedStepIndex = $state<number | null>(null);
  let shouldAnimateAllSteps = $state<boolean>(false);
  let shouldAnimateStartPlacement = $state<boolean>(false);
  let isSequentialMode = $state<boolean>(true); // Default to sequential
  let stepsToAnimate = $state<Set<number>>(new Set());
  let isPreparingFullAnimation = $state<boolean>(false);
  let isWaitingForSequentialAnimation = $state<boolean>(false);
  let isClearingForGeneration = $state<boolean>(false);

  // Construct gives one committed step the workspace stage, then hands the
  // finished pictograph to its grid cell. Keeping both owners in one request
  // guarantees that only one of them is visible at a time.
  let arrivalRequest = $state<PictographArrivalRequest | null>(null);
  let nextArrivalRequestId = 0;

  // Animation generation counter - used to cancel previous animations when a new one starts
  // Each new animation increments this, and running animations check if they're still current
  let animationGeneration = 0;

  // Animation epoch - increments each time a NEW sequence animation starts
  // This is exposed to components so they can reset hasAnimated when a new epoch begins
  // (even if beat.id stays the same across generations)
  let animationEpoch = $state(0);

  // Animation timing configuration
  let animationTiming = $state<AnimationTiming>({
    ...DEFAULT_ANIMATION_TIMING,
  });

  // When the current reveal wave began, in the performance.now() clock. Cells
  // schedule themselves against it: a cell on band 3 is due at
  // waveStartedAt + 3 * waveBandDelay, whenever it happens to become ready.
  let waveStartedAt = $state(0);
  // When the last cell scheduled so far will have finished landing. Content
  // gating can push this past the nominal end of the wave, so cleanup waits on
  // it rather than on arithmetic done before anything rendered.
  let revealCompletesAt = 0;
  let revealDeadline = 0;

  const wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  /**
   * Set animation mode (sequential vs all-at-once)
   */
  function setAnimationMode(mode: AnimationMode) {
    isSequentialMode = mode === "sequential";
  }

  /**
   * Prepare for full sequence animation
   * Called BEFORE new sequence is set
   */
  function prepareSequenceAnimation(_stepCount: number, mode: AnimationMode) {
    arrivalRequest = null;
    // Increment epoch to signal all StepCells to reset their hasAnimated state
    // This is critical when beat IDs are reused across generations (e.g., beat-5, beat-6)
    animationEpoch++;

    // Set animation state IMMEDIATELY so steps render invisible
    isPreparingFullAnimation = true;
    shouldAnimateStartPlacement = true;
    newlyAddedStepIndex = null;
    // The previous wave's clock is dead the moment a new one is being set up.
    // Leaving it running let a cell that reported ready during the gap schedule
    // itself against the OLD wave start, which is already in the past — so it
    // landed instantly instead of taking its place in the new wave.
    waveStartedAt = 0;

    // Reassigned, never cleared in place. A plain Set is not deeply reactive, so
    // `.clear()` empties it without telling anyone — which meant a reveal
    // interrupted by a second Generate never saw its cells leave the animating
    // set, so their `.animate` class never came off, so the CSS animation never
    // restarted and the incoming sequence simply appeared.
    stepsToAnimate = new Set();

    if (mode === "sequential") {
      // Sequential mode: Start with empty stepsToAnimate
      shouldAnimateAllSteps = false;
      isWaitingForSequentialAnimation = true;
    } else {
      // All at once mode: All steps animate immediately
      shouldAnimateAllSteps = true;
      isWaitingForSequentialAnimation = false;
    }
  }

  /**
   * Prepare for cycle extension animation (only new beats from offset onward).
   * Existing beats stay visible and untouched.
   */
  function prepareCycleExtensionAnimation(
    totalBeatCount: number,
    existingBeatCount: number
  ) {
    arrivalRequest = null;
    // Increment epoch so new StepCells know to animate
    animationEpoch++;

    // DO NOT set isPreparingFullAnimation - existing beats must stay visible
    isPreparingFullAnimation = false;
    shouldAnimateStartPlacement = false;
    shouldAnimateAllSteps = false;
    newlyAddedStepIndex = null;
    // Same reason as prepareSequenceAnimation: the old wave's clock must not
    // outlive it, or a cell reporting ready in the gap schedules against a t0
    // that is already in the past and lands with no delay at all.
    waveStartedAt = 0;

    // Mark only the new beats (from existingBeatCount onward) as waiting.
    // Pre-populate existing beats so they're not hidden.
    const carried = new Set<number>();
    for (let i = 0; i < existingBeatCount; i++) {
      carried.add(i);
    }
    stepsToAnimate = carried;

    isWaitingForSequentialAnimation = true;
  }

  /**
   * Reveal the sequence as one diagonal wave.
   *
   * Every step is marked to animate in a single tick; the spacing between them
   * is CSS `animation-delay`, keyed off each cell's `--wave-band`. That matters
   * because generation blocks the main thread for hundreds of milliseconds
   * while the pictographs render — a JS-timer stagger fires late and clumps
   * under that load, which is what made the reveal read as cells popping in
   * rather than a wave crossing the grid. The compositor honours the delays
   * regardless of how busy the main thread is.
   *
   * Resolves when the last cell has landed, so callers can await the reveal.
   *
   * `maxWaveBand` is how many bands the wave actually spans. Callers that know
   * the grid's column count should pass it; the step count is a safe upper
   * bound otherwise, since a wave never has more bands than it has steps except
   * in a single-column grid.
   */
  async function triggerSequentialAnimation(
    steps: readonly StepData[],
    _dispatchEvent: (event: CustomEvent) => void,
    startFromIndex: number = 0,
    maxWaveBand?: number
  ): Promise<void> {
    // Increment generation to cancel any previous running animation
    const thisGeneration = ++animationGeneration;
    const stepCount = steps.length;

    const next = new Set(stepsToAnimate);
    for (let i = startFromIndex; i < stepCount; i++) {
      next.add(i);
    }
    stepsToAnimate = next; // Trigger reactivity

    const bands = Math.max(0, maxWaveBand ?? stepCount);
    const nominalReveal =
      bands * animationTiming.waveBandDelay + animationTiming.entranceDuration;

    waveStartedAt = performance.now();
    revealCompletesAt = waveStartedAt + nominalReveal;
    revealDeadline = revealCompletesAt + MAX_CONTENT_GATE_MS;

    // Cells report the delay they actually took, so a pictograph that finished
    // late pushes this out. Re-check rather than sleeping once: the wave is not
    // over until the last cell that joined it has landed.
    for (;;) {
      const remaining = revealCompletesAt - performance.now();
      if (remaining <= 0) break;
      await wait(remaining);
      if (thisGeneration !== animationGeneration) return;
    }

    await wait(animationTiming.cleanupDelay);

    // Only cleanup if this animation is still current
    if (thisGeneration === animationGeneration) {
      cleanupAnimation();
    }
  }

  /**
   * A cell has scheduled its entrance `delayMs` from now. Holds the wave open
   * long enough for it to finish, up to the content-gate deadline.
   */
  function noteRevealScheduled(delayMs: number) {
    if (waveStartedAt === 0) return;
    const landsAt =
      performance.now() + delayMs + animationTiming.entranceDuration;
    revealCompletesAt = Math.min(
      Math.max(revealCompletesAt, landsAt),
      revealDeadline
    );
  }

  /**
   * Trigger all-at-once animation
   */
  function triggerAllAtOnceAnimation() {
    // Increment generation to cancel any previous running animation
    const thisGeneration = ++animationGeneration;

    // All steps already set to animate via shouldAnimateAllSteps
    // Just clean up after animation duration
    setTimeout(() => {
      // Only cleanup if this animation is still current
      if (thisGeneration === animationGeneration) {
        cleanupAnimation();
      }
    }, animationTiming.cleanupDelay);
  }

  /**
   * Handle single beat addition (Construct mode)
   */
  function handleSingleBeatAddition(
    stepIndex: number,
    shouldStageArrival: boolean = false
  ) {
    isPreparingFullAnimation = false;
    newlyAddedStepIndex = stepIndex;
    shouldAnimateAllSteps = false;
    shouldAnimateStartPlacement = false;
    stepsToAnimate = new Set();
    arrivalRequest = shouldStageArrival
      ? {
          intent: "commit",
          stepIndex,
          requestId: ++nextArrivalRequestId,
          owner: "stage",
          phase: "preview",
        }
      : null;

    // Clear after animation completes
    setTimeout(() => {
      newlyAddedStepIndex = null;
    }, animationTiming.entranceDuration);
  }

  function beginArrivalLanding(requestId: number) {
    if (!arrivalRequest || arrivalRequest.requestId !== requestId) return;
    arrivalRequest = { ...arrivalRequest, phase: "landing" };
  }

  function beginArrivalHandoff(requestId: number) {
    if (!arrivalRequest || arrivalRequest.requestId !== requestId) return;
    arrivalRequest = { ...arrivalRequest, owner: "cell" };
  }

  function completeArrival(requestId: number) {
    if (!arrivalRequest || arrivalRequest.requestId !== requestId) return;
    arrivalRequest = null;
  }

  function cancelArrival() {
    arrivalRequest = null;
  }

  /**
   * Handle sequence clearing animation
   */
  function handleClearSequence() {
    arrivalRequest = null;
    isClearingForGeneration = true;

    // Reset after animation completes
    setTimeout(() => {
      isClearingForGeneration = false;
    }, animationTiming.clearDuration);
  }

  /**
   * Clean up animation state
   */
  function cleanupAnimation() {
    isPreparingFullAnimation = false;
    isWaitingForSequentialAnimation = false;
    shouldAnimateStartPlacement = false;
    shouldAnimateAllSteps = false;
    stepsToAnimate = new Set();
    arrivalRequest = null;
    waveStartedAt = 0;
  }

  /**
   * Check if a beat should animate
   */
  function shouldBeatAnimate(stepIndex: number): boolean {
    return (
      shouldAnimateAllSteps ||
      stepIndex === newlyAddedStepIndex ||
      stepsToAnimate.has(stepIndex)
    );
  }

  /**
   * Check if a beat should be hidden (sequential mode waiting)
   */
  function shouldBeatBeHidden(stepIndex: number): boolean {
    if (!isWaitingForSequentialAnimation) return false;
    // If this step has already been revealed, don't hide it
    if (stepsToAnimate.has(stepIndex)) return false;
    return true;
  }

  /**
   * Update animation timing configuration
   */
  function setAnimationTiming(timing: Partial<AnimationTiming>) {
    animationTiming = { ...animationTiming, ...timing };
  }

  return {
    // Getters for reactive state
    get newlyAddedStepIndex() {
      return newlyAddedStepIndex;
    },
    get shouldAnimateAllSteps() {
      return shouldAnimateAllSteps;
    },
    get shouldAnimateStartPlacement() {
      return shouldAnimateStartPlacement;
    },
    get isSequentialMode() {
      return isSequentialMode;
    },
    get stepsToAnimate() {
      return stepsToAnimate;
    },
    get isPreparingFullAnimation() {
      return isPreparingFullAnimation;
    },
    get isWaitingForSequentialAnimation() {
      return isWaitingForSequentialAnimation;
    },
    /**
     * True while a whole-sequence wave is in flight. Cells consult this before
     * taking a wave delay so a single step committed in Construct still lands
     * immediately instead of waiting out the band it happens to sit on.
     */
    get isCascadeReveal() {
      return isWaitingForSequentialAnimation;
    },
    get isClearingForGeneration() {
      return isClearingForGeneration;
    },
    get animationTiming() {
      return animationTiming;
    },
    /**
     * performance.now() timestamp the current reveal wave started at, or 0 when
     * no wave is running. Cells schedule their own band against it.
     */
    get waveStartedAt() {
      return waveStartedAt;
    },
    get animationEpoch() {
      return animationEpoch;
    },
    get arrivalRequest() {
      return arrivalRequest;
    },

    // Actions
    setAnimationMode,
    prepareSequenceAnimation,
    prepareCycleExtensionAnimation,
    triggerSequentialAnimation,
    noteRevealScheduled,
    triggerAllAtOnceAnimation,
    handleSingleBeatAddition,
    beginArrivalLanding,
    beginArrivalHandoff,
    completeArrival,
    cancelArrival,
    handleClearSequence,
    cleanupAnimation,
    shouldBeatAnimate,
    shouldBeatBeHidden,
    setAnimationTiming,
  };
}

export type StepGridDisplayState = ReturnType<
  typeof createStepGridDisplayState
>;
