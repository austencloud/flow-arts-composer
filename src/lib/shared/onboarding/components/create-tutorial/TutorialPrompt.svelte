<!--
  TutorialPrompt - Opt-in card shown after FirstRunWizard

  Asks the user if they want a guided tour of the builder.
  Accept starts guidance beside the real Construct controls.
  Skip goes straight to the main app.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { FocusTrap } from "$lib/shared/foundation/ui/drawer/focus-trap";

  interface Props {
    onAccept: () => void;
    onSkip: () => void;
  }

  const { onAccept, onSkip }: Props = $props();

  let animateIn = $state(false);
  let hapticService: HapticFeedback | null = null;
  let cardEl = $state<HTMLDivElement | null>(null);

  onMount(() => {
    try {
      hapticService = getHapticFeedback();
    } catch {
      // Optional service
    }
    requestAnimationFrame(() => {
      animateIn = true;
    });
  });

  // Trap focus inside the prompt while it's open: focus moves to the card on
  // open (same target the old manual `cardEl?.focus()` used), Tab is trapped
  // within, everything else goes inert, and focus returns to the trigger on
  // close. Matches ErrorModal's top-level-modal wiring (empty inertExclusions
  // — this is a full blocking prompt, not a panel beside persistent chrome).
  const focusTrap = new FocusTrap({
    focusContainerOnInitial: true,
    inertExclusions: [],
  });

  $effect(() => {
    if (!cardEl) return;
    focusTrap.activate(cardEl);
    return () => focusTrap.deactivate();
  });

  function handleAccept() {
    hapticService?.trigger("selection");
    onAccept();
  }

  function handleSkip() {
    hapticService?.trigger("selection");
    onSkip();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      handleSkip();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="tutorial-prompt-backdrop" class:animate-in={animateIn}>
  <div
    class="prompt-card"
    bind:this={cardEl}
    role="dialog"
    aria-modal="true"
    aria-labelledby="tutorial-prompt-title"
    tabindex="-1"
  >
    <div class="icon-circle">
      <i class="fas fa-compass" aria-hidden="true"></i>
    </div>

    <h2 id="tutorial-prompt-title" class="prompt-title">
      Try the Construct guide?
    </h2>
    <p class="prompt-body">
      Choose a start placement, add one pictograph, then play the sequence.
    </p>

    <div class="prompt-actions">
      <button class="accept-button" onclick={handleAccept}>
        Start guide
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </button>
      <!-- The presenter's way past an unsolicited overlay. This prompt is the
           FIRST thing a fresh browser profile sees, and its backdrop makes every
           annotated control fail the hit-test that gates a press — so an
           un-dismissable prompt is a presenter that stands in front of a modal
           all night. Skip, never accept: a guided tutorial is not the tour. -->
      <button
        class="skip-button"
        data-ghost="safe"
        data-ghost-kind="dismiss"
        data-ghost-label="Skip for now"
        onclick={handleSkip}
      >
        Skip for now
      </button>
    </div>
  </div>
</div>

<style>
  .tutorial-prompt-backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    z-index: var(--z-priority);
    padding: 24px;
  }

  .prompt-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    max-width: 380px;
    width: 100%;
    padding: 36px 28px 28px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-radius: 20px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    text-align: center;
    opacity: 0;
    transform: translateY(16px) scale(0.97);
    transition:
      opacity var(--duration-dramatic, 350ms) var(--ease-out),
      transform var(--duration-dramatic, 350ms) var(--ease-out);
  }

  .animate-in .prompt-card {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  /* Programmatic focus target (tabindex=-1) — the card is the dialog
     container, not an interactive control, so suppress the focus ring. */
  .prompt-card:focus {
    outline: none;
  }

  .icon-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 20%,
      transparent
    );
    border: 1.5px solid
      color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 40%, transparent);
    color: var(--theme-accent-strong, #8b5cf6);
    font-size: 1.4rem;
  }

  .prompt-title {
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--theme-text, #fff);
    margin: 0;
  }

  .prompt-body {
    font-size: 0.95rem;
    color: color-mix(
      in srgb,
      var(--theme-text, #fff) 82%,
      var(--theme-panel-bg, #12121c)
    );
    margin: 0;
    line-height: 1.5;
    max-width: 280px;
  }

  .prompt-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    margin-top: 4px;
  }

  .accept-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px 24px;
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 40%,
      transparent
    );
    border: 2px solid
      color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 60%, transparent);
    border-radius: 12px;
    color: var(--theme-text, #fff);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out);
  }

  .accept-button:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 50%,
      transparent
    );
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 30%, transparent);
  }

  .accept-button:active {
    transform: scale(0.97);
  }

  .accept-button:focus-visible {
    outline: 2px solid var(--theme-accent-strong, #8b5cf6);
    outline-offset: 2px;
  }

  .skip-button {
    padding: 10px 24px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: color-mix(
      in srgb,
      var(--theme-text, #fff) 82%,
      var(--theme-panel-bg, #12121c)
    );
    font-size: 0.9rem;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out);
  }

  .skip-button:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .skip-button:focus-visible {
    outline: 2px solid var(--theme-accent-strong, #8b5cf6);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .prompt-card {
      transition: none;
      opacity: 1;
      transform: none;
    }

    .accept-button,
    .skip-button {
      transition: none;
    }

    .accept-button:active {
      transform: none;
    }
  }
</style>
