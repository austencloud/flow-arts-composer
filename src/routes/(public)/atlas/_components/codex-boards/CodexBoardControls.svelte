<!--
  The Codex reader controls, in one row: turns for each hand, the transform
  buttons, and (on the board) which layers each pictograph draws. The board
  and the letter explorer share it; the explorer adds Invert and draws no
  layers. Turns are the same setting in both, so a letter opens with the
  turns the board shows. The parts are the app's own: the Blue/Red turn pair
  from Construct, the Composer's transform toolbar and the browse chips.
-->
<script lang="ts">
  import SequenceTransformActions from "#lib/shared/create/components/SequenceTransformActions.svelte";
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
    leftCanRotate = true,
    rightCanRotate = true,
    transformed,
    visibility,
    onTurnsChange,
    onRotationChange,
    onTransform,
    onInvert,
    onResetTransforms,
    onResetTurns,
    onToggleLayer,
  }: {
    leftTurns: TurnValue;
    rightTurns: TurnValue;
    leftRotation: RotationDirection;
    rightRotation: RotationDirection;
    /** False hides a hand's rotation choice even with turns: only dash and
     *  static motions take one, and the explorer knows its letter's motions. */
    leftCanRotate?: boolean;
    rightCanRotate?: boolean;
    /** True once any transform has been pressed. */
    transformed: boolean;
    /** The board's layer toggles; left out, the Show group is not drawn. */
    visibility?: CodexVisibility;
    onTurnsChange: (hand: HandSide, delta: number) => void;
    onRotationChange: (hand: HandSide, direction: RotationDirection) => void;
    onTransform: (op: CodexTransformOp) => void;
    /** Given, the toolbar offers Invert (the explorer, where it can change
     *  the letter). */
    onInvert?: () => void;
    onResetTransforms: () => void;
    onResetTurns: () => void;
    onToggleLayer?: (key: keyof CodexVisibility) => void;
  } = $props();

  const LAYERS: { key: keyof CodexVisibility; label: string }[] = [
    { key: "showGrid", label: "Grid" },
    { key: "showTKA", label: "TKA" },
    { key: "showGlyph", label: "Glyph" },
    { key: "showPlacements", label: "Placements" },
    { key: "showReversals", label: "Reversals" },
    { key: "showNonRadialPoints", label: "Non-Radial" },
  ];

  // Spin only changes dash and static letters, and only once they turn.
  const turning = (turns: TurnValue) => turns !== "fl" && turns > 0;
  const hasTurns = $derived(leftTurns !== 0 || rightTurns !== 0);

  // Two hands side by side take about 19.75rem (two 9.5rem cards and the
  // gap between them), or 27rem once a rotation toggle can join each
  // stepper. A row too narrow for that stacks the hands instead of letting
  // the buttons spill past their cards.
  const sideBySideWidth = $derived(
    (leftCanRotate || rightCanRotate ? 27 : 19.75) * 16
  );
  let rowWidth = $state(0);
  const stackHands = $derived(rowWidth > 0 && rowWidth < sideBySideWidth);
</script>

