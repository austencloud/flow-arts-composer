<script lang="ts">
  import { onDestroy } from "svelte";
  import { WinterBackgroundSystem, type QualityLevel } from "@austencloud/backgrounds";
  import { ChipToggle, ChipGroup } from '@austencloud/chip-toggle';
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import LabPreviewCanvas from "./LabPreviewCanvas.svelte";

  // Background system
  let backgroundSystem: WinterBackgroundSystem | null = $state(null);
  let canvasDimensions = $state({ width: 800, height: 600 });

  // Quality settings
  let quality: QualityLevel = $state("high");

  // Loading state
  let isLoading = $state(true);
  let initError = $state<string | null>(null);

  // Layer toggles
  let layers = $state({
    gradient: true,
    snowflakes: true,
    shootingStars: true,
  });

  // Density presets
  type DensityPreset = "light" | "normal" | "heavy" | "blizzard";
  let densityPreset: DensityPreset = $state("normal");

  // Stats
  let stats = $state({ snowflakes: 0 });
  let lastStatsUpdate = 0;

  // Initialize system when canvas is ready
  function handleCanvasReady(dimensions: { width: number; height: number }) {
    canvasDimensions = dimensions;
    initError = null;
    try {
      backgroundSystem = new WinterBackgroundSystem();
      backgroundSystem.initialize(dimensions, quality);

      if (backgroundSystem.setLayerVisibility) {
        backgroundSystem.setLayerVisibility(layers);
      }

      isLoading = false;
    } catch (error) {
      isLoading = false;
      const message = error instanceof Error ? error.message : String(error);
      initError = message;
      console.error("Failed to initialize Winter Lab:", error);
      toast.error(`Winter Lab failed to load: ${message}`);
    }
  }

  // Update stats on each frame
  function handleFrame() {
    const now = performance.now();
    if (now - lastStatsUpdate > 1000 && backgroundSystem) {
      stats = backgroundSystem.getStats();
      lastStatsUpdate = now;
    }
  }

  function regenerate() {
    if (backgroundSystem) {
      backgroundSystem.cleanup?.();
    }
    try {
      backgroundSystem = new WinterBackgroundSystem();
      backgroundSystem.initialize(canvasDimensions, quality);
      if (backgroundSystem.setLayerVisibility) {
        backgroundSystem.setLayerVisibility(layers);
      }
      initError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      initError = message;
      console.error("Failed to regenerate Winter Lab:", error);
      toast.error(`Winter Lab failed to load: ${message}`);
    }
  }

  function setQuality(q: QualityLevel) {
    quality = q;
    regenerate();
  }

  function setDensity(preset: DensityPreset) {
    densityPreset = preset;
    regenerate();
  }

  function toggleLayer(layer: keyof typeof layers) {
    layers = { ...layers, [layer]: !layers[layer] };
    if (backgroundSystem?.setLayerVisibility) {
      backgroundSystem.setLayerVisibility(layers);
    }
  }

  onDestroy(() => {
    if (backgroundSystem) {
      backgroundSystem.cleanup?.();
    }
  });
</script>

