<script lang="ts">
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { getVideoTrailsContext } from "../context/video-trails-context";
  import type { DetectedEndpoint, EndpointCorrection } from "../domain/types";

  interface Props {
    videoElement: HTMLVideoElement | null;
  }

  interface TrainingExport {
    exportedAt: string;
    totalFrames: number;
    correctedFrames: number;
    corrections: Record<number, EndpointCorrection[]>;
    detections: Record<number, DetectedEndpoint[]>;
  }

  interface DriftBucket {
    label: string;
    min: number;
    max: number;
    count: number;
  }

  interface WorstFrame {
    frameIndex: number;
    avgDrift: number;
    correctionCount: number;
  }

  const { videoElement }: Props = $props();
  const { state: trailsState } = getVideoTrailsContext();

  let isExportingImages = $state(false);
  let imageExportProgress = $state(0);
  let imageExportTotal = $state(0);

  const detectedFrameCount = $derived(Object.keys(trailsState.frameDetections).length);

  // Average pixel distance between detected and corrected positions across all corrections
  const avgCorrectionDrift = $derived.by((): number => {
    let total = 0;
    let count = 0;
    for (const correctionList of Object.values(trailsState.corrections)) {
      for (const c of correctionList) {
        if (c.detected && c.corrected) {
          const dx = c.corrected.x - c.detected.x;
          const dy = c.corrected.y - c.detected.y;
          total += Math.sqrt(dx * dx + dy * dy);
          count++;
        }
      }
    }
    return count > 0 ? total / count : 0;
  });

  // Histogram of correction drift magnitudes across 5 buckets
  const driftBuckets = $derived.by((): DriftBucket[] => {
    const buckets: DriftBucket[] = [
      { label: "0–5 px", min: 0, max: 5, count: 0 },
      { label: "5–10 px", min: 5, max: 10, count: 0 },
      { label: "10–20 px", min: 10, max: 20, count: 0 },
      { label: "20–50 px", min: 20, max: 50, count: 0 },
      { label: "50+ px", min: 50, max: Infinity, count: 0 },
    ];

    for (const correctionList of Object.values(trailsState.corrections)) {
      for (const c of correctionList) {
        if (c.detected && c.corrected) {
          const dx = c.corrected.x - c.detected.x;
          const dy = c.corrected.y - c.detected.y;
          const drift = Math.sqrt(dx * dx + dy * dy);
          const bucket = buckets.find((b) => drift >= b.min && drift < b.max);
          if (bucket) bucket.count++;
        }
      }
    }

    return buckets;
  });

  const maxBucketCount = $derived(Math.max(1, ...driftBuckets.map((b) => b.count)));

  // Top 5 frames by average drift magnitude
  const worstFrames = $derived.by((): WorstFrame[] => {
    const perFrame: WorstFrame[] = [];

    for (const [frameStr, correctionList] of Object.entries(trailsState.corrections)) {
      let total = 0;
      let count = 0;
      for (const c of correctionList) {
        if (c.detected && c.corrected) {
          const dx = c.corrected.x - c.detected.x;
          const dy = c.corrected.y - c.detected.y;
          total += Math.sqrt(dx * dx + dy * dy);
          count++;
        }
      }
      if (count > 0) {
        perFrame.push({
          frameIndex: Number(frameStr),
          avgDrift: total / count,
          correctionCount: correctionList.length,
        });
      }
    }

    return perFrame.sort((a, b) => b.avgDrift - a.avgDrift).slice(0, 5);
  });

  // Count of endpoint-frames marked as occluded
  const occlusionStats = $derived.by(() => {
    let occluded = 0;
    let total = 0;
    for (const correctionList of Object.values(trailsState.corrections)) {
      for (const c of correctionList) {
        total++;
        if (c.status === "occluded") occluded++;
      }
    }
    return { occluded, total };
  });

  const hasAnyData = $derived(detectedFrameCount > 0 || trailsState.correctionCount > 0);
  const hasCorrectedFrames = $derived(trailsState.correctionCount > 0);

  function handleExport() {
    const data: TrainingExport = {
      exportedAt: new Date().toISOString(),
      totalFrames: trailsState.totalFrames,
      correctedFrames: trailsState.correctionCount,
      corrections: trailsState.corrections,
      detections: trailsState.frameDetections,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "video-trails-training-data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportWithImages() {
    if (!videoElement || !trailsState.source) return;

    const correctedFrameNumbers = Object.keys(trailsState.corrections).map(Number);
    if (correctedFrameNumbers.length === 0) return;

    isExportingImages = true;
    imageExportProgress = 0;
    imageExportTotal = correctedFrameNumbers.length;

    const canvas = document.createElement("canvas");
    canvas.width = trailsState.source.resolution.width || videoElement.videoWidth;
    canvas.height = trailsState.source.resolution.height || videoElement.videoHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      isExportingImages = false;
      return;
    }

    const fps = trailsState.source.fps;
    const trainingPairs: Array<{
      frameIndex: number;
      frame: { width: number; height: number; dataUrl: string };
      detected: DetectedEndpoint[];
      corrected: EndpointCorrection[];
    }> = [];

    // Seek to each corrected frame, capture the image, and build the training pair.
    // Seeking is async - we wait for seeked event before drawing.
    for (let i = 0; i < correctedFrameNumbers.length; i++) {
      const frameIndex = correctedFrameNumbers[i]!;
      const targetTime = frameIndex / fps;

      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          videoElement!.removeEventListener("seeked", onSeeked);
          resolve();
        };
        videoElement!.addEventListener("seeked", onSeeked);
        videoElement!.currentTime = targetTime;
      });

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

      trainingPairs.push({
        frameIndex,
        frame: { width: canvas.width, height: canvas.height, dataUrl },
        detected: trailsState.frameDetections[frameIndex] ?? [],
        corrected: trailsState.corrections[frameIndex] ?? [],
      });

      imageExportProgress = i + 1;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      totalFrames: trailsState.totalFrames,
      correctedFrames: trailsState.correctionCount,
      trainingPairs,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "video-trails-training-data-with-frames.json";
    a.click();
    URL.revokeObjectURL(url);

    isExportingImages = false;
    imageExportProgress = 0;
  }
