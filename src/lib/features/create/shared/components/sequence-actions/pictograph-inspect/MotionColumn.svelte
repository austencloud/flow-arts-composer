<script lang="ts">
  /**
   * Motion Column
   *
   * Displays motion data for one performer-relative hand.
   * Reusable component for the pictograph inspector modal.
   */
  import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
  import type { PipelineDiagnostics } from "#lib/shared/pictograph/arrow/positioning/calculation/domain/pipeline-diagnostics.js";
  import {
    formatMotionText,
    formatMotionTypeLabel,
    formatRotationLabel,
  } from "./formatters";
  import PipelineTraceSection from "./PipelineTraceSection.svelte";
  import CollapsibleSection from "#lib/features/admin/components/feature-flags/shared/CollapsibleSection.svelte";
  import { selectedArrowState } from "#lib/shared/create/state/selected-arrow-state.svelte.js";
  import {
    HandSide,
    type HandSide as HandSideValue,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

  interface Props {
    hand: HandSideValue;
    motion: MotionData | undefined;
    rotationOverride: { hasOverride: boolean } | null;
    copiedSection: string | null;
    onCopy: (text: string, section: string) => void;
    diagnostics: PipelineDiagnostics | null;
    open: boolean;
    onToggle: (next: boolean) => void;
  }

  let {
    hand,
    motion,
    rotationOverride,
    copiedSection,
    onCopy,
    diagnostics,
    open,
    onToggle,
  }: Props = $props();

  const color = $derived(hand === HandSide.LEFT ? "blue" : "red");
  const colorClass = $derived(
    hand === HandSide.LEFT ? "blue-column" : "red-column"
  );
  const label = $derived(
    hand === HandSide.LEFT ? "Left Motion" : "Right Motion"
  );
  const isSelected = $derived(selectedArrowState.selectedArrow?.hand === hand);
</script>

<CollapsibleSection
  title={label}
  {open}
  {onToggle}
  iconColor={color === "blue"
    ? "var(--prop-blue, #58a6ff)"
    : "var(--prop-red, #f85149)"}
  icon="fa-circle"
  selected={isSelected}
>
  {#snippet headerAction()}
    <button
      class="copy-btn"
      onclick={async () =>
        onCopy(await formatMotionText(motion, hand, rotationOverride), hand)}
      title="Copy {label}"
    >
      <i class="fas fa-copy" aria-hidden="true"></i>
      {#if copiedSection === hand}<span class="copied-label">Copied</span>{/if}
    </button>
  {/snippet}

  <section class="column {colorClass}">
    {#if motion}
      <div class="motion-line">
        <span class="mt">{formatMotionTypeLabel(motion.motionType)}</span>
        <span class="rot">{formatRotationLabel(motion.rotationDirection)}</span>
        <span class="path">{motion.startLocation}→{motion.endLocation}</span>
        <span class="ori"
          >{motion.startOrientation}→{motion.endOrientation}</span
        >
        <span class="turns"
          >{motion.turns === "fl" ? "float" : `${motion.turns}t`}</span
        >
        {#if motion.prefloatMotionType}<span class="warn-val"
            >pf:{motion.prefloatMotionType}</span
          >{/if}
      </div>
      <div class="placement-line">
        <span class="pl"
          >{motion.arrowPlacementData?.positionX?.toFixed(0) ?? "-"}, {motion.arrowPlacementData?.positionY?.toFixed(
            0
          ) ?? "-"}</span
        >
        <span class="pl"
          >{motion.arrowPlacementData?.rotationAngle?.toFixed(0) ?? "-"}°</span
        >
        {#if motion.arrowPlacementData?.svgMirrored}<span class="pl mir"
            >mirrored</span
          >{/if}
        {#if rotationOverride?.hasOverride}<span class="pl ov">rotOverride</span
          >{/if}
        {#if motion.arrowPlacementData?.manualAdjustmentX || motion.arrowPlacementData?.manualAdjustmentY}
          <span class="pl warn-val"
            >manual ({motion.arrowPlacementData?.manualAdjustmentX?.toFixed(
              0
            ) ?? 0}, {motion.arrowPlacementData?.manualAdjustmentY?.toFixed(
              0
            ) ?? 0})</span
          >
        {/if}
      </div>

      <PipelineTraceSection {diagnostics} {hand} />
    {:else}
      <div class="empty-state">No {hand} motion</div>
    {/if}
  </section>
</CollapsibleSection>

<style>
  .column {
    display: flex;
    flex-direction: column;
    gap: 0;
    font-family: inherit;
  }
  .copy-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    min-height: var(--min-touch-target, 44px);
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text, #fff);
    cursor: pointer;
    font-size: var(--font-size-compact, 12px);
    font-family: inherit;
  }
  .copy-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }
  .copy-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #58a6ff);
    outline-offset: 1px;
  }
  .copied-label {
    color: var(--semantic-success, #7ee787);
    font-weight: 600;
  }
  .motion-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px;
    font-size: var(--font-size-md, 17px);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    padding: 2px;
  }
  .motion-line .mt {
    color: var(--semantic-warning, #ffa657);
  }
  .motion-line .rot {
    color: var(--theme-accent, #d2a8ff);
  }
  .motion-line .path {
    color: var(--theme-text, #fff);
  }
  .motion-line .ori {
    color: var(--semantic-info, #79c0ff);
  }
  .motion-line .turns {
    color: var(--theme-text-dim, #8b949e);
  }
  .motion-line .warn-val {
    color: var(--semantic-warning, #d29922);
    font-size: var(--font-size-compact, 12px);
  }
  .placement-line {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, #8b949e);
    font-variant-numeric: tabular-nums;
    padding: 0 2px 4px;
  }
  .placement-line .pl {
    color: var(--theme-text-muted, #c9d1d9);
  }
  .placement-line .mir {
    font-style: italic;
    color: var(--theme-text-dim, #8b949e);
  }
  .placement-line .ov {
    color: var(--semantic-success, #3fb950);
  }
  .placement-line .warn-val {
    color: var(--semantic-warning, #d29922);
  }
  .empty-state {
    padding: 20px;
    text-align: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-sm, 14px);
  }
</style>
