<script lang="ts">
  import ExportTakeover from "#lib/shared/video-export/components/ExportTakeover.svelte";
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import { exportPhaseLabelKey } from "#lib/shared/video-export/services/export-takeover-phase.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { sequenceMandalaHandOffsets } from "#lib/shared/mandala/services/mandala-grid-join.js";
  import type { MandalaViewerController } from "../state/mandala-viewer-controller.svelte";

  interface Props {
    ctrl: MandalaViewerController;
    sequence: any;
    leftPropType?: string;
    rightPropType?: string;
    size: number;
    /**
     * The share sheet is driving this render and shows its own progress. The
     * takeover would sit behind the modal, unreachable, and its Cancel/Retry
     * would compete with the sheet's.
     */
    suppressed?: boolean;
    onCancel?: () => void;
    onRetry?: () => void;
  }
  let {
    ctrl,
    sequence,
    leftPropType,
    rightPropType,
    size,
    suppressed = false,
    onCancel,
    onRetry,
  }: Props = $props();

  const handOffsets = $derived(sequenceMandalaHandOffsets(sequence));

  const phaseLabel = $derived.by(() => {
    const key = exportPhaseLabelKey(ctrl.exportPhase);
    return key ? t(key) : "";
  });
</script>

{#if !suppressed}
  <ExportTakeover
    phase={ctrl.exportPhase}
    progress={ctrl.exportProgress}
    {phaseLabel}
    error={ctrl.exportError}
    onCancel={() => (onCancel ? onCancel() : ctrl.cancelExport())}
    onRetry={() => (onRetry ? onRetry() : ctrl.startExport())}
    opaque
  >
    {#snippet centerpiece()}
      <SequenceMandala
        {sequence}
        animate={!ctrl.paused}
        animateMin={0}
        animateMax={ctrl.rangeMax}
        animatePeriod={ctrl.period}
        animateEasing="breathe"
        animateRotation={ctrl.rotation}
        pathShape={ctrl.pathShape}
        {size}
        {leftPropType}
        {rightPropType}
        mode="card-back"
        style="stroke"
        show="both"
        palette={ctrl.palette}
        strokeWidth={ctrl.lineWeight}
        gradient={ctrl.gradientColors}
        {handOffsets}
      />
    {/snippet}
  </ExportTakeover>
{/if}
