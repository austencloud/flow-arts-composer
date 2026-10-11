<!--
  BuilderTurnBar.svelte - Phase-aware control bar below the grid (desktop).

  Shows orientation pills and next-motion turn settings during "placing",
  then keeps turn count + rotation direction during "building". Stays active during animation so users
  can adjust settings for the next action. Dimmed when idle, hidden
  when sequence is complete. Hidden on mobile (replaced by popover).
-->
<script lang="ts">
  import type { AssembleState } from "../state/assemble-state.svelte";
  import BuilderMotionSettings from "./BuilderMotionSettings.svelte";
  import BuilderOrientationPicker from "./BuilderOrientationPicker.svelte";
  import OrientationExplainer from "./OrientationExplainer.svelte";
  import { getBuilderControlVisibility } from "../services/builder-phase-presentation";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

  let { builderState }: { builderState: AssembleState } = $props();

  let explainerOpen = $state(false);

  const isPlacing = $derived(builderState.phase === "placing");
  const isBuilding = $derived(builderState.phase === "building");
  const isAnimating = $derived(builderState.phase === "animating");
  const isIdle = $derived(builderState.phase === "idle");
  const isComplete = $derived(builderState.phase === "complete");
  const controlVisibility = $derived(
    getBuilderControlVisibility(builderState.phase)
  );

  const barDimmed = $derived(isIdle);
  const barHidden = $derived(isComplete);

  // Track which content to show. During animating/done, keep showing whatever
  // was last active (building or placing) to prevent layout shift.
  let lastActiveContent = $state<"placing" | "building" | "idle">("idle");

  $effect(() => {
    if (isPlacing) lastActiveContent = "placing";
    else if (isBuilding) lastActiveContent = "building";
    else if (isIdle) lastActiveContent = "idle";
    // animating/done/complete: keep lastActiveContent unchanged
  });

  const showPlacing = $derived(
    controlVisibility.orientation ||
      ((barDimmed || isAnimating) && lastActiveContent === "placing")
  );
  const showBuilding = $derived(
    controlVisibility.motionSettings ||
      (barDimmed && lastActiveContent === "building")
  );
  const showPlaceholder = $derived(
    !showPlacing && !showBuilding && !isComplete
  );
</script>

<div
  class="control-bar"
  class:dimmed={barDimmed}
  class:hidden-bar={barHidden}
  class:blue-hand={builderState.activeHand === HandSide.LEFT}
  class:red-hand={builderState.activeHand === HandSide.RIGHT}
>
  <!-- Placing phase: orientation pills (persists during animating/done to prevent layout shift) -->
  {#if showPlacing}
    <div class="bar-content orientation-content">
      <span class="bar-label">Orientation</span>
      <BuilderOrientationPicker
        value={builderState.currentOrientation}
        onchange={(orientation) => builderState.setOrientation(orientation)}
        onHelp={() => {
          explainerOpen = true;
        }}
      />
    </div>
  {/if}

  <!-- Rotation direction + turn count apply to the next destination click. -->
  {#if showBuilding}
    <div class="bar-content">
      <BuilderMotionSettings
        turnCount={builderState.turnCount}
        rotationDirection={builderState.rotationDirection}
        onchangeTurnCount={(turnCount) => builderState.setTurnCount(turnCount)}
        onchangeRotationDirection={(direction) =>
          builderState.setRotationDirection(direction)}
      />
    </div>
  {/if}

  <!-- Idle: explain what will occupy this reserved control row. -->
  {#if showPlaceholder}
    <div class="bar-content bar-placeholder">
      <span class="tap-cue" aria-hidden="true">
        <i class="fas fa-hand-pointer"></i>
      </span>
      <span class="idle-copy">
        <strong>First touch sets position.</strong>
        <span>Orientation and motion controls open next.</span>
      </span>
    </div>
  {/if}
</div>

<OrientationExplainer bind:isOpen={explainerOpen} />

<style>
  .control-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--settings-spacing-sm, 8px);
    width: 100%;
    flex-shrink: 0;
    min-height: 48px;
    transition: opacity 0.2s ease;
  }

  .control-bar.dimmed {
    pointer-events: none;
  }

  .control-bar.hidden-bar {
    opacity: 0;
    pointer-events: none;
  }

  .bar-content {
    display: flex;
    flex: 1 1 580px;
    align-items: center;
    justify-content: center;
    gap: var(--settings-spacing-sm, 8px);
    max-width: 610px;
    min-width: 0;
  }

  .orientation-content {
    flex-basis: 390px;
    max-width: 410px;
  }

  .bar-placeholder {
    justify-content: center;
    gap: 10px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
  }

  .control-bar.blue-hand {
    --cue-color: var(--prop-blue, #2e8bf0);
  }

  .control-bar.red-hand {
    --cue-color: var(--prop-red, #ed1c24);
  }

  .tap-cue {
    display: grid;
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--cue-color) 48%, transparent);
    border-radius: 11px;
    background: color-mix(in srgb, var(--cue-color) 12%, transparent);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 0 18px color-mix(in srgb, var(--cue-color) 14%, transparent);
    color: var(--cue-color);
    animation: tap-cue 1.8s ease-in-out infinite;
  }

  .idle-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
    line-height: 1.25;
  }

  .idle-copy strong {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
  }

  .idle-copy span {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-min, 14px);
  }

  @keyframes tap-cue {
    0%,
    100% {
      transform: translateY(0);
    }
    45% {
      transform: translateY(-2px);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        0 0 24px color-mix(in srgb, var(--cue-color) 24%, transparent);
    }
  }

  .bar-label {
    padding: 0 4px;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    flex-shrink: 0;
  }

  /* Hidden on mobile - BuilderControls popover handles it */
  @container tool-panel (max-width: 768px) {
    .control-bar {
      display: none;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .control-bar {
      transition: none;
    }

    .tap-cue {
      animation: none;
    }
  }
</style>
