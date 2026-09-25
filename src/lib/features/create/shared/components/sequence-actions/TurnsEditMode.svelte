<!--
  TurnsEditMode.svelte

  The "Turns" tab content - allows editing turns and rotation for a selected beat.
  Uses PropControlPair for consistent blue/red card layout, PropTurnsControl for
  the per-hand turns/rotation stepper, and PropTypeRow for the prop-type +
  chirality selector.

  Compact mode: Single-row controls with icon-only prop selector for mobile.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    HandSide,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import PropControlPair from "./PropControlPair.svelte";
  import PropTurnsControl from "./PropTurnsControl.svelte";
  import PropTypeRow from "./PropTypeRow.svelte";
  import type { PathShapeValue } from "../../services/step-operations/path-shape-handler";

  interface Props {
    hasSelection: boolean;
    leftTurns: number | "fl";
    rightTurns: number | "fl";
    leftRotation: RotationDirection;
    rightRotation: RotationDirection;
    showLeftRotation: boolean;
    showRightRotation: boolean;
    stacked?: boolean;
    /** Compact mode: single-row layout with icon-only prop selector */
    compact?: boolean;
    leftPathShape?: PathShapeValue | undefined;
    rightPathShape?: PathShapeValue | undefined;
    leftIsShift?: boolean;
    rightIsShift?: boolean;
    onTurnsChange: (color: HandSide, delta: number) => void;
    onRotationChange: (color: HandSide, direction: RotationDirection) => void;
    onOpenPropSheet?: (hand: "left" | "right") => void;
    onPathShapeChange?: (color: HandSide, shape: PathShapeValue) => void;
    onPathShapeClear?: (color: HandSide) => void;
  }

  let {
    hasSelection,
    leftTurns,
    rightTurns,
    leftRotation,
    rightRotation,
    showLeftRotation,
    showRightRotation,
    stacked = false,
    compact = false,
    leftPathShape,
    rightPathShape,
    leftIsShift = true,
    rightIsShift = true,
    onTurnsChange,
    onRotationChange,
    onOpenPropSheet,
    onPathShapeChange,
    onPathShapeClear,
  }: Props = $props();
</script>

{#if !hasSelection}
  <div class="empty-state">
    <i class="fas fa-hand-pointer" aria-hidden="true"></i>
    <p>{t("create_ui_tap_a_step_in_the_sequence_to_edit_its_turns")}</p>
  </div>
{:else}
  <PropControlPair {stacked} {compact}>
    {#snippet leftContent()}
      <PropTurnsControl
        hand="left"
        turns={leftTurns}
        rotationDirection={leftRotation}
        showRotation={showLeftRotation}
        {compact}
        pathShape={leftPathShape}
        isShift={leftIsShift}
        onTurnsChange={(delta) => onTurnsChange(HandSide.LEFT, delta)}
        onRotationChange={(dir) => onRotationChange(HandSide.LEFT, dir)}
        onPathShapeChange={onPathShapeChange
          ? (shape) => onPathShapeChange(HandSide.LEFT, shape)
          : undefined}
        onPathShapeClear={onPathShapeClear
          ? () => onPathShapeClear(HandSide.LEFT)
          : undefined}
      />
      <PropTypeRow hand="left" {compact} {onOpenPropSheet} />
    {/snippet}
    {#snippet rightContent()}
      <PropTurnsControl
        hand="right"
        turns={rightTurns}
        rotationDirection={rightRotation}
        showRotation={showRightRotation}
        {compact}
        pathShape={rightPathShape}
        isShift={rightIsShift}
        onTurnsChange={(delta) => onTurnsChange(HandSide.RIGHT, delta)}
        onRotationChange={(dir) => onRotationChange(HandSide.RIGHT, dir)}
        onPathShapeChange={onPathShapeChange
          ? (shape) => onPathShapeChange(HandSide.RIGHT, shape)
          : undefined}
        onPathShapeClear={onPathShapeClear
          ? () => onPathShapeClear(HandSide.RIGHT)
          : undefined}
      />
      <PropTypeRow hand="right" {compact} {onOpenPropSheet} />
    {/snippet}
  </PropControlPair>
{/if}

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px 16px;
    color: rgba(255, 255, 255, 0.4);
    text-align: center;
  }

  .empty-state i {
    font-size: 2rem;
    opacity: 0.5;
  }

  .empty-state p {
    font-size: 0.9rem;
    margin: 0;
  }
</style>