<div class="board-controls" bind:clientWidth={rowWidth}>
  <div class="group">
    <div class="group-head">
      <span class="group-label">Turns</span>
      {#if hasTurns}
        <span class="head-action">
          <FilterChipBase
            mode="action"
            size="sm"
            label="Reset"
            icon="fas fa-rotate-left"
            onclick={onResetTurns}
          />
        </span>
      {/if}
    </div>
    <div class="group-body">
      <PropControlPair compact stacked={stackHands}>
        {#snippet leftContent()}
          <PropTurnsControl
            hand="left"
            turns={leftTurns}
            rotationDirection={leftRotation}
            showRotation={leftCanRotate && turning(leftTurns)}
            reserveRotation={false}
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
            showRotation={rightCanRotate && turning(rightTurns)}
            reserveRotation={false}
            compact
            onTurnsChange={(delta) => onTurnsChange(HandSide.RIGHT, delta)}
            onRotationChange={(direction) =>
              onRotationChange(HandSide.RIGHT, direction)}
          />
        {/snippet}
      </PropControlPair>
    </div>
  </div>

  <div class="group">
    <div class="group-head">
      <span class="group-label">Transform</span>
    </div>
    <div class="group-body">
      <SequenceTransformActions
        toolbar
        hasSequence={true}
        hasSelection={false}
        isTransforming={false}
        showEditInConstructor={false}
        actionSubject="the pictographs"
        rotationDegrees={45}
        resetPlacement="transform"
        onReset={transformed ? onResetTransforms : undefined}
        onRotateCCW={() => onTransform("rotate-ccw")}
        onRotateCW={() => onTransform("rotate")}
        onMirror={() => onTransform("mirror")}
        onFlip={() => onTransform("flip")}
        onSwap={() => onTransform("swap")}
        {onInvert}
      />
    </div>
  </div>

  {#if visibility}
    <div class="group">
      <div class="group-head">
        <span class="group-label">Show</span>
      </div>
      <div class="group-body chip-row">
        {#each LAYERS as layer (layer.key)}
          <FilterChipBase
            mode="toggle"
            size="sm"
            label={layer.label}
            active={visibility[layer.key]}
            onclick={() => onToggleLayer?.(layer.key)}
          />
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Groups share their tops, so the labels sit on one line, each centred
     over its own controls; a shorter group centres in the row's height. */
  .board-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
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

  /* The label holds the centre column; Reset hangs to its right without
     pushing it off centre. One fixed height keeps every label on the same
     line whether or not its group shows a Reset. */
  .group-head {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    grid-template-rows: 1.75rem;
    align-items: center;
    gap: 0.5rem;
  }

  .group-head .group-label {
    grid-column: 2;
  }

  .head-action {
    grid-column: 3;
    justify-self: start;
  }

  .group-body {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
  }

  .group-label {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text-muted, oklch(0.72 0.015 270));
  }

  .chip-row {
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  /* Side by side, both hands take the wider hand's width, so a hand that
     gains its rotation toggle widens both cards instead of squeezing its
     own stepper. */
  .group-body :global(.prop-pair:not(.stacked)) {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
  }

  /* The Composer's transform toolbar, in full colour here: the buttons are
     the whole point of the row, so each wears its action's colour rather
     than a dark tint of it. */
  .board-controls
    .group-body
    :global(.actions-container.toolbar .grid-btn[class]) {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, rgb(var(--btn-color)) 42%, var(--sheet-bg-solid)),
      color-mix(in srgb, rgb(var(--btn-color)) 26%, var(--sheet-bg-solid))
    );
    border-color: color-mix(in srgb, rgb(var(--btn-color)) 80%, white);
    box-shadow: 0 6px 18px -10px rgba(var(--btn-color), 0.9);
  }

  .board-controls
    .group-body
    :global(.actions-container.toolbar .grid-btn[class]:hover:not(:disabled)) {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, rgb(var(--btn-color)) 58%, var(--sheet-bg-solid)),
      color-mix(in srgb, rgb(var(--btn-color)) 38%, var(--sheet-bg-solid))
    );
    border-color: color-mix(in srgb, rgb(var(--btn-color)) 60%, white);
  }

  .board-controls
    .group-body
    :global(.actions-container.toolbar .grid-btn[class] .btn-icon) {
    color: color-mix(in srgb, rgb(var(--btn-color)) 35%, white);
  }

  /* Phones, either way up: smaller transform buttons (still a full touch target), so the
     controls leave room for the pictographs. */
  @media (max-width: 600px), (max-height: 500px) {
    .board-controls {
      gap: 0.5rem 1rem;
    }

    .board-controls
      .group-body
      :global(.actions-container.toolbar .section-grid) {
      gap: 0.4rem;
    }

    .board-controls
      .group-body
      :global(.actions-container.toolbar .grid-btn[class]) {
      min-height: var(--min-touch-target);
      padding: 0.3rem 0.6rem;
      gap: 0.35rem;
    }

    .board-controls .group-body :global(.actions-container.toolbar .btn-label) {
      font-size: 0.875rem;
    }

    .board-controls
      .group-body
      :global(.actions-container.toolbar .rotation-pair .grid-btn) {
      min-width: 2.75rem;
    }

    .board-controls .group-body :global(.actions-container.toolbar .btn-icon) {
      width: 1.5rem;
      height: 1.5rem;
    }
  }
</style>
