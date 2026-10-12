<script lang="ts">
  import { getVideoTrailsContext } from "../context/video-trails-context";
  import type { DetectedEndpoint, EndpointCorrection } from "../domain/types";

  interface Props {
    selectedEndpointIdx: number;
    onSelectEndpoint: (idx: number) => void;
  }

  const { selectedEndpointIdx, onSelectEndpoint }: Props = $props();
  const { state: trailsState } = getVideoTrailsContext();

  // Current frame's endpoints with their correction status
  interface EndpointDisplay {
    endpoint: DetectedEndpoint;
    correction: EndpointCorrection | undefined;
    label: string;
    color: string;
    status: "detected" | "corrected" | "accepted" | "occluded" | "interpolated";
  }

  let endpointDisplays = $derived.by((): EndpointDisplay[] => {
    const endpoints = trailsState.currentEndpoints;
    const frameCorrectionList =
      trailsState.corrections[trailsState.currentFrame] ?? [];

    return endpoints.map((ep) => {
      const correction = frameCorrectionList.find(
        (c) => c.propIndex === ep.propIndex && c.tipIndex === ep.tipIndex
      );
      const propLabel = ep.propIndex === 0 ? "Left" : "Right";
      return {
        endpoint: ep,
        correction,
        label: `${propLabel} tip ${ep.tipIndex}`,
        color: ep.propIndex === 0 ? "#4a90d9" : "#d94a4a",
        status: correction?.status ?? "detected",
      };
    });
  });

  let detectedCount = $derived(trailsState.currentEndpoints.length);
  let correctedCount = $derived(
    (trailsState.corrections[trailsState.currentFrame] ?? []).filter(
      (c) => c.status === "corrected" || c.status === "accepted"
    ).length
  );

  // Progress: percentage of frames with detections that have at least one correction
  let progressStats = $derived.by(() => {
    const detectedFrameKeys = Object.keys(trailsState.frameDetections);
    const totalDetected = detectedFrameKeys.length;
    if (totalDetected === 0) return { reviewed: 0, total: 0, percent: 0 };

    let reviewed = 0;
    for (const key of detectedFrameKeys) {
      const frame = Number(key);
      if (
        trailsState.corrections[frame] &&
        trailsState.corrections[frame].length > 0
      ) {
        reviewed++;
      }
    }
    return {
      reviewed,
      total: totalDetected,
      percent: Math.round((reviewed / totalDetected) * 100),
    };
  });

  function getStatusIcon(status: EndpointDisplay["status"]): string {
    switch (status) {
      case "corrected":
        return "fa-check-circle";
      case "accepted":
        return "fa-check";
      case "occluded":
        return "fa-eye-slash";
      case "interpolated":
        return "fa-arrows-alt-h";
      default:
        return "fa-circle";
    }
  }

  function getStatusClass(status: EndpointDisplay["status"]): string {
    switch (status) {
      case "corrected":
        return "status-corrected";
      case "accepted":
        return "status-accepted";
      case "occluded":
        return "status-occluded";
      case "interpolated":
        return "status-interpolated";
      default:
        return "status-detected";
    }
  }

  function handleAcceptAll(): void {
    const endpoints = trailsState.currentEndpoints;
    const frame = trailsState.currentFrame;
    for (const ep of endpoints) {
      trailsState.correctEndpoint(frame, {
        propIndex: ep.propIndex,
        tipIndex: ep.tipIndex,
        detected: { x: ep.x, y: ep.y, confidence: ep.confidence },
        corrected: null,
        status: "accepted",
      });
    }
  }

  function handleCopyPrevious(): void {
    if (trailsState.currentFrame === 0) return;
    const prevFrame = trailsState.currentFrame - 1;
    const prevCorrections = trailsState.corrections[prevFrame];
    if (!prevCorrections) return;

    for (const c of prevCorrections) {
      trailsState.correctEndpoint(trailsState.currentFrame, { ...c });
    }
  }

  function handleInterpolateGap(): void {
    // Find the nearest corrected frame before and after the current frame for each endpoint.
    // This is a simplified interpolation trigger that delegates to the state's interpolateGap
    // for each endpoint found in the previous/next corrected frames.
    const frame = trailsState.currentFrame;
    const endpoints = trailsState.currentEndpoints;

    for (const ep of endpoints) {
      // Find nearest corrected frame before
      let startFrame = -1;
      for (let f = frame - 1; f >= 0; f--) {
        const corr = trailsState.corrections[f]?.find(
          (c) =>
            c.propIndex === ep.propIndex &&
            c.tipIndex === ep.tipIndex &&
            c.corrected
        );
        if (corr) {
          startFrame = f;
          break;
        }
      }

      // Find nearest corrected frame after
      let endFrame = -1;
      for (let f = frame + 1; f < trailsState.totalFrames; f++) {
        const corr = trailsState.corrections[f]?.find(
          (c) =>
            c.propIndex === ep.propIndex &&
            c.tipIndex === ep.tipIndex &&
            c.corrected
        );
        if (corr) {
          endFrame = f;
          break;
        }
      }

      if (startFrame >= 0 && endFrame >= 0) {
        trailsState.interpolateGap(
          startFrame + 1,
          endFrame - 1,
          ep.propIndex,
          ep.tipIndex
        );
      }
    }
  }

  function handleMarkOccluded(ep: DetectedEndpoint): void {
    trailsState.markOccluded(
      trailsState.currentFrame,
      ep.propIndex,
      ep.tipIndex
    );
  }
</script>

