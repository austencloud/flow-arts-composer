<script lang="ts">
  import type {
    ForestLayers,
    TreeTypeVisibility,
    EcologicalPattern,
    QualityLevel,
  } from "@austencloud/backgrounds";
  import { ChipToggle, ChipGroup } from "@austencloud/chip-toggle";

  interface PreviewStats {
    fireflies: number;
    stars: number;
    ambientParticles: number;
    hasShootingStar: boolean;
  }

  interface Props {
    quality: QualityLevel;
    layers: ForestLayers;
    treeTypes: TreeTypeVisibility;
    density: number;
    style: number;
    stats: PreviewStats;
    patterns: EcologicalPattern[];
    currentPatternId: string;
    onQualityChange: (quality: QualityLevel) => void;
    onLayerToggle: (layer: keyof ForestLayers) => void;
    onTreeTypeToggle: (type: keyof TreeTypeVisibility) => void;
    onDensityChange: (value: number) => void;
    onStyleChange: (value: number) => void;
    onResetPlacement: () => void;
    onRegenerate: () => void;
    onPatternChange: (patternId: string) => void;
    onRandomPattern: () => void;
  }

  let {
    quality,
    layers,
    treeTypes,
    density,
    style,
    stats,
    patterns,
    currentPatternId,
    onQualityChange,
    onLayerToggle,
    onTreeTypeToggle,
    onDensityChange,
    onStyleChange,
    onResetPlacement,
    onRegenerate,
    onPatternChange,
    onRandomPattern,
  }: Props = $props();

  // Get current pattern details for description
  let currentPattern = $derived(
    patterns.find((p) => p.id === currentPatternId)
  );
</script>

<!-- Quality Chips -->
<ChipGroup>
  <ChipToggle
    label="High"
    active={quality === "high"}
    color="lime"
    onclick={() => onQualityChange("high")}
  />
  <ChipToggle
    label="Medium"
    active={quality === "medium"}
    color="lime"
    onclick={() => onQualityChange("medium")}
  />
  <ChipToggle
    label="Low"
    active={quality === "low"}
    color="lime"
    onclick={() => onQualityChange("low")}
  />
</ChipGroup>

<!-- Layer Chips -->
<ChipGroup>
  <ChipToggle
    label="Gradient"
    icon="fill-drip"
    active={layers.gradient}
    color="lime"
    onclick={() => onLayerToggle("gradient")}
  />
  <ChipToggle
    label="Stars"
    icon="star"
    active={layers.stars}
    color="lime"
    onclick={() => onLayerToggle("stars")}
  />
  <ChipToggle
    label="Moon"
    icon="moon"
    active={layers.moon}
    color="lime"
    onclick={() => onLayerToggle("moon")}
  />
  <ChipToggle
    label="Shooting Stars"
    icon="meteor"
    active={layers.shootingStars}
    color="lime"
    onclick={() => onLayerToggle("shootingStars")}
  />
  <ChipToggle
    label="Trees"
    icon="tree"
    active={layers.trees}
    color="lime"
    onclick={() => onLayerToggle("trees")}
  />
  <ChipToggle
    label="Grass"
    icon="seedling"
    active={layers.grass}
    color="lime"
    onclick={() => onLayerToggle("grass")}
  />
  <ChipToggle
    label="Dust Motes"
    icon="wand-magic-sparkles"
    active={layers.ambientParticles}
    color="lime"
    onclick={() => onLayerToggle("ambientParticles")}
  />
  <ChipToggle
    label="Campfire"
    icon="fire"
    active={layers.campfire}
    color="red"
    onclick={() => onLayerToggle("campfire")}
  />
  <ChipToggle
    label="Fireflies"
    icon="lightbulb"
    active={layers.fireflies}
    color="lime"
    onclick={() => onLayerToggle("fireflies")}
  />
</ChipGroup>

