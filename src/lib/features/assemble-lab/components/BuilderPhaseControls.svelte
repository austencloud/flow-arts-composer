<!--
  Compact, phase-aware chips stacked in the grid's top-right corner: the grid
  shape before the first point, then orientation and turns. Each opens its
  settings in a popover, so the chips stay small and off the dots.
-->
<script lang="ts">
  import { Popover } from "bits-ui";
  import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { AssembleState } from "../state/assemble-state.svelte";
  import { getBuilderControlVisibility } from "../services/builder-phase-presentation";
  import BuilderMotionSettings from "./BuilderMotionSettings.svelte";
  import BuilderOrientationPicker from "./BuilderOrientationPicker.svelte";
  import GridModePicker from "./GridModePicker.svelte";
  import OrientationExplainer from "./OrientationExplainer.svelte";
  import { popIn } from "#lib/shared/transitions/motion.js";

  let { builderState }: { builderState: AssembleState } = $props();

  const controlVisibility = $derived(
    getBuilderControlVisibility(builderState.phase)
  );
  // The grid is chosen before the first point; once a start point exists the
  // corner belongs to the orientation and turn settings.
  const showGridChip = $derived(
    builderState.canChangeGridMode && builderState.phase === "idle"
  );
  const gridChip = $derived.by(() => {
    switch (builderState.gridMode) {
      case GridMode.BOX:
        return { label: "Box", icon: "fa-square" };
      case GridMode.SKEWED:
        return { label: "Merged", icon: "fa-border-all" };
      default:
        return { label: "Diamond", icon: "fa-diamond" };
    }
  });
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

  let gridPopoverOpen = $state(false);
  let orientationPopoverOpen = $state(false);
  let turnsPopoverOpen = $state(false);
  let explainerOpen = $state(false);

  $effect(() => {
    const _phase = builderState.phase;
    gridPopoverOpen = false;
    orientationPopoverOpen = false;
    turnsPopoverOpen = false;
  });
</script>

<!-- Turns sits above orientation, so it keeps its place when orientation
     leaves after the start point. -->
<div class="phase-controls">
  {#if showGridChip}
    <div class="control-slot" in:popIn>
      <Popover.Root bind:open={gridPopoverOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class="phase-trigger"
              aria-label="Grid: {gridChip.label}"
            >
              <i class="fas {gridChip.icon}" aria-hidden="true"></i>
              <span>{gridChip.label}</span>
            </button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={8}
            class="assemble-popover-panel grid-popover"
            aria-label="Grid shape"
          >
            <GridModePicker
              gridMode={builderState.gridMode}
              showCenter={builderState.showCenter}
              onGridModeChange={(mode) => {
                builderState.setGridMode(mode);
                gridPopoverOpen = false;
              }}
              onCenterChange={(show) => builderState.setShowCenter(show)}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  {/if}

  {#if controlVisibility.motionSettings}
    <div class="control-slot" in:popIn>
      <Popover.Root bind:open={turnsPopoverOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class="phase-trigger turns-trigger"
              aria-label="Turn settings: {isFloat
                ? 'Float'
                : `${rotationLabel} ${builderState.turnCount}`}"
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
  {/if}

  {#if controlVisibility.orientation}
    <div class="control-slot" in:popIn>
      <Popover.Root bind:open={orientationPopoverOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              class="phase-trigger"
              aria-label="Orientation: {currentOrientationLabel}"
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
  {/if}
</div>

<OrientationExplainer bind:isOpen={explainerOpen} />

<style>
  /* One right-aligned column. Each chip keeps its own width, which leaves
     the most room between the stack and the nearest grid points. */
  .phase-controls {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    min-width: 0;
  }

  .control-slot {
    display: flex;
    min-width: 0;
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

  .turns-trigger {
    font-variant-numeric: tabular-nums;
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
    animation: assemble-popover-in var(--duration-fast, 150ms) ease-out;
    z-index: var(--z-dropdown, 100);
  }

  :global(.assemble-popover-panel.orientation-popover) {
    width: min(420px, calc(100vw - 16px));
  }

  :global(.assemble-popover-panel.grid-popover) {
    width: max-content;
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
