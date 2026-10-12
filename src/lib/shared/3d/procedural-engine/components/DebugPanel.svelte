<script lang="ts">
  /**
   * DebugPanel
   *
   * Comprehensive debug GUI for exploring infinite worlds.
   * Shows real-time state from all managers - position, biome, fog, water,
   * textures, chunks, vegetation, and performance metrics.
   */
  import { ChipToggle } from "@austencloud/chip-toggle";

  interface AtmosphereState {
    fogEnabled: boolean;
    currentBiome: string;
    fogDensity: number;
    fogColor: string;
  }

  interface WaterState {
    visible: boolean;
    waterLevel: number;
    color: string;
    opacity: number;
  }

  interface ChunkStats {
    loaded: number;
    pending: number;
    loading: number;
  }

  interface VegetationStats {
    trees: number;
    rocks: number;
    bushes: number;
    grass: number;
  }

  interface Props {
    // Position & Navigation
    position: { x: number; y: number; z: number };
    biome: string;
    onTeleport: (x: number, y: number, z: number) => void;

    // Toggle callbacks
    onToggleWater?: (visible: boolean) => void;
    onToggleFog?: (enabled: boolean) => void;
    onToggleTextures?: (enabled: boolean) => void;

    // Toggle states (reactive from parent)
    fogEnabled?: boolean;
    waterVisible?: boolean;
    texturesEnabled?: boolean;
    texturesLoaded?: boolean;

    // Real-time state from managers (for detail display)
    atmosphereState?: AtmosphereState | null;
    waterState?: WaterState | null;

    // Performance & Stats
    fps?: number;
    chunkStats?: ChunkStats;
    vegetationStats?: VegetationStats;
    colliderCount?: number;
    seed?: string;
  }

  let {
    position,
    biome,
    onTeleport,
    onToggleWater,
    onToggleFog,
    onToggleTextures,
    fogEnabled = true,
    waterVisible = true,
    texturesEnabled = true,
    texturesLoaded = false,
    atmosphereState = null,
    waterState = null,
    fps = 0,
    chunkStats = { loaded: 0, pending: 0, loading: 0 },
    vegetationStats = { trees: 0, rocks: 0, bushes: 0, grass: 0 },
    colliderCount = 0,
    seed = "",
  }: Props = $props();

  let isCollapsed = $state(false);
  let activeSection = $state<string | null>(null); // For expanding detail sections

  // Toggle states are now passed directly as props (fogEnabled, waterVisible, texturesEnabled)
  // No need to derive - they're reactive from the parent

  const BIOME_PRESETS = [
    { name: "Forest", x: 0, y: 60, z: 0, color: "#22c55e", icon: "fa-tree" },
    {
      name: "Plains",
      x: 500,
      y: 60,
      z: 500,
      color: "#84cc16",
      icon: "fa-seedling",
    },
    {
      name: "Mountains",
      x: 0,
      y: 80,
      z: 1500,
      color: "#94a3b8",
      icon: "fa-mountain",
    },
    { name: "Desert", x: 2000, y: 60, z: 0, color: "#f59e0b", icon: "fa-sun" },
    {
      name: "Ocean",
      x: -800,
      y: 60,
      z: -800,
      color: "#0ea5e9",
      icon: "fa-water",
    },
  ];

  function handleTeleport(preset: (typeof BIOME_PRESETS)[0]) {
    onTeleport(preset.x, preset.y, preset.z);
  }

  function handleToggleWater() {
    onToggleWater?.(!waterVisible);
  }

  function handleToggleFog() {
    onToggleFog?.(!fogEnabled);
  }

  function handleToggleTextures() {
    onToggleTextures?.(!texturesEnabled);
  }

  function toggleSection(section: string) {
    activeSection = activeSection === section ? null : section;
  }

  function formatCoord(val: number): string {
    return val.toFixed(1);
  }

  function formatDensity(density: number): string {
    return (density * 1000).toFixed(1);
  }

  const currentBiomeColor = $derived(
    BIOME_PRESETS.find((p) => p.name.toLowerCase() === biome)?.color ??
      "#64748b"
  );

  // Total vegetation count
  const totalVegetation = $derived(
    vegetationStats.trees +
      vegetationStats.rocks +
      vegetationStats.bushes +
      vegetationStats.grass
  );
