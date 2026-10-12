<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    AutumnBackgroundSystem,
    type QualityLevel,
  } from "@austencloud/backgrounds";
  import { ChipToggle, ChipGroup } from "@austencloud/chip-toggle";
  import LabPreviewCanvas from "./LabPreviewCanvas.svelte";

  type DensityPreset = "sparse" | "normal" | "dense" | "storm";
  type WindPreset = "calm" | "breezy" | "windy" | "gusty";
  type LayerState = {
    sky: boolean;
    moon: boolean;
    trees: boolean;
    landscape: boolean;
    leaves: boolean;
    owl: boolean;
  };

  interface AutumnLabSystem {
    initialize(
      dimensions: { width: number; height: number },
      quality: QualityLevel
    ): void;
    update(
      dimensions: { width: number; height: number },
      frameMultiplier: number
    ): void;
    draw(
      ctx: CanvasRenderingContext2D,
      dimensions: { width: number; height: number }
    ): void;
    cleanup?(): void;
    handleResize?(
      oldDimensions: { width: number; height: number },
      newDimensions: { width: number; height: number }
    ): void;
    setQuality(quality: QualityLevel): void;
    setLayerVisibility(layers: Partial<LayerState>): void;
    setDensityPreset?(preset: DensityPreset): void;
    setWindPreset?(preset: WindPreset): void;
    triggerGust?(): void;
    setPointer?(
      x: number,
      y: number,
      active: boolean,
      pointerType?: string
    ): void;
    setAccessibility?(settings: {
      reducedMotion: boolean;
      highContrast: boolean;
    }): void;
    getStats(): {
      leaves: number;
      treesLoaded?: number;
    };
  }

  function createAutumnLabSystem(): AutumnLabSystem {
    return new AutumnBackgroundSystem() as unknown as AutumnLabSystem;
  }

  // Background system
  let backgroundSystem: AutumnLabSystem | null = $state(null);
  let canvasDimensions = $state({ width: 800, height: 600 });

  // Quality settings
  let quality: QualityLevel = $state("high");

  // Loading state
  let isLoading = $state(true);

  // Layer toggles
  let layers: LayerState = $state({
    sky: true,
    moon: false,
    trees: true,
    landscape: true,
    leaves: true,
    owl: false,
  });

  let densityPreset: DensityPreset = $state("normal");

  let windPreset: WindPreset = $state("breezy");

  // Stats
  let stats = $state({ leaves: 0, trees: 0 });
  let lastStatsUpdate = 0;

  // Initialize system when canvas is ready
  function handleCanvasReady(dimensions: { width: number; height: number }) {
    canvasDimensions = dimensions;
    backgroundSystem = createAutumnLabSystem();
    backgroundSystem.initialize(dimensions, quality);
    applySettings();

    isLoading = false;
  }

  // Update stats on each frame
  function handleFrame() {
    const now = performance.now();
    if (now - lastStatsUpdate > 1000 && backgroundSystem) {
      const sceneStats = backgroundSystem.getStats();
      stats = {
        leaves: sceneStats.leaves,
        trees: sceneStats.treesLoaded ?? 0,
      };
      lastStatsUpdate = now;
    }
  }

  function regenerate() {
    if (backgroundSystem) {
      backgroundSystem.cleanup?.();
    }
    backgroundSystem = createAutumnLabSystem();
    backgroundSystem.initialize(canvasDimensions, quality);
    applySettings();
  }

  function applySettings() {
    if (!backgroundSystem) return;
    backgroundSystem.setLayerVisibility(layers);
    backgroundSystem.setDensityPreset?.(densityPreset);
    backgroundSystem.setWindPreset?.(windPreset);
    backgroundSystem.setAccessibility?.({
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
      highContrast: window.matchMedia("(prefers-contrast: more)").matches,
    });
  }

  function setQuality(q: QualityLevel) {
    quality = q;
    backgroundSystem?.setQuality(q);
  }

  function setDensity(preset: DensityPreset) {
    densityPreset = preset;
    backgroundSystem?.setDensityPreset?.(preset);
  }

  function setWindPreset(preset: WindPreset) {
    windPreset = preset;
    backgroundSystem?.setWindPreset?.(preset);
  }

  function toggleLayer(layer: keyof typeof layers) {
    layers = { ...layers, [layer]: !layers[layer] };
    backgroundSystem?.setLayerVisibility(layers);
  }

  function toggleScene() {
    const visible = !layers.sky;
    layers = {
      ...layers,
      sky: visible,
      trees: visible,
      landscape: visible,
    };
    backgroundSystem?.setLayerVisibility(layers);
  }

  onDestroy(() => {
    if (backgroundSystem) {
      backgroundSystem.cleanup?.();
    }
  });
