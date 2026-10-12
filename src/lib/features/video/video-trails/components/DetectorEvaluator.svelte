<script lang="ts">
  import { getVideoTrailsContext } from "../context/video-trails-context";
  import { DETECTOR_REGISTRY } from "../domain/types";
  import type { IEndpointDetector } from "../services/IEndpointDetector";
  import { getLedThresholdDetector } from "../get-led-threshold-detector";
  import { getColorEndpointDetector } from "../get-color-endpoint-detector";
  import type { DetectedEndpoint, EndpointCorrection } from "../domain/types";

  interface Props {
    videoElement: HTMLVideoElement | null;
  }

  const { videoElement }: Props = $props();
  const { state: trailsState } = getVideoTrailsContext();

  interface FrameResult {
    frame: number;
    detected: DetectedEndpoint[];
    corrections: EndpointCorrection[];
    matchDistances: (number | null)[];
    missCount: number;
    falsePositiveCount: number;
  }

  let evaluating = $state(false);
  let progress = $state(0);
  let frameResults = $state<FrameResult[]>([]);
  let expandedFrames = $state<Set<number>>(new Set());
  let hasRun = $state(false);

  const ACCURACY_THRESHOLD_PX = 10;

  const summaryMetrics = $derived.by(() => {
    if (frameResults.length === 0) return null;

    let totalCorrections = 0;
    let accurateHits = 0;
    let totalError = 0;
    let errorCount = 0;
    let totalMisses = 0;
    let totalFalsePositives = 0;
    let totalDetections = 0;

    for (const result of frameResults) {
      totalCorrections += result.corrections.length;
      totalMisses += result.missCount;
      totalFalsePositives += result.falsePositiveCount;
      totalDetections += result.detected.length;

      for (const dist of result.matchDistances) {
        if (dist === null) continue;
        totalError += dist;
        errorCount++;
        if (dist <= ACCURACY_THRESHOLD_PX) accurateHits++;
      }
    }

    const detectionAccuracy =
      totalCorrections > 0 ? (accurateHits / totalCorrections) * 100 : 0;

    const avgError = errorCount > 0 ? totalError / errorCount : 0;

    const missRate =
      totalCorrections > 0 ? (totalMisses / totalCorrections) * 100 : 0;

    const falsePositiveRate =
      totalDetections > 0 ? (totalFalsePositives / totalDetections) * 100 : 0;

    return { detectionAccuracy, avgError, missRate, falsePositiveRate };
  });

  const correctedFrameCount = $derived(
    Object.keys(trailsState.corrections).length
  );

  const canRun = $derived(
    !!videoElement &&
      !!trailsState.source &&
      correctedFrameCount > 0 &&
      !evaluating
  );

  async function runEvaluation() {
    if (!videoElement || !trailsState.source) return;

    evaluating = true;
    progress = 0;
    frameResults = [];
    hasRun = true;
    expandedFrames = new Set();

    const offscreen = document.createElement("canvas");
    offscreen.width = trailsState.source.resolution.width;
    offscreen.height = trailsState.source.resolution.height;
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      evaluating = false;
      return;
    }

    const registration = DETECTOR_REGISTRY.find(
      (r) => r.id === trailsState.activeDetectorId
    );
    const containerKey = registration?.containerKey ?? "ledThresholdDetector";
    const detectorMap: Record<string, () => IEndpointDetector> = {
      ledThresholdDetector: getLedThresholdDetector,
      colorEndpointDetector: getColorEndpointDetector,
    };
    const detector = (detectorMap[containerKey] ?? getLedThresholdDetector)();

    const correctedFrameNumbers = Object.keys(trailsState.corrections)
      .map(Number)
      .sort((a, b) => a - b);
    const results: FrameResult[] = [];

    for (let i = 0; i < correctedFrameNumbers.length; i++) {
      const frame = correctedFrameNumbers[i]!;
      progress = i / correctedFrameNumbers.length;

      videoElement.currentTime = frame / trailsState.source.fps;
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          videoElement!.removeEventListener("seeked", onSeeked);
          resolve();
        };
        videoElement!.addEventListener("seeked", onSeeked);
      });

      ctx.drawImage(videoElement, 0, 0);
      const imageData = ctx.getImageData(
        0,
        0,
        offscreen.width,
        offscreen.height
      );
      const detected = detector.detect(imageData, trailsState.detectionConfig);

      const corrections = trailsState.corrections[frame] ?? [];

      const matchDistances: (number | null)[] = corrections.map(
        (correction) => {
          if (!correction.corrected) return null;

          let minDist: number | null = null;
          for (const det of detected) {
            const dx = det.x - correction.corrected.x;
            const dy = det.y - correction.corrected.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (minDist === null || dist < minDist) minDist = dist;
          }
          return minDist;
        }
      );

      const missCount = corrections.filter((c, idx) => {
        if (!c.corrected) return false;
        const dist = matchDistances[idx] ?? null;
        return dist === null || dist > ACCURACY_THRESHOLD_PX * 3;
      }).length;

      const falsePositiveCount = detected.filter((det) => {
        return !corrections.some((c) => {
          if (!c.corrected) return false;
          const dx = det.x - c.corrected.x;
          const dy = det.y - c.corrected.y;
          return Math.sqrt(dx * dx + dy * dy) <= ACCURACY_THRESHOLD_PX * 2;
        });
      }).length;

      results.push({
        frame,
        detected,
        corrections,
        matchDistances,
        missCount,
        falsePositiveCount,
      });
    }

    frameResults = results;
    progress = 1;
    evaluating = false;
  }

  function toggleFrameExpanded(frame: number) {
    const next = new Set(expandedFrames);
    if (next.has(frame)) next.delete(frame);
    else next.add(frame);
    expandedFrames = next;
  }

  function formatPercent(v: number) {
    return v.toFixed(1) + "%";
  }

  function formatPx(v: number) {
    return v.toFixed(1) + " px";
  }

  function metricClass(
    value: number,
    goodBelow: number,
    badAbove: number
  ): string {
    if (value <= goodBelow) return "good";
    if (value >= badAbove) return "bad";
    return "neutral";
  }

  function accuracyClass(value: number): string {
    if (value >= 90) return "good";
    if (value <= 60) return "bad";
    return "neutral";
  }
