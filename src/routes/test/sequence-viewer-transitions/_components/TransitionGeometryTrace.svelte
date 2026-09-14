<script lang="ts">
  import { summarizeStudioSurfaceMotion } from "../studio-surface-motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { isWorkspaceReplayCommand } from "../workspace-review-replays";
  import {
    READABLE_PANE_SIZE,
    VISIBLE_PANE_OPACITY,
    MAX_MANDALA_RASTER_SCALE,
    summarizeTransitionGeometry,
    type TransitionEndpointUndershoot,
    type TransitionGeometrySample,
    type TransitionGeometryTrace,
    type TransitionTravelSummary,
    type TransitionValueRange,
    type TransitionContentDrift,
    type InspectorRevealSummary,
  } from "../transition-geometry-trace";

  interface Props {
    trace: TransitionGeometryTrace;
  }

  let { trace }: Props = $props();

  const chartWidth = 760;
  const chartHeight = 168;
  const chartInset = 18;
  // ResizeObserver can publish one frame after the structural panel clock.
  // Two 60 Hz frames is the largest skew that still reads as one gesture.
  const maxCardClockSkew = 34;
  const isMotionTrace = $derived(trace.command.startsWith("3d"));
  const isTunnelTrace = $derived(trace.command.startsWith("tunnel"));
  const isCardStageTrace = $derived(trace.command.startsWith("card-"));
  const isPerformanceTrace = $derived(
    trace.command.startsWith("performances-")
  );
  const summary = $derived(summarizeTransitionGeometry(trace));
  const workspaceSamples = $derived(
    trace.samples.flatMap((sample) =>
      sample.workspace ? [sample.workspace] : []
    )
  );
  const maximumSize = $derived(
    Math.max(
      READABLE_PANE_SIZE,
      ...trace.samples.map((sample) => sample.stageSize)
    )
  );
  const plotWidth = chartWidth - chartInset * 2;
  const plotHeight = chartHeight - chartInset * 2;

  function x(time: number): number {
    return chartInset + (time / Math.max(1, trace.duration)) * plotWidth;
  }

  function y(size: number): number {
    return chartHeight - chartInset - (size / maximumSize) * plotHeight;
  }

  function points(
    samples: TransitionGeometrySample[],
    value: (sample: TransitionGeometrySample) => number
  ): string {
    return samples
      .map((sample) => `${x(sample.time)},${y(value(sample))}`)
      .join(" ");
  }

  function formatSize(size: number | null): string {
    return size === null ? "n/a" : `${Math.round(size)} px`;
  }

  function formatCardBox(
    box: { width: number; height: number } | null
  ): string {
    return box
      ? `${Math.round(box.width)} × ${Math.round(box.height)} px`
      : "n/a";
  }

  function formatAspectRange(minimum: number | null, maximum: number | null) {
    return minimum === null || maximum === null
      ? "n/a"
      : `${minimum.toFixed(2)}–${maximum.toFixed(2)}`;
  }

  function formatUndershoot(
    value: TransitionEndpointUndershoot | null
  ): string {
    if (!value) return "n/a";
    return `${Math.round(value.start)} → ${Math.round(value.minimum)} → ${Math.round(value.end)} px · ${Math.round(value.undershoot)} px dip`;
  }

  function formatTravel(value: TransitionTravelSummary | null): string {
    if (!value) return "n/a";
    return `${Math.round(value.start)} → ${Math.round(value.end)} px · ${Math.round(value.backtrack)} px backtrack · ${Math.round(value.overshoot)} px overshoot`;
  }

  function formatReveal(value: InspectorRevealSummary): string {
    const parts = [
      `${Math.round(value.maxClippedLeft)} px left cut`,
      `${Math.round(value.maxClippedRight)} px right cut`,
      `${Math.round(value.maxUncovered)} px undrawn`,
    ];
    const held = [
      value.clippedMs > 0 ? `${Math.round(value.clippedMs)} ms cut` : "",
      value.uncoveredMs > 0
        ? `${Math.round(value.uncoveredMs)} ms undrawn`
        : "",
    ].filter(Boolean);
    return `${parts.join(" · ")}${held.length ? ` · ${held.join(" · ")}` : ""}`;
  }

  function revealBroken(value: InspectorRevealSummary): boolean {
    return (
      value.maxClippedLeft > 1 ||
      value.maxClippedRight > 1 ||
      value.maxUncovered > 1
    );
  }

  function formatDrift(value: TransitionContentDrift | null): string {
    if (!value) return "n/a";
    return `${Math.round(value.width)} px width · ${Math.round(value.origin)} px origin · ${Math.round(value.vertical)} px vertical`;
  }

  function drifted(value: TransitionContentDrift | null): boolean {
    if (!value) return false;
    return value.width > 1 || value.origin > 1 || value.vertical > 1;
  }

  function formatRange(value: TransitionValueRange | null): string {
    if (!value) return "n/a";
    return `${Math.round(value.start)} → ${Math.round(value.end)} px · Δ${Math.round(value.variation)} px`;
  }

  function settingsReflow(
    width: TransitionValueRange | null,
    height: TransitionValueRange | null,
    centerY: TransitionValueRange | null
  ): boolean {
    return (
      (width?.variation ?? 0) > 1 ||
      (height?.variation ?? 0) > 1 ||
      (centerY?.variation ?? 0) > 1
    );
  }

  interface MotionTiming {
    start: number;
    end: number;
    onset: number;
    settle: number;
  }

  function motionTiming(
    phase: TransitionGeometrySample["phase"],
    value: (sample: TransitionGeometrySample) => number
  ): MotionTiming | null {
    const samples = trace.samples.filter(
      (sample) => sample.phase === phase && value(sample) > 0
    );
    if (samples.length < 2) return null;

    const start = value(samples[0]);
    const end = value(samples.at(-1)!);
    if (Math.abs(end - start) <= 0.75) return null;
    const timingTolerance = Math.max(0.75, Math.abs(end - start) * 0.02);

    const onset =
      samples.find(
        (sample) => Math.abs(value(sample) - start) > timingTolerance
      )?.time ?? samples[0].time;
    const settle =
      samples.find((sample, index) =>
        samples
          .slice(index)
          .every(
            (candidate) => Math.abs(value(candidate) - end) <= timingTolerance
          )
      )?.time ?? samples.at(-1)!.time;

    return { start, end, onset, settle };
  }

  function formatMotionTiming(value: MotionTiming | null): string {
    if (!value) return "n/a";
    return `${Math.round(value.start)} → ${Math.round(value.end)} px · ${Math.round(value.onset)}–${Math.round(value.settle)} ms`;
  }

  const cardFocusWidthMotion = $derived(
    motionTiming("focus-card", (sample) => sample.cardContentWidth)
  );
  const cardFocusVerticalMotion = $derived(
    motionTiming("focus-card", (sample) => sample.cardContentCenterY)
  );
  const cardFocusOnsetSkew = $derived(
    cardFocusWidthMotion && cardFocusVerticalMotion
      ? Math.abs(cardFocusWidthMotion.onset - cardFocusVerticalMotion.onset)
      : null
  );
  const cardFocusSettleSkew = $derived(
    cardFocusWidthMotion && cardFocusVerticalMotion
      ? Math.abs(cardFocusWidthMotion.settle - cardFocusVerticalMotion.settle)
      : null
  );
  const cardGeometryVisible = $derived(summary.dissolveFrames === 0);
  const cardReturnWidthMotion = $derived(
    motionTiming("return-split", (sample) => sample.cardContentWidth)
  );
  const cardReturnVerticalMotion = $derived(
    motionTiming("return-split", (sample) => sample.cardContentCenterY)
  );
  const cardReturnOnsetSkew = $derived(
    cardReturnWidthMotion && cardReturnVerticalMotion
      ? Math.abs(cardReturnWidthMotion.onset - cardReturnVerticalMotion.onset)
      : null
  );
  const cardReturnSettleSkew = $derived(
    cardReturnWidthMotion && cardReturnVerticalMotion
      ? Math.abs(cardReturnWidthMotion.settle - cardReturnVerticalMotion.settle)
      : null
  );

  const modeCommitSummary = $derived(
    trace.modeCommits
      .map(
        (commit) =>
          `${commit.mode} ${Math.max(0, Math.round(commit.latency))} ms`
      )
      .join(" · ")
  );

  const slowModeCommit = $derived(
    trace.modeCommits.some((commit) => commit.latency > DURATION.instant)
  );

  const tinyCardSamples = $derived(
    trace.samples.filter(
      (sample) =>
        sample.cardOpacity >= VISIBLE_PANE_OPACITY &&
        sample.cardContentWidth < READABLE_PANE_SIZE
    )
  );
  const firstTinyCardSample = $derived(tinyCardSamples[0] ?? null);
  const firstMagnifiedMandalaSample = $derived(
    trace.samples.find(
      (sample) =>
        sample.phase === "return-split" &&
        sample.mandalaRasterScale > MAX_MANDALA_RASTER_SCALE
    ) ?? null
  );
  const returnPanelMinimumSample = $derived.by(() => {
    const returnSamples = trace.samples.filter(
      (sample) => sample.phase === "return-split" && sample.cardPanelWidth > 0
    );
    return (
      returnSamples.reduce<TransitionGeometrySample | null>(
        (minimum, sample) =>
          !minimum || sample.cardPanelWidth < minimum.cardPanelWidth
            ? sample
            : minimum,
        null
      ) ?? null
    );
  });
  const returnMotionOnsets = $derived.by(() => {
    const returnSamples = trace.samples.filter(
      (sample) => sample.phase === "return-split"
    );
    const first = returnSamples[0];
    if (!first) return null;
    const inner = returnSamples.find(
      (sample) => sample.animationFlexGrow > first.animationFlexGrow + 0.01
    );
    const outer = returnSamples.find(
      (sample) => sample.inspectorSize < first.inspectorSize - 1
    );
    return {
      phaseStart: first.time,
      innerStart: inner?.time ?? null,
      outerStart: outer?.time ?? null,
    };
  });