</script>

<div class="autumn-lab">
  <div class="controls themed-scrollbar-accent">
    <div class="header">
      <h2>Autumn Lab</h2>
      <span class="badge">Quiet Clearing</span>
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
        label="Scene"
        icon="tree"
        active={layers.sky}
        color="amber"
        onclick={toggleScene}
      />
      <ChipToggle
        label="Leaves"
        icon="leaf"
        active={layers.leaves}
        color="amber"
        onclick={() => toggleLayer("leaves")}
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
        label="Storm"
        active={densityPreset === "storm"}
        color="amber"
        onclick={() => setDensity("storm")}
      />
    </ChipGroup>

    <!-- Wind Chips -->
    <ChipGroup>
      <ChipToggle
        label="Calm"
        active={windPreset === "calm"}
        color="default"
        onclick={() => setWindPreset("calm")}
      />
      <ChipToggle
        label="Breezy"
        active={windPreset === "breezy"}
        color="default"
        onclick={() => setWindPreset("breezy")}
      />
      <ChipToggle
        label="Windy"
        active={windPreset === "windy"}
        color="default"
        onclick={() => setWindPreset("windy")}
      />
      <ChipToggle
        label="Gusty"
        active={windPreset === "gusty"}
        color="default"
        onclick={() => setWindPreset("gusty")}
      />
    </ChipGroup>

    <div class="actions">
      <button
        class="action-btn"
        onclick={() => backgroundSystem?.triggerGust?.()}
      >
        <i class="fas fa-wind"></i>
        Call a Gust
      </button>
      <button class="secondary-btn" onclick={regenerate}>
        <i class="fas fa-rotate"></i>
        Reset Leaves
      </button>
    </div>

    <!-- Stats -->
    <div class="stats-section">
      <span class="label">Scene Stats</span>
      <div class="stats-grid">
        <div class="stat">
          <span class="stat-value">{stats.leaves}</span>
          <span class="stat-label">Leaves</span>
        </div>
        <div class="stat">
          <span class="stat-value">{stats.trees}</span>
          <span class="stat-label">Trees</span>
        </div>
      </div>
    </div>

    <!-- Progress Pills -->
    <div class="progress-section">
      <span class="label">Features</span>
      <div class="progress-pills">
        <span class="pill complete">Five depth bands</span>
        <span class="pill complete">Subtle parallax</span>
        <span class="pill complete">Clear center</span>
        <span class="pill complete">Eased gusts</span>
      </div>
    </div>
  </div>

  <LabPreviewCanvas
    system={backgroundSystem}
    {isLoading}
    accentColor="#f59e0b"
    backgroundColor="rgba(45, 24, 16, 0.9)"
    onCanvasReady={handleCanvasReady}
    onFrame={handleFrame}
  />
</div>

<style>
  .autumn-lab {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 20px;
    height: 100%;
    min-height: 0;
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
      rgba(217, 119, 6, 0.3),
      rgba(245, 158, 11, 0.3)
    );
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 20px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: #f59e0b;
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
    min-height: 44px;
    background: linear-gradient(135deg, #d97706, #b45309);
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
      box-shadow var(--duration-normal) var(--ease-standard),
      grid-template-columns var(--duration-normal) var(--ease-standard);
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .secondary-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: #f3f4f6;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }

  .secondary-btn:hover {
    background: rgba(245, 158, 11, 0.12);
    border-color: rgba(245, 158, 11, 0.32);
  }

  .secondary-btn:focus-visible {
    outline: 2px solid #fbbf24;
    outline-offset: 2px;
  }

  .action-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(217, 119, 6, 0.35);
  }

  .action-btn:active {
    transform: translateY(0);
  }

  .action-btn:focus-visible {
    outline: 2px solid #fbbf24;
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
    color: #f59e0b;
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
    background: color-mix(
      in srgb,
      var(--theme-success, #34d399) 15%,
      transparent
    );
    color: var(--theme-success, #34d399);
  }

  @media (max-width: 800px) {
    .autumn-lab {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, auto) minmax(400px, 58vh);
    }
  }

  @media (max-height: 500px) and (min-width: 801px) {
    .autumn-lab :global(.preview) {
      min-height: 0;
    }
  }

  /* Accessibility: Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .action-btn,
    .secondary-btn,
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
