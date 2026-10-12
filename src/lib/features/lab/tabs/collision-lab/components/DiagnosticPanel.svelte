<script lang="ts">
  /**
   * DiagnosticPanel
   *
   * Tools for debugging specific poses:
   *
   *   1. Pose identifier (big, copyable) so the reviewer can reference
   *      specific poses in conversation.
   *   2. "Copy diagnostic" - dumps a full JSON report for the current
   *      pose to the clipboard. Paste into the Claude Code conversation
   *      to get a focused analysis of why a pose is misbehaving.
   *   3. "Scan infeasible" - runs the optimizer across every unlabeled
   *      pose and caches results. Progress bar shows completion.
   *   4. "Next infeasible" - jumps the cursor to the next pose whose
   *      optimizer verdict is infeasible (from the cache).
   *   5. "Infeasible only" toggle - filters the catalog to problem poses.
   */

  import { getCollisionLabContext } from "../context/collision-lab-context";

  const labCtx = getCollisionLabContext();

  let copyStatus = $state<"idle" | "copied" | "failed">("idle");
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  async function copyDiagnostic() {
    const report = labCtx.state.buildDiagnosticReport();
    const json = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      copyStatus = "copied";
    } catch {
      // Fallback: dump to console so the user can copy manually.
      // eslint-disable-next-line no-console
      console.log("[CollisionLabDiagnostic]", json);
      copyStatus = "failed";
    }
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyStatus = "idle";
    }, 2500);
  }

  async function runScan() {
    await labCtx.state.scanAllForFeasibility();
  }

  function jumpNext() {
    labCtx.state.jumpToNextInfeasible();
  }

  function toggleInfeasibleOnly() {
    labCtx.state.setInfeasibleOnly(!labCtx.state.infeasibleOnly);
  }
</script>

<div class="panel">
  <div class="pose-id-row">
    <div class="pose-id">
      <span class="label">Pose</span>
      <code class="id-code">{labCtx.state.currentPose?.id ?? "-"}</code>
      <span class="index">
        {labCtx.state.currentPoseGlobalIndex + 1} / {labCtx.state.allPoses
          .length}
      </span>
    </div>
  </div>

  <button
    class="copy-btn"
    class:copied={copyStatus === "copied"}
    class:failed={copyStatus === "failed"}
    onclick={copyDiagnostic}
    title="Copy a full JSON report of the current pose to the clipboard so you can paste it into chat"
  >
    {#if copyStatus === "copied"}
      Copied - paste to Claude
    {:else if copyStatus === "failed"}
      Copy failed - see console
    {:else}
      Copy diagnostic
    {/if}
  </button>

  {#if labCtx.state.hasOptimizer}
    <div class="scan-row">
      <button
        class="scan-btn"
        disabled={labCtx.state.scanProgress.running}
        onclick={runScan}
      >
        {#if labCtx.state.scanProgress.running}
          Scanning {labCtx.state.scanProgress.done}/{labCtx.state.scanProgress
            .total}…
        {:else if labCtx.state.scanProgress.done > 0}
          Rescan all ({labCtx.state.infeasibleCount} infeasible)
        {:else}
          Scan all for feasibility
        {/if}
      </button>

      {#if labCtx.state.scanProgress.running}
        <div class="progress-bar">
          <div
            class="progress-fill"
            style="width: {(labCtx.state.scanProgress.done /
              Math.max(1, labCtx.state.scanProgress.total)) *
              100}%;"
          ></div>
        </div>
      {/if}
    </div>

    <div class="nav-row">
      <button class="next-infeasible" onclick={jumpNext}>
        Next infeasible →
      </button>
      <label class="toggle">
        <input
          type="checkbox"
          checked={labCtx.state.infeasibleOnly}
          onchange={toggleInfeasibleOnly}
        />
        <span>Infeasible only</span>
      </label>
    </div>
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    height: 100%;
    box-sizing: border-box;
  }
  .pose-id-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pose-id {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    opacity: 0.6;
    font-weight: 600;
  }
  .id-code {
    font-family: monospace;
    font-size: 14px;
    font-weight: 700;
    padding: 2px 8px;
    background: var(--theme-panel-bg);
    border-radius: 4px;
    border: 1px solid var(--theme-stroke);
    user-select: all;
  }
  .index {
    font-size: 12px;
    opacity: 0.7;
    font-family: monospace;
  }
  .copy-btn {
    padding: 6px 12px;
    background: color-mix(in srgb, #8b5cf6 15%, var(--theme-panel-bg));
    border: 1px solid color-mix(in srgb, #8b5cf6 50%, transparent);
    border-radius: 6px;
    color: #ddd6fe;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    transition: background var(--duration-instant);
  }
  .copy-btn:hover {
    background: color-mix(in srgb, #8b5cf6 30%, var(--theme-panel-bg));
  }
  .copy-btn.copied {
    background: color-mix(in srgb, #22c55e 25%, var(--theme-panel-bg));
    border-color: color-mix(in srgb, #22c55e 60%, transparent);
    color: #86efac;
  }
  .copy-btn.failed {
    background: color-mix(in srgb, #ef4444 25%, var(--theme-panel-bg));
    border-color: color-mix(in srgb, #ef4444 60%, transparent);
    color: #fca5a5;
  }
  .scan-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .scan-btn {
    padding: 6px 10px;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 4px;
    color: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .scan-btn:hover:not(:disabled) {
    background: var(--theme-stroke);
  }
  .scan-btn:disabled {
    opacity: 0.7;
    cursor: progress;
  }
  .progress-bar {
    width: 100%;
    height: 4px;
    background: var(--theme-panel-bg);
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: #8b5cf6;
    transition: width var(--duration-instant);
  }
  .nav-row {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  }
  .next-infeasible {
    padding: 5px 10px;
    background: color-mix(in srgb, #ef4444 12%, var(--theme-panel-bg));
    border: 1px solid color-mix(in srgb, #ef4444 40%, transparent);
    border-radius: 4px;
    color: #fca5a5;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .next-infeasible:hover {
    background: color-mix(in srgb, #ef4444 22%, var(--theme-panel-bg));
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    opacity: 0.9;
    cursor: pointer;
    user-select: none;
  }
</style>
