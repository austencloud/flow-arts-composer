<!--
  CreateTutorialWizard - Post-onboarding tutorial for learning the Create workflow

  Teaches new users the core build loop by embedding live Create module components.
  Steps auto-advance when the user completes each action (no Continue button).
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onDestroy, onMount } from "svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { FocusTrap } from "$lib/shared/foundation/ui/drawer/focus-trap";
  import {
    logOnboardingTutorialSkipped,
    logOnboardingTutorialStepCompleted,
    logOnboardingTutorialStepViewed,
    type OnboardingEventSource,
  } from "$lib/shared/analytics/services/onboarding-events";
  import {
    createTutorialState,
    type CreateTutorialStep,
  } from "../../state/create-tutorial-state.svelte";

  // Step components (will be created in Tasks 4-8)
  import PickStartPlacementStep from "./steps/PickStartPlacementStep.svelte";
  import AddStepTutorialStep from "./steps/AddStepTutorialStep.svelte";
  import PlaySequenceStep from "./steps/PlaySequenceStep.svelte";
  import ReadyStep from "./steps/ReadyStep.svelte";

  interface Props {
    onComplete: () => void;
    onSkip: () => void;
    source?: OnboardingEventSource;
  }

  const { onComplete, onSkip, source = "app_entry" }: Props = $props();

  let animateIn = $state(false);
  let hapticService: HapticFeedback | null = null;
  let wizardEl = $state<HTMLDivElement | null>(null);
  const transitionTimers = new Set<ReturnType<typeof setTimeout>>();
  const animationFrames = new Set<number>();

  // Step exit duration — the outgoing card lifts + fades before we swap.
  // Kept in sync with the .tutorial-step transition below.
  const STEP_EXIT_MS = 230;

  function scheduleFrame(callback: () => void): void {
    const frame = requestAnimationFrame(() => {
      animationFrames.delete(frame);
      callback();
    });
    animationFrames.add(frame);
  }

  function scheduleTransition(callback: () => void): void {
    const timer = setTimeout(() => {
      transitionTimers.delete(timer);
      callback();
    }, STEP_EXIT_MS);
    transitionTimers.add(timer);
  }

  // Trap focus inside the wizard while it's open: focus moves to the wizard
  // container on open, Tab is trapped within, everything else (MainInterface
  // behind it) goes inert, and focus returns to the trigger on close. Empty
  // inertExclusions — this is a full-page blocking takeover, not a panel
  // beside persistent chrome, so nothing behind it should stay tabbable.
  // Matches ErrorModal's top-level-modal wiring.
  const focusTrap = new FocusTrap({
    focusContainerOnInitial: true,
    inertExclusions: [],
  });

  $effect(() => {
    if (!wizardEl) return;
    focusTrap.activate(wizardEl);
    return () => focusTrap.deactivate();
  });

  const STEP_ICONS: Record<CreateTutorialStep, string> = {
    "pick-start": "fa-crosshairs",
    "add-step": "fa-plus",
    "play-sequence": "fa-play",
    ready: "fa-rocket",
  };

  const STEPS: CreateTutorialStep[] = [
    "pick-start",
    "add-step",
    "play-sequence",
    "ready",
  ];
  const viewedSteps = new Set<CreateTutorialStep>();

  $effect(() => {
    const step = createTutorialState.currentStep;
    if (viewedSteps.has(step)) return;
    viewedSteps.add(step);
    logOnboardingTutorialStepViewed({
      source,
      step,
      step_index: createTutorialState.currentStepIndex,
      total_steps: STEPS.length,
    });
  });

  onMount(() => {
    try {
      hapticService = getHapticFeedback();
    } catch {
      // Haptics optional
    }

    scheduleFrame(() => {
      animateIn = true;
    });
  });

  onDestroy(() => {
    transitionTimers.forEach((timer) => clearTimeout(timer));
    animationFrames.forEach((frame) => cancelAnimationFrame(frame));
    transitionTimers.clear();
    animationFrames.clear();
  });

  // Carve-out (crossfade-primitive.md keep-separate): this is NOT routed
  // through the shared <Crossfade> primitive. The entrance here is a
  // translateY + scale SPRING (cubic-bezier overshoot, see
  // `.animate-in :global(.tutorial-step)` below), driven by toggling the
  // `animate-in` class on a timer. Crossfade's layers only support a plain
  // opacity `fade` — swapping to it would drop the spring/scale entrance
  // entirely, which is a feel change the P3 finding explicitly says not to
  // force. Evaluated 2026-07-19 per the onboarding-accessibility spec.
  function prefersReducedMotion(): boolean {
    return (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    );
  }

  // Play the outgoing card's exit, run `swap`, then spring the new card in.
  function transitionStep(swap: () => void) {
    if (prefersReducedMotion()) {
      swap();
      animateIn = true;
      return;
    }
    animateIn = false;
    scheduleTransition(() => {
      swap();
      scheduleFrame(() => {
        animateIn = true;
      });
    });
  }

  function handleAdvance() {
    hapticService?.trigger("selection");
    logOnboardingTutorialStepCompleted({
      source,
      step: createTutorialState.currentStep,
      step_index: createTutorialState.currentStepIndex,
      total_steps: STEPS.length,
    });

    if (createTutorialState.currentStep === "ready") {
      // Last step - exit the card, then complete the tutorial.
      if (prefersReducedMotion()) {
        onComplete();
        return;
      }
      animateIn = false;
      scheduleTransition(onComplete);
      return;
    }

    transitionStep(() => createTutorialState.advance());
  }

  function handleBack() {
    if (createTutorialState.currentStepIndex === 0) return;
    hapticService?.trigger("selection");

    // On the add-step step with steps already picked, undo the last step
    // instead of leaving the step entirely
    if (
      createTutorialState.currentStep === "add-step" &&
      createTutorialState.steps.length > 0
    ) {
      createTutorialState.removeLastStep();
      return;
    }

    transitionStep(() => createTutorialState.goBack());
  }

  function handleDotClick(index: number) {
    if (index >= createTutorialState.currentStepIndex) return;
    hapticService?.trigger("selection");
    transitionStep(() => createTutorialState.goToStep(index));
  }

  function handleSkip() {
    hapticService?.trigger("selection");
    logOnboardingTutorialSkipped({
      source,
      step: createTutorialState.currentStep,
      step_index: createTutorialState.currentStepIndex,
      total_steps: STEPS.length,
    });
    createTutorialState.reset();
    onSkip();
  }

  // Dismiss like a modal: clicking the backdrop (dark area around the card) or
  // pressing Escape closes the tutorial — same outcome as Skip.
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      handleSkip();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="create-tutorial-wizard"
  class:animate-in={animateIn}
  bind:this={wizardEl}
  role="dialog"
  aria-modal="true"
  aria-labelledby="tutorial-step-title"
  tabindex="-1"
