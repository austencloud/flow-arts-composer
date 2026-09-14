<!--
  PropTurnsControl.svelte

  Internal controls for adjusting turns and rotation of a single prop.
  Designed to be used inside PropControlPair which provides the card styling.
  Uses CSS custom properties from parent card for color theming.

  Full mode stacks turns, rotation, path, and prop controls. Compact mode keeps
  the primary actions together and gives path choices a full-width second row.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PathShapeValue } from "../../services/step-operations/path-shape-handler";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";

  interface Props {
    hand: "left" | "right";
    turns: number | "fl";
    rotationDirection: RotationDirection;
    showRotation: boolean;
    /** Compact mode: single row layout for mobile */
    compact?: boolean;
    pathShape?: PathShapeValue | undefined;
    isShift?: boolean;
    onTurnsChange: (delta: number) => void;
    onRotationChange: (direction: RotationDirection) => void;
    onPathShapeChange?: (shape: PathShapeValue) => void;
    onPathShapeClear?: () => void;
    trailingControl?: Snippet;
  }

  let {
    hand,
    turns,
    rotationDirection,
    showRotation,
    compact = false,
    pathShape,
    isShift = true,
    onTurnsChange,
    onRotationChange,
    onPathShapeChange,
    onPathShapeClear,
    trailingControl,
  }: Props = $props();

  const displayTurns = $derived(turns === "fl" ? "fl" : turns);

  const directionIcon = $derived(
    rotationDirection === RotationDirection.NO_ROTATION
      ? "fa-minus"
      : rotationDirection === RotationDirection.CLOCKWISE
        ? "fa-rotate-right"
        : "fa-rotate-left"
  );

  const directionLabel = $derived(
    rotationDirection === RotationDirection.NO_ROTATION
      ? ""
      : rotationDirection === RotationDirection.CLOCKWISE
        ? "CW"
        : "CCW"
  );

  function handleTurnsChangeClick(e: MouseEvent, delta: number) {
    e.stopPropagation();
    onTurnsChange(delta);
  }

  const shapes: PathShapeValue[] = ["arc", "linear", "concave"];

  const globalHint = $derived.by(() => {
    const vm = getAnimationVisibilityManager();
    if (vm.getMotionAwarePaths()) return "Hybrid";
    const s = vm.getPathShape();
    return s.charAt(0).toUpperCase() + s.slice(1);
  });

  function handleInvert(e: MouseEvent) {
    e.stopPropagation();
    const opposite =
      rotationDirection === RotationDirection.CLOCKWISE
        ? RotationDirection.COUNTER_CLOCKWISE
        : RotationDirection.CLOCKWISE;
    onRotationChange(opposite);
  }
</script>

<div
  class="turns-controls"
  class:blue={hand === "left"}
  class:red={hand === "right"}
  class:compact
