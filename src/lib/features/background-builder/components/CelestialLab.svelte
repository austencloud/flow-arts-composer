<script lang="ts">
  import { onDestroy } from "svelte";
  import {
    CelestialBackgroundSystem,
    type QualityLevel,
    type CelestialLayers,
  } from "@austencloud/backgrounds";
  import { ChipToggle, ChipGroup } from "@austencloud/chip-toggle";
  import LabPreviewCanvas from "./LabPreviewCanvas.svelte";
  import {
    getCelestialLabSettings,
    updateCelestialLabSettings,
  } from "../state/background-builder-state.svelte";

  function buildLayerVisibility(): Partial<CelestialLayers> {
    return {
      clouds: layers.clouds,
      sunGlow: layers.sunGlow,
      atmosphere: layers.atmosphere,
      vignette: layers.vignette,
    };
  }

  let backgroundSystem: CelestialBackgroundSystem | null = $state(null);
  let canvasDimensions = $state({ width: 800, height: 600 });
  let isLoading = $state(true);

  const savedSettings = getCelestialLabSettings();
  let quality: QualityLevel = $state(savedSettings.quality);
  let layers = $state({ ...savedSettings.layers });

  function handleCanvasReady(dimensions: { width: number; height: number }) {
    canvasDimensions = dimensions;
    backgroundSystem = new CelestialBackgroundSystem();
    backgroundSystem.initialize(dimensions, quality);
    backgroundSystem.setLayerVisibility(buildLayerVisibility());
    isLoading = false;
  }

  function regenerate() {
    backgroundSystem?.cleanup?.();
    backgroundSystem = new CelestialBackgroundSystem();
    backgroundSystem.initialize(canvasDimensions, quality);
    backgroundSystem.setLayerVisibility(buildLayerVisibility());
  }

  function setQuality(q: QualityLevel) {
    quality = q;
    updateCelestialLabSettings({ quality: q });
    backgroundSystem?.setQuality(q);
  }

  function toggleLayer(layer: keyof typeof layers) {
    layers = { ...layers, [layer]: !layers[layer] };
    updateCelestialLabSettings({ layers: { ...layers } });
    backgroundSystem?.setLayerVisibility(buildLayerVisibility());
  }

  onDestroy(() => {
    backgroundSystem?.cleanup?.();
  });
</script>

<div class="celestial-lab">
  <div class="controls themed-scrollbar-accent">
    <div class="header">
      <h2>Celestial Lab</h2>
      <span class="badge">Cloudscape</span>
    </div>

    <ChipGroup>
      <ChipToggle
        label="High"
        active={quality === "high"}
        color="cyan"
        onclick={() => setQuality("high")}
      />
      <ChipToggle
        label="Medium"
        active={quality === "medium"}
        color="cyan"
        onclick={() => setQuality("medium")}
      />
      <ChipToggle
        label="Low"
        active={quality === "low"}
        color="cyan"
        onclick={() => setQuality("low")}
      />
    </ChipGroup>

    <ChipGroup>
      <ChipToggle
        label="Clouds"
        icon="cloud"
        active={layers.clouds}
        color="cyan"
        onclick={() => toggleLayer("clouds")}
      />
      <ChipToggle
        label="Sun Glow"
        icon="sun"
        active={layers.sunGlow}
        color="cyan"
        onclick={() => toggleLayer("sunGlow")}
      />
      <ChipToggle
        label="Atmosphere"
        icon="smog"
        active={layers.atmosphere}
        color="cyan"
        onclick={() => toggleLayer("atmosphere")}
      />
      <ChipToggle
        label="Vignette"
        icon="circle"
        active={layers.vignette}
        color="cyan"
        onclick={() => toggleLayer("vignette")}
      />
    </ChipGroup>

    <button class="action-btn" onclick={regenerate}>
      <i class="fas fa-cloud-sun"></i>
      Regenerate
    </button>
  </div>

  <LabPreviewCanvas
    system={backgroundSystem}
    {isLoading}
    accentColor="#8dc4e8"
    backgroundColor="rgba(32, 112, 200, 0.9)"
    onCanvasReady={handleCanvasReady}
  />
</div>

<style>
  .celestial-lab {
    --celestial-accent: #4a9ae8;
    --celestial-accent-strong: #2070c8;
    --celestial-accent-deep: #17569b;
    --celestial-highlight: #8dc4e8;

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
    background: color-mix(in srgb, var(--celestial-accent) 30%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--celestial-highlight) 45%, transparent);
    border-radius: 20px;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    color: var(--celestial-highlight);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 20px;
    background: linear-gradient(
      135deg,
      var(--celestial-accent-strong),
      var(--celestial-accent-deep)
    );
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
    box-shadow: 0 8px 20px
      color-mix(in srgb, var(--celestial-accent) 35%, transparent);
  }

  .action-btn:active {
    transform: translateY(0);
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--celestial-highlight);
    outline-offset: 2px;
  }

  @media (max-width: 800px) {
    .celestial-lab {
      grid-template-columns: 1fr;
      grid-template-rows: auto 400px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .action-btn {
      transition: none;
    }
  }
</style>
