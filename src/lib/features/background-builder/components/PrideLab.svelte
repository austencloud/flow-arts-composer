<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    RainbowBackgroundSystem,
    RAINBOW_PALETTES,
    type RainbowPalette,
    type QualityLevel,
  } from "@austencloud/backgrounds";
  import { ChipToggle, ChipGroup } from "@austencloud/chip-toggle";
  import LabPreviewCanvas from "./LabPreviewCanvas.svelte";
  import {
    getRainbowSettings,
    updateRainbowSettings,
  } from "../state/background-builder-state.svelte";

  // Background system
  let backgroundSystem: RainbowBackgroundSystem | null = $state(null);
  let canvasDimensions = $state({ width: 800, height: 600 });

  // Load persisted settings
  const savedSettings = getRainbowSettings();

  // Quality settings
  let quality: QualityLevel = $state(savedSettings.quality);

  // Loading state
  let isLoading = $state(true);

  // Palette selection
  let currentPalette: RainbowPalette = $state(savedSettings.palette);

  // Layer toggles
  let layers = $state({ ...savedSettings.layers });

  // Stats
  let stats = $state({
    bands: 0,
    bokeh: 0,
    sparkles: 0,
    hearts: 0,
    shimmerPoints: 0,
  });

  // Palette display names
  const paletteNames: Record<RainbowPalette, string> = {
    classic: "Classic",
    progress: "Progress",
    trans: "Trans",
    bisexual: "Bisexual",
    pansexual: "Pansexual",
    nonbinary: "Non-binary",
    lesbian: "Lesbian",
    asexual: "Asexual",
    gay: "MLM",
  };

  // Initialize system when canvas is ready
  function handleCanvasReady(dimensions: { width: number; height: number }) {
    canvasDimensions = dimensions;
    backgroundSystem = new RainbowBackgroundSystem();
    backgroundSystem.setPalette(currentPalette);
    backgroundSystem.initialize(dimensions, quality);
    backgroundSystem.setLayerVisibility(layers);
    updateStats();
    isLoading = false;
  }

  function updateStats() {
    if (backgroundSystem) {
      const s = backgroundSystem.getStats();
      stats = {
        bands: s.bands,
        bokeh: s.bokeh,
        sparkles: s.sparkles,
        hearts: s.hearts,
        shimmerPoints: s.shimmerPoints,
      };
    }
  }

  function regenerate() {
    if (backgroundSystem) {
      backgroundSystem.cleanup?.();
    }
    backgroundSystem = new RainbowBackgroundSystem();
    backgroundSystem.setPalette(currentPalette);
    backgroundSystem.initialize(canvasDimensions, quality);
    backgroundSystem.setLayerVisibility(layers);
    updateStats();
  }

  function setQuality(q: QualityLevel) {
    quality = q;
    updateRainbowSettings({ quality: q });
    if (backgroundSystem) {
      backgroundSystem.setQuality(q);
      updateStats();
    }
  }

  function setPalette(palette: RainbowPalette) {
    currentPalette = palette;
    updateRainbowSettings({ palette });
    if (backgroundSystem) {
      backgroundSystem.setPalette(palette);
    }
  }

  function toggleLayer(layer: keyof typeof layers) {
    layers = { ...layers, [layer]: !layers[layer] };
    updateRainbowSettings({ layers: { ...layers } });
    if (backgroundSystem) {
      backgroundSystem.setLayerVisibility(layers);
    }
  }

  onDestroy(() => {
    if (backgroundSystem) {
      backgroundSystem.cleanup?.();
    }
  });
</script>

