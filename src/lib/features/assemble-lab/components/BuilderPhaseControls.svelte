<!--
  Compact, phase-aware orientation and turn controls shared by Assemble's
  desktop header and mobile grid overlay.
-->
<script lang="ts">
  import { Popover } from "bits-ui";
  import { RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { AssembleState } from "../state/assemble-state.svelte";
  import { getBuilderControlVisibility } from "../services/builder-phase-presentation";
  import BuilderMotionSettings from "./BuilderMotionSettings.svelte";
  import BuilderOrientationPicker from "./BuilderOrientationPicker.svelte";
  import OrientationExplainer from "./OrientationExplainer.svelte";

  let {
    builderState,
    reserveSlots = true,
  }: {
    builderState: AssembleState;
    reserveSlots?: boolean;
  } = $props();

  const controlVisibility = $derived(
    getBuilderControlVisibility(builderState.phase)
  );
  const currentOrientationLabel = $derived(
    String(builderState.currentOrientation).replace("center", "")
  );

  const FLOAT_TURN = -0.5;
  const isFloat = $derived(builderState.turnCount === FLOAT_TURN);
  const rotationLabel = $derived(
    builderState.rotationDirection === RotationDirection.CLOCKWISE
      ? "CW"
      : "CCW"
  );
  const isFlipped = $derived(
    builderState.rotationDirection === RotationDirection.COUNTER_CLOCKWISE
  );

  let orientationPopoverOpen = $state(false);
  let turnsPopoverOpen = $state(false);
  let explainerOpen = $state(false);

  $effect(() => {
    const _phase = builderState.phase;
    orientationPopoverOpen = false;
    turnsPopoverOpen = false;
  });
</script>

<div class="phase-controls" class:reserve-slots={reserveSlots}>
  <div
    class="control-slot orientation-slot"
    class:visible={controlVisibility.orientation}
  >
    <Popover.Root bind:open={orientationPopoverOpen}>
      <Popover.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class="phase-trigger"
            aria-label="Orientation: {currentOrientationLabel}"
            tabindex={controlVisibility.orientation ? 0 : -1}
          >
            <i class="fas fa-compass" aria-hidden="true"></i>
            <span>{currentOrientationLabel}</span>
          </button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          class="assemble-popover-panel orientation-popover"
          aria-label="Starting orientation"
        >
          <BuilderOrientationPicker
            value={builderState.currentOrientation}
            onchange={(orientation) => {
              builderState.setOrientation(orientation);
              orientationPopoverOpen = false;
            }}
            onHelp={() => {
              orientationPopoverOpen = false;
              explainerOpen = true;
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  </div>

  <div
    class="control-slot turns-slot"
    class:visible={controlVisibility.motionSettings}
  >
    <Popover.Root bind:open={turnsPopoverOpen}>
      <Popover.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            class="phase-trigger"
            aria-label="Turn settings: {isFloat
              ? 'Float'
              : `${rotationLabel} ${builderState.turnCount}`}"
            tabindex={controlVisibility.motionSettings ? 0 : -1}
          >
            {#if !isFloat}
              <i
                class="fas fa-rotate-right"
                class:flipped={isFlipped}
                aria-hidden="true"
              ></i>
            {/if}
            <span
              >{isFloat
                ? "fl"
                : `${rotationLabel} ${builderState.turnCount}`}</span
            >
          </button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          class="assemble-popover-panel turns-popover"
          aria-label="Turn count and rotation direction"
        >
          <BuilderMotionSettings
            turnCount={builderState.turnCount}
            rotationDirection={builderState.rotationDirection}
            onchangeTurnCount={(turnCount) =>
              builderState.setTurnCount(turnCount)}
            onchangeRotationDirection={(direction) =>
              builderState.setRotationDirection(direction)}
            stacked
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  </div>
</div>

<OrientationExplainer bind:isOpen={explainerOpen} />

<style>
  .phase-controls {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    justify-content: end;
    gap: 6px;
    min-width: 0;
  }

  .phase-controls.reserve-slots {
    grid-template-columns: 82px 102px;
  }

  .control-slot {
    min-width: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .control-slot.visible {
    visibility: visible;
    pointer-events: auto;
  }

  .phase-controls:not(.reserve-slots) .control-slot:not(.visible) {
    display: none;
  }

  .phase-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: 100%;
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    padding: 6px 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-md, 12px);
    background: var(--theme-card-bg, rgba(10, 22, 30, 0.92));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .phase-trigger:hover,
  .phase-trigger[data-state="open"] {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .phase-trigger:active {
    transform: scale(0.97);
  }

  .phase-trigger:focus-visible {
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: 2px;
  }

  /* Plain surface, colored icon: the same quiet look as the workspace rail. */
  .phase-trigger i {
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--theme-accent, #26c6da) 70%, white);
    font-size: 12px;
    transition: transform var(--duration-fast, 150ms) ease;
  }

  .phase-trigger i.flipped {
    transform: scaleX(-1);
  }

  :global(.assemble-popover-panel) {
    width: min(520px, calc(100vw - 16px));
    max-width: calc(100vw - 16px);
    padding: var(--settings-spacing-sm, 8px);
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-md, 14px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    box-shadow: 0 8px 32px var(--theme-shadow, rgba(0, 0, 0, 0.3));
    animation: assemble-popover-in var(--duration-fast, 150ms) ease-out;
    z-index: var(--z-dropdown, 100);
  }

  :global(.assemble-popover-panel.orientation-popover) {
    width: min(420px, calc(100vw - 16px));
  }

  @keyframes assemble-popover-in {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(0.96);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .phase-trigger,
    .phase-trigger i {
      transition: none;
    }

    :global(.assemble-popover-panel) {
      animation: none;
    }
  }
</style>
