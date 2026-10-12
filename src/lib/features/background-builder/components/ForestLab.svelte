<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type {
    ForestLayers,
    TreeTypeVisibility,
    EcologicalPattern,
    QualityLevel,
    TreeCategory,
    RenderedTree,
  } from "@austencloud/backgrounds";
  import {
    getForestSettings,
    updateForestSettings,
  } from "../state/background-builder-state.svelte";
  import { getPreviewAnimationController } from "../get-preview-animation-controller";
  import type { PreviewStats } from "../services/types";

  // Child components
  import PreviewControls from "./PreviewControls.svelte";
  import TreeImageGallery from "./TreeImageGallery.svelte";

  // Get services from getter
  const previewController = getPreviewAnimationController();

  type LabMode = "preview" | "treeLab";
  let mode: LabMode = $state("preview");

  // Tree Lab state - image gallery with delete capability
  let selectedGalleryCategory = $state<TreeCategory | "all">("all");
  let sceneTrees = $state<RenderedTree[]>([]);

  // Preview state
  let canvas: HTMLCanvasElement | null = $state(null);
  let isLoading = $state(true);
  const savedSettings = getForestSettings();
  let layers = $state<ForestLayers>({ ...savedSettings.layers });
  let treeTypes = $state<TreeTypeVisibility>({ ...savedSettings.treeTypes });
  let quality: QualityLevel = $state(savedSettings.quality);
  let density = $state(0.5);
  let style = $state(0.5);
  let stats = $state<PreviewStats>({
    fireflies: 0,
    stars: 0,
    ambientParticles: 0,
    hasShootingStar: false,
  });

  // Ecological pattern state
  let patterns = $state<EcologicalPattern[]>([]);
  let currentPatternId = $state("random");

  // Stats polling
  let statsInterval: ReturnType<typeof setInterval> | null = null;

  function initializePreview() {
    if (!canvas) return;
    previewController.initialize(canvas, quality, layers);
    previewController.start();
    stats = previewController.getStats();
    patterns = previewController.getAvailablePatterns();
    currentPatternId = previewController.getEcologicalPatternId();
    startStatsPolling();
    isLoading = false;
  }

  function startStatsPolling() {
    statsInterval = setInterval(() => {
      if (previewController.isInitialized()) {
        stats = previewController.getStats();
      }
    }, 1000);
  }

  function stopStatsPolling() {
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
  }

  function handleQualityChange(q: QualityLevel) {
    quality = q;
    updateForestSettings({ quality: q });
    previewController.setQuality(q);
    stats = previewController.getStats();
  }

  function handleLayerToggle(layer: keyof ForestLayers) {
    layers[layer] = !layers[layer];
    updateForestSettings({ layers: { ...layers } });
    previewController.setLayerVisibility(layers);
  }

  function handleTreeTypeToggle(type: keyof TreeTypeVisibility) {
    treeTypes[type] = !treeTypes[type];
    updateForestSettings({ treeTypes: { ...treeTypes } });
    previewController.setTreeVisibility(treeTypes);
  }

  function handleDensityChange(value: number) {
    density = value;
    previewController.applyPlacement({ density, style });
  }

  function handleStyleChange(value: number) {
    style = value;
    previewController.applyPlacement({ density, style });
  }

  function handleResetPlacement() {
    density = 0.5;
    style = 0.5;
    previewController.resetPlacement();
  }

  function handleRegenerate() {
    previewController.regenerate();
    stats = previewController.getStats();
  }

  function handlePatternChange(patternId: string) {
    currentPatternId = patternId;
    previewController.setEcologicalPattern(patternId);
  }

  function handleRandomPattern() {
    currentPatternId = previewController.setRandomEcologicalPattern();
  }

  function handleMouseMove(event: MouseEvent) {
    previewController.updateMousePosition(event.clientX, event.clientY);
  }

  function handleMouseLeave() {
    previewController.resetMousePosition();
  }

  function handleResize() {
    previewController.handleResize();
  }

  function setMode(newMode: LabMode) {
    mode = newMode;
    if (newMode === "treeLab") {
      refreshSceneTrees();
    }
  }

  function refreshSceneTrees() {
    sceneTrees = previewController.getRenderedTrees();
  }

  function handleGalleryCategoryChange(category: TreeCategory | "all") {
    selectedGalleryCategory = category;
  }

  function handleDeleteTreesByImage(imageFilename: string) {
    const removed = previewController.removeTreesByImage(imageFilename);
    if (removed > 0) {
      refreshSceneTrees();
    }
  }

  onMount(() => {
    initializePreview();
    window.addEventListener("resize", handleResize);
  });

  onDestroy(() => {
    stopStatsPolling();
    previewController.cleanup();
    window.removeEventListener("resize", handleResize);
  });