<div class="pride-lab">
  <div class="controls themed-scrollbar-accent">
    <div class="header">
      <h2>Rainbow Lab</h2>
      <span class="badge">Rainbow</span>
    </div>

    <!-- Palette Chips -->
    <ChipGroup>
      {#each Object.keys(RAINBOW_PALETTES) as palette}
        <ChipToggle
          label={paletteNames[palette as RainbowPalette]}
          active={currentPalette === palette}
          color="rose"
          size="sm"
          onclick={() => setPalette(palette as RainbowPalette)}
        />
      {/each}
    </ChipGroup>

    <!-- Quality Chips -->
    <ChipGroup>
      <ChipToggle
        label="High"
        active={quality === "high"}
        color="rose"
        onclick={() => setQuality("high")}
      />
      <ChipToggle
        label="Medium"
        active={quality === "medium"}
        color="rose"
        onclick={() => setQuality("medium")}
      />
      <ChipToggle
        label="Low"
        active={quality === "low"}
        color="rose"
        onclick={() => setQuality("low")}
      />
    </ChipGroup>

    <!-- Layer Chips -->
    <ChipGroup>
      <ChipToggle
        label="Base"
        icon="square"
        active={layers.gradient}
        color="rose"
        onclick={() => toggleLayer("gradient")}
      />
      <ChipToggle
        label="Bands"
        icon="rainbow"
        active={layers.bands}
        color="rose"
        onclick={() => toggleLayer("bands")}
      />
      <ChipToggle
        label="Shimmer"
        icon="sparkle"
        active={layers.shimmer}
        color="rose"
        onclick={() => toggleLayer("shimmer")}
      />
      <ChipToggle
        label="Bokeh"
        icon="circle"
        active={layers.bokeh}
        color="rose"
        onclick={() => toggleLayer("bokeh")}
      />
      <ChipToggle
        label="Sparkles"
        icon="wand-magic-sparkles"
        active={layers.sparkles}
        color="rose"
        onclick={() => toggleLayer("sparkles")}
      />
      <ChipToggle
        label="Hearts"
        icon="heart"
        active={layers.hearts}
        color="rose"
        onclick={() => toggleLayer("hearts")}
      />
    </ChipGroup>

    <!-- Regenerate -->
    <button class="action-btn" onclick={regenerate}>
      <i class="fas fa-wand-magic-sparkles"></i>
      Regenerate
    </button>

    <!-- Stats -->
    <div class="stats-section">
      <span class="label">Scene Stats</span>
      <div class="stats-grid">
        <div class="stat">
          <span class="stat-value">{stats.bands}</span>
          <span class="stat-label">Bands</span>
        </div>
        <div class="stat">
          <span class="stat-value">{stats.bokeh}</span>
          <span class="stat-label">Bokeh</span>
        </div>
        <div class="stat">
          <span class="stat-value">{stats.sparkles}</span>
          <span class="stat-label">Sparkles</span>
        </div>
        <div class="stat">
          <span class="stat-value">{stats.hearts}</span>
          <span class="stat-label">Hearts</span>
        </div>
        <div class="stat">
          <span class="stat-value">{stats.shimmerPoints}</span>
          <span class="stat-label">Shimmer</span>
        </div>
      </div>
    </div>

    <!-- Info -->
    <div class="info-section">
      <span class="label">About</span>
      <p class="info-text">
        Flowing rainbow wave bands, dreamy bokeh orbs, twinkling sparkles,
        shimmer effects, and floating hearts. Choose from 9 different color
        palettes.
      </p>
    </div>

    <!-- Progress Pills -->
    <div class="progress-section">
      <span class="label">Features</span>
      <div class="progress-pills">
        <span class="pill complete">Wave Bands</span>
        <span class="pill complete">Multiple Palettes</span>
        <span class="pill complete">Bokeh Orbs</span>
        <span class="pill complete">Sparkles</span>
        <span class="pill complete">Shimmer</span>
        <span class="pill complete">Hearts</span>
        <span class="pill complete">Quality Levels</span>
      </div>
    </div>
  </div>

  <LabPreviewCanvas
    system={backgroundSystem}
    {isLoading}
    accentColor="#fda4af"
    backgroundColor="rgba(10, 10, 21, 0.9)"
    onCanvasReady={handleCanvasReady}
  />
</div>

<style>
  .pride-lab {
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
    background: linear-gradient(
      135deg,
      rgba(244, 63, 94, 0.3),
      rgba(251, 146, 60, 0.3),
      rgba(250, 204, 21, 0.3),
      rgba(34, 197, 94, 0.3),
      rgba(59, 130, 246, 0.3),
      rgba(168, 85, 247, 0.3)
    );
    border: 1px solid rgba(244, 63, 94, 0.4);
    border-radius: 20px;
    font-size: var(--font-size-compact, 0.75rem); /* 12px minimum */
    font-weight: 600;
    color: #fda4af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .label {
    font-size: var(--font-size-compact, 0.75rem); /* 12px minimum */
    font-weight: 500;
    color: #9ca3af; /* AAA contrast: ~7.7:1 on dark */
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 20px;
    background: linear-gradient(135deg, #f43f5e, #ec4899);
    border: none;
    border-radius: 12px;
    color: #ffffff;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
  }

  .action-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(244, 63, 94, 0.35);
  }

  .action-btn:active {
    transform: translateY(0);
  }

  .action-btn:focus-visible {
    outline: 2px solid #fda4af;
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
    grid-template-columns: repeat(2, 1fr);
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
    color: #fda4af;
  }

  .stat-label {
    font-size: var(--font-size-compact, 0.75rem); /* 12px minimum */
    color: #9ca3af; /* AAA contrast: ~7.7:1 on dark */
    text-transform: uppercase;
  }

  .info-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .info-text {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem); /* 12px minimum */
    color: #9ca3af; /* AAA contrast: ~7.7:1 on dark */
    line-height: 1.5;
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
    font-size: var(--font-size-compact, 0.75rem); /* 12px minimum */
    font-weight: 500;
  }

  .pill.complete {
    background: rgba(244, 63, 94, 0.15);
    color: #fda4af;
  }

  @media (max-width: 800px) {
    .pride-lab {
      grid-template-columns: 1fr;
      grid-template-rows: auto 400px;
    }
  }

  /* Accessibility: Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .action-btn {
      transition: none;
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
    .stat-label,
    .info-text {
      color: #d1d5db; /* Higher contrast gray */
    }
  }
</style>
