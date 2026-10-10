<script lang="ts">
  import { onDestroy } from "svelte";
  import { BlossomBackgroundSystem, type BlossomLayers, type QualityLevel, type TimeOfDay, getTimeOfDayPreset } from "@austencloud/backgrounds";
  import { ChipToggle, ChipGroup } from '@austencloud/chip-toggle';
  import LabPreviewCanvas from "./LabPreviewCanvas.svelte";
  import {
    getBlossomSettings,
    updateBlossomSettings,
  } from "../state/background-builder-state.svelte";
  import type {
    BlossomDensityPreset,
    BlossomWindPreset,
  } from "#lib/shared/background-builder/domain/lab-settings-types.js";

  // Background system
  let backgroundSystem: BlossomBackgroundSystem | null = $state(null);
  let canvasDimensions = $state({ width: 800, height: 600 });

  // Load persisted settings
  const savedSettings = getBlossomSettings();

  // Quality settings
  let quality: QualityLevel = $state(savedSettings.quality);

  // Loading state
  let isLoading = $state(true);

  // Time of day
  let timeOfDay: TimeOfDay = $state(savedSettings.timeOfDay);

  // Layer toggles - expanded for all features
  let layers = $state<BlossomLayers>({ ...savedSettings.layers });

  // Density presets
  let densityPreset: BlossomDensityPreset = $state(savedSettings.densityPreset);

  // Wind presets
  let windPreset: BlossomWindPreset = $state(savedSettings.windPreset);

  // Stats
  let stats = $state({ petals: 0, flowers: 0 });
  let lastStatsUpdate = 0;

  // Moon settings
  let moonDetailLevel = $state(0.7);
  let moonDarkness = $state(0.5);
  let moonSpread = $state(0.7);
  let moonGlow = $state(1.2);

  // Initialize system when canvas is ready
  function handleCanvasReady(dimensions: { width: number; height: number }) {
    canvasDimensions = dimensions;
    backgroundSystem = new BlossomBackgroundSystem();
    backgroundSystem.initialize(dimensions, quality);

    backgroundSystem.setTimeOfDay(timeOfDay);

    // Apply user's saved layer settings (don't overwrite with preset defaults)
    if (backgroundSystem.setLayerVisibility) {
      backgroundSystem.setLayerVisibility(layers);
    }

    isLoading = false;
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
    backgroundSystem = new BlossomBackgroundSystem();
    backgroundSystem.initialize(canvasDimensions, quality);
    backgroundSystem.setTimeOfDay(timeOfDay);
    if (backgroundSystem.setLayerVisibility) {
      backgroundSystem.setLayerVisibility(layers);
    }
  }

  function setQuality(q: QualityLevel) {
    quality = q;
    updateBlossomSettings({ quality: q });
    regenerate();
  }

  function setTimeOfDayMode(mode: TimeOfDay) {
    timeOfDay = mode;
    updateBlossomSettings({ timeOfDay: mode });
    if (backgroundSystem) {
      backgroundSystem.setTimeOfDay(mode);
      // Sync layers from new preset defaults
      layers = backgroundSystem.getLayerVisibility();
      updateBlossomSettings({ layers: { ...layers } });
    }
  }

  function setDensity(preset: BlossomDensityPreset) {
    densityPreset = preset;
    updateBlossomSettings({ densityPreset: preset });
    regenerate();
  }

  function setWindPreset(preset: BlossomWindPreset) {
    windPreset = preset;
    updateBlossomSettings({ windPreset: preset });
    // Wind presets could be applied via the system if we add that capability
  }

  function toggleLayer(layer: keyof BlossomLayers) {
    layers = { ...layers, [layer]: !layers[layer] };
    updateBlossomSettings({ layers: { ...layers } });
    if (backgroundSystem?.setLayerVisibility) {
      backgroundSystem.setLayerVisibility(layers);
    }
  }

  function triggerGust() {
    if (backgroundSystem?.triggerGust) {
      backgroundSystem.triggerGust();
    }
  }

  function updateMoonConfig() {
    if (backgroundSystem?.setMoonConfig) {
      backgroundSystem.setMoonConfig({
        detailLevel: moonDetailLevel,
        surfaceDarkness: moonDarkness,
        featureSpread: moonSpread,
        glowIntensity: moonGlow,
      });
    }
  }

  function setMoonDetail(value: number) {
    moonDetailLevel = value;
    updateMoonConfig();
  }

  function setMoonDarkness(value: number) {
    moonDarkness = value;
    updateMoonConfig();
  }

  function setMoonSpread(value: number) {
    moonSpread = value;
    updateMoonConfig();
  }

  function setMoonGlow(value: number) {
    moonGlow = value;
    updateMoonConfig();
  }

  function copyMoonSettings() {
    const settings = `detailLevel: ${moonDetailLevel}, surfaceDarkness: ${moonDarkness}, featureSpread: ${moonSpread}, glowIntensity: ${moonGlow}`;
    navigator.clipboard.writeText(settings);
  }

  onDestroy(() => {
    if (backgroundSystem) {
      backgroundSystem.cleanup?.();
    }
  });