</script>

<div class="forest-lab">
  <div class="controls themed-scrollbar-accent">
    <div class="header">
      <h2>Forest Lab</h2>
      <span class="badge">Classic</span>
    </div>

    <!-- Mode Toggle -->
    <div class="mode-toggle">
      <button
        class="mode-btn"
        class:active={mode === "preview"}
        onclick={() => setMode("preview")}
      >
        <i class="fas fa-eye"></i>
        Preview
      </button>
      <button
        class="mode-btn"
        class:active={mode === "treeLab"}
        onclick={() => setMode("treeLab")}
      >
        <i class="fas fa-images"></i>
        Gallery
      </button>
    </div>

    {#if mode === "preview"}
      <PreviewControls
        {quality}
        {layers}
        {treeTypes}
        {density}
        {style}
        {stats}
        {patterns}
        {currentPatternId}
        onQualityChange={handleQualityChange}
        onLayerToggle={handleLayerToggle}
        onTreeTypeToggle={handleTreeTypeToggle}
        onDensityChange={handleDensityChange}
        onStyleChange={handleStyleChange}
        onResetPlacement={handleResetPlacement}
        onRegenerate={handleRegenerate}
        onPatternChange={handlePatternChange}
        onRandomPattern={handleRandomPattern}
      />
    {:else}
      <p class="gallery-hint">
        Click the trash icon on any tree to remove it from the scene.
      </p>
    {/if}
  </div>

  <!-- Content Area -->
  {#if mode === "preview"}
    <div
      class="preview"
      onmousemove={handleMouseMove}
      onmouseleave={handleMouseLeave}
      role="application"
      aria-label="Forest preview"
    >
      {#if isLoading}
        <div class="loading-overlay">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Loading forest...</span>
        </div>
      {/if}
      <canvas bind:this={canvas}></canvas>
    </div>
  {:else}
    <TreeImageGallery
      selectedCategory={selectedGalleryCategory}
      onCategoryChange={handleGalleryCategoryChange}
      onDeleteTree={handleDeleteTreesByImage}
      {sceneTrees}
    />
  {/if}
</div>

<style>
  .forest-lab {
    display: grid;
    grid-template-columns: 320px 1fr;
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
      rgba(132, 204, 22, 0.3),
      rgba(163, 230, 53, 0.3)
    );
    border: 1px solid rgba(163, 230, 53, 0.4);
    border-radius: 20px;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    color: #a3e635;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .mode-toggle {
    display: flex;
    gap: 8px;
    padding: 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 10px;
  }

  .mode-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 16px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: #6b7280;
    font-size: 0.8rem;
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

  .mode-btn:hover {
    color: #9ca3af;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
  }

  .mode-btn.active {
    background: linear-gradient(
      135deg,
      rgba(132, 204, 22, 0.2),
      rgba(163, 230, 53, 0.2)
    );
    color: #a3e635;
  }

  .preview {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    background: linear-gradient(
      to bottom,
      #0a1628 0%,
      #162033 50%,
      #1a2a3d 100%
    );
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .preview canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(10, 22, 40, 0.9);
    color: #a3e635;
    font-size: var(--font-size-min, 0.875rem);
    z-index: 10;
  }

  .loading-overlay i {
    font-size: 1.5rem;
  }

  .gallery-hint {
    margin: 0;
    padding: 12px;
    background: rgba(132, 204, 22, 0.1);
    border: 1px solid rgba(132, 204, 22, 0.2);
    border-radius: 8px;
    font-size: 0.8rem;
    color: #a3e635;
    line-height: 1.5;
  }

  @media (max-width: 900px) {
    .forest-lab {
      grid-template-columns: 1fr;
      grid-template-rows: auto 400px;
    }
  }

  .mode-btn:focus-visible {
    outline: 2px solid #a3e635;
    outline-offset: 2px;
  }

  /* Accessibility: Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .mode-btn {
      transition: none;
    }
  }

  /* Accessibility: High contrast */
  @media (prefers-contrast: high) {
    .controls,
    .preview {
      border: 2px solid rgba(255, 255, 255, 0.3);
    }

    .mode-toggle {
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
  }
</style>