<div class="winter-lab">
  <div class="controls themed-scrollbar-accent">
    <div class="header">
      <h2>Winter Lab</h2>
      <span class="badge">Winter Wonder</span>
    </div>

    {#if initError}
      <div class="error-banner" role="alert">
        <i class="fas fa-triangle-exclamation"></i>
        <div class="error-text">
          <span class="error-title">Failed to load</span>
          <span class="error-detail">{initError}</span>
        </div>
        <button class="retry-btn" onclick={regenerate}>Retry</button>
      </div>
    {/if}

    <!-- Quality Chips -->
    <ChipGroup>
      <ChipToggle label="High" active={quality === "high"} color="cyan" onclick={() => setQuality("high")} />
      <ChipToggle label="Medium" active={quality === "medium"} color="cyan" onclick={() => setQuality("medium")} />
      <ChipToggle label="Low" active={quality === "low"} color="cyan" onclick={() => setQuality("low")} />
    </ChipGroup>

    <!-- Layer Chips -->
    <ChipGroup>
      <ChipToggle label="Sky Gradient" icon="moon" active={layers.gradient} color="cyan" onclick={() => toggleLayer("gradient")} />
      <ChipToggle label="Snowflakes" icon="snowflake" active={layers.snowflakes} color="cyan" onclick={() => toggleLayer("snowflakes")} />
      <ChipToggle label="Shooting Stars" icon="meteor" active={layers.shootingStars} color="cyan" onclick={() => toggleLayer("shootingStars")} />
    </ChipGroup>

    <!-- Density Chips -->
    <ChipGroup>
      <ChipToggle label="Light" active={densityPreset === "light"} color="cyan" onclick={() => setDensity("light")} />
      <ChipToggle label="Normal" active={densityPreset === "normal"} color="cyan" onclick={() => setDensity("normal")} />
      <ChipToggle label="Heavy" active={densityPreset === "heavy"} color="cyan" onclick={() => setDensity("heavy")} />
      <ChipToggle label="Blizzard" active={densityPreset === "blizzard"} color="cyan" onclick={() => setDensity("blizzard")} />
    </ChipGroup>

    <!-- Regenerate -->
    <button class="action-btn" onclick={regenerate}>
      <i class="fas fa-snowflake"></i>
      Regenerate
    </button>

    <!-- Stats -->
    <div class="stats-section">
      <span class="label">Scene Stats</span>
      <div class="stats-grid">
        <div class="stat">
          <span class="stat-value">{stats.snowflakes}</span>
          <span class="stat-label">Snowflakes</span>
        </div>
      </div>
    </div>

    <!-- Progress Pills -->
    <div class="progress-section">
      <span class="label">Features</span>
      <div class="progress-pills">
        <span class="pill complete">Night Gradient</span>
        <span class="pill complete">Crystal Snowflakes</span>
        <span class="pill complete">Sparkle Effects</span>
        <span class="pill complete">Depth Layering</span>
        <span class="pill complete">Shooting Stars</span>
        <span class="pill active">Layer Controls</span>
      </div>
    </div>
  </div>

  <LabPreviewCanvas
    system={backgroundSystem}
    {isLoading}
    accentColor="#67e8f9"
    backgroundColor="rgba(10, 22, 40, 0.9)"
    onCanvasReady={handleCanvasReady}
    onFrame={handleFrame}
  />
</div>

<style>
  .winter-lab {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 20px;
    height: 100%;
    min-height: 600px;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
    background: var(--theme-panel-bg, rgba(15, 15, 25, 0.8));
    border-radius: 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    overflow-y: auto;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--theme-error, #fb7185) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-error, #fb7185) 40%, transparent);
    border-radius: 12px;
    color: var(--theme-error, #fb7185);
  }

  .error-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .error-title {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
  }

  .error-detail {
    font-size: var(--font-size-compact, 12px);
    color: #9ca3af;
    word-break: break-word;
  }

  .retry-btn {
    flex-shrink: 0;
    padding: 6px 12px;
    background: color-mix(in srgb, var(--theme-error, #fb7185) 18%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-error, #fb7185) 40%, transparent);
    border-radius: 8px;
    color: var(--theme-error, #fb7185);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
  }

  .retry-btn:focus-visible {
    outline: 2px solid var(--theme-error, #fb7185);
    outline-offset: 2px;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #ffffff;
  }

  .badge {
    padding: 4px 10px;
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.3), rgba(103, 232, 249, 0.3));
    border: 1px solid rgba(103, 232, 249, 0.4);
    border-radius: 20px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: #67e8f9;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 20px;
    background: linear-gradient(135deg, #06b6d4, #0891b2);
    border: none;
    border-radius: 12px;
    color: #ffffff;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(6, 182, 212, 0.35);
  }

  .action-btn:active {
    transform: translateY(0);
  }

  .action-btn:focus-visible {
    outline: 2px solid #67e8f9;
    outline-offset: 2px;
  }

  .stats-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .stats-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 10px;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: #67e8f9;
  }

  .stat-label {
    font-size: var(--font-size-compact, 12px);
    color: #9ca3af;
    text-transform: uppercase;
  }

  .progress-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .progress-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pill {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
  }

  .pill.complete {
    background: color-mix(in srgb, var(--theme-success, #34d399) 15%, transparent);
    color: var(--theme-success, #34d399);
  }

  .pill.active {
    background: rgba(6, 182, 212, 0.2);
    color: #67e8f9;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  @media (max-width: 800px) {
    .winter-lab {
      grid-template-columns: 1fr;
      grid-template-rows: auto 400px;
    }
  }

  /* Accessibility: Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .action-btn,
    .pill {
      transition: none;
      animation: none;
    }
  }

  /* Accessibility: High contrast */
  @media (prefers-contrast: high) {
    .controls {
      border: 2px solid rgba(255, 255, 255, 0.3);
    }

    .stat {
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .label,
    .stat-label {
      color: #d1d5db;
    }
  }
</style>