</script>

<section class="geometry-trace" aria-labelledby="geometry-trace-title">
  <header>
    <div>
      <span>Measured geometry</span>
      <h3 id="geometry-trace-title">
        {isPerformanceTrace
          ? "Viewer stage and Performances through the last replay"
          : isCardStageTrace
            ? "Card and motion views through the last replay"
            : isMotionTrace
              ? "2D and 3D through the last replay"
              : isTunnelTrace
                ? "One canvas becoming Tunnel through the last replay"
                : "Pane size through the last replay"}
      </h3>
    </div>
    <div class="trace-legend" aria-label="Geometry trace legend">
      <span class="animation"
        >{isPerformanceTrace
          ? "Viewer stage opacity"
          : isCardStageTrace
            ? "Viewer stage allocation"
            : isMotionTrace
              ? "2D opacity"
              : isTunnelTrace
                ? "2D base"
                : "Animation"}</span
      >
      <span class="card"
        >{isPerformanceTrace
          ? "Performances opacity"
          : isMotionTrace
            ? "3D opacity"
            : isTunnelTrace
              ? "Tunnel layer blend"
              : "Card visual"}</span
      >
      <span class="stage">Viewer stage</span>
    </div>
  </header>

  <div class="trace-summary">
    {#if isWorkspaceReplayCommand(trace.command)}
      <span>Mode path: {summary.modePath.join(" → ") || "n/a"}</span>
      <span>Mode commit: {modeCommitSummary || "n/a"}</span>
      {#if trace.command.includes("studio")}
        <span
          >Selected Studio half: {workspaceSamples.at(-1)?.selectedStudioHalf ??
            "unmeasured"}</span
        >
        <span
          >Live Card settings identities: {new Set(
            workspaceSamples
              .map((s) => s.sharedCardInspectorIdentity)
              .filter(Boolean)
          ).size}</span
        >
        <span
          >Motion settings fading: {workspaceSamples.filter(
            (s) =>
              (s.motionInspectorOpacity ?? 0) > 0.01 &&
              (s.motionInspectorOpacity ?? 1) < 0.99
          ).length} frames</span
        >
        {@const coveredFrames = workspaceSamples.filter(
          (sample) => sample.sharedTransportCovered
        ).length}
        {@const rasterDensity = workspaceSamples
          .filter((sample) => sample.sharedRasterDensity != null)
          .at(-1)?.sharedRasterDensity}
        <span data-problem={coveredFrames > 0}
          >Canvas covering scrubber: {coveredFrames} frames</span
        >
        <span
          >Final canvas raster density: {rasterDensity == null
            ? "unmeasured"
            : `${rasterDensity.toFixed(2)}× device pixels`}</span
        >
        {#each Object.entries(summarizeStudioSurfaceMotion(trace.samples)) as [name, motion]}
          <span
            data-problem={motion.backtrackPx > 2 || motion.sizeBacktrackPx > 2}
          >
            {name}: {motion.backtrackPx} px backtracking · {motion.sizeBacktrackPx}
            px size reversal · {motion.maxStepPx} px largest step · {motion.frames}
            frames
          </span>
        {/each}
        {#each ["sharedCanvasIdentity", "sharedInspectorIdentity", "sharedCardIdentity", "sharedTransportIdentity", "sharedScrubberIdentity", "sharedPlayButtonIdentity"] as key}
          {@const identities = new Set(
            workspaceSamples
              .map(
                (sample) =>
                  sample[
                    key as
                      | "sharedCanvasIdentity"
                      | "sharedInspectorIdentity"
                      | "sharedCardIdentity"
                      | "sharedTransportIdentity"
                      | "sharedScrubberIdentity"
                      | "sharedPlayButtonIdentity"
                  ]
              )
              .filter(Boolean)
          )}
          <span data-problem={identities.size !== 1}>
            {key === "sharedCanvasIdentity"
              ? "Live canvas"
              : key === "sharedInspectorIdentity"
                ? "Shared inspector"
                : key === "sharedCardIdentity"
                  ? "Shared Card"
                  : key === "sharedScrubberIdentity"
                    ? "Live scrubber"
                    : key === "sharedPlayButtonIdentity"
                      ? "Live play button"
                      : "Shared transport"} identities: {identities.size}
          </span>
        {/each}
        <span
          >Canvas docked in phone: {workspaceSamples.filter(
            (sample) => sample.sharedCanvasInStudio
          ).length} frames</span
        >
        <span
          >Inspector docked in Studio: {workspaceSamples.filter(
            (sample) => sample.sharedInspectorInStudio
          ).length} frames</span
        >
      {/if}
      <span data-problem={workspaceSamples.length < 2}
        >Measured frames: {workspaceSamples.length}</span
      >
      <span
        data-problem={new Set(
          workspaceSamples.map((sample) => sample.stageIdentity)
        ).size > 1}
      >
        Viewer stage identities: {new Set(
          workspaceSamples.map((sample) => sample.stageIdentity)
        ).size}
      </span>
      <span
        >Studio dissolve frames: {workspaceSamples.filter(
          (sample) => sample.studioOpacity > 0.02 && sample.studioOpacity < 0.98
        ).length}</span
      >
      <span
        >Practice height: {Math.round(
          Math.max(
            0,
            ...workspaceSamples.map((sample) => sample.practiceHeight)
          )
        )} px maximum</span
      >
      <span
        data-problem={workspaceSamples.some(
          (sample) => sample.selectedButtons > 1
        )}
      >
        Duplicate selected buttons: {workspaceSamples.filter(
          (sample) => sample.selectedButtons > 1
        ).length} frames
      </span>
    {:else if isPerformanceTrace}
      <span data-problem={summary.performanceStageIdentityChanges > 0}
        >Viewer stage remounts: {summary.performanceStageIdentityChanges}</span
      >
      <span data-problem={summary.performanceGalleryIdentityChanges > 0}
        >Performance stage remounts: {summary.performanceGalleryIdentityChanges}</span
      >
      <span data-problem={summary.performanceInspectorIdentityChanges > 0}
        >Inspector remounts: {summary.performanceInspectorIdentityChanges}</span
      >
      <span data-problem={summary.performanceBlankFrames > 0}
        >Blank workspace frames: {summary.performanceBlankFrames}</span
      >
      <span data-problem={summary.performanceDoubleOpaqueFrames > 0}
        >Double-opaque frames: {summary.performanceDoubleOpaqueFrames}</span
      >
      <span data-dissolve={summary.performanceCrossfadeFrames > 0}
        >Crossfade frames: {summary.performanceCrossfadeFrames}</span
      >
      <span data-dissolve={summary.dissolveFrames > 0}
        >Workspace dissolve frames: {summary.dissolveFrames}</span
      >
      <span data-problem={summary.performanceUnreadyFrames > 0}
        >Unready performance frames: {summary.performanceUnreadyFrames}</span
      >
      <span data-problem={summary.performanceLayoutChanges > 0}
        >Visible inspector layout changes: {summary.performanceLayoutChanges}</span
      >
      <span data-problem={summary.performancePlayerCountMaximum > 1}
        >Maximum performance players: {summary.performancePlayerCountMaximum}</span
      >
      <span data-dissolve={summary.performanceOpacityComplementDriftMaximum > 0}
        >Shared-background dip: {summary.performanceOpacityComplementDriftMaximum.toFixed(
          3
        )}</span
      >
      <span data-problem={summary.performanceLayerWidthMismatchMaximum > 1}
        >Layer width mismatch: {Math.round(
          summary.performanceLayerWidthMismatchMaximum
        )} px</span
      >
      <span
        data-problem={(summary.performanceStageExit?.backtrack ?? 0) > 1 ||
          (summary.performanceStageExit?.overshoot ?? 0) > 1}
        >Viewer stage expands: {formatTravel(
          summary.performanceStageExit
        )}</span
      >
      <span
        data-problem={(summary.performanceStageEntry?.backtrack ?? 0) > 1 ||
          (summary.performanceStageEntry?.overshoot ?? 0) > 1}
        >Viewer stage contracts: {formatTravel(
          summary.performanceStageEntry
        )}</span
      >
      <span
        data-problem={(summary.performanceInspectorExit?.backtrack ?? 0) > 1 ||
          (summary.performanceInspectorExit?.overshoot ?? 0) > 1}
        >Inspector departure: {formatTravel(
          summary.performanceInspectorExit
        )}</span
      >
      <span
        data-problem={(summary.performanceInspectorEntry?.backtrack ?? 0) > 1 ||
          (summary.performanceInspectorEntry?.overshoot ?? 0) > 1}
        >Inspector return: {formatTravel(
          summary.performanceInspectorEntry
        )}</span
      >
      <span
        >Surface path: {summary.performanceSurfacePath.join(" → ") ||
          "n/a"}</span
      >
      <span>Mode path: {summary.modePath.join(" → ") || "n/a"}</span>
      <span data-problem={slowModeCommit}
        >Mode commit: {modeCommitSummary || "n/a"}</span
      >
      <span>Outer axis: {summary.outerDirectionPath.join(" → ") || "n/a"}</span>
    {:else if isCardStageTrace}
      <span data-problem={summary.cardStageCardIdentityChanges > 0}
        >Card remounts: {summary.cardStageCardIdentityChanges}</span
      >
      <span data-problem={summary.cardStageAnimatorIdentityChanges > 0}
        >Animator remounts: {summary.cardStageAnimatorIdentityChanges}</span
      >
      <span data-problem={summary.cardStageInspectorIdentityChanges > 0}
        >Inspector remounts: {summary.cardStageInspectorIdentityChanges}</span
      >
      <span data-problem={summary.cardStageSplitFrames > 0}
        >Side-by-Side intermediate frames: {summary.cardStageSplitFrames}</span
      >
      <span data-problem={summary.cardStageBlankFrames > 0}
        >Blank workspace frames: {summary.cardStageBlankFrames}</span
      >
      <span data-problem={summary.squashedCardFrames > 0}
        >Squashed Card frames: {summary.squashedCardFrames}</span
      >
      <span data-problem={summary.transformedCardCellFrames > 0}
        >Transformed Card cell frames: {summary.transformedCardCellFrames} · max
        {summary.maximumTransformedCardCells} cells</span
      >
      <span data-problem={summary.cardStageSettingsBlankFrames > 0}
        >Blank inspector frames: {summary.cardStageSettingsBlankFrames}</span
      >
      <span data-dissolve={summary.cardStageSettingsCrossfadeFrames > 0}
        >Settings crossfade frames: {summary.cardStageSettingsCrossfadeFrames}</span
      >
      <span
        data-problem={(summary.cardStageExitTravel?.backtrack ?? 0) > 1 ||
          (summary.cardStageExitTravel?.overshoot ?? 0) > 1}
        >Card exit travel: {formatTravel(summary.cardStageExitTravel)}</span
      >
      <span
        data-problem={(summary.cardStageEntryTravel?.backtrack ?? 0) > 1 ||
          (summary.cardStageEntryTravel?.overshoot ?? 0) > 1}
        >Card entry travel: {formatTravel(summary.cardStageEntryTravel)}</span
      >
      <span
        data-problem={(summary.cardStageExitAllocation?.backtrack ?? 0) > 1 ||
          (summary.cardStageExitAllocation?.overshoot ?? 0) > 1}
        >Viewer stage entrance: {formatTravel(
          summary.cardStageExitAllocation
        )}</span
      >
      <span
        data-problem={(summary.cardStageEntryAllocation?.backtrack ?? 0) > 1 ||
          (summary.cardStageEntryAllocation?.overshoot ?? 0) > 1}
        >Viewer stage exit: {formatTravel(
          summary.cardStageEntryAllocation
        )}</span
      >
      <span
        data-problem={(summary.cardStageInspectorExit?.backtrack ?? 0) > 1 ||
          (summary.cardStageInspectorExit?.overshoot ?? 0) > 1}
        >Inspector departure: {formatTravel(
          summary.cardStageInspectorExit
        )}</span
      >
      <span
        data-problem={(summary.cardStageInspectorEntry?.backtrack ?? 0) > 1 ||
          (summary.cardStageInspectorEntry?.overshoot ?? 0) > 1}
        >Inspector return: {formatTravel(summary.cardStageInspectorEntry)}</span
      >
      <span data-problem={drifted(summary.artSettingsContentDrift)}
        >Art settings drift: {formatDrift(
          summary.artSettingsContentDrift
        )}</span
      >
      <span data-problem={drifted(summary.cardSettingsContentDrift)}
        >Card settings drift: {formatDrift(
          summary.cardSettingsContentDrift
        )}</span
      >
      <span data-problem={summary.longestSampleGap > 80}
        >Longest sample gap: {Math.round(summary.longestSampleGap)} ms</span
      >
      <span data-dissolve={summary.dissolveFrames > 0}
        >Workspace dissolve frames: {summary.dissolveFrames}</span
      >
      <span>Mode path: {summary.modePath.join(" → ") || "n/a"}</span>
      <span data-problem={slowModeCommit}
        >Mode commit: {modeCommitSummary || "n/a"}</span
      >
      <span>Panel axis: {summary.panelDirectionPath.join(" → ") || "n/a"}</span>
      <span>Outer axis: {summary.outerDirectionPath.join(" → ") || "n/a"}</span>
      <span>Card layout: {summary.cardLayoutPath.join(" → ") || "n/a"}</span>
    {:else if isTunnelTrace}
      <span data-problem={summary.tunnelUnreadyFrames > 0}
        >Unready Tunnel frames: {summary.tunnelUnreadyFrames}</span
      >
      <span data-problem={summary.tunnelUnpreparedLayerFrames > 0}
        >Reveal-before-layers frames: {summary.tunnelUnpreparedLayerFrames}</span
      >
      <span data-problem={summary.tunnelUnpreparedTextureFrames > 0}
        >Reveal-before-textures frames: {summary.tunnelUnpreparedTextureFrames}</span
      >
      <span data-problem={summary.tunnelLateLayerArrivals > 0}
        >Late layer arrivals: {summary.tunnelLateLayerArrivals}</span
      >
      <span
        data-problem={summary.tunnelLayerOpacityStepMaximum > 0.35 &&
          summary.longestSampleGap <= 80}
        >Largest layer alpha step: {summary.tunnelLayerOpacityStepMaximum.toFixed(
          2
        )}</span
      >
      <span
        data-problem={summary.tunnelGridOpacityStepMaximum > 0.35 &&
          summary.longestSampleGap <= 80}
        >Largest grid alpha step: {summary.tunnelGridOpacityStepMaximum.toFixed(
          2
        )}</span
      >
      <span
        data-problem={summary.tunnelPreparedLayerCountMaximum > 1 &&
          summary.tunnelCrossfadeFrames > 2 &&
          (summary.tunnelLayerOpacitySpreadMaximum < 0.08 ||
            summary.tunnelLayerOpacitySpreadMaximum > 0.28)}
        >Layer timing spread: {summary.tunnelPreparedLayerCountMaximum > 1
          ? summary.tunnelLayerOpacitySpreadMaximum.toFixed(2)
          : "n/a · one copy"}</span
      >
      <span
        data-problem={summary.tunnelPreparedLayerCountMaximum > 0 &&
          (summary.tunnelAllLayersPerceptibleProgress === null ||
            summary.tunnelAllLayersPerceptibleProgress > 0.35 ||
            (summary.tunnelLayerMeanOpacityAtHalf ?? 0) < 0.35)}
        >Ensemble legibility: {summary.tunnelAllLayersPerceptibleProgress ===
        null
          ? "never"
          : `${Math.round(summary.tunnelAllLayersPerceptibleProgress * 100)}% reveal`}
        · {summary.tunnelLayerMeanOpacityAtHalf === null
          ? "n/a"
          : `${Math.round(summary.tunnelLayerMeanOpacityAtHalf * 100)}% mean alpha at halfway`}</span
      >
      <span
        data-problem={summary.tunnelPaintedArrival === null ||
          (summary.longestSampleGap <= 80 &&
            (summary.tunnelPaintedArrival.allPropsPerceptibleProgress ===
              null ||
              summary.tunnelPaintedArrival.allPropsPerceptibleProgress > 0.35 ||
              summary.tunnelPaintedArrival.quarterMeanAlpha < 0.15 ||
              summary.tunnelPaintedArrival.halfwayMeanAlpha < 0.35 ||
              summary.tunnelPaintedArrival.growthFrames < 4))}
        title="Reads completed additional-prop draw calls from the Canvas2D renderer, not reactive layer state."
        >Painted prop arrival: {summary.tunnelPaintedArrival === null
          ? "unavailable"
          : `all ${summary.tunnelPaintedArrival.peakProps} by ${summary.tunnelPaintedArrival.allPropsPerceptibleProgress === null ? "never" : `${Math.round(summary.tunnelPaintedArrival.allPropsPerceptibleProgress * 100)}% reveal`} · ${Math.round(summary.tunnelPaintedArrival.quarterMeanAlpha * 100)}% mean alpha at quarter · ${Math.round(summary.tunnelPaintedArrival.halfwayMeanAlpha * 100)}% at halfway · ${summary.tunnelPaintedArrival.growthFrames} rendered growth frames`}</span
      >
      <span data-problem={summary.tunnelUnguardedFormationFrames > 0}
        >Trail-safe formation: {summary.tunnelUnguardedFormationFrames} moving frames
        unguarded</span
      >
      <span data-problem={summary.tunnelFormationTrailCaptures > 0}
        >Formation trail captures: {summary.tunnelFormationTrailCaptures}</span
      >
      <span
        data-problem={summary.tunnelFormationPoseDriftMaximum > 0.001 ||
          summary.tunnelFormationPoseDriftFrames > 0}
        title="Compares every rendered copy with the authored Tunnel pose prepared at the same playhead. The handoff should change opacity only."
        >Formation placement: {(
          summary.tunnelFormationPoseDriftMaximum * 100
        ).toFixed(1)}% max drift · {summary.tunnelFormationPoseDriftFrames}
        drifting frames</span
      >
      <span data-dissolve={summary.tunnelCrossfadeFrames > 0}
        >Layer-bloom frames: {summary.tunnelCrossfadeFrames}</span
      >
      <span data-problem={summary.tunnelDoubleFadeFrames > 0}
        >Double-fade frames: {summary.tunnelDoubleFadeFrames}</span
      >
      <span data-problem={summary.tunnelBlankFrames > 0}
        >Blank frames: {summary.tunnelBlankFrames}</span
      >
      <span data-problem={summary.tunnelLateBackingChanges > 0}
        >Late Tunnel backing changes: {summary.tunnelLateBackingChanges}</span
      >
      <span data-problem={summary.tunnelAnimatorIdentityChanges > 0}
        >Animator remounts: {summary.tunnelAnimatorIdentityChanges}</span
      >
      <span data-problem={summary.tunnelInspectorIdentityChanges > 0}
        >Inspector remounts: {summary.tunnelInspectorIdentityChanges}</span
      >
      <span data-problem={summary.tunnelDuplicateCanvasFrames > 0}
        >Non-singleton canvas frames: {summary.tunnelDuplicateCanvasFrames}</span
      >
      <span data-problem={summary.tunnelDuplicateSettingsFrames > 0}
        >Duplicate active settings frames: {summary.tunnelDuplicateSettingsFrames}</span
      >
      <span
        >Ready-frame handoff: {summary.tunnelHandoffLatency === null
          ? "n/a"
          : `${Math.round(summary.tunnelHandoffLatency)} ms`}</span
      >
      <span>Surface path: {summary.tunnelSurfacePath.join(" → ") || "n/a"}</span
      >
      <span
        >Viewer stage allocation: {formatRange(summary.tunnelStageSize)}</span
      >
      <span>Tunnel display: {formatRange(summary.tunnelDisplaySize)}</span>
      <span data-dissolve={summary.dissolveFrames > 0}
        >Workspace dissolve frames: {summary.dissolveFrames}</span
      >
      <span>Mode path: {summary.modePath.join(" → ") || "n/a"}</span>
      <span data-problem={slowModeCommit}
        >Mode commit: {modeCommitSummary || "n/a"}</span
      >
      <span>Outer axis: {summary.outerDirectionPath.join(" → ") || "n/a"}</span>
    {:else if isMotionTrace}
      <span data-problem={summary.motionBlankFrames > 0}
        >Blank motion frames: {summary.motionBlankFrames}</span
      >
      <span data-problem={summary.motionUnready3DFrames > 0}
        >Unprotected 3D frames: {summary.motionUnready3DFrames}</span
      >
      <span
        data-problem={summary.motionPreparationFrames > 0 &&
          summary.motionCurtainFrames < summary.motionPreparationFrames}
        >Protected preparation frames: {summary.motionCurtainFrames} / {summary.motionPreparationFrames}</span
      >
      <span data-problem={summary.motionMisidentified3DFrames > 0}
        >Misidentified 3D frames: {summary.motionMisidentified3DFrames}</span
      >
      <span data-problem={summary.motionPreparationProgressRegressions > 0}
        >Progress regressions: {summary.motionPreparationProgressRegressions}</span
      >
      <span
        >Preparation phases: {summary.motionPreparationLabels.join(" → ") ||
          "n/a"}</span
      >
      <span data-dissolve={summary.motionCrossfadeFrames > 0}
        >Crossfade frames: {summary.motionCrossfadeFrames}</span
      >
      <span
        >Sharp 2D exit frames: {summary.motionPreparationGeometryHeldFrames}</span
      >
      <span data-problem={summary.motionMagnifiedPreparationFrames > 0}
        >Placeholder raster growth: {summary.motionPreparationRasterGrowthMaximum ===
        null
          ? "n/a"
          : `${summary.motionPreparationRasterGrowthMaximum.toFixed(2)}×`} · peak
        scale {summary.motionPreparationRasterScaleMaximum === null
          ? "n/a"
          : `${summary.motionPreparationRasterScaleMaximum.toFixed(2)}×`}</span
      >
      <span data-problem={summary.motionMagnifiedPreparationFrames > 0}
        >Magnified placeholder frames: {summary.motionMagnifiedPreparationFrames}</span
      >
      <span data-problem={summary.motionLate2DBackingChanges > 0}
        >Late 2D backing changes: {summary.motionLate2DBackingChanges}</span
      >
      <span
        >Ready-frame handoff: {summary.motionHandoffLatency === null
          ? "n/a"
          : `${Math.round(summary.motionHandoffLatency)} ms`}</span
      >
      <span>Surface path: {summary.motionSurfacePath.join(" → ") || "n/a"}</span
      >
      <span
        >Viewer stage allocation: {formatRange(summary.motionStageSize)}</span
      >
      <span
        >Inspector allocation: {formatRange(summary.motionInspectorSize)}</span
      >
      <span data-dissolve={summary.dissolveFrames > 0}
        >Workspace dissolve frames: {summary.dissolveFrames}</span
      >
      <span>Mode path: {summary.modePath.join(" → ") || "n/a"}</span>
      <span data-problem={slowModeCommit}
        >Mode commit: {modeCommitSummary || "n/a"}</span
      >
      <span>Outer axis: {summary.outerDirectionPath.join(" → ") || "n/a"}</span>
    {:else}
      <span
        data-problem={summary.animationExitMinimum !== null &&
          summary.animationExitMinimum < READABLE_PANE_SIZE}
        >Animation exit: {formatSize(summary.animationExitMinimum)}</span
      >
      <span
        data-problem={summary.animationEntryMinimum !== null &&
          summary.animationEntryMinimum < READABLE_PANE_SIZE}
        >Animation entry: {formatSize(summary.animationEntryMinimum)}</span
      >
      <span
        data-problem={summary.cardExitMinimum !== null &&
          summary.cardExitMinimum < READABLE_PANE_SIZE}
        >Card exit: {formatSize(summary.cardExitMinimum)}</span
      >
      <span
        data-problem={summary.cardEntryMinimum !== null &&
          summary.cardEntryMinimum < READABLE_PANE_SIZE}
        >Card entry: {formatSize(summary.cardEntryMinimum)}</span
      >
      <span data-problem={summary.tinyCardFrames > 0}
        >Tiny Card frames: {summary.tinyCardFrames}</span
      >
      <span data-problem={summary.tinyAnimationFrames > 0}
        >Tiny Animation frames: {summary.tinyAnimationFrames}</span
      >
      <span data-problem={summary.magnifiedMandalaReturnFrames > 0}
        >Mandala return scale: {summary.mandalaReturnRasterScaleMaximum === null
          ? "n/a"
          : `${summary.mandalaReturnRasterScaleMaximum.toFixed(2)}×`}</span
      >
      <span data-problem={summary.magnifiedMandalaReturnFrames > 0}
        >Magnified Mandala frames: {summary.magnifiedMandalaReturnFrames}</span
      >
      <span data-dissolve={summary.dissolveFrames > 0}
        >Dissolve frames: {summary.dissolveFrames}</span
      >
      <span data-problem={summary.squashedCardFrames > 0}
        >Card minimum box: {formatCardBox(summary.cardBoxMinimum)}</span
      >
      <span data-problem={summary.squashedCardFrames > 0}
        >Card aspect: {formatAspectRange(
          summary.cardAspectMinimum,
          summary.cardAspectMaximum
        )}</span
      >
      <span data-problem={summary.squashedCardFrames > 0}
        >Squashed Card frames: {summary.squashedCardFrames}</span
      >
      <span data-dissolve={summary.dissolveCoveredCardFrames > 0}
        >Dissolve-covered Card reflow: {summary.dissolveCoveredCardFrames}</span
      >
      <span data-problem={summary.transformedCardCellFrames > 0}
        >Transformed Card cell frames: {summary.transformedCardCellFrames} · max
        {summary.maximumTransformedCardCells} cells</span
      >
      <span>Mode path: {summary.modePath.join(" → ") || "n/a"}</span>
      <span data-problem={slowModeCommit}
        >Mode commit: {modeCommitSummary || "n/a"}</span
      >
      <span>Panel axis: {summary.panelDirectionPath.join(" → ") || "n/a"}</span>
      <span>Outer axis: {summary.outerDirectionPath.join(" → ") || "n/a"}</span>
      <span>Card layout: {summary.cardLayoutPath.join(" → ") || "n/a"}</span>
      <span
        >Layout lease: {summary.cardLayoutLockPath.join(" → ") || "n/a"}</span
      >
      <span
        data-problem={cardGeometryVisible &&
          ((cardFocusOnsetSkew ?? 0) > maxCardClockSkew ||
            (cardFocusSettleSkew ?? 0) > maxCardClockSkew)}
        >Card focus width: {formatMotionTiming(cardFocusWidthMotion)}</span
      >
      <span
        data-problem={cardGeometryVisible &&
          ((cardFocusOnsetSkew ?? 0) > maxCardClockSkew ||
            (cardFocusSettleSkew ?? 0) > maxCardClockSkew)}
        >Card focus rise: {formatMotionTiming(cardFocusVerticalMotion)} · onset skew
        {cardFocusOnsetSkew === null
          ? "n/a"
          : `${Math.round(cardFocusOnsetSkew)} ms`} · settle skew
        {cardFocusSettleSkew === null
          ? "n/a"
          : `${Math.round(cardFocusSettleSkew)} ms`}</span
      >
      <span
        data-problem={cardGeometryVisible &&
          ((cardReturnOnsetSkew ?? 0) > maxCardClockSkew ||
            (cardReturnSettleSkew ?? 0) > maxCardClockSkew)}
        >Card return width: {formatMotionTiming(cardReturnWidthMotion)}</span
      >
      <span
        data-problem={cardGeometryVisible &&
          ((cardReturnOnsetSkew ?? 0) > maxCardClockSkew ||
            (cardReturnSettleSkew ?? 0) > maxCardClockSkew)}
        >Card return fall: {formatMotionTiming(cardReturnVerticalMotion)} · onset
        skew
        {cardReturnOnsetSkew === null
          ? "n/a"
          : `${Math.round(cardReturnOnsetSkew)} ms`} · settle skew
        {cardReturnSettleSkew === null
          ? "n/a"
          : `${Math.round(cardReturnSettleSkew)} ms`}</span
      >
      <span data-problem={(summary.cardReturnPanelWidth?.undershoot ?? 0) > 1}
        >Return panel: {formatUndershoot(summary.cardReturnPanelWidth)}</span
      >
      <span data-problem={(summary.cardReturnPanelHeight?.undershoot ?? 0) > 1}
        >Return panel height: {formatUndershoot(
          summary.cardReturnPanelHeight
        )}</span
      >
      <span data-problem={(summary.cardReturnRootWidth?.undershoot ?? 0) > 1}
        >Return root width: {formatUndershoot(
          summary.cardReturnRootWidth
        )}</span
      >
      <span data-problem={(summary.cardReturnRootHeight?.undershoot ?? 0) > 1}
        >Return root height: {formatUndershoot(
          summary.cardReturnRootHeight
        )}</span
      >
      <span data-problem={(summary.cardReturnVisualWidth?.undershoot ?? 0) > 1}
        >Return visual width: {formatUndershoot(
          summary.cardReturnVisualWidth
        )}</span
      >
      <span data-problem={(summary.cardReturnVisualHeight?.undershoot ?? 0) > 1}
        >Return visual height: {formatUndershoot(
          summary.cardReturnVisualHeight
        )}</span
      >
      <span
        data-problem={(summary.cardReturnTravel?.backtrack ?? 0) > 1 ||
          (summary.cardReturnTravel?.overshoot ?? 0) > 1}
        >Return travel: {formatTravel(summary.cardReturnTravel)}</span
      >
      <span
        data-problem={summary.dissolveFrames === 0 &&
          ((summary.animationReturnSizeTravel?.backtrack ?? 0) > 1 ||
            (summary.animationReturnSizeTravel?.overshoot ?? 0) > 1)}
        >2D return allocation: {formatTravel(
          summary.animationReturnSizeTravel
        )}</span
      >
      <span
        data-problem={settingsReflow(
          summary.cardSettingsFocusWidth,
          summary.cardSettingsFocusHeight,
          summary.cardSettingsFocusCenterY
        )}
        >Settings enter: width {formatRange(summary.cardSettingsFocusWidth)} · height
        {formatRange(summary.cardSettingsFocusHeight)} · center Y
        {formatRange(summary.cardSettingsFocusCenterY)}</span
      >
      <span
        data-problem={settingsReflow(
          summary.cardSettingsReturnWidth,
          summary.cardSettingsReturnHeight,
          summary.cardSettingsReturnCenterY
        )}
        >Settings leave: width {formatRange(summary.cardSettingsReturnWidth)} · height
        {formatRange(summary.cardSettingsReturnHeight)} · center Y
        {formatRange(summary.cardSettingsReturnCenterY)}</span
      >
      <span
        data-problem={summary.dissolveFrames === 0 &&
          (summary.cardEffectsSeamGapMaximum > 1 ||
            (summary.cardEffectsOpacityOnsetSkew ?? 0) > maxCardClockSkew ||
            summary.cardEffectsBlankFrames > 0)}
        >Card → Effects seam: max gap {Math.round(
          summary.cardEffectsSeamGapMaximum
        )} px · opacity onset skew {summary.cardEffectsOpacityOnsetSkew === null
          ? "n/a"
          : `${Math.round(summary.cardEffectsOpacityOnsetSkew)} ms`} · crossfade
        {summary.cardEffectsCrossfadeFrames} frames · blank {summary.cardEffectsBlankFrames}
        frames</span
      >
      {#if returnPanelMinimumSample}
        <span data-problem={(summary.cardReturnPanelWidth?.undershoot ?? 0) > 1}
          >Minimum at {Math.round(returnPanelMinimumSample.time)} ms · stage
          {Math.round(returnPanelMinimumSample.stageSize)} px · pane flex
          {returnPanelMinimumSample.animationFlexGrow.toFixed(2)} / {returnPanelMinimumSample.cardFlexGrow.toFixed(
            2
          )} · inspector {Math.round(returnPanelMinimumSample.inspectorSize)} px</span
        >
      {/if}
      {#if returnMotionOnsets}
        <span
          >Return onset: {Math.round(returnMotionOnsets.phaseStart)} ms · inner
          {returnMotionOnsets.innerStart === null
            ? "n/a"
            : `${Math.round(returnMotionOnsets.innerStart)} ms`} · outer
          {returnMotionOnsets.outerStart === null
            ? "n/a"
            : `${Math.round(returnMotionOnsets.outerStart)} ms`}</span
        >
      {/if}
    {/if}
    <!-- Reveal geometry applies to every gate that resizes the inspector, so it
         is rendered outside the per-gate metric branches. -->
    {#if summary.inspectorSurfaceStep}
      <span data-problem={summary.inspectorSurfaceStep.widthPx > 1}
        >Inspector surface step: {Math.round(
          summary.inspectorSurfaceStep.widthPx
        )} px · {summary.inspectorSurfaceStep.alphaDrop.toFixed(2)} alpha · {Math.round(
          summary.inspectorSurfaceStep.ms
        )} ms</span
      >
    {/if}
    <!-- The Card's size pin outlives the last mode step, so this reads the
         settle tail rather than any one gate's phase. -->
    {#if summary.cardSizePinRelease}
      <span data-problem={summary.cardSizePinRelease.stepPx > 2}
        >Card size pin release: {Math.round(summary.cardSizePinRelease.stepPx)} px
        step · {Math.round(summary.cardSizePinRelease.travelPx)} px over {summary
          .cardSizePinRelease.frames} frames · {Math.round(
          summary.cardSizePinRelease.ms
        )} ms · fill {summary.cardSizePinRelease.fillBefore.toFixed(2)} → {summary.cardSizePinRelease.fillAfter.toFixed(
          2
        )}</span
      >
    {/if}
    <!-- Measured from the commit into card, not from a gate phase: the
         arrival is what the user watches, and it outlives the step that
         started it. -->
    <!-- The dock is the cause the arrival only hints at: a held panel whose
       basis snaps between a length and a keyword re-lays out the whole group
       in one frame. A collapse that takes a single frame is that snap. -->
    {#if summary.dockCollapse}
      <span
        data-problem={summary.dockCollapse.frames <= 1 &&
          summary.dockCollapse.travelPx > 24}
        title="A held dock is sized by its flex-basis alone, and CSS cannot interpolate between a length and a keyword. A collapse that takes one frame is that snap."
        >Dock collapse: {Math.round(summary.dockCollapse.stepPx)} px step · {Math.round(
          summary.dockCollapse.travelPx
        )} px over {summary.dockCollapse.frames} frames · {Math.round(
          summary.dockCollapse.ms
        )} ms</span
      >
    {/if}
    {#if summary.cardArrival}
      <span
        data-problem={summary.cardArrival.offstagePx > 0 ||
          (summary.cardArrival.travelPx > 24 &&
            summary.cardArrival.frames <= 1)}
        >Card arrival: {Math.round(summary.cardArrival.stepPx)} px step · {Math.round(
          summary.cardArrival.travelPx
        )} px climbed over {summary.cardArrival.frames} frames · {Math.round(
          summary.cardArrival.ms
        )} ms · {Math.round(summary.cardArrival.offstagePx)} px offstage</span
      >
    {/if}
    {#each summary.inspectorReveal as reveal (reveal.layer)}
      <span data-problem={revealBroken(reveal)}
        >{reveal.layer} reveal: {formatReveal(reveal)}</span
      >
    {/each}
  </div>

  {#if firstTinyCardSample}
    <p class="problem-detail">
      First tiny card at {Math.round(firstTinyCardSample.time)} ms ·
      {firstTinyCardSample.phase} · panel
      {Math.round(firstTinyCardSample.cardPanelWidth)} ×
      {Math.round(firstTinyCardSample.cardPanelHeight)} · root
      {Math.round(firstTinyCardSample.cardRootWidth)} ×
      {Math.round(firstTinyCardSample.cardRootHeight)} · visual
      {Math.round(firstTinyCardSample.cardContentWidth)} ×
      {Math.round(firstTinyCardSample.cardContentHeight)} · opacity
      {firstTinyCardSample.cardOpacity.toFixed(2)} · focus
      {firstTinyCardSample.focusedPane ?? "split"} · flex
      {firstTinyCardSample.animationFlexGrow.toFixed(2)} /
      {firstTinyCardSample.cardFlexGrow.toFixed(2)} · stage
      {Math.round(firstTinyCardSample.stageSize)}
      ({firstTinyCardSample.stageFlexGrow.toFixed(2)}) · inspector
      {Math.round(firstTinyCardSample.inspectorSize)}
      ({firstTinyCardSample.inspectorFlexGrow.toFixed(2)}) · outer
      {firstTinyCardSample.outerDirection} · hidden/readable
      {String(firstTinyCardSample.cardHidden)} /
      {String(firstTinyCardSample.cardReadable)}
    </p>
  {/if}

  {#if firstMagnifiedMandalaSample}
    <p class="problem-detail">
      First magnified mandala at {Math.round(firstMagnifiedMandalaSample.time)}
      ms · backing {Math.round(firstMagnifiedMandalaSample.mandalaBackingSize)}
      px · display {Math.round(firstMagnifiedMandalaSample.mandalaDisplaySize)}
      px · {firstMagnifiedMandalaSample.mandalaRasterScale.toFixed(2)}×
    </p>
  {/if}

  <svg
    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
    role="img"
    aria-label={isCardStageTrace
      ? `Card and motion-view geometry during the ${trace.command} replay. ${summary.cardStageBlankFrames} blank workspace frames were sampled.`
      : isPerformanceTrace
        ? `Viewer stage and Performances opacity during the ${trace.command} replay. ${summary.performanceBlankFrames} blank frames were sampled.`
        : isMotionTrace
          ? `2D and 3D opacity during the ${trace.command} replay. ${summary.motionBlankFrames} blank frames were sampled.`
          : isTunnelTrace
            ? `The persistent 2D base and Tunnel layer blend during the ${trace.command} replay. ${summary.tunnelAnimatorIdentityChanges} Animator remounts were sampled.`
            : `Pane sizes during the ${trace.command} replay. The Card pane was visibly smaller than ${READABLE_PANE_SIZE} pixels for ${summary.tinyCardFrames} sampled frames.`}
  >
    {#if !isMotionTrace && !isTunnelTrace && !isPerformanceTrace}
      <line
        class="readable-threshold"
        x1={chartInset}
        x2={chartWidth - chartInset}
        y1={y(READABLE_PANE_SIZE)}
        y2={y(READABLE_PANE_SIZE)}
      />
      <text x={chartInset + 4} y={y(READABLE_PANE_SIZE) - 5}
        >{READABLE_PANE_SIZE}px readable floor</text
      >
    {/if}
    <polyline
      class="stage-line"
      points={points(trace.samples, (sample) => sample.stageSize)}
    />
    {#if isPerformanceTrace}
      <polyline
        class="animation-line"
        points={points(
          trace.samples,
          (sample) => sample.stageLayerOpacity * maximumSize
        )}
      />
      <polyline
        class="card-line"
        points={points(
          trace.samples,
          (sample) => sample.performanceLayerOpacity * maximumSize
        )}
      />
    {:else if isTunnelTrace}
      <polyline
        class="animation-line"
        points={points(trace.samples, () => maximumSize)}
      />
      <polyline
        class="card-line"
        points={points(
          trace.samples,
          (sample) => sample.tunnelOpacity * maximumSize
        )}
      />
    {:else if isMotionTrace}
      <polyline
        class="animation-line"
        points={points(
          trace.samples,
          (sample) => sample.motion2DOpacity * maximumSize
        )}
      />
      <polyline
        class="card-line"
        points={points(
          trace.samples,
          (sample) => sample.motion3DOpacity * maximumSize
        )}
      />
    {:else}
      <polyline
        class="animation-line"
        points={points(trace.samples, (sample) => sample.animationSize)}
      />
      <polyline
        class="card-line"
        points={points(trace.samples, (sample) => sample.cardContentWidth)}
      />
      <polyline
        class="card-height-line"
        points={points(trace.samples, (sample) => sample.cardContentHeight)}
      />
      {#each tinyCardSamples as sample}
        <circle
          class="problem-point"
          cx={x(sample.time)}
          cy={y(sample.cardContentWidth)}
          r="3"
        />
      {/each}
    {/if}
  </svg>
</section>

<style>
  .geometry-trace {
    margin-top: 14px;
    padding: 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  header,
  .trace-legend,
  .trace-summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
  }

  header {
    justify-content: space-between;
    gap: 12px;
  }

  header span {
    color: var(--theme-accent, #a78bfa);
    font-size: var(--font-size-compact, 12px);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h3 {
    margin: 3px 0 0;
    font-size: var(--font-size-lg, 18px);
  }

  .trace-legend,
  .trace-summary {
    gap: 10px;
  }

  .trace-legend span,
  .trace-summary span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .trace-legend span::before {
    display: inline-block;
    width: 18px;
    height: 2px;
    margin-right: 6px;
    vertical-align: middle;
    background: currentColor;
    content: "";
  }

  .trace-legend .animation {
    color: var(--prop-blue, #4aa3ff);
  }

  .trace-legend .card {
    color: var(--theme-accent, #a78bfa);
  }

  .trace-legend .stage {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
  }

  .trace-summary {
    margin-top: 12px;
  }

  .trace-summary span[data-problem="true"] {
    color: var(--semantic-warning, #fbbf24);
  }

  .trace-summary span[data-dissolve="true"] {
    color: var(--semantic-success, #6ee7b7);
  }

  .problem-detail {
    margin: 8px 0 0;
    color: var(--semantic-warning, #fbbf24);
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    margin-top: 8px;
    overflow: visible;
  }

  polyline,
  line {
    vector-effect: non-scaling-stroke;
  }

  polyline {
    fill: none;
    stroke-width: 2;
  }

  .stage-line {
    stroke: var(--theme-text-dim, rgba(255, 255, 255, 0.52));
  }

  .animation-line {
    stroke: var(--prop-blue, #4aa3ff);
  }

  .card-line {
    stroke: var(--theme-accent, #a78bfa);
  }

  .card-height-line {
    stroke: var(--semantic-success, #6ee7b7);
    stroke-dasharray: 5 4;
  }

  .readable-threshold {
    stroke: var(--semantic-warning, #fbbf24);
    stroke-dasharray: 4 4;
    stroke-width: 1;
  }

  text {
    fill: var(--semantic-warning, #fbbf24);
    font-size: var(--font-size-compact, 12px);
  }

  .problem-point {
    fill: var(--semantic-warning, #fbbf24);
  }

  @media (max-width: 720px) {
    header {
      align-items: start;
      flex-direction: column;
    }
  }
</style>