</script>

<div class="blossom-lab">
  <div class="controls themed-scrollbar-accent">
    <div class="header">
      <h2>Blossom Lab</h2>
      <span class="badge">Petals</span>
    </div>

    <!-- Time of Day Selector -->
    <ChipGroup>
      <ChipToggle
        label="Twilight"
        icon="cloud-moon"
        active={timeOfDay === "twilight"}
        color="default"
        onclick={() => setTimeOfDayMode("twilight")}
      />
      <ChipToggle
        label="Golden Hour"
        icon="sun"
        active={timeOfDay === "goldenHour"}
        color="amber"
        onclick={() => setTimeOfDayMode("goldenHour")}
      />
      <ChipToggle
        label="Night"
        icon="moon"
        active={timeOfDay === "night"}
        color="cyan"
        onclick={() => setTimeOfDayMode("night")}
      />
    </ChipGroup>

    <!-- Quality Chips -->
    <ChipGroup>
      <ChipToggle label="High" active={quality === "high"} color="rose" onclick={() => setQuality("high")} />
      <ChipToggle label="Medium" active={quality === "medium"} color="rose" onclick={() => setQuality("medium")} />
      <ChipToggle label="Low" active={quality === "low"} color="rose" onclick={() => setQuality("low")} />
    </ChipGroup>

    <!-- Core Layer Toggles -->
    <ChipGroup>
      <ChipToggle label="Gradient" icon="fill-drip" active={layers.gradient} color="rose" onclick={() => toggleLayer("gradient")} />
      <ChipToggle label="Petals" icon="leaf" active={layers.petals} color="rose" onclick={() => toggleLayer("petals")} />
    </ChipGroup>

    <!-- Parallax Depth Toggles -->
    <ChipGroup>
      <ChipToggle label="Far" active={layers.petalsFar} color="default" onclick={() => toggleLayer("petalsFar")} />
      <ChipToggle label="Mid" active={layers.petalsMid} color="default" onclick={() => toggleLayer("petalsMid")} />
      <ChipToggle label="Near" active={layers.petalsNear} color="default" onclick={() => toggleLayer("petalsNear")} />
    </ChipGroup>

    <!-- Environmental Layers -->
    <ChipGroup>
      <ChipToggle label="Moon" icon="moon" active={layers.moon} color="cyan" onclick={() => toggleLayer("moon")} />
      <ChipToggle label="Stars" icon="star" active={layers.stars} color="cyan" onclick={() => toggleLayer("stars")} />
      <ChipToggle label="Trees" icon="tree" active={layers.trees} color="emerald" onclick={() => toggleLayer("trees")} />
      <ChipToggle label="Lanterns" icon="lightbulb" active={layers.lanterns} color="amber" onclick={() => toggleLayer("lanterns")} />
      <ChipToggle label="Reflection" icon="water" active={layers.reflection} color="cyan" onclick={() => toggleLayer("reflection")} />
    </ChipGroup>

    <!-- Moon Settings (shown when moon is enabled) -->
    {#if layers.moon}
      <div class="slider-section">
        <div class="slider-header">
          <span class="label">Moon Settings</span>
          <button class="copy-btn" onclick={copyMoonSettings} title="Copy settings">
            <i class="fas fa-copy"></i>
          </button>
        </div>
        <div class="slider-row">
          <span class="slider-label">Detail</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={moonDetailLevel}
            oninput={(e) => setMoonDetail(Number(e.currentTarget.value))}
          />
          <span class="slider-value">{Math.round(moonDetailLevel * 100)}%</span>
        </div>
        <div class="slider-row">
          <span class="slider-label">Darkness</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={moonDarkness}
            oninput={(e) => setMoonDarkness(Number(e.currentTarget.value))}
          />
          <span class="slider-value">{Math.round(moonDarkness * 100)}%</span>
        </div>
        <div class="slider-row">
          <span class="slider-label">Spread</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={moonSpread}
            oninput={(e) => setMoonSpread(Number(e.currentTarget.value))}
          />
          <span class="slider-value">{Math.round(moonSpread * 100)}%</span>
        </div>
        <div class="slider-row">
          <span class="slider-label">Glow</span>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={moonGlow}
            oninput={(e) => setMoonGlow(Number(e.currentTarget.value))}
          />
          <span class="slider-value">{moonGlow.toFixed(1)}x</span>
        </div>
      </div>
    {/if}

    <!-- Effect Layers -->
    <ChipGroup>
      <ChipToggle label="Trails" icon="wind" active={layers.trails} color="rose" onclick={() => toggleLayer("trails")} />
      <ChipToggle label="Accumulation" icon="layer-group" active={layers.accumulation} color="rose" onclick={() => toggleLayer("accumulation")} />
      <ChipToggle label="Vortex" icon="hurricane" active={layers.vortex} color="rose" onclick={() => toggleLayer("vortex")} />
    </ChipGroup>

    <!-- Density Chips -->
    <ChipGroup>
      <ChipToggle label="Sparse" active={densityPreset === "sparse"} color="rose" onclick={() => setDensity("sparse")} />
      <ChipToggle label="Normal" active={densityPreset === "normal"} color="rose" onclick={() => setDensity("normal")} />
      <ChipToggle label="Dense" active={densityPreset === "dense"} color="rose" onclick={() => setDensity("dense")} />
      <ChipToggle label="Ultra" active={densityPreset === "ultra"} color="rose" onclick={() => setDensity("ultra")} />
    </ChipGroup>

    <!-- Wind Chips -->
    <ChipGroup>
      <ChipToggle label="Calm" active={windPreset === "calm"} color="default" onclick={() => setWindPreset("calm")} />
      <ChipToggle label="Gentle" active={windPreset === "gentle"} color="default" onclick={() => setWindPreset("gentle")} />
      <ChipToggle label="Breezy" active={windPreset === "breezy"} color="default" onclick={() => setWindPreset("breezy")} />
      <ChipToggle label="Gusty" active={windPreset === "gusty"} color="default" onclick={() => setWindPreset("gusty")} />
    </ChipGroup>

    <!-- Actions -->
    <div class="action-row">
      <button class="action-btn gust-btn" onclick={triggerGust}>
        <i class="fas fa-wind"></i>
        Trigger Gust
      </button>
      <button class="action-btn" onclick={regenerate}>
        <i class="fas fa-wand-magic-sparkles"></i>
        Regenerate
      </button>
    </div>

    <!-- Stats -->
    <div class="stats-section">
      <span class="label">Scene Stats</span>
      <div class="stats-grid">
        <div class="stat">
          <span class="stat-value">{stats.petals}</span>
          <span class="stat-label">Petals</span>
        </div>
        <div class="stat">
          <span class="stat-value">{stats.flowers}</span>
          <span class="stat-label">Flowers</span>
        </div>
      </div>
    </div>

    <!-- Progress Pills -->
    <div class="progress-section">
      <span class="label">Features</span>
      <div class="progress-pills">
        <span class="pill complete">Time of Day</span>
        <span class="pill complete">Twilight Gradient</span>
        <span class="pill complete">Tumble Physics</span>
        <span class="pill complete">Wind Gusts</span>
        <span class="pill complete">Flower Rendering</span>
        <span class="pill complete">Layer Controls</span>
        <span class="pill active">Parallax Depth</span>
        <span class="pill pending">Moon & Stars</span>
        <span class="pill pending">Tree Silhouettes</span>
        <span class="pill pending">Lanterns</span>
      </div>
    </div>
  </div>

  <LabPreviewCanvas
    system={backgroundSystem}
    {isLoading}
    accentColor="#f472b6"
    backgroundColor="rgba(26, 16, 22, 0.9)"
    onCanvasReady={handleCanvasReady}
    onFrame={handleFrame}
  />
</div>

<style>
  .blossom-lab {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 20px;
    height: 100%;
    min-height: 600px;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
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
    background: linear-gradient(135deg, rgba(244, 63, 94, 0.3), rgba(251, 113, 133, 0.3));
    border: 1px solid rgba(251, 113, 133, 0.4);
    border-radius: 20px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: #fb7185;
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

  .action-row {
    display: flex;
    gap: 10px;
  }

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    background: linear-gradient(135deg, #f43f5e, #e11d48);
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
    box-shadow: 0 8px 20px rgba(244, 63, 94, 0.35);
  }

  .action-btn:active {
    transform: translateY(0);
  }

  .action-btn:focus-visible {
    outline: 2px solid #fb7185;
    outline-offset: 2px;
  }

  .gust-btn {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
  }

  .gust-btn:hover {
    box-shadow: 0 8px 20px rgba(99, 102, 241, 0.35);
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
    color: #fb7185;
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
    background: rgba(244, 63, 94, 0.2);
    color: #fb7185;
    animation: pulse 2s infinite;
  }

  .pill.pending {
    background: var(--theme-input-bg, rgba(255, 255, 255, 0.05));
    color: #6b7280;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  .slider-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .slider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .copy-btn {
    padding: 4px 8px;
    background: var(--theme-hover-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: #9ca3af;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .copy-btn:hover {
    background: rgba(6, 182, 212, 0.2);
    border-color: rgba(6, 182, 212, 0.3);
    color: #06b6d4;
  }

  .slider-row {
    display: grid;
    grid-template-columns: 70px 1fr 45px;
    align-items: center;
    gap: 10px;
  }

  .slider-label {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .slider-value {
    font-size: 0.75rem;
    color: #06b6d4;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .slider-section input[type="range"] {
    width: 100%;
    height: 4px;
    background: var(--theme-hover-bg, rgba(255, 255, 255, 0.1));
    border-radius: 2px;
    appearance: none;
    cursor: pointer;
  }

  .slider-section input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    background: #06b6d4;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .slider-section input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }

  .slider-section input[type="range"]:focus-visible {
    outline: 2px solid rgba(6, 182, 212, 0.7);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .slider-section input[type="range"]::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: #06b6d4;
    border-radius: 50%;
    border: none;
    cursor: pointer;
  }

  @media (max-width: 800px) {
    .blossom-lab {
      grid-template-columns: 1fr;
      grid-template-rows: auto 400px;
    }

    .action-row {
      flex-direction: column;
    }
  }

  /* Accessibility: Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .action-btn,
    .gust-btn,
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