>
  <!-- Turns row -->
  <div class="turns-row" class:compact>
    <button
      class="ctrl-btn"
      class:compact
      aria-label="Decrease {hand} turns"
      onclick={(e) => handleTurnsChangeClick(e, -0.5)}
    >
      <i class="fas fa-minus" aria-hidden="true"></i>
    </button>
    <span class="turns-value" class:compact>{displayTurns}</span>
    <button
      class="ctrl-btn"
      class:compact
      aria-label="Increase {hand} turns"
      onclick={(e) => handleTurnsChangeClick(e, 0.5)}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Rotation direction toggle — hidden for dash/static at 0 turns -->
  {#if showRotation}
    <button
      class="invert-btn"
      class:compact
      aria-label="Toggle {hand} rotation (currently {directionLabel})"
      onclick={handleInvert}
    >
      <i class="fas {directionIcon}" aria-hidden="true"></i>
      <span class="invert-label">{directionLabel}</span>
    </button>
  {/if}

  <!-- Path shape override (only for motions that traverse the grid) -->
  {#if onPathShapeChange && onPathShapeClear && isShift}
    <div class="path-row" class:compact>
      {#each shapes as shape}
        <button
          class="shape-pill"
          class:active={pathShape === shape}
          class:compact
          aria-pressed={pathShape === shape}
          aria-label="{hand} path: {shape}"
          onclick={(e) => {
            e.stopPropagation();
            onPathShapeChange(shape);
          }}
        >
          {shape.charAt(0).toUpperCase() + shape.slice(1)}
        </button>
      {/each}
      <button
        class="shape-pill reset"
        class:compact
        disabled={pathShape === undefined}
        aria-label="Reset {hand} path to global"
        onclick={(e) => {
          e.stopPropagation();
          onPathShapeClear();
        }}
      >
        <i class="fas fa-rotate-left" aria-hidden="true"></i>
      </button>
      {#if pathShape === undefined}
        <span class="path-hint">{globalHint}</span>
      {/if}
    </div>
  {/if}

  {#if trailingControl}
    <div class="trailing-control">
      {@render trailingControl()}
    </div>
  {/if}
</div>

<style>
  .turns-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
  }

  /* Compact: primary actions share the first row; path choices get the full
     second row so labels and touch targets do not collapse. */
  .turns-controls.compact {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      "turns rotation trailing"
      "path path path";
    align-items: center;
    gap: 6px;
    width: 100%;
  }

  .turns-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .turns-row.compact {
    grid-area: turns;
    justify-self: center;
    gap: 6px;
  }

  .turns-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.95);
    min-width: var(--min-touch-target);
    text-align: center;
  }

  .turns-value.compact {
    font-size: 1.35rem;
    min-width: 36px;
  }

  /* ============================================================================
     CONTROL BUTTONS (turns +/-)
     ============================================================================ */

  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border-radius: 10px;
    border: 1px solid;
    cursor: pointer;
    font-size: 1.1rem;
    transition: all var(--duration-fast) ease;
  }

  .ctrl-btn.compact {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border-radius: 8px;
    font-size: 0.95rem;
  }

  .ctrl-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  /* Blue ctrl buttons */
  .turns-controls.blue .ctrl-btn {
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.2);
    border-color: rgba(var(--prop-color-rgb, 59, 130, 246), 0.4);
    color: var(--prop-color, var(--semantic-info));
  }

  .turns-controls.blue .ctrl-btn:hover {
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.3);
    border-color: rgba(var(--prop-color-rgb, 59, 130, 246), 0.6);
    box-shadow: 0 2px 8px rgba(var(--prop-color-rgb, 59, 130, 246), 0.25);
  }

  /* Red ctrl buttons */
  .turns-controls.red .ctrl-btn {
    background: rgba(var(--prop-color-rgb, 239, 68, 68), 0.2);
    border-color: rgba(var(--prop-color-rgb, 239, 68, 68), 0.4);
    color: var(--prop-color, var(--semantic-error));
  }

  .turns-controls.red .ctrl-btn:hover {
    background: rgba(var(--prop-color-rgb, 239, 68, 68), 0.3);
    border-color: rgba(var(--prop-color-rgb, 239, 68, 68), 0.6);
    box-shadow: 0 2px 8px rgba(var(--prop-color-rgb, 239, 68, 68), 0.25);
  }

  .invert-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: var(--min-touch-target);
    padding: 0 20px;
    border-radius: 10px;
    border: 1px solid;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    transition: all var(--duration-fast) ease;
  }

  /* Compact: icon-only square button, positioned before turns row */
  .invert-btn.compact {
    grid-area: rotation;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    padding: 0;
    border-radius: 8px;
    font-size: 0.95rem;
    flex-shrink: 0;
  }

  .turns-controls.compact .invert-label {
    display: none;
  }

  .invert-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .invert-label {
    font-size: inherit;
    font-weight: inherit;
  }

  /* Blue invert button */
  .turns-controls.blue .invert-btn {
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.25);
    border-color: rgba(var(--prop-color-rgb, 59, 130, 246), 0.5);
    color: var(--prop-color, var(--semantic-info));
    box-shadow: 0 2px 8px rgba(var(--prop-color-rgb, 59, 130, 246), 0.15);
  }

  .turns-controls.blue .invert-btn:hover:not(:disabled) {
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.35);
    border-color: rgba(var(--prop-color-rgb, 59, 130, 246), 0.7);
    box-shadow: 0 2px 12px rgba(var(--prop-color-rgb, 59, 130, 246), 0.3);
  }

  /* Red invert button */
  .turns-controls.red .invert-btn {
    background: rgba(var(--prop-color-rgb, 239, 68, 68), 0.25);
    border-color: rgba(var(--prop-color-rgb, 239, 68, 68), 0.5);
    color: var(--prop-color, var(--semantic-error));
    box-shadow: 0 2px 8px rgba(var(--prop-color-rgb, 239, 68, 68), 0.15);
  }

  .turns-controls.red .invert-btn:hover:not(:disabled) {
    background: rgba(var(--prop-color-rgb, 239, 68, 68), 0.35);
    border-color: rgba(var(--prop-color-rgb, 239, 68, 68), 0.7);
    box-shadow: 0 2px 12px rgba(var(--prop-color-rgb, 239, 68, 68), 0.3);
  }

  .path-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
    padding-top: 6px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    margin-top: 4px;
    width: 100%;
  }

  .path-row.compact {
    grid-area: path;
    padding-top: 4px;
    margin-top: 2px;
    gap: 3px;
  }

  .shape-pill {
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: rgba(255, 255, 255, 0.4);
    font-size: 0.65rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    min-height: 28px;
  }

  .shape-pill.compact {
    padding: 0 8px;
    font-size: var(--font-size-compact, 12px);
    min-height: var(--min-touch-target, 44px);
  }

  .shape-pill:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.7);
  }

  .shape-pill.active {
    color: white;
  }

  .turns-controls.blue .shape-pill.active {
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.25);
    border-color: rgba(var(--prop-color-rgb, 59, 130, 246), 0.5);
  }

  .turns-controls.red .shape-pill.active {
    background: rgba(var(--prop-color-rgb, 239, 68, 68), 0.25);
    border-color: rgba(var(--prop-color-rgb, 239, 68, 68), 0.5);
  }

  .shape-pill.reset {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.08));
    font-size: var(--font-size-compact, 12px);
  }

  .shape-pill:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }

  .path-hint {
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.3);
    font-style: italic;
  }

  .trailing-control {
    width: 100%;
  }

  .turns-controls.compact .trailing-control {
    grid-area: trailing;
    width: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .ctrl-btn,
    .invert-btn,
    .shape-pill {
      transition: none;
    }
    .ctrl-btn:active:not(:disabled),
    .invert-btn:active:not(:disabled) {
      transform: none;
    }
  }
</style>