</script>

<div class="debug-panel" class:collapsed={isCollapsed}>
  <button
    class="collapse-btn"
    onclick={() => (isCollapsed = !isCollapsed)}
    aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
  >
    <i
      class="fas {isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"
      aria-hidden="true"
    ></i>
  </button>

  {#if !isCollapsed}
    <!-- Performance Stats (Always Visible) -->
    <div class="perf-bar">
      <span
        class="fps"
        class:good={fps >= 55}
        class:warning={fps >= 30 && fps < 55}
        class:bad={fps < 30}
      >
        {fps} FPS
      </span>
      <span class="stat">
        <i class="fas fa-cube" aria-hidden="true"></i>
        {chunkStats.loaded}
      </span>
      <span class="stat">
        <i class="fas fa-tree" aria-hidden="true"></i>
        {totalVegetation}
      </span>
    </div>

    <!-- Position Section -->
    <div class="section">
      <button class="section-header" onclick={() => toggleSection("position")}>
        <i class="fas fa-location-dot" aria-hidden="true"></i>
        <span>Position</span>
        <i
          class="fas fa-chevron-{activeSection === 'position'
            ? 'up'
            : 'down'} chevron"
          aria-hidden="true"
        ></i>
      </button>
      <div class="coords-grid">
        <div class="coord-item">
          <span class="coord-label">X</span>
          <span class="coord-value">{formatCoord(position.x)}</span>
        </div>
        <div class="coord-item">
          <span class="coord-label">Y</span>
          <span class="coord-value">{formatCoord(position.y)}</span>
        </div>
        <div class="coord-item">
          <span class="coord-label">Z</span>
          <span class="coord-value">{formatCoord(position.z)}</span>
        </div>
      </div>
      {#if activeSection === "position" && seed}
        <div class="detail-row">
          <span class="detail-label">Seed</span>
          <span class="detail-value mono">{seed}</span>
        </div>
      {/if}
    </div>

    <!-- Biome Section -->
    <div class="section">
      <div class="section-header">
        <i class="fas fa-globe" aria-hidden="true"></i>
        <span>Current Biome</span>
      </div>
      <div class="biome-pill" style="--biome-color: {currentBiomeColor}">
        <span class="biome-dot"></span>
        <span class="biome-name">{biome || "Unknown"}</span>
      </div>
    </div>

    <!-- Teleport Section -->
    <div class="section">
      <div class="section-header">
        <i class="fas fa-bolt" aria-hidden="true"></i>
        <span>Quick Travel</span>
      </div>
      <div class="teleport-grid">
        {#each BIOME_PRESETS as preset}
          <button
            class="teleport-chip"
            class:active={biome === preset.name.toLowerCase()}
            style="--chip-color: {preset.color}"
            onclick={() => handleTeleport(preset)}
            aria-label="Teleport to {preset.name}"
          >
            <i class="fas {preset.icon}" aria-hidden="true"></i>
            <span>{preset.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Environment Toggles with State Readouts -->
    <div class="section">
      <button
        class="section-header"
        onclick={() => toggleSection("environment")}
      >
        <i class="fas fa-sliders" aria-hidden="true"></i>
        <span>Environment</span>
        <i
          class="fas fa-chevron-{activeSection === 'environment'
            ? 'up'
            : 'down'} chevron"
          aria-hidden="true"
        ></i>
      </button>

      <div class="toggle-chips">
        <ChipToggle
          label="Water"
          icon="fa-droplet"
          active={waterVisible}
          color="cyan"
          size="sm"
          onclick={handleToggleWater}
        />
        <ChipToggle
          label="Fog"
          icon="fa-cloud"
          active={fogEnabled}
          color="gray"
          size="sm"
          onclick={handleToggleFog}
        />
        <ChipToggle
          label="Textures"
          icon="fa-image"
          active={texturesEnabled}
          color="lime"
          size="sm"
          onclick={handleToggleTextures}
        />
      </div>

      {#if activeSection === "environment"}
        <div class="state-details">
          <!-- Water State -->
          {#if waterState}
            <div class="state-group">
              <div class="state-title">
                <i
                  class="fas fa-droplet"
                  style="color: #0ea5e9"
                  aria-hidden="true"
                ></i>
                Water
              </div>
              <div class="detail-row">
                <span class="detail-label">Level</span>
                <span class="detail-value">{waterState.waterLevel}m</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Opacity</span>
                <span class="detail-value"
                  >{(waterState.opacity * 100).toFixed(0)}%</span
                >
              </div>
              <div class="detail-row">
                <span class="detail-label">Color</span>
                <span
                  class="color-swatch"
                  style="background: {waterState.color}"
                ></span>
              </div>
            </div>
          {/if}

          <!-- Fog State -->
          {#if atmosphereState}
            <div class="state-group">
              <div class="state-title">
                <i
                  class="fas fa-cloud"
                  style="color: #94a3b8"
                  aria-hidden="true"
                ></i>
                Fog
              </div>
              <div class="detail-row">
                <span class="detail-label">Biome</span>
                <span class="detail-value">{atmosphereState.currentBiome}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Density</span>
                <span class="detail-value"
                  >{formatDensity(atmosphereState.fogDensity)}</span
                >
              </div>
              <div class="detail-row">
                <span class="detail-label">Color</span>
                <span
                  class="color-swatch"
                  style="background: {atmosphereState.fogColor}"
                ></span>
              </div>
            </div>
          {/if}

          <!-- Texture State -->
          <div class="state-group">
            <div class="state-title">
              <i class="fas fa-image" style="color: #84cc16" aria-hidden="true"
              ></i>
              Textures
            </div>
            <div class="detail-row">
              <span class="detail-label">Mode</span>
              <span class="detail-value"
                >{texturesEnabled ? "PBR Textures" : "Vertex Colors"}</span
              >
            </div>
            <div class="detail-row">
              <span class="detail-label">Loaded</span>
              <span
                class="detail-value status"
                class:ok={texturesLoaded}
                class:pending={!texturesLoaded}
              >
                {texturesLoaded ? "Yes" : "Loading..."}
              </span>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- World Stats Section -->
    <div class="section">
      <button class="section-header" onclick={() => toggleSection("stats")}>
        <i class="fas fa-chart-bar" aria-hidden="true"></i>
        <span>World Stats</span>
        <i
          class="fas fa-chevron-{activeSection === 'stats'
            ? 'up'
            : 'down'} chevron"
          aria-hidden="true"
        ></i>
      </button>

      {#if activeSection === "stats"}
        <div class="state-details">
          <!-- Chunks -->
          <div class="state-group">
            <div class="state-title">
              <i class="fas fa-cube" style="color: #60a5fa" aria-hidden="true"
              ></i>
              Chunks
            </div>
            <div class="detail-row">
              <span class="detail-label">Loaded</span>
              <span class="detail-value">{chunkStats.loaded}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Loading</span>
              <span
                class="detail-value status"
                class:ok={chunkStats.loading === 0}
                class:pending={chunkStats.loading > 0}
              >
                {chunkStats.loading}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Pending</span>
              <span class="detail-value">{chunkStats.pending}</span>
            </div>
          </div>

          <!-- Vegetation -->
          <div class="state-group">
            <div class="state-title">
              <i
                class="fas fa-tree"
                style="color: var(--semantic-success, #22c55e)"
                aria-hidden="true"
              ></i>
              Vegetation
            </div>
            <div class="detail-row">
              <span class="detail-label">Trees</span>
              <span class="detail-value"
                >{vegetationStats.trees.toLocaleString()}</span
              >
            </div>
            <div class="detail-row">
              <span class="detail-label">Rocks</span>
              <span class="detail-value"
                >{vegetationStats.rocks.toLocaleString()}</span
              >
            </div>
            <div class="detail-row">
              <span class="detail-label">Bushes</span>
              <span class="detail-value"
                >{vegetationStats.bushes.toLocaleString()}</span
              >
            </div>
            <div class="detail-row">
              <span class="detail-label">Grass</span>
              <span class="detail-value"
                >{vegetationStats.grass.toLocaleString()}</span
              >
            </div>
          </div>

          <!-- Physics -->
          <div class="state-group">
            <div class="state-title">
              <i
                class="fas fa-shapes"
                style="color: var(--semantic-warning, #f59e0b)"
                aria-hidden="true"
              ></i>
              Physics
            </div>
            <div class="detail-row">
              <span class="detail-label">Colliders</span>
              <span class="detail-value">{colliderCount}</span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .debug-panel {
    position: absolute;
    top: 16px;
    right: 16px;
    background: rgba(15, 15, 25, 0.95);
    padding: 12px;
    border-radius: 16px;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 13px;
    color: white;
    min-width: 220px;
    max-width: 280px;
    z-index: 100;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow:
      0 4px 24px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
    backdrop-filter: blur(12px);
  }

  .debug-panel.collapsed {
    min-width: auto;
    padding: 10px;
  }

  .collapse-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 26px;
    height: 26px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      outline-color var(--duration-fast) var(--ease-standard);
  }

  .collapse-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border-color: rgba(255, 255, 255, 0.2);
  }

  /* Performance Bar */
  .perf-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    margin-bottom: 12px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 500;
  }

  .fps {
    font-family: "SF Mono", "JetBrains Mono", monospace;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
  }

  .fps.good {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .fps.warning {
    background: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
  }

  .fps.bad {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 4px;
    color: rgba(255, 255, 255, 0.6);
  }

  .stat i {
    font-size: 10px;
    opacity: 0.7;
  }

  /* Sections */
  .section {
    margin-bottom: 12px;
  }

  .section:last-child {
    margin-bottom: 0;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    background: none;
    border: none;
    cursor: pointer;
    width: 100%;
    padding: 0;
    font-family: inherit;
  }

  .section-header:hover {
    color: rgba(255, 255, 255, 0.7);
  }

  .section-header i {
    font-size: 10px;
    opacity: 0.7;
  }

  .section-header .chevron {
    margin-left: auto;
    font-size: 9px;
  }

  /* Position Coordinates */
  .coords-grid {
    display: flex;
    gap: 6px;
  }

  .coord-item {
    flex: 1;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 6px;
    padding: 6px;
    text-align: center;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  .coord-label {
    display: block;
    font-size: 9px;
    color: rgba(255, 255, 255, 0.4);
    font-weight: 600;
    margin-bottom: 2px;
  }

  .coord-value {
    display: block;
    font-family: "SF Mono", "JetBrains Mono", monospace;
    font-size: 12px;
    color: #60a5fa;
    font-weight: 500;
  }

  /* Biome Badge */
  .biome-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .biome-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--biome-color, #64748b);
    box-shadow: 0 0 6px var(--biome-color, #64748b);
  }

  .biome-name {
    font-weight: 600;
    text-transform: capitalize;
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
  }

  /* Teleport Chips */
  .teleport-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .teleport-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      outline-color var(--duration-fast) var(--ease-standard);
    font-family: inherit;
  }

  .teleport-chip i {
    font-size: 10px;
    color: var(--chip-color, #64748b);
  }

  .teleport-chip:hover {
    background: color-mix(in srgb, var(--chip-color, #64748b) 20%, transparent);
    border-color: var(--chip-color, #64748b);
    color: white;
  }

  .teleport-chip.active {
    background: color-mix(in srgb, var(--chip-color, #64748b) 25%, transparent);
    border-color: var(--chip-color, #64748b);
    color: white;
  }

  /* Toggle Chips */
  .toggle-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  /* State Details */
  .state-details {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .state-group {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 8px;
  }

  .state-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .state-title i {
    font-size: 10px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 0;
    font-size: 11px;
  }

  .detail-label {
    color: rgba(255, 255, 255, 0.5);
  }

  .detail-value {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
  }

  .detail-value.mono {
    font-family: "SF Mono", "JetBrains Mono", monospace;
    font-size: 10px;
  }

  .detail-value.status.ok {
    color: #22c55e;
  }

  .detail-value.status.pending {
    color: #f59e0b;
  }

  .color-swatch {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  /* Focus states */
  .collapse-btn:focus-visible,
  .teleport-chip:focus-visible,
  .section-header:focus-visible {
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .collapse-btn,
    .teleport-chip,
    .biome-dot,
    .section-header {
      transition: none;
    }
  }
</style>
