<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    EmberBackgroundSystem,
    type QualityLevel,
    type HeatIntensity,
    type DensityPreset,
  } from "@austencloud/backgrounds";
  import { ChipToggle, ChipGroup } from "@austencloud/chip-toggle";
  import LabPreviewCanvas from "./LabPreviewCanvas.svelte";
  import {
    getEmberSettings,
    updateEmberSettings,
  } from "../state/background-builder-state.svelte";

  // Background system
  let backgroundSystem: EmberBackgroundSystem | null = $state(null);
  let canvasDimensions = $state({ width: 800, height: 600 });

  // Load persisted settings
  const savedSettings = getEmberSettings();

  // Quality settings
  let quality: QualityLevel = $state(savedSettings.quality);

  // Loading state
  let isLoading = $state(true);

  // Layer toggles
  let layers = $state({ ...savedSettings.layers });

  // Density presets
  let densityPreset: DensityPreset = $state(savedSettings.densityPreset);

  // Heat intensity
  let heatIntensity: HeatIntensity = $state(savedSettings.heatIntensity);

  // Stats
  let stats = $state({
    embers: 0,
    smoke: 0,
    sparks: 0,
    coals: 0,
  });

  // Initialize system when canvas is ready
  function handleCanvasReady(dimensions: { width: number; height: number }) {
    canvasDimensions = dimensions;
    backgroundSystem = new EmberBackgroundSystem();
    backgroundSystem.setHeatIntensity(heatIntensity);
    backgroundSystem.setDensityPreset(densityPreset);
    backgroundSystem.initialize(dimensions, quality);
    backgroundSystem.setLayerVisibility(layers);
    updateStats();
    isLoading = false;
  }

  function updateStats() {
    if (backgroundSystem) {
      const s = backgroundSystem.getStats();
      stats = {
        embers: s.embers,
        smoke: s.smoke,
        sparks: s.sparks,
        coals: s.coals,
      };
    }
  }

  function regenerate() {
    if (backgroundSystem) {
      backgroundSystem.cleanup?.();
    }
    backgroundSystem = new EmberBackgroundSystem();
    backgroundSystem.setHeatIntensity(heatIntensity);
    backgroundSystem.setDensityPreset(densityPreset);
    backgroundSystem.initialize(canvasDimensions, quality);
    backgroundSystem.setLayerVisibility(layers);
    updateStats();
  }

  function setQuality(q: QualityLevel) {
    quality = q;
    updateEmberSettings({ quality: q });
    if (backgroundSystem) {
      backgroundSystem.setQuality(q);
      updateStats();
    }
  }

  function setDensity(preset: DensityPreset) {
    densityPreset = preset;
    updateEmberSettings({ densityPreset: preset });
    if (backgroundSystem) {
      backgroundSystem.setDensityPreset(preset);
      updateStats();
    }
  }

  function setHeat(intensity: HeatIntensity) {
    heatIntensity = intensity;
    updateEmberSettings({ heatIntensity: intensity });
    if (backgroundSystem) {
      backgroundSystem.setHeatIntensity(intensity);
      updateStats();
    }
  }

  function toggleLayer(layer: keyof typeof layers) {
    layers = { ...layers, [layer]: !layers[layer] };
    updateEmberSettings({ layers: { ...layers } });
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

<div class="ember-lab">
  <div class="controls themed-scrollbar-accent">
    <div class="header">
      <h2>Ember Lab</h2>
      <span class="badge">Fire Particles</span>
    </div>

    <!-- Quality Chips -->
    <ChipGroup>
      <ChipToggle
        label="High"
        active={quality === "high"}
        color="amber"
        onclick={() => setQuality("high")}
      />
      <ChipToggle
        label="Medium"
        active={quality === "medium"}
        color="amber"
        onclick={() => setQuality("medium")}
      />
      <ChipToggle
        label="Low"
        active={quality === "low"}
        color="amber"
        onclick={() => setQuality("low")}
      />
    </ChipGroup>

    <!-- Layer Chips -->
    <ChipGroup>
      <ChipToggle
        label="Base"
        icon="square"
        active={layers.gradient}
        color="amber"
        onclick={() => toggleLayer("gradient")}
      />
      <ChipToggle
        label="Coal Bed"
        icon="fire-burner"
        active={layers.coalBed}
        color="amber"
        onclick={() => toggleLayer("coalBed")}
      />
      <ChipToggle
        label="Smoke"
        icon="cloud"
        active={layers.smoke}
        color="amber"
        onclick={() => toggleLayer("smoke")}
      />
      <ChipToggle
        label="Embers"
        icon="fire"
        active={layers.embers}
        color="amber"
        onclick={() => toggleLayer("embers")}
      />
      <ChipToggle
        label="Sparks"
        icon="sparkle"
        active={layers.sparks}
        color="amber"
        onclick={() => toggleLayer("sparks")}
      />
    </ChipGroup>

    <!-- Enhancement Chips -->
    <ChipGroup>
      <ChipToggle
        label="Vignette"
        icon="circle"
        active={layers.vignette}
        color="amber"
        onclick={() => toggleLayer("vignette")}
      />
      <ChipToggle
        label="Bottom Glow"
        icon="sun"
        active={layers.bottomGlow}
        color="amber"
        onclick={() => toggleLayer("bottomGlow")}
      />
      <ChipToggle
        label="Spark Trails"
        icon="comet"
        active={layers.sparkTrails}
        color="amber"
        onclick={() => toggleLayer("sparkTrails")}
      />
      <ChipToggle
        label="Breathing"
        icon="wind"
        active={layers.breathing}
        color="amber"
        onclick={() => toggleLayer("breathing")}
      />
    </ChipGroup>

    <!-- Density Chips -->
    <ChipGroup>
      <ChipToggle
        label="Sparse"
        active={densityPreset === "sparse"}
        color="amber"
        onclick={() => setDensity("sparse")}
      />
      <ChipToggle
        label="Normal"
        active={densityPreset === "normal"}
        color="amber"
        onclick={() => setDensity("normal")}
      />
      <ChipToggle
        label="Dense"
        active={densityPreset === "dense"}
        color="amber"
        onclick={() => setDensity("dense")}
      />
      <ChipToggle
        label="Inferno"
        active={densityPreset === "inferno"}
        color="amber"
        onclick={() => setDensity("inferno")}
      />
    </ChipGroup>

    <!-- Heat Chips -->
    <ChipGroup>
      <ChipToggle
        label="Smolder"
        active={heatIntensity === "smolder"}
        color="amber"
        onclick={() => setHeat("smolder")}
      />
      <ChipToggle
        label="Warm"
        active={heatIntensity === "warm"}
        color="amber"
        onclick={() => setHeat("warm")}
      />
      <ChipToggle
        label="Hot"
        active={heatIntensity === "hot"}
        color="amber"
        onclick={() => setHeat("hot")}
      />
      <ChipToggle
        label="Blazing"
        active={heatIntensity === "blazing"}
        color="amber"
        onclick={() => setHeat("blazing")}
      />
    </ChipGroup>

    <!-- Regenerate -->
    <button class="action-btn" onclick={regenerate}>
      <i class="fas fa-fire-flame-curved"></i>
      Regenerate
    </button>

    <!-- Stats -->
    <div class="stats-section">
      <span class="label">Scene Stats</span>
      <div class="stats-grid">
        <div class="stat">
          <span class="stat-value">{stats.coals}</span>
          <span class="stat-label">Coals</span>
        </div>
        <div class="stat">
          <span class="stat-value">{stats.embers}</span>
          <span class="stat-label">Embers</span>
        </div>
        <div class="stat">
          <span class="stat-value">{stats.smoke}</span>
          <span class="stat-label">Smoke</span>
        </div>
        <div class="stat">
          <span class="stat-value">{stats.sparks}</span>
          <span class="stat-label">Sparks</span>
        </div>
      </div>
    </div>

    <!-- Info -->
    <div class="info-section">
      <span class="label">About</span>
      <p class="info-text">
        A warm, cozy atmosphere with a glowing coal bed at the bottom, rising
        embers, drifting smoke particles, and bright sparks. Heat intensity
        affects colors, speed, and glow. Density controls particle count. The
        coal bed pulses with offset phases and random flare hotspots.
        Enhancements add vignette, bottom glow, spark trails, and breathing
        (scene-wide pulsing synced with the coals).
      </p>
    </div>

    <!-- Progress Pills -->
    <div class="progress-section">
      <span class="label">Features</span>
      <div class="progress-pills">
        <span class="pill complete">Dark Gradient</span>
        <span class="pill complete">Coal Bed</span>
        <span class="pill complete">Rising Embers</span>
        <span class="pill complete">Glow Effects</span>
        <span class="pill complete">Flicker Animation</span>
        <span class="pill complete">Smoke Particles</span>
        <span class="pill complete">Bright Sparks</span>
        <span class="pill complete">Heat Intensity</span>
        <span class="pill complete">Density Presets</span>
        <span class="pill complete">Quality Levels</span>
        <span class="pill complete">Vignette Effect</span>
        <span class="pill complete">Bottom Glow</span>
        <span class="pill complete">Spark Trails</span>
        <span class="pill complete">Breathing Effect</span>
        <span class="pill complete">Playful Embers</span>
        <span class="pill complete">Billowing Smoke</span>
        <span class="pill complete">Phoenix Easter Egg</span>
      </div>
    </div>
  </div>

  <LabPreviewCanvas
    system={backgroundSystem}
    {isLoading}
    accentColor="#f97316"
    backgroundColor="rgba(26, 12, 8, 0.9)"
    onCanvasReady={handleCanvasReady}
  />
</div>

<style>
  .ember-lab {
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
      rgba(245, 158, 11, 0.3),
      rgba(251, 191, 36, 0.3)
    );
    border: 1px solid rgba(251, 191, 36, 0.4);
    border-radius: 20px;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    color: #fbbf24;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .label {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 500;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 20px;
    background: linear-gradient(135deg, #f59e0b, #d97706);
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
    box-shadow: 0 8px 20px rgba(245, 158, 11, 0.35);
  }

  .action-btn:active {
    transform: translateY(0);
  }

  .action-btn:focus-visible {
    outline: 2px solid #fcd34d;
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
    grid-template-columns: repeat(4, 1fr);
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
    color: #fbbf24;
  }

  .stat-label {
    font-size: var(--font-size-compact, 0.75rem);
    color: #9ca3af;
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
    font-size: var(--font-size-compact, 0.75rem);
    color: #9ca3af;
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
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 500;
  }

  .pill.complete {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
  }

  @media (max-width: 800px) {
    .ember-lab {
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
      color: #d1d5db;
    }
  }
</style>