</script>

<div class="evaluator-panel">
  <div class="panel-header">
    <i class="fas fa-chart-bar" aria-hidden="true"></i>
    <span>Detector Evaluation</span>
  </div>

  {#if correctedFrameCount === 0}
    <p class="empty-hint">
      Add corrections in the editor first - the evaluator re-runs the detector
      on corrected frames and measures how well it did.
    </p>
  {:else}
    <p class="hint">
      {correctedFrameCount} corrected {correctedFrameCount === 1
        ? "frame"
        : "frames"} available. Evaluation seeks to each frame and re-runs the detector.
    </p>
  {/if}

  <button
    class="run-btn"
    onclick={runEvaluation}
    disabled={!canRun}
    aria-label="Run detector evaluation"
  >
    {#if evaluating}
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      Evaluating…
    {:else}
      <i class="fas fa-play" aria-hidden="true"></i>
      Run Evaluation
    {/if}
  </button>

  {#if evaluating}
    <div
      class="progress-bar-wrap"
      role="progressbar"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div class="progress-bar-fill" style="width: {progress * 100}%"></div>
    </div>
    <p class="progress-label">
      Frame {Math.round(progress * correctedFrameCount)} / {correctedFrameCount}
    </p>
  {/if}

  {#if hasRun && !evaluating && summaryMetrics}
    <div class="metrics-section">
      <div class="metrics-header">Summary</div>
      <dl class="metrics-grid">
        <div class="metric-cell">
          <dt>Detection accuracy</dt>
          <dd class={accuracyClass(summaryMetrics.detectionAccuracy)}>
            {formatPercent(summaryMetrics.detectionAccuracy)}
          </dd>
          <span class="metric-sub">within {ACCURACY_THRESHOLD_PX}px</span>
        </div>
        <div class="metric-cell">
          <dt>Average error</dt>
          <dd class={metricClass(summaryMetrics.avgError, 5, 20)}>
            {formatPx(summaryMetrics.avgError)}
          </dd>
          <span class="metric-sub">mean distance</span>
        </div>
        <div class="metric-cell">
          <dt>Miss rate</dt>
          <dd class={metricClass(summaryMetrics.missRate, 10, 30)}>
            {formatPercent(summaryMetrics.missRate)}
          </dd>
          <span class="metric-sub">not detected</span>
        </div>
        <div class="metric-cell">
          <dt>False positives</dt>
          <dd class={metricClass(summaryMetrics.falsePositiveRate, 10, 30)}>
            {formatPercent(summaryMetrics.falsePositiveRate)}
          </dd>
          <span class="metric-sub">of all detections</span>
        </div>
      </dl>
    </div>

    {#if frameResults.length > 0}
      <div class="frames-section">
        <div class="frames-header">Per-frame results</div>
        <ul class="frame-list">
          {#each frameResults as result (result.frame)}
            {@const expanded = expandedFrames.has(result.frame)}
            {@const worstDist = result.matchDistances.reduce<number>(
              (m, d) => (d !== null && d > m ? d : m),
              0
            )}
            <li class="frame-item">
              <button
                class="frame-row"
                onclick={() => toggleFrameExpanded(result.frame)}
                aria-expanded={expanded}
              >
                <span class="frame-num">F{result.frame}</span>
                <span class="frame-badges">
                  {#if result.missCount > 0}
                    <span class="badge bad">{result.missCount} missed</span>
                  {/if}
                  {#if result.falsePositiveCount > 0}
                    <span class="badge warn"
                      >{result.falsePositiveCount} FP</span
                    >
                  {/if}
                  {#if result.missCount === 0 && result.falsePositiveCount === 0}
                    <span class="badge good">OK</span>
                  {/if}
                </span>
                <span class="frame-err">
                  {worstDist > 0 ? formatPx(worstDist) : "-"}
                </span>
                <i
                  class="fas {expanded ? 'fa-chevron-up' : 'fa-chevron-down'}"
                  aria-hidden="true"
                ></i>
              </button>

              {#if expanded}
                <div class="frame-detail">
                  <table class="detail-table">
                    <thead>
                      <tr>
                        <th>Prop</th>
                        <th>Tip</th>
                        <th>Corrected pos</th>
                        <th>Nearest det.</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each result.corrections as correction, idx}
                        {@const dist = result.matchDistances[idx] ?? null}
                        <tr
                          class={dist !== null && dist <= ACCURACY_THRESHOLD_PX
                            ? "row-ok"
                            : "row-miss"}
                        >
                          <td
                            >{correction.propIndex === 0 ? "Left" : "Right"}</td
                          >
                          <td>{correction.tipIndex}</td>
                          <td>
                            {#if correction.corrected}
                              ({Math.round(correction.corrected.x)}, {Math.round(
                                correction.corrected.y
                              )})
                            {:else}
                              occluded
                            {/if}
                          </td>
                          <td>
                            {#if dist !== null}
                              {formatPx(dist)} away
                            {:else}
                              none
                            {/if}
                          </td>
                          <td
                            class={dist === null
                              ? "cell-miss"
                              : dist <= ACCURACY_THRESHOLD_PX
                                ? "cell-ok"
                                : "cell-bad"}
                          >
                            {#if dist === null}
                              miss
                            {:else if dist <= ACCURACY_THRESHOLD_PX}
                              ✓
                            {:else}
                              {formatPx(dist)}
                            {/if}
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}

  {#if hasRun && !evaluating && frameResults.length === 0}
    <p class="empty-hint">
      No results - corrections may have been cleared since evaluation started.
    </p>
  {/if}
</div>

<style>
  .evaluator-panel {
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

  .hint,
  .empty-hint {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    line-height: 1.4;
  }

  .run-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--theme-accent, #f43f5e);
    background: color-mix(
      in srgb,
      var(--theme-accent, #f43f5e) 15%,
      transparent
    );
    color: var(--theme-accent, #f43f5e);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: background var(--duration-fast);
  }

  .run-btn:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--theme-accent, #f43f5e) 25%,
      transparent
    );
  }

  .run-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    background: transparent;
  }

  .progress-bar-wrap {
    height: 4px;
    border-radius: 2px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: var(--theme-accent, #f43f5e);
    border-radius: 2px;
    transition: width var(--duration-instant) linear;
  }

  .progress-label {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    text-align: center;
  }

  .metrics-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .metrics-header,
  .frames-header {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 0;
  }

  .metric-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
  }

  .metric-cell dt {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    line-height: 1.2;
  }

  .metric-cell dd {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.1;
  }

  .metric-cell .metric-sub {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
  }

  .metric-cell dd.good {
    color: var(--semantic-success, #22c55e);
  }

  .metric-cell dd.bad {
    color: var(--semantic-error, #ef4444);
  }

  .metric-cell dd.neutral {
    color: var(--theme-text, #fff);
  }

  .frames-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .frame-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 260px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      transparent;
  }

  .frame-item {
    border-radius: 6px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    overflow: hidden;
  }

  .frame-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: none;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    text-align: left;
    transition: background var(--duration-instant);
  }

  .frame-row:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.07));
  }

  .frame-num {
    font-weight: 600;
    min-width: 36px;
    font-family: monospace;
  }

  .frame-badges {
    display: flex;
    gap: 4px;
    flex: 1;
    flex-wrap: wrap;
  }

  .badge {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    line-height: 1.4;
  }

  .badge.bad {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
  }

  .badge.warn {
    background: color-mix(
      in srgb,
      var(--semantic-warning, #eab308) 20%,
      transparent
    );
    color: var(--semantic-warning, #eab308);
  }

  .badge.good {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 20%,
      transparent
    );
    color: var(--semantic-success, #22c55e);
  }

  .frame-err {
    font-family: monospace;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    min-width: 56px;
    text-align: right;
  }

  .frame-row i.fas {
    font-size: 10px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
  }

  .frame-detail {
    padding: 8px;
    background: var(--theme-overlay-bg, rgba(0, 0, 0, 0.2));
    overflow-x: auto;
  }

  .detail-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-compact, 12px);
  }

  .detail-table th {
    text-align: left;
    padding: 3px 6px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-weight: 600;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .detail-table td {
    padding: 3px 6px;
    color: var(--theme-text, #fff);
    font-family: monospace;
  }

  .row-ok td {
    opacity: 0.85;
  }

  .row-miss td {
    opacity: 1;
  }

  .cell-ok {
    color: var(--semantic-success, #22c55e) !important;
    font-weight: 600;
  }

  .cell-bad {
    color: var(--semantic-error, #ef4444) !important;
    font-weight: 600;
  }

  .cell-miss {
    color: var(--semantic-warning, #eab308) !important;
    font-weight: 600;
    font-family: sans-serif !important;
  }
</style>