>
  <!-- Click-out backdrop: a click on the dark area around the card dismisses the
       tutorial (same as Skip). It sits behind the content; the card and the
       fixed controls are layered above it so their own clicks aren't swallowed.
       Matches the Drawer primitive's backdrop pattern (aria-hidden + window
       keydown handles keyboard dismissal). -->
  <div class="tutorial-backdrop" onclick={handleSkip} aria-hidden="true"></div>

  <!-- Progress bar -->
  <div class="progress-bar">
    <div
      class="progress-fill"
      style="width: {createTutorialState.progress}%"
    ></div>
  </div>

  <!-- Navigation buttons -->
  {#if createTutorialState.currentStepIndex > 0}
    <button class="back-button" onclick={handleBack}>
      <i class="fas fa-arrow-left" aria-hidden="true"></i> Back
    </button>
  {/if}
  <button class="skip-button" onclick={handleSkip}>Skip tutorial</button>

  <!-- Step content. aria-live announces each step swap (title + body) to
       screen readers without moving focus, per the tours' announcement
       convention (CreateTutorialWizard / GeneratePanelTour / StepEditorTour). -->
  <div class="step-container" aria-live="polite">
    {#if createTutorialState.currentStep === "pick-start"}
      <PickStartPlacementStep onAdvance={handleAdvance} />
    {:else if createTutorialState.currentStep === "add-step"}
      <AddStepTutorialStep onAdvance={handleAdvance} />
    {:else if createTutorialState.currentStep === "play-sequence"}
      <PlaySequenceStep onAdvance={handleAdvance} />
    {:else if createTutorialState.currentStep === "ready"}
      <ReadyStep onAdvance={handleAdvance} />
    {/if}
  </div>

  <!-- Step dots with icons -->
  <div class="step-dots">
    {#each STEPS as step, i}
      {#if i < createTutorialState.currentStepIndex}
        <button
          class="dot completed"
          aria-label="Go back to step {i + 1}: {step}"
          onclick={() => handleDotClick(i)}
        >
          <i class="fas {STEP_ICONS[step]}" aria-hidden="true"></i>
        </button>
      {:else}
        <!-- role="img": a plain div has an implicit "generic" role, which
             doesn't support naming — aria-label needs a nameable role
             (axe aria-prohibited-attr). This dot is a graphical status
             indicator (icon + label), same pattern as an icon-only image. -->
        <div
          class="dot"
          class:active={i === createTutorialState.currentStepIndex}
          role="img"
          aria-label="Step {i + 1}: {step}"
        >
          <i class="fas {STEP_ICONS[step]}" aria-hidden="true"></i>
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .create-tutorial-wizard {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    z-index: var(--z-priority);
    overflow-y: auto;
  }

  /* Programmatic focus target (tabindex=-1) — the wizard container is the
     dialog root, not an interactive control, so suppress the focus ring the
     global `:focus-visible` rule would otherwise draw around the whole
     overlay. Matches Drawer.svelte / TutorialPrompt.svelte. */
  .create-tutorial-wizard:focus,
  .create-tutorial-wizard:focus-visible {
    outline: none;
  }

  /* Transparent click-catcher for the dark area around the card. The visible
     tint comes from the wizard's own background above; this layer just turns a
     click anywhere outside the card into a dismiss. Sits behind everything
     (z-index 0); the card + controls are raised above it. */
  .tutorial-backdrop {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  /* Progress bar */
  .progress-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent-strong, #8b5cf6);
    transition: width var(--duration-emphasis, 0.6s) ease;
  }

  /* Back button */
  .back-button {
    position: fixed;
    top: 16px;
    left: 16px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 0.875rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all var(--duration-normal, 200ms) var(--ease-out);
  }

  .back-button:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  /* Skip button */
  .skip-button {
    position: fixed;
    top: 16px;
    right: 16px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 0.875rem;
    cursor: pointer;
    transition: all var(--duration-normal, 200ms) var(--ease-out);
  }

  .skip-button:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  /* Step container */
  .step-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 1100px;
    padding: 0 16px 90px;
    /* Raise the card above the click-out backdrop so clicks on it aren't
       swallowed (a positioned z-index is required — a static element paints
       below the absolutely-positioned backdrop). */
    position: relative;
    z-index: 1;
  }

  /* Header wrapper — column on desktop, one compact line on mobile (see media query) */
  .create-tutorial-wizard :global(.step-header) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
  }

  /* Step transition: outgoing card lifts + fades, incoming springs up into place. */
  .create-tutorial-wizard :global(.tutorial-step) {
    opacity: 0;
    transform: translateY(26px) scale(0.965);
    transition:
      opacity 240ms ease,
      transform 440ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .create-tutorial-wizard.animate-in :global(.tutorial-step) {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  /* Step dots */
  .step-dots {
    position: fixed;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 12px;
  }

  .dot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 0.9rem;
    transition: all var(--duration-normal, 200ms) var(--ease-out);
  }

  .dot.active {
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 30%,
      transparent
    );
    border-color: var(--theme-accent-strong, #8b5cf6);
    color: var(--theme-accent-strong, #8b5cf6);
    transform: scale(1.1);
  }

  button.dot.completed {
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    border-color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    cursor: pointer;
    padding: 0;
  }

  button.dot.completed:hover {
    background: var(--theme-hover, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-accent-strong, #8b5cf6);
    color: var(--theme-accent-strong, #8b5cf6);
    transform: scale(1.1);
  }

  /* Mobile */
  @media (max-width: 480px) {
    .back-button {
      top: 12px;
      left: 12px;
      padding: 6px 12px;
      font-size: 0.8125rem;
    }

    .skip-button {
      top: 12px;
      right: 12px;
      padding: 6px 12px;
      font-size: 0.8125rem;
    }

    .step-dots {
      bottom: 24px;
      gap: 10px;
    }

    .dot {
      width: 36px;
      height: 36px;
      font-size: 0.8rem;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .progress-fill {
      transition: none;
    }

    .create-tutorial-wizard :global(.tutorial-step) {
      transition: none;
      opacity: 1;
      transform: none;
    }

    .dot,
    .skip-button,
    .back-button,
    button.dot.completed {
      transition: none;
    }
  }

  /* ── Mobile / small-tablet: fullscreen edge-to-edge ── */
  @media (max-width: 900px) {
    .step-container {
      padding: 0;
      max-width: none;
      align-items: stretch;
    }

    /* Strip card chrome for every step (0,2,0) > each step's own rule (0,1,0) */
    .create-tutorial-wizard :global(.tutorial-step) {
      max-width: none;
      width: 100%;
      border: none;
      border-radius: 0;
      min-height: 100dvh;
      box-sizing: border-box;
      padding-top: 56px; /* clear fixed Back/Skip buttons */
      padding-bottom: 88px; /* clear fixed step-dots */
      padding-left: max(8px, env(safe-area-inset-left));
      padding-right: max(8px, env(safe-area-inset-right));
    }

    /* Free the second axis so the device-aware fitter grows tiles both ways.
       (Ready's accordion is intentionally NOT filled — it stays content-sized.) */
    .create-tutorial-wizard :global(.picker-container),
    .create-tutorial-wizard :global(.viewer-container) {
      height: auto;
      flex: 1;
      min-height: 0;
    }
  }
</style>
