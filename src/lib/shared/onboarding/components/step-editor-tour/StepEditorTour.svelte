<!--
  StepEditorTour - Coach marks overlay for the step editor panel.

  Renders inside the step editor as a floating card that walks through
  5 tour stops. Dims non-active sections via CSS classes on the parent.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import {
    stepEditorTourState,
    type StepEditorTourStop,
  } from "../../state/step-editor-tour-state.svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { FocusTrap } from "$lib/shared/foundation/ui/drawer/focus-trap";

  interface StopInfo {
    id: StepEditorTourStop;
    icon: string;
    title: string;
    description: string;
    /** Which section to highlight - "all" dims everything for welcome */
    highlight: "all" | "preview" | "duration" | "turns";
  }

  const STOP_INFO: StopInfo[] = [
    {
      id: "welcome",
      icon: "fa-sliders-h",
      title: "Step Editor",
      description:
        "This panel opens when you tap any step. You can edit each step individually.",
      highlight: "all",
    },
    {
      id: "preview",
      icon: "fa-image",
      title: "Step Preview",
      description:
        "This pictograph shows the step you selected, with both props and their locations.",
      highlight: "preview",
    },
    {
      id: "turns",
      icon: "fa-redo",
      title: "Turns",
      description:
        "Control how many rotations each prop makes. The left prop is blue and the right prop is red. Set clockwise or counter-clockwise.",
      highlight: "turns",
    },
    {
      id: "duration",
      icon: "fa-clock",
      title: "Duration",
      description:
        "Adjust how long this step lasts in your sequence. Longer steps hold the placement.",
      highlight: "duration",
    },
  ];

  const currentStopInfo: StopInfo = $derived(
    STOP_INFO[stepEditorTourState.currentStopIndex] ?? STOP_INFO[0]!
  );

  let hapticService: HapticFeedback | null = null;
  try {
    hapticService = getHapticFeedback();
  } catch {
    // Optional service
  }

  let overlayEl = $state<HTMLDivElement | null>(null);

  // Trap focus inside the coach-mark card while it's open: focus moves in on
  // open, Tab is trapped, everything else goes inert (default exclusions —
  // this tour anchors within the step editor panel, so nav/bottom-nav stay
  // reachable, matching Drawer's default), and focus returns to the trigger
  // on close.
  const focusTrap = new FocusTrap({ focusContainerOnInitial: true });

  $effect(() => {
    if (!overlayEl) return;
    focusTrap.activate(overlayEl);
    return () => focusTrap.deactivate();
  });

  function handleNext() {
    hapticService?.trigger("selection");
    stepEditorTourState.advance();
  }

  function handleSkip() {
    hapticService?.trigger("selection");
    stepEditorTourState.skip();
  }
</script>

