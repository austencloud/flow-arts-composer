<script lang="ts">
  /**
   * PromoGenerator Component
   *
   * Modern 2026-style UI for the 3D device mockup promo video generator.
   * Features visual selectors, floating controls, and immersive canvas.
   */

  import { onMount, onDestroy, tick } from "svelte";
  import { getPromoOrchestrator } from "#lib/features/promo-generator/get-promo-orchestrator.js";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import type { PromoOrchestrator } from "../services/promo-orchestrator";
  import type {
    PromoGeneratorState,
    AnimationPreset,
    ExportConfig,
    EnvironmentType,
  } from "../domain/promo-models";
  import type { ExportStage } from "../services/types";
  // Props
  interface Props {
    initialModelPath?: string;
    initialScreenshot?: string;
    width?: number;
    height?: number;
  }

  let {
    initialModelPath = "",
    initialScreenshot = "",
    width = 1920,
    height = 1080,
  }: Props = $props();

  // State
  let canvas: HTMLCanvasElement | null = $state(null);
  let canvasContainer: HTMLDivElement | null = $state(null);
  let orchestrator: PromoOrchestrator | null = $state(null);
  let generatorState: PromoGeneratorState = $state({
    isReady: false,
    isExporting: false,
    exportProgress: 0,
    error: null,
    currentDevice: null,
    currentPreset: null,
    screenshots: [],
  });
  let availablePresets: AnimationPreset[] = $state([]);
  let selectedPreset: string = $state("float-rotate");
  let selectedEnvironment: EnvironmentType = $state("studio");
  let exportStage: ExportStage = $state("preparing");
  let isPlaying: boolean = $state(false);
  let progress: number = $state(0);
  let showExportPanel: boolean = $state(false);

  // Export settings
  let exportResolution: "720p" | "1080p" | "4k" = $state("1080p");
  let exportFps: 30 | 60 = $state(60);

  // File input refs
  let modelInput: HTMLInputElement | null = $state(null);
  let screenshotInput: HTMLInputElement | null = $state(null);

  // Export modal ref for focus management
  let exportModal: HTMLDivElement | null = $state(null);

  // Object URLs created from uploads — revoked on replacement and on destroy
  let modelObjectUrl: string | null = null;
  let screenshotObjectUrl: string | null = null;

  // Empty state: engine ready but no device model loaded yet
  const showEmptyState = $derived(
    generatorState.isReady &&
      !generatorState.currentDevice &&
      !generatorState.isExporting
  );

  // Environment options with visual representation
  const environments: { id: EnvironmentType; label: string; color: string }[] = [
    { id: "studio", label: "Studio", color: "#1a1a2e" },
    { id: "gradient", label: "Gradient", color: "linear-gradient(135deg, #1a1a2e, #0f0f1a)" },
    { id: "space", label: "Space", color: "#000000" },
    { id: "sunset", label: "Sunset", color: "linear-gradient(135deg, #ff6b35, #f7931e)" },
  ];

  // Resolution options
  const resolutions: { id: "720p" | "1080p" | "4k"; label: string; dims: string }[] = [
    { id: "720p", label: "HD", dims: "1280×720" },
    { id: "1080p", label: "Full HD", dims: "1920×1080" },
    { id: "4k", label: "4K", dims: "3840×2160" },
  ];

  onMount(async () => {
    if (!canvas || !canvasContainer) return;

    try {
      orchestrator = getPromoOrchestrator();
      if (!orchestrator) {
        const message = "Failed to start the promo generator engine.";
        console.error("[PromoGenerator]", message);
        generatorState = { ...generatorState, error: message };
        toast.error(message);
        return;
      }

      // Get container dimensions for responsive canvas
      const rect = canvasContainer.getBoundingClientRect();
      const canvasWidth = Math.floor(rect.width);
      const canvasHeight = Math.floor(rect.height);

      await orchestrator.initialize(canvas, canvasWidth, canvasHeight);

      orchestrator.subscribe((newState) => {
        generatorState = newState;
      });

      availablePresets = orchestrator.getAvailablePresets();

      if (initialModelPath) {
        await orchestrator.loadDevice(initialModelPath);
      }

      if (initialScreenshot) {
        await orchestrator.loadScreenshot(initialScreenshot);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to initialize the 3D engine.";
      console.error("[PromoGenerator] Initialization failed:", error);
      generatorState = { ...generatorState, error: message };
      toast.error(message);
    }
  });

  onDestroy(() => {
    orchestrator?.dispose();
    // Release any object URLs created from uploads to avoid leaking Blob memory
    if (modelObjectUrl) URL.revokeObjectURL(modelObjectUrl);
    if (screenshotObjectUrl) URL.revokeObjectURL(screenshotObjectUrl);
  });

  // Handlers
  async function handleModelUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !orchestrator) return;

    // Revoke the previous model URL before replacing it
    if (modelObjectUrl) URL.revokeObjectURL(modelObjectUrl);
    const url = URL.createObjectURL(file);
    modelObjectUrl = url;

    try {
      await orchestrator.loadDevice(url);
    } catch (error) {
      const message =
        error instanceof Error
          ? `Could not load model: ${error.message}`
          : "Could not load the 3D model.";
      console.error("Failed to load model:", error);
      generatorState = { ...generatorState, error: message };
      toast.error(message);
    }
  }

  async function handleScreenshotUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !orchestrator) return;

    // Revoke the previous screenshot URL before replacing it
    if (screenshotObjectUrl) URL.revokeObjectURL(screenshotObjectUrl);
    const url = URL.createObjectURL(file);
    screenshotObjectUrl = url;

    try {
      await orchestrator.loadScreenshot(url);
    } catch (error) {
      const message =
        error instanceof Error
          ? `Could not load screenshot: ${error.message}`
          : "Could not load the screenshot.";
      console.error("Failed to load screenshot:", error);
      generatorState = { ...generatorState, error: message };
      toast.error(message);
    }
  }

  function handlePresetChange(presetId: string) {
    if (!orchestrator) return;
    selectedPreset = presetId;
    orchestrator.usePreset(presetId);
  }

  function handleEnvironmentChange(env: EnvironmentType) {
    if (!orchestrator) return;
    selectedEnvironment = env;
    orchestrator.setEnvironment(env);
  }

  function togglePlayback() {
    if (!orchestrator) return;
    if (isPlaying) {
      orchestrator.pausePreview();
      isPlaying = false;
    } else {
      isPlaying = true;
      orchestrator.preview((prog) => {
        progress = prog;
        if (prog >= 1) {
          isPlaying = false;
        }
      });
    }
  }

  function stopPreview() {
    if (!orchestrator) return;
    orchestrator.stopPreview();
    isPlaying = false;
    progress = 0;
  }

  function handleSeek(event: Event) {
    const input = event.target as HTMLInputElement;
    const value = parseFloat(input.value);
    if (!orchestrator) return;
    orchestrator.seekPreview(value);
    progress = value;
  }

  async function exportVideo() {
    if (!orchestrator) return;

    const config: ExportConfig = {
      resolution: exportResolution,
      fps: exportFps,
      format: "mp4",
      filename: `promo-${Date.now()}`,
    };

    await orchestrator.export(config, (prog, stage) => {
      progress = prog / 100;
      exportStage = stage;
    });
  }

  function cancelExport() {
    orchestrator?.cancelExport();
  }

  // SegmentedControl options for the export panel single-select groups
  const resolutionOptions = resolutions.map((r) => ({
    value: r.id,
    label: `${r.label} · ${r.dims}`,
  }));

  const fpsOptions: { value: "30" | "60"; label: string }[] = [
    { value: "30", label: "30 fps" },
    { value: "60", label: "60 fps" },
  ];

  // Close the export panel on Escape (keyboard dismissal for the popover)
  function handleExportPanelKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      showExportPanel = false;
    }
  }

  // When the export modal opens, move focus into it so screen readers and
  // keyboard users land inside the dialog. Escape cancels the export.
  $effect(() => {
    if (generatorState.isExporting && exportModal) {
      tick().then(() => exportModal?.focus());
    }
  });

  function handleExportModalKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      cancelExport();
    }
  }

  // Get preset icon based on type
  function getPresetIcon(id: string): string {
    const icons: Record<string, string> = {
      "tka-showcase": "video",
    };
    return icons[id] || "cube";
  }
