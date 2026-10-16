<!--
  The Codex board's reader controls, in one row above the board: turns for
  each hand, whole-board rotate/mirror/swap, and which layers each pictograph
  draws. Turns are the same setting the letter explorer edits, so a letter
  opens with the turns the board shows. The parts are the app's own: the
  Blue/Red turn pair from Construct and the browse filter chips.
-->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PropControlPair from "#lib/features/create/shared/components/sequence-actions/PropControlPair.svelte";
  import PropTurnsControl from "#lib/features/create/shared/components/sequence-actions/PropTurnsControl.svelte";
  import {
    HandSide,
    type RotationDirection,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { TurnValue } from "#lib/shared/create/domain/turn-pattern-data.js";
  import type {
    CodexTransformOp,
    CodexVisibility,
  } from "../../../codex/_data/codex-view";

  let {
    leftTurns,
    rightTurns,
    leftRotation,
    rightRotation,
    transformed,
    visibility,
    onTurnsChange,
    onRotationChange,
    onTransform,
    onResetTransforms,
    onResetTurns,
    onToggleLayer,
  }: {
    leftTurns: TurnValue;
    rightTurns: TurnValue;
    leftRotation: RotationDirection;
    rightRotation: RotationDirection;
    /** True once any rotate/mirror/swap has been pressed. */
    transformed: boolean;
    visibility: CodexVisibility;
    onTurnsChange: (hand: HandSide, delta: number) => void;
    onRotationChange: (hand: HandSide, direction: RotationDirection) => void;
    onTransform: (op: CodexTransformOp) => void;
    onResetTransforms: () => void;
    onResetTurns: () => void;
    onToggleLayer: (key: keyof CodexVisibility) => void;
  } = $props();

  const LAYERS: { key: keyof CodexVisibility; label: string }[] = [
    { key: "showGrid", label: "Grid" },
    { key: "showTKA", label: "TKA" },
    { key: "showGlyph", label: "Glyph" },
    { key: "showPlacements", label: "Placements" },
    { key: "showReversals", label: "Reversals" },
    { key: "showNonRadialPoints", label: "Non-Radial" },
  ];

  const TRANSFORMS: { op: CodexTransformOp; label: string; icon: string }[] = [
    { op: "rotate", label: "Rotate", icon: "fas fa-rotate-right" },
    { op: "mirror", label: "Mirror", icon: "fas fa-left-right" },
    { op: "swap", label: "Swap", icon: "fas fa-palette" },
  ];

  // Spin only changes dash and static letters, and only once they turn.
  const turning = (turns: TurnValue) => turns !== "fl" && turns > 0;
  const hasTurns = $derived(leftTurns !== 0 || rightTurns !== 0);
</script>

<div class="board-controls">
  <div class="group">
    <div class="group-head">
      <span class="group-label">Turns</span>
      {#if hasTurns}
        <FilterChipBase
          mode="action"
          size="sm"
          label="Reset"
          icon="fas fa-rotate-left"
          onclick={onResetTurns}
        />
      {/if}
    </div>
    <PropControlPair compact>
      {#snippet leftContent()}
        <PropTurnsControl
          hand="left"
          turns={leftTurns}
          rotationDirection={leftRotation}
          showRotation={turning(leftTurns)}
          compact
          onTurnsChange={(delta) => onTurnsChange(HandSide.LEFT, delta)}
          onRotationChange={(direction) =>
            onRotationChange(HandSide.LEFT, direction)}
        />
      {/snippet}
      {#snippet rightContent()}
        <PropTurnsControl
          hand="right"
          turns={rightTurns}
          rotationDirection={rightRotation}
          showRotation={turning(rightTurns)}
          compact
          onTurnsChange={(delta) => onTurnsChange(HandSide.RIGHT, delta)}
          onRotationChange={(direction) =>
            onRotationChange(HandSide.RIGHT, direction)}
        />
      {/snippet}
    </PropControlPair>
  </div>

  <div class="group">
    <div class="group-head">
      <span class="group-label">Transform</span>
      {#if transformed}
        <FilterChipBase
          mode="action"
          size="sm"
          label="Reset"
          icon="fas fa-rotate-left"
          onclick={onResetTransforms}
        />
      {/if}
    </div>
    <div class="chip-row">
      {#each TRANSFORMS as transform (transform.op)}
        <FilterChipBase
          mode="action"
          size="sm"
          label={transform.label}
          icon={transform.icon}
          onclick={() => onTransform(transform.op)}
        />
      {/each}
    </div>
  </div>

  <div class="group">
    <div class="group-head">
      <span class="group-label">Show</span>
    </div>
    <div class="chip-row">
      {#each LAYERS as layer (layer.key)}
        <FilterChipBase
          mode="toggle"
          size="sm"
          label={layer.label}
          active={visibility[layer.key]}
          onclick={() => onToggleLayer(layer.key)}
        />
      {/each}
    </div>
  </div>
</div>

<style>
  .board-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: center;
    gap: 0.75rem 1.5rem;
    padding: 0 0 0.35rem;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .group-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 1.75rem;
  }

  .group-label {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text-muted, oklch(0.72 0.015 270));
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
</style>