{#if stepEditorTourState.isActive}
  <div
    class="tour-overlay"
    class:align-bottom={currentStopInfo.highlight === "preview"}
    bind:this={overlayEl}
    role="dialog"
    aria-modal="true"
    aria-labelledby="step-editor-tour-title"
    tabindex="-1"
  >
    <!-- Click-away to skip (transparent, no dimming - sections handle their own dimming) -->
    <button
      class="tour-backdrop"
      onclick={handleSkip}
      aria-label="Skip tour"
      tabindex="-1"
    ></button>

    <!-- Floating tour card - offset away from highlighted section -->
    <div
      class="tour-card"
      class:card-above={currentStopInfo.highlight === "turns" ||
        currentStopInfo.highlight === "duration"}
    >
      <div class="tour-icon">
        <i class="fas {currentStopInfo.icon}" aria-hidden="true"></i>
      </div>

      <!-- aria-live announces each stop's title + description to screen
           readers on advance, without moving focus (tours' announcement
           convention). display:contents keeps the two children in the
           .tour-card flex flow so the gap spacing is unaffected. -->
      <div class="tour-copy" aria-live="polite">
        <h3 id="step-editor-tour-title" class="tour-title">
          {currentStopInfo.title}
        </h3>
        <p class="tour-desc">{currentStopInfo.description}</p>
      </div>

      <!-- Step dots -->
      <div class="tour-dots">
        {#each STOP_INFO as _, i}
          <div
            class="dot"
            class:active={i === stepEditorTourState.currentStopIndex}
            class:completed={i < stepEditorTourState.currentStopIndex}
          ></div>
        {/each}
      </div>

      <!-- Actions -->
      <div class="tour-actions">
        <!-- data-ghost-kind="dismiss": see GeneratePanelTour — an overlay the
             presenter cannot dismiss makes every room look empty. -->
        <button
          class="skip-btn"
          data-ghost="safe"
          data-ghost-kind="dismiss"
          data-ghost-label="Skip"
          onclick={handleSkip}>Skip</button
        >
        <button class="next-btn" onclick={handleNext}>
          {stepEditorTourState.isLastStop ? "Got it" : "Next"}
          {#if !stepEditorTourState.isLastStop}
            <i class="fas fa-arrow-right" aria-hidden="true"></i>
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tour-overlay {
    position: absolute;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
  }

  /* Preview highlighted → anchor card to bottom so pictograph is fully visible */
  .tour-overlay.align-bottom {
    align-items: flex-end;
    padding-bottom: 8px;
  }

  .tour-backdrop {
    position: absolute;
    inset: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  /* Programmatic focus target (tabindex=-1) — the overlay is the dialog root,
     not an interactive control, so suppress the focus ring the global
     `:focus-visible` rule would otherwise draw. Matches Drawer.svelte. */
  .tour-overlay:focus,
  .tour-overlay:focus-visible {
    outline: none;
  }

  /* Keeps the title + description as direct participants in .tour-card's
     flex flow (gap spacing unaffected) despite the aria-live wrapper. */
  .tour-copy {
    display: contents;
  }

  .tour-card {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    max-width: 320px;
    width: calc(100% - 32px);
    padding: 20px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    border-radius: 16px;
    text-align: center;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    transform: translateY(0);
    transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Controls highlighted (lower area) → slide card into upper half */
  .tour-card.card-above {
    transform: translateY(-25%);
  }

  .tour-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: color-mix(
      in srgb,
      var(--feature-edit, #8b5cf6) 25%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--feature-edit, #8b5cf6) 40%, transparent);
    color: var(--feature-edit, #8b5cf6);
    font-size: 1.1rem;
  }

  .tour-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
    color: white;
  }

  .tour-desc {
    margin: 0;
    font-size: 0.875rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    line-height: 1.5;
  }

  .tour-dots {
    display: flex;
    gap: 6px;
    margin-top: 2px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    transition: all 0.2s ease;
  }

  .dot.active {
    background: var(--feature-edit, #8b5cf6);
    transform: scale(1.2);
  }

  .dot.completed {
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.4));
  }

  .tour-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 4px;
    width: 100%;
    justify-content: center;
  }

  .skip-btn {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .skip-btn:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    color: var(--theme-text, white);
  }

  .next-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    background: color-mix(
      in srgb,
      var(--feature-edit, #8b5cf6) 40%,
      transparent
    );
    border: 1.5px solid
      color-mix(in srgb, var(--feature-edit, #8b5cf6) 55%, transparent);
    border-radius: 8px;
    color: white;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .next-btn:hover {
    background: color-mix(
      in srgb,
      var(--feature-edit, #8b5cf6) 50%,
      transparent
    );
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--feature-edit, #8b5cf6) 25%, transparent);
  }

  .next-btn:active {
    transform: scale(0.97);
  }

  .next-btn i {
    font-size: 0.75rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .tour-card {
      transition: none;
    }
    .dot {
      transition: none;
    }
    .skip-btn,
    .next-btn {
      transition: none;
    }
    .next-btn:active {
      transform: none;
    }
  }
</style>