<div class="endpoint-sidebar">
  <!-- Frame info header -->
  <div class="frame-info">
    <div class="frame-title">
      <i class="fas fa-crosshairs" aria-hidden="true"></i>
      <span>Frame {trailsState.currentFrame + 1}</span>
    </div>
    <div class="frame-counts">
      <span class="count-item">
        <span class="count-dot detected"></span>
        {detectedCount} detected
      </span>
      <span class="count-item">
        <span class="count-dot corrected"></span>
        {correctedCount} corrected
      </span>
    </div>
  </div>

  <!-- Endpoint list -->
  <div class="endpoint-list" role="listbox" aria-label="Endpoints">
    <div class="list-header">Endpoints</div>
    {#if endpointDisplays.length === 0}
      <p class="empty-msg">No endpoints on this frame</p>
    {:else}
      {#each endpointDisplays as display, i (i)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="endpoint-row"
          class:selected={i === selectedEndpointIdx}
          onclick={() => onSelectEndpoint(i)}
          role="option"
          aria-selected={i === selectedEndpointIdx}
          tabindex="0"
        >
          <span class="ep-dot" style="background: {display.color}"></span>
          <span class="ep-label">{display.label}</span>
          <span class="ep-status {getStatusClass(display.status)}">
            <i class="fas {getStatusIcon(display.status)}" aria-hidden="true"
            ></i>
          </span>
          <button
            class="ep-occlude-btn"
            onclick={(e: MouseEvent) => {
              e.stopPropagation();
              handleMarkOccluded(display.endpoint);
            }}
            title="Mark occluded"
            aria-label="Mark {display.label} as occluded"
          >
            <i class="fas fa-eye-slash" aria-hidden="true"></i>
          </button>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Quick actions -->
  <div class="quick-actions">
    <div class="list-header">Quick Actions</div>
    <button
      class="action-btn"
      onclick={handleAcceptAll}
      disabled={endpointDisplays.length === 0}
    >
      <i class="fas fa-check-double" aria-hidden="true"></i>
      Accept All
    </button>
    <button
      class="action-btn"
      onclick={handleCopyPrevious}
      disabled={trailsState.currentFrame === 0}
    >
      <i class="fas fa-copy" aria-hidden="true"></i>
      Copy Previous
    </button>
    <button
      class="action-btn"
      onclick={handleInterpolateGap}
      disabled={endpointDisplays.length === 0}
    >
      <i class="fas fa-arrows-alt-h" aria-hidden="true"></i>
      Interpolate Gap
    </button>
  </div>

  <!-- Progress -->
  <div class="progress-section">
    <div class="progress-header">
      <span>Review Progress</span>
      <span class="progress-pct">{progressStats.percent}%</span>
    </div>
    <div
      class="progress-track"
      role="progressbar"
      aria-valuenow={progressStats.percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div class="progress-fill" style="width: {progressStats.percent}%"></div>
    </div>
    <span class="progress-detail">
      {progressStats.reviewed} / {progressStats.total} frames reviewed
    </span>
  </div>

  <!-- Stats -->
  <div class="stats-section">
    <div class="stat-row">
      <span class="stat-label">Total corrections</span>
      <span class="stat-value">{trailsState.correctionCount}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Low confidence</span>
      <span class="stat-value warn"
        >{trailsState.lowConfidenceFrames.length}</span
      >
    </div>
  </div>
</div>

<style>
  .endpoint-sidebar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      transparent;
  }

  /* Frame info */
  .frame-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
  }

  .frame-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .frame-title i {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .frame-counts {
    display: flex;
    gap: 12px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .count-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .count-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .count-dot.detected {
    background: var(--semantic-success, #22c55e);
  }

  .count-dot.corrected {
    background: var(--theme-accent, #f43f5e);
  }

  /* Endpoint list */
  .endpoint-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
  }

  .list-header {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }

  .empty-msg {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
    font-style: italic;
  }

  .endpoint-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition:
      background var(--duration-instant),
      border-color var(--duration-instant);
    text-align: left;
  }

  .endpoint-row:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .endpoint-row.selected {
    border-color: var(--theme-accent, #f43f5e);
    background: color-mix(
      in srgb,
      var(--theme-accent, #f43f5e) 10%,
      transparent
    );
  }

  .ep-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ep-label {
    flex: 1;
    font-weight: 500;
  }

  .ep-status {
    font-size: var(--font-size-compact, 12px);
    flex-shrink: 0;
  }

  .status-detected {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
  }

  .status-corrected {
    color: var(--semantic-success, #22c55e);
  }

  .status-accepted {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .status-occluded {
    color: var(--semantic-error, #ef4444);
  }

  .status-interpolated {
    color: var(--theme-accent, #f43f5e);
  }

  .ep-occlude-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
    font-size: 11px;
    cursor: pointer;
    transition:
      color var(--duration-instant),
      background var(--duration-instant);
    flex-shrink: 0;
  }

  .ep-occlude-btn:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  /* Quick actions */
  .quick-actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition:
      background var(--duration-instant),
      border-color var(--duration-instant);
    text-align: left;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .action-btn i {
    width: 14px;
    text-align: center;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  /* Progress */
  .progress-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .progress-pct {
    font-weight: 700;
    color: var(--theme-text, #ffffff);
  }

  .progress-track {
    height: 6px;
    border-radius: 3px;
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--theme-accent, #f43f5e);
    transition: width var(--duration-normal) var(--ease-standard);
  }

  .progress-detail {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  /* Stats */
  .stats-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-size-compact, 12px);
  }

  .stat-label {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .stat-value {
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .stat-value.warn {
    color: var(--semantic-warning, #eab308);
  }
</style>