</script>

<div class="training-panel">
  <div class="panel-header">
    <i class="fas fa-database" aria-hidden="true"></i>
    <span>Training Data</span>
  </div>

  <!-- Basic stats -->
  <dl class="stats">
    <div class="stat-row">
      <dt>Frames with detections</dt>
      <dd>{detectedFrameCount}</dd>
    </div>
    <div class="stat-row">
      <dt>Corrected frames</dt>
      <dd class:has-data={trailsState.correctionCount > 0}>{trailsState.correctionCount}</dd>
    </div>
    <div class="stat-row">
      <dt>Low confidence frames</dt>
      <dd class:warning={trailsState.lowConfidenceFrames.length > 0}>
        {trailsState.lowConfidenceFrames.length}
      </dd>
    </div>
    <div class="stat-row">
      <dt>Avg correction drift</dt>
      <dd>
        {#if avgCorrectionDrift > 0}
          {avgCorrectionDrift.toFixed(1)} px
        {:else}
          -
        {/if}
      </dd>
    </div>
    <div class="stat-row">
      <dt>Occluded endpoints</dt>
      <dd class:warning={occlusionStats.occluded > 0}>
        {#if occlusionStats.total > 0}
          {occlusionStats.occluded} / {occlusionStats.total}
        {:else}
          -
        {/if}
      </dd>
    </div>
  </dl>

  {#if hasCorrectedFrames}
    <!-- Correction Magnitude Histogram -->
    <div class="section">
      <div class="section-title">Drift Magnitude Distribution</div>
      <div class="histogram">
        {#each driftBuckets as bucket}
          <div class="histogram-row">
            <span class="bucket-label">{bucket.label}</span>
            <div class="bar-container">
              <div
                class="bar"
                class:bar-warm={bucket.min >= 20}
                style="width: {(bucket.count / maxBucketCount) * 100}%"
              ></div>
            </div>
            <span class="bucket-count">{bucket.count}</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Worst Frames -->
    {#if worstFrames.length > 0}
      <div class="section">
        <div class="section-title">Highest-Drift Frames</div>
        <ul class="worst-frames">
          {#each worstFrames as entry}
            <li>
              <FilterChipBase
                label="Frame {entry.frameIndex}"
                icon="fas fa-forward-step"
                mode="action"
                size="sm"
                ariaLabel="Jump to frame {entry.frameIndex}"
                onclick={() => trailsState.setCurrentFrame(entry.frameIndex)}
              />
              <span class="frame-drift">{entry.avgDrift.toFixed(1)} px</span>
              <span class="frame-corrections">{entry.correctionCount} corr.</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}

  <!-- Export buttons -->
  <div class="export-buttons">
    <button
      class="export-btn"
      onclick={handleExport}
      disabled={!hasAnyData}
    >
      <i class="fas fa-download" aria-hidden="true"></i>
      Export Training Data
    </button>

    <button
      class="export-btn export-btn-secondary"
      onclick={handleExportWithImages}
      disabled={!hasCorrectedFrames || !videoElement || isExportingImages}
    >
      {#if isExportingImages}
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        Capturing {imageExportProgress} / {imageExportTotal}…
      {:else}
        <i class="fas fa-film" aria-hidden="true"></i>
        Export with Frame Images
      {/if}
    </button>
  </div>
</div>

<style>
  .training-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #fff);
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }

  .panel-header i {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .stats {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--font-size-compact, 12px);
  }

  dt {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  dd {
    margin: 0;
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  dd.has-data {
    color: var(--semantic-success, #22c55e);
  }

  dd.warning {
    color: var(--semantic-error, #ef4444);
  }

  /* Sections (histogram, worst frames) */

  .section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-title {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Histogram */

  .histogram {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .histogram-row {
    display: grid;
    grid-template-columns: 56px 1fr 28px;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact, 12px);
  }

  .bucket-label {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    text-align: right;
    white-space: nowrap;
  }

  .bar-container {
    height: 10px;
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
    border-radius: 3px;
    overflow: hidden;
  }

  .bar {
    height: 100%;
    background: var(--theme-accent, #f43f5e);
    border-radius: 3px;
    transition: width 0.2s ease;
    min-width: 2px;
  }

  /* Warm color (larger drift = more concern) */
  .bar.bar-warm {
    background: var(--semantic-warning, #f59e0b);
  }

  .bucket-count {
    font-weight: 600;
    color: var(--theme-text, #fff);
    text-align: right;
  }

  /* Worst frames list */

  .worst-frames {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .worst-frames li {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact, 12px);
  }

  .frame-drift {
    font-weight: 600;
    color: var(--theme-text, #fff);
    margin-left: auto;
  }

  .frame-corrections {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  /* Export buttons */

  .export-buttons {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .export-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--theme-accent, #f43f5e);
    background: color-mix(in srgb, var(--theme-accent, #f43f5e) 15%, transparent);
    color: var(--theme-accent, #f43f5e);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: background 0.15s;
  }

  .export-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent, #f43f5e) 25%, transparent);
  }

  .export-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    background: transparent;
  }

  /* Secondary export button - muted variant */
  .export-btn-secondary {
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
  }

  .export-btn-secondary:hover:not(:disabled) {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #fff);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }
</style>