</script>

<div class="promo-generator">
  <!-- Hidden file inputs -->
  <input
    bind:this={modelInput}
    type="file"
    accept=".glb,.gltf"
    onchange={handleModelUpload}
    class="hidden-input"
  />
  <input
    bind:this={screenshotInput}
    type="file"
    accept="image/*"
    onchange={handleScreenshotUpload}
    class="hidden-input"
  />

  <!-- Main Canvas Area -->
  <div class="canvas-area" bind:this={canvasContainer}>
    <canvas bind:this={canvas} class="preview-canvas"></canvas>

    {#if !generatorState.isReady}
      <div class="loading-overlay">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <span>Initializing 3D Engine...</span>
      </div>
    {:else if showEmptyState}
      <div class="empty-state">
        <i class="fas fa-cube empty-icon" aria-hidden="true"></i>
        <span class="empty-title">No model loaded</span>
        <p class="empty-desc">Load a 3D model to start building your promo video.</p>
        <button class="empty-action" onclick={() => modelInput?.click()}>
          <i class="fas fa-cube" aria-hidden="true"></i>
          Load 3D Model
        </button>
      </div>
    {/if}

    {#if generatorState.isExporting}
      <div class="export-overlay">
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="export-modal"
          bind:this={exportModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
          tabindex="-1"
          onkeydown={handleExportModalKeydown}
        >
          <div class="export-header">
            <span class="export-title" id="export-modal-title">Rendering Video</span>
            <span class="export-stage">{exportStage}</span>
          </div>
          <div class="export-progress-ring">
            <svg viewBox="0 0 100 100">
              <circle class="progress-bg" cx="50" cy="50" r="45" />
              <circle
                class="progress-fill"
                cx="50"
                cy="50"
                r="45"
                style="stroke-dashoffset: {283 - (283 * generatorState.exportProgress) / 100}"
              />
            </svg>
            <span class="progress-text">{Math.round(generatorState.exportProgress)}%</span>
          </div>
          <button class="cancel-btn" onclick={cancelExport}>Cancel</button>
        </div>
      </div>
    {/if}

    <!-- Floating Controls - Top Left: Upload Actions -->
    <div class="floating-controls top-left">
      <button
        class="icon-btn"
        onclick={() => modelInput?.click()}
        disabled={!generatorState.isReady}
        title="Load 3D Model"
        aria-label="Load 3D Model"
      >
        <i class="fas fa-cube" aria-hidden="true"></i>
      </button>
      <button
        class="icon-btn"
        onclick={() => screenshotInput?.click()}
        disabled={!generatorState.isReady}
        title="Load Screenshot"
        aria-label="Load Screenshot"
      >
        <i class="fas fa-image" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Floating Controls - Top Right: Export -->
    <div class="floating-controls top-right">
      <button
        class="export-trigger"
        onclick={() => (showExportPanel = !showExportPanel)}
        disabled={!generatorState.isReady || generatorState.isExporting}
      >
        <i class="fas fa-download"></i>
        <span>Export</span>
      </button>

      {#if showExportPanel}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="export-panel"
          role="group"
          aria-label="Export settings"
          onkeydown={handleExportPanelKeydown}
        >
          <div class="panel-section">
            <span class="section-label">Resolution</span>
            <SegmentedControl
              options={resolutionOptions}
              value={exportResolution}
              onchange={(v) => (exportResolution = v)}
              color="accent"
              size="sm"
            />
          </div>
          <div class="panel-section">
            <span class="section-label">Frame Rate</span>
            <SegmentedControl
              options={fpsOptions}
              value={String(exportFps) as "30" | "60"}
              onchange={(v) => (exportFps = Number(v) as 30 | 60)}
              color="accent"
              size="sm"
            />
          </div>
          <button class="render-btn" onclick={exportVideo} disabled={generatorState.isExporting}>
            <i class="fas fa-film" aria-hidden="true"></i>
            Render Video
          </button>
        </div>
      {/if}
    </div>

    <!-- Floating Controls - Bottom Center: Playback -->
    <div class="floating-controls bottom-center">
      <div class="playback-bar">
        <button class="playback-btn" onclick={togglePlayback} disabled={!generatorState.isReady} aria-label={isPlaying ? "Pause" : "Play"}>
          {#if isPlaying}
            <i class="fas fa-pause" aria-hidden="true"></i>
          {:else}
            <i class="fas fa-play" aria-hidden="true"></i>
          {/if}
        </button>
        <div class="timeline-container">
          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={progress}
            oninput={handleSeek}
            disabled={!generatorState.isReady}
            class="timeline"
          />
          <div class="timeline-fill" style="width: {progress * 100}%"></div>
        </div>
        <button class="playback-btn stop" onclick={stopPreview} disabled={!generatorState.isReady} aria-label="Stop">
          <i class="fas fa-stop" aria-hidden="true"></i>
        </button>
        <span class="time-display">
          {Math.floor(progress * 21)}s
        </span>
      </div>
    </div>
  </div>

  <!-- Right Sidebar: Simple workflow -->
  <aside class="sidebar">
    <section class="sidebar-section">
      <h3 class="section-title">Animation</h3>
      <div class="animation-info">
        <p class="animation-desc">
          7 cinematic shots with hard cuts between angles.
          Each shot showcases a different screenshot.
        </p>
        <div class="shot-list">
          <div class="shot-item">
            <span class="shot-time">0-3s</span>
            <span class="shot-desc">Front zoom in</span>
          </div>
          <div class="shot-item">
            <span class="shot-time">3-6s</span>
            <span class="shot-desc">Right angle pan</span>
          </div>
          <div class="shot-item">
            <span class="shot-time">6-9s</span>
            <span class="shot-desc">Left angle drift</span>
          </div>
          <div class="shot-item">
            <span class="shot-time">9-12s</span>
            <span class="shot-desc">Low angle rise</span>
          </div>
          <div class="shot-item">
            <span class="shot-time">12-15s</span>
            <span class="shot-desc">High angle descent</span>
          </div>
          <div class="shot-item">
            <span class="shot-time">15-18s</span>
            <span class="shot-desc">Three-quarter zoom</span>
          </div>
          <div class="shot-item">
            <span class="shot-time">18-21s</span>
            <span class="shot-desc">Hero drift</span>
          </div>
        </div>
      </div>
    </section>

    <section class="sidebar-section">
      <h3 class="section-title">Background</h3>
      <div class="env-grid">
        {#each environments as env}
          <button
            class="env-card"
            class:active={selectedEnvironment === env.id}
            onclick={() => handleEnvironmentChange(env.id)}
            disabled={!generatorState.isReady}
            style="--env-color: {env.color}"
          >
            <div class="env-preview"></div>
            <span class="env-label">{env.label}</span>
          </button>
        {/each}
      </div>
    </section>

    {#if generatorState.error}
      <div class="error-toast">
        <i class="fas fa-exclamation-circle"></i>
        <span>{generatorState.error}</span>
      </div>
    {/if}
  </aside>
</div>

<style>
  .promo-generator {
    /* Scoped chrome palette — primary accent maps to the app theme accent,
       the secondary accent is derived from it via color-mix so the whole
       gradient skin tracks theme changes. Hex values are kept as var()
       fallbacks. These tokens style module CHROME only, never the exported
       artwork (3D scene background / device render). */
    --promo-accent: var(--theme-accent, #6366f1);
    --promo-accent-2: color-mix(in srgb, var(--promo-accent) 55%, #8b5cf6);
    --promo-accent-soft: color-mix(in srgb, var(--promo-accent) 20%, transparent);
    --promo-accent-glow: color-mix(in srgb, var(--promo-accent) 40%, transparent);
    --promo-surface-0: #0a0a0f;
    --promo-surface-1: #1a1a2e;
    --promo-panel-bg: rgba(20, 20, 30, 0.95);
    --promo-bar-bg: rgba(20, 20, 30, 0.9);
    --promo-sidebar-bg: rgba(15, 15, 20, 0.95);
    --promo-overlay-bg: rgba(10, 10, 15, 0.9);
    --promo-stroke: rgba(255, 255, 255, 0.1);
    --promo-stroke-strong: rgba(255, 255, 255, 0.2);
    --promo-stroke-soft: rgba(255, 255, 255, 0.06);
    --promo-fill-hover: rgba(255, 255, 255, 0.15);
    --promo-text: #fff;
    --promo-text-strong: rgba(255, 255, 255, 0.8);
    --promo-text-dim: rgba(255, 255, 255, 0.7);
    --promo-text-muted: rgba(255, 255, 255, 0.5);
    --promo-text-faint: rgba(255, 255, 255, 0.4);
    --promo-fill-1: rgba(255, 255, 255, 0.08);
    --promo-fill-2: rgba(255, 255, 255, 0.04);
    --promo-fill-3: rgba(255, 255, 255, 0.03);

    display: grid;
    grid-template-columns: 1fr 280px;
    height: 100vh;
    background: var(--promo-surface-0);
    overflow: hidden;
  }

  .hidden-input {
    display: none;
  }

  /* Canvas Area */
  .canvas-area {
    position: relative;
    background: radial-gradient(
      ellipse at center,
      var(--promo-surface-1) 0%,
      var(--promo-surface-0) 100%
    );
    overflow: hidden;
  }

  .preview-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* Loading Overlay */
  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: var(--promo-overlay-bg);
    color: var(--promo-text-dim);
    font-size: 14px;
  }

  /* Empty State */
  .empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
    padding: 24px;
    pointer-events: none;
  }

  .empty-icon {
    font-size: 40px;
    color: var(--promo-text-faint);
  }

  .empty-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--promo-text-strong);
  }

  .empty-desc {
    margin: 0;
    max-width: 280px;
    font-size: 13px;
    line-height: 1.5;
    color: var(--promo-text-muted);
  }

  .empty-action {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    padding: 10px 16px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--promo-accent), var(--promo-accent-2));
    color: var(--promo-text);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform var(--duration-normal) ease;
  }

  .empty-action:hover {
    transform: translateY(-2px);
  }

  /* Floating Controls */
  .floating-controls {
    position: absolute;
    display: flex;
    gap: 8px;
    z-index: 10;
  }

  .floating-controls.top-left {
    top: 20px;
    left: 20px;
  }

  .floating-controls.top-right {
    top: 20px;
    right: 20px;
    flex-direction: column;
    align-items: flex-end;
  }

  .floating-controls.bottom-center {
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
  }

  .icon-btn {
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 12px;
    background: var(--promo-fill-1);
    color: var(--promo-text-strong);
    font-size: 18px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    backdrop-filter: blur(8px);
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--promo-fill-hover);
    color: var(--promo-text);
    transform: translateY(-2px);
  }

  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Export Trigger */
  .export-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--promo-accent), var(--promo-accent-2));
    color: var(--promo-text);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .export-trigger:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px var(--promo-accent-glow);
  }

  .export-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Export Panel */
  .export-panel {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 8px;
    padding: 16px;
    background: var(--promo-panel-bg);
    border: 1px solid var(--promo-stroke);
    border-radius: 16px;
    backdrop-filter: blur(16px);
    min-width: 280px;
  }

  .panel-section {
    margin-bottom: 16px;
  }

  .section-label {
    display: block;
    margin-bottom: 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--promo-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .render-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--promo-accent), var(--promo-accent-2));
    color: var(--promo-text);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .render-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 16px var(--promo-accent-glow);
  }

  /* Playback Bar */
  .playback-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--promo-bar-bg);
    border: 1px solid var(--promo-stroke);
    border-radius: 20px;
    backdrop-filter: blur(16px);
  }

  .playback-btn {
    width: 40px;
    height: 40px;
    border: none;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--promo-accent), var(--promo-accent-2));
    color: var(--promo-text);
    font-size: 14px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .playback-btn.stop {
    background: var(--promo-stroke);
    width: 32px;
    height: 32px;
    font-size: 12px;
  }

  .playback-btn:hover:not(:disabled) {
    transform: scale(1.05);
  }

  .playback-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .timeline-container {
    position: relative;
    width: 200px;
    height: 6px;
    background: var(--promo-stroke);
    border-radius: 3px;
    overflow: hidden;
  }

  .timeline {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    z-index: 1;
  }

  .timeline-fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: linear-gradient(90deg, var(--promo-accent), var(--promo-accent-2));
    border-radius: 3px;
    pointer-events: none;
  }

  .time-display {
    font-size: 12px;
    font-weight: 500;
    color: var(--promo-text-dim);
    min-width: 32px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* Sidebar */
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 24px;
    background: var(--promo-sidebar-bg);
    border-left: 1px solid var(--promo-stroke-soft);
    overflow-y: auto;
  }

  .sidebar-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-title {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--promo-text-faint);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  /* Animation Info */
  .animation-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .animation-desc {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--promo-text-dim);
  }

  .shot-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .shot-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    background: var(--promo-fill-3);
    border-radius: 8px;
    transition: background var(--duration-normal) ease;
  }

  .shot-item:hover {
    background: var(--promo-stroke-soft);
  }

  .shot-time {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--promo-accent);
    min-width: 40px;
    font-variant-numeric: tabular-nums;
  }

  .shot-desc {
    font-size: 12px;
    color: var(--promo-text-dim);
  }

  /* Environment Grid */
  .env-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .env-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--promo-fill-1);
    border-radius: 12px;
    background: var(--promo-fill-2);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .env-card:hover:not(:disabled) {
    border-color: var(--promo-fill-hover);
    transform: translateY(-2px);
  }

  .env-card.active {
    border-color: var(--promo-accent);
  }

  .env-card:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .env-preview {
    width: 100%;
    height: 32px;
    border-radius: 6px;
    background: var(--env-color);
  }

  .env-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--promo-text-dim);
  }

  .env-card.active .env-label {
    color: var(--promo-text);
  }

  /* Export Overlay */
  .export-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--promo-overlay-bg);
    backdrop-filter: blur(8px);
  }

  .export-modal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 32px 48px;
    background: var(--promo-panel-bg);
    border: 1px solid var(--promo-stroke);
    border-radius: 24px;
  }

  .export-modal:focus-visible {
    outline: 2px solid var(--promo-accent);
    outline-offset: 2px;
  }

  .export-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .export-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--promo-text);
  }

  .export-stage {
    font-size: 13px;
    color: var(--promo-text-muted);
    text-transform: capitalize;
  }

  .export-progress-ring {
    position: relative;
    width: 120px;
    height: 120px;
  }

  .export-progress-ring svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .export-progress-ring circle {
    fill: none;
    stroke-width: 6;
    stroke-linecap: round;
  }

  .progress-bg {
    stroke: var(--promo-stroke);
  }

  .progress-fill {
    stroke: var(--promo-accent);
    stroke-dasharray: 283;
    transition: stroke-dashoffset var(--duration-emphasis) ease;
  }

  .progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 24px;
    font-weight: 700;
    color: var(--promo-text);
    font-variant-numeric: tabular-nums;
  }

  .cancel-btn {
    padding: 10px 24px;
    border: 1px solid var(--promo-stroke-strong);
    border-radius: 10px;
    background: transparent;
    color: var(--promo-text-dim);
    font-size: 14px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .cancel-btn:hover {
    background: var(--promo-stroke);
    color: var(--promo-text);
  }

  /* Error Toast */
  .error-toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: color-mix(in srgb, var(--theme-error, #fb7185) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-error, #fb7185) 30%, transparent);
    border-radius: 10px;
    color: var(--theme-error, #fb7185);
    font-size: 13px;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .promo-generator {
      grid-template-columns: 1fr;
      grid-template-rows: 1fr auto;
    }

    .sidebar {
      flex-direction: row;
      padding: 16px;
      border-left: none;
      border-top: 1px solid var(--promo-stroke-soft);
      overflow-x: auto;
    }

    .sidebar-section {
      min-width: 200px;
    }

    .env-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

</style>
