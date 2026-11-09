<script lang="ts">
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import MandalaControlDock from "./MandalaControlDock.svelte";
  import MandalaExportTakeover from "./MandalaExportTakeover.svelte";
  import MandalaGhostTrail from "./mandala/MandalaGhostTrail.svelte";
  import { calculateLuminance } from "#lib/shared/settings/utils/background-theme-calculator.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { MandalaViewerController } from "../state/mandala-viewer-controller.svelte";
  import { getAnimationVisibilityContext } from "#lib/shared/animation-engine/state/animation-visibility-context.js";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import type { MandalaRenderOptions } from "#lib/shared/mandala/domain/mandala-types.js";
  import type { ControlDockAction } from "./ControlDock.svelte";
  import { sequenceMandalaHandOffsets } from "#lib/shared/mandala/services/mandala-grid-join.js";

  interface Props {
    sequence: SequenceData;
    leftPropType?: string;
    rightPropType?: string;
    show?: MandalaRenderOptions["show"];
    /**
     * The mandala controller. Owned by ArtPane so the same instance backs both
     * the in-pane dock/takeover and the Art panel's Export button. Falls back to
     * a locally-created instance for standalone mounts (e.g. test pages) that
     * don't supply one.
     */
    ctrl?: MandalaViewerController;
    /**
     * Where the mandala's category controls live. "dock" (default) renders the
     * bottom MandalaControlDock; "external" suppresses it because the controls
     * are surfaced elsewhere (the Art-mode right sidebar). The bloom always
     * fills its stage either way.
     */
    controlsPlacement?: "dock" | "external";
    showDownload?: boolean;
    /** Optional compact action at the end of the bottom dock. */
    dockAction?: ControlDockAction;
    /** The share sheet owns this render and shows its own progress. */
    exportTakeoverSuppressed?: boolean;
    onExportCancel?: () => void;
    onExportRetry?: () => void;
  }

  let {
    sequence,
    leftPropType,
    rightPropType,
    show,
    ctrl: providedCtrl,
    controlsPlacement = "dock",
    showDownload = true,
    dockAction,
    exportTakeoverSuppressed = false,
    onExportCancel,
    onExportRetry,
  }: Props = $props();

  let stageEl: HTMLDivElement | undefined = $state();
  let containerSize: number = $state(400);
  let dockHeight = $state(76);

  const pathPolicy =
    getAnimationVisibilityContext() ?? getAnimationVisibilityManager();
  const ctrl =
    providedCtrl ??
    new MandalaViewerController({
      getSequence: () => sequence,
      getLeftPropType: () => leftPropType,
      getRightPropType: () => rightPropType,
      pathPolicy,
    });

  let ghostTrail: MandalaGhostTrail | undefined = $state();
  // Ghosts only form while the mandala moves; a still one lets them fade out.
  const trailOn = $derived(ctrl.trailEnabled && !ctrl.paused);
  // Overlapping ghosts brighten like light on film over a dark stage. Over a
  // light one that same blend would wash them out, so they just fade there.
  const additiveTrail = $derived.by(() => {
    const bg = ctrl.bgColor;
    return !/^#[0-9a-f]{6}$/i.test(bg) || calculateLuminance(bg) < 0.2;
  });

  const takeoverSize = $derived(Math.max(160, containerSize - 32));
  const renderedHands = $derived(show ?? ctrl.show);
  // A joined sequence draws each hand's figure around its own grid.
  const handOffsets = $derived(sequenceMandalaHandOffsets(sequence));

  // With the dock suppressed (controls in the sidebar) the stage reclaims the
  // bottom padding the dock would otherwise reserve.
  const stagePadBottom = $derived(
    controlsPlacement === "external" ? 0 : dockHeight + 14
  );

  $effect(() => {
    if (!stageEl) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      containerSize = Math.floor(Math.min(width, height));
    });
    observer.observe(stageEl);
    return () => observer.disconnect();
  });
</script>

<div class="mandala-pane" style:background={ctrl.bgColor}>
  <!-- The presenter's `linger` intention: something worth sitting with rather
       than pressing. The whole sequence at once is the prettiest thing in the
       app and the ghost should be allowed to just watch it. -->
  <div
    class="mandala-stage"
    bind:this={stageEl}
    data-ghost="safe"
    data-ghost-kind="stage"
    data-ghost-linger=""
    style:padding-bottom="{stagePadBottom}px"
  >
    <div
      class="mandala-frame"
      style:width="{containerSize}px"
      style:height="{containerSize}px"
    >
      <MandalaGhostTrail
        bind:this={ghostTrail}
        enabled={trailOn}
        length={ctrl.trailLength}
        size={containerSize}
        additive={additiveTrail}
      />
      <div class="mandala-live">
        <SequenceMandala
          {sequence}
          animate={!ctrl.paused}
          animateMin={0}
          animateMax={ctrl.rangeMax}
          animatePeriod={ctrl.period}
          animateEasing="breathe"
          animateRotation={ctrl.rotation}
          pathShape={ctrl.pathShape}
          size={containerSize}
          {leftPropType}
          {rightPropType}
          mode="card-back"
          style="stroke"
          show={renderedHands}
          palette={ctrl.palette}
          strokeWidth={ctrl.lineWeight}
          gradient={ctrl.gradientColors}
          {handOffsets}
          onFrame={trailOn
            ? (canvas, rotationDeg, time) =>
                ghostTrail?.capture(canvas, rotationDeg, time)
            : undefined}
        />
      </div>
    </div>
  </div>

  {#if controlsPlacement === "dock"}
    <MandalaControlDock
      {ctrl}
      {showDownload}
      trailingAction={dockAction}
      onHeightChange={(px) => (dockHeight = px)}
    />
  {/if}
  <MandalaExportTakeover
    {ctrl}
    {sequence}
    {leftPropType}
    {rightPropType}
    size={takeoverSize}
    suppressed={exportTakeoverSuppressed}
    onCancel={onExportCancel}
    onRetry={onExportRetry}
  />
</div>

<style>
  .mandala-pane {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .mandala-stage {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    transition: padding-bottom var(--duration-emphasis) var(--ease-standard-out);
  }
  .mandala-frame {
    position: relative;
    flex: none;
  }
  .mandala-live {
    position: relative;
  }
  .mandala-stage :global(svg) {
    width: 100%;
    height: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .mandala-stage {
      transition: none;
    }
  }
</style>