<!-- Tree Type Chips -->
<ChipGroup>
  <ChipToggle
    label="Pine"
    active={treeTypes.pine}
    color="lime"
    onclick={() => onTreeTypeToggle("pine")}
  />
  <ChipToggle
    label="Fir"
    active={treeTypes.fir}
    color="lime"
    onclick={() => onTreeTypeToggle("fir")}
  />
  <ChipToggle
    label="Spruce"
    active={treeTypes.spruce}
    color="lime"
    onclick={() => onTreeTypeToggle("spruce")}
  />
  <ChipToggle
    label="Oak"
    active={treeTypes.oak}
    color="lime"
    onclick={() => onTreeTypeToggle("oak")}
  />
  <ChipToggle
    label="Maple"
    active={treeTypes.maple}
    color="lime"
    onclick={() => onTreeTypeToggle("maple")}
  />
  <ChipToggle
    label="Poplar"
    active={treeTypes.poplar}
    color="lime"
    onclick={() => onTreeTypeToggle("poplar")}
  />
</ChipGroup>

<!-- Ecological Pattern Selector -->
<div class="pattern-section">
  <div class="section-header">
    <span class="label">Ecological Pattern</span>
    <button
      class="random-btn"
      onclick={onRandomPattern}
      title="Pick random pattern"
    >
      <i class="fas fa-dice"></i>
    </button>
  </div>

  <select
    class="pattern-select"
    value={currentPatternId}
    onchange={(e) => onPatternChange(e.currentTarget.value)}
  >
    {#each patterns as pattern}
      <option value={pattern.id}>{pattern.name}</option>
    {/each}
  </select>

  {#if currentPattern}
    <p class="pattern-description">{currentPattern.description}</p>
  {/if}
</div>

<!-- Tree Placement Sliders -->
<div class="placement-section">
  <div class="section-header">
    <span class="label">Tree Placement</span>
    <button
      class="reset-btn"
      onclick={onResetPlacement}
      title="Reset to defaults"
    >
      <i class="fas fa-undo"></i>
    </button>
  </div>

  <div class="slider-group">
    <label class="slider-label" for="density-slider">
      <span>Density</span>
      <span class="slider-value"
        >{density < 0.33 ? "Sparse" : density > 0.66 ? "Dense" : "Medium"}</span
      >
    </label>
    <input
      id="density-slider"
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={density}
      oninput={(e) => onDensityChange(parseFloat(e.currentTarget.value))}
    />
    <div class="slider-labels"><span>Sparse</span><span>Dense</span></div>
  </div>

  <div class="slider-group">
    <label class="slider-label" for="style-slider">
      <span>Style</span>
      <span class="slider-value"
        >{style < 0.33
          ? "Natural"
          : style > 0.66
            ? "Composed"
            : "Balanced"}</span
      >
    </label>
    <input
      id="style-slider"
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={style}
      oninput={(e) => onStyleChange(parseFloat(e.currentTarget.value))}
    />
    <div class="slider-labels"><span>Natural</span><span>Composed</span></div>
  </div>
</div>

<button class="action-btn" onclick={onRegenerate}>
  <i class="fas fa-rotate"></i>
  Regenerate
</button>

<!-- Stats -->
<div class="stats-section">
  <span class="label">Scene Stats</span>
  <div class="stats-grid">
    <div class="stat">
      <span class="stat-value">{stats.fireflies}</span>
      <span class="stat-label">Fireflies</span>
    </div>
    <div class="stat">
      <span class="stat-value">{stats.stars}</span>
      <span class="stat-label">Stars</span>
    </div>
    <div class="stat">
      <span class="stat-value">{stats.ambientParticles}</span>
      <span class="stat-label">Dust Motes</span>
    </div>
    <div class="stat easter-egg-stat" class:active={stats.hasShootingStar}>
      <i class="fas fa-meteor"></i>
      <span class="stat-label"
        >{stats.hasShootingStar ? "Shooting!" : "Waiting..."}</span
      >
    </div>
  </div>
</div>

<style>
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
    background: linear-gradient(135deg, #84cc16, #65a30d);
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
    box-shadow: 0 8px 20px rgba(132, 204, 22, 0.35);
  }

  .action-btn:active {
    transform: translateY(0);
  }

  .action-btn:focus-visible {
    outline: 2px solid #a3e635;
    outline-offset: 2px;
  }

  .pattern-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.04);
  }

  .pattern-select {
    width: 100%;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #ffffff;
    font-size: 0.85rem;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard),
      width var(--duration-fast) var(--ease-standard);
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    background-size: 16px;
  }

  .pattern-select:hover {
    background-color: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .pattern-select:focus {
    outline: none;
    border-color: rgba(132, 204, 22, 0.5);
  }

  .pattern-select option {
    background: #1a1a2e;
    color: #ffffff;
    padding: 8px;
  }

  .pattern-description {
    margin: 0;
    font-size: 0.75rem;
    color: #6b7280;
    line-height: 1.4;
    font-style: italic;
  }

  .random-btn {
    padding: 6px 10px;
    background: linear-gradient(
      135deg,
      rgba(132, 204, 22, 0.2),
      rgba(163, 230, 53, 0.2)
    );
    border: 1px solid rgba(163, 230, 53, 0.3);
    border-radius: 6px;
    color: #a3e635;
    font-size: 0.75rem;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  .random-btn:hover {
    background: linear-gradient(
      135deg,
      rgba(132, 204, 22, 0.3),
      rgba(163, 230, 53, 0.3)
    );
    border-color: rgba(163, 230, 53, 0.5);
    transform: rotate(10deg);
  }

  .placement-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.04);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .reset-btn {
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    color: #9ca3af;
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  .reset-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  .slider-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .slider-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
    color: #d1d5db;
  }

  .slider-value {
    font-family: monospace;
    font-size: 0.75rem;
    color: #a3e635;
    min-width: 36px;
    text-align: right;
  }

  .slider-labels {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-size-compact, 12px);
    color: #9ca3af;
    margin-top: 2px;
  }

  .placement-section input[type="range"] {
    width: 100%;
    height: 6px;
    appearance: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }

  .placement-section input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    background: linear-gradient(135deg, #84cc16, #65a30d);
    border-radius: 50%;
    cursor: pointer;
    transition: transform var(--duration-fast) var(--ease-standard);
  }

  .placement-section input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }

  .placement-section input[type="range"]:focus-visible {
    outline: 2px solid rgba(132, 204, 22, 0.7);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .placement-section input[type="range"]::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: linear-gradient(135deg, #84cc16, #65a30d);
    border: none;
    border-radius: 50%;
    cursor: pointer;
  }

  .stats-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
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
    background: rgba(255, 255, 255, 0.03);
    border-radius: 10px;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: #bef264;
  }

  .stat-label {
    font-size: var(--font-size-compact, 12px);
    color: #6b7280;
    text-transform: uppercase;
  }

  .easter-egg-stat {
    flex-direction: row;
    gap: 8px;
    color: #6b7280;
  }

  .easter-egg-stat i {
    font-size: 1rem;
    opacity: 0.5;
    transition:
      background var(--duration-emphasis) var(--ease-standard),
      border-color var(--duration-emphasis) var(--ease-standard),
      color var(--duration-emphasis) var(--ease-standard),
      opacity var(--duration-emphasis) var(--ease-standard),
      transform var(--duration-emphasis) var(--ease-standard),
      box-shadow var(--duration-emphasis) var(--ease-standard);
  }

  .easter-egg-stat.active {
    background: rgba(250, 204, 21, 0.1);
  }
  .easter-egg-stat.active i {
    color: #facc15;
    opacity: 1;
  }
  .easter-egg-stat.active .stat-label {
    color: #facc15;
  }

  @media (prefers-reduced-motion: reduce) {
    .action-btn,
    .pattern-select,
    .random-btn,
    .reset-btn,
    .placement-section input[type="range"]::-webkit-slider-thumb,
    .easter-egg-stat i {
      transition: none;
    }

    .random-btn:hover,
    .placement-section input[type="range"]::-webkit-slider-thumb:hover {
      transform: none;
    }
  }
</style>
