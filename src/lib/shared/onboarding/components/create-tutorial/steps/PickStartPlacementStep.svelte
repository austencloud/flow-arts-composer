<!--
  PickStartPlacementStep - Step 1 of the create tutorial

  Embeds the real StartPlacementPicker so the user can tap a starting placement.
  Auto-advances when a placement is selected (no Continue button needed).
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { createSimplifiedStartPlacementState } from "$lib/shared/create/state/start-placement-state.svelte";
  import { createTutorialState } from "../../../state/create-tutorial-state.svelte";

  interface Props {
    onAdvance: () => void;
  }

  const { onAdvance }: Props = $props();

  // Create a local start placement state for the picker
  const startPlacementState = createSimplifiedStartPlacementState();
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    // Listen for user placement selection
    unsubscribe = startPlacementState.onSelectedPlacementChange(
      (placement, source) => {
        if (source === "user" && placement) {
          // Store in tutorial state with the picker's current grid mode
          createTutorialState.setStartPlacement(
            placement,
            startPlacementState.currentGridMode,
          );
          onAdvance();
        }
      }
    );
  });

  onDestroy(() => {
    unsubscribe?.();
  });
</script>

<div class="tutorial-step">
  <div class="step-header">
    <h1 id="tutorial-step-title" class="title">Pick a starting placement</h1>
  </div>

  <div class="picker-container">
    {#await import("$lib/features/create/construct/start-placement-picker/components/StartPlacementPicker.svelte") then mod}
      <mod.default {startPlacementState} embedded />
    {/await}
  </div>
</div>

<style>
  .tutorial-step {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    max-width: 720px;
    width: 100%;
    text-align: center;
    padding: 24px 32px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-radius: 24px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .title {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--theme-text, #fff);
    margin: 0;
  }

  .picker-container {
    width: 100%;
    height: clamp(280px, 50vh, 500px);
  }

  /* Make the 3 start placements clearly tappable in the tutorial: a resting
     colored frame + soft glow + gentle invite-pulse, then a punchy hover.
     Scoped to this step's picker so the real Create start-picker is untouched. */
  .picker-container :global(.pictograph-wrapper) {
    border-color: color-mix(
      in srgb,
      var(--letter-border-color, var(--theme-accent, #8b5cf6)) 55%,
      transparent
    );
    box-shadow:
      0 0 0 1px
        color-mix(
          in srgb,
          var(--letter-border-color, var(--theme-accent, #8b5cf6)) 30%,
          transparent
        ),
      0 10px 28px rgba(0, 0, 0, 0.4);
    animation: tutorial-start-invite 2.6s ease-in-out infinite;
  }

  .picker-container :global(.pictograph-container:hover .pictograph-wrapper) {
    transform: scale(1.1);
    border-color: var(--letter-border-color, var(--theme-accent, #8b5cf6));
    box-shadow:
      0 0 28px
        color-mix(
          in srgb,
          var(--letter-border-color, var(--theme-accent, #8b5cf6)) 55%,
          transparent
        ),
      0 12px 32px rgba(0, 0, 0, 0.45);
    filter: brightness(1.08);
    animation: none;
  }

  @keyframes tutorial-start-invite {
    0%,
    100% {
      box-shadow:
        0 0 0 1px
          color-mix(
            in srgb,
            var(--letter-border-color, var(--theme-accent, #8b5cf6)) 30%,
            transparent
          ),
        0 10px 28px rgba(0, 0, 0, 0.4);
    }
    50% {
      box-shadow:
        0 0 22px
          color-mix(
            in srgb,
            var(--letter-border-color, var(--theme-accent, #8b5cf6)) 45%,
            transparent
          ),
        0 10px 28px rgba(0, 0, 0, 0.4);
    }
  }

  @media (max-width: 640px) {
    .picker-container {
      height: clamp(320px, 60vh, 520px);
    }
  }

  @media (max-width: 480px) {
    .tutorial-step {
      padding: 12px;
      gap: 8px;
    }
    .title {
      font-size: 1.25rem;
    }
    .picker-container {
      height: clamp(340px, 65vh, 520px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tutorial-step {
      transition: none;
    }
    .picker-container :global(.pictograph-wrapper) {
      animation: none;
    }
  }
</style>
