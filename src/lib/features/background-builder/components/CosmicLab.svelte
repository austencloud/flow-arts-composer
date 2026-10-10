<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { type QualityLevel, type UFOMood, type WobbleType } from "@austencloud/backgrounds";
  import type { CosmicDensityPreset, CosmicLabMode } from "#lib/shared/background-builder/domain/lab-settings-types.js";
  import type { UFOStatusSnapshot } from "../services/types";
  import { getCosmicLabController } from "../get-cosmic-lab-controller";
  import { getUFOStatusPoller } from "../get-ufo-status-poller";
  import {
    getCosmicSettings,
    updateCosmicSettings,
  } from "../state/background-builder-state.svelte";
  import CosmicDefaultControls from "./CosmicDefaultControls.svelte";
  import UFOLabControls from "./UFOLabControls.svelte";

  // Services from container
  const controller = getCosmicLabController();
  const statusPoller = getUFOStatusPoller();

  // Load persisted settings
  const savedSettings = getCosmicSettings();

  // Canvas reference
  let canvas: HTMLCanvasElement | null = $state(null);

  // Loading state
  let isLoading = $state(true);

  // Mode and settings state
  let mode: CosmicLabMode = $state(savedSettings.mode ?? "default");
  let quality: QualityLevel = $state(savedSettings.quality);
  let layers = $state({ ...savedSettings.layers });
  let densityPreset: CosmicDensityPreset = $state(savedSettings.densityPreset);

  // UFO status (polled from system)
  let ufoStatus = $state<UFOStatusSnapshot>({
    active: false,
    mood: null,
    tiredness: null,
    state: null,
    position: null,
    heading: null,
    scannedStars: 0,
  });

  // Entrance/exit types
  type EntranceType = "fade" | "warp" | "zoom" | "descend";
  type ExitType = "fade" | "warp" | "zoom" | "shootUp";

  function setMode(newMode: CosmicLabMode) {
    mode = newMode;
    updateCosmicSettings({ mode: newMode });

    // Start/stop UFO status polling based on mode
    if (newMode === "ufoLab" && controller.isInitialized()) {
      const system = controller.getSystem();
      if (system) {
        statusPoller.start(system, (snapshot) => {
          ufoStatus = snapshot;
        });
      }
    } else {
      statusPoller.stop();
    }
  }

  function handleQualityChange(q: QualityLevel) {
    quality = q;
    updateCosmicSettings({ quality: q });
    controller.regenerate(quality, layers);
  }

  function handleDensityChange(preset: CosmicDensityPreset) {
    densityPreset = preset;
    updateCosmicSettings({ densityPreset: preset });
    controller.regenerate(quality, layers);
  }

  function handleLayerToggle(layer: keyof typeof layers) {
    layers = { ...layers, [layer]: !layers[layer] };
    updateCosmicSettings({ layers });
    controller.setLayerVisibility(layers);
  }

  function handleRegenerate() {
    controller.regenerate(quality, layers);
  }

  function triggerMeteor() {
    controller.getSystem()?.triggerMeteor();
  }

  function triggerComet() {
    controller.getSystem()?.triggerComet();
  }

  const UFO_ACTIVE_KEY = "nightsky-ufo-active";

  function spawnUFO() {
    const system = controller.getSystem();
    if (!system) return;

    // Auto-enable UFO layer
    if (!layers.ufo) {
      layers = { ...layers, ufo: true };
      updateCosmicSettings({ layers });
    }

    const entrances: EntranceType[] = ["fade", "warp", "zoom", "descend"];
    const randomEntrance = entrances[Math.floor(Math.random() * entrances.length)]!;
    system.triggerUFOWithEntrance(randomEntrance);

    // Persist UFO active state for HMR
    sessionStorage.setItem(UFO_ACTIVE_KEY, "true");
  }

  function handleEntranceType(type: EntranceType) {
    const system = controller.getSystem();
    if (!system) return;

    if (!layers.ufo) {
      layers = { ...layers, ufo: true };
      updateCosmicSettings({ layers });
    }
    system.triggerUFOWithEntrance(type);
  }

  function handleExitType(type: ExitType) {
    const system = controller.getSystem();
    if (system?.isUFOActive()) {
      system.commandUFOExitWith(type);
      // Clear HMR persistence - user explicitly exited
      sessionStorage.removeItem(UFO_ACTIVE_KEY);
    }
  }

  function handleSetMood(mood: UFOMood) {
    controller.getSystem()?.setUFOMood(mood);
  }

  function handleResetTiredness() {
    controller.getSystem()?.resetUFOTiredness();
  }

  function handleClearScannedStars() {
    controller.getSystem()?.clearUFOScannedStars();
  }

  function handleTriggerWobble(type: WobbleType) {
    controller.getSystem()?.triggerUFOWobble(type);
  }

  function handleWander() {
    const system = controller.getSystem();
    if (system?.isUFOActive()) {
      system.commandUFOWander();
    }
  }

  function handleDrift() {
    const system = controller.getSystem();
    if (system?.isUFOActive()) {
      system.commandUFODrift();
    }
  }

  function handlePause() {
    const system = controller.getSystem();
    if (system?.isUFOActive()) {
      system.commandUFOPause();
    }
  }

  function handleScanStar() {
    const system = controller.getSystem();
    if (system?.isUFOActive()) {
      const found = system.commandUFOScanStar();
      if (!found) {
        system.commandUFOScanGround();
      }
    }
  }

  function handleScanGround() {
    const system = controller.getSystem();
    if (system?.isUFOActive()) {
      system.commandUFOScanGround();
    }
  }

  // Track if UFO has been active this session (to avoid clearing on initial load)
  let ufoHasBeenActive = $state(false);

  // Clear HMR persistence when UFO exits naturally (tired, panicked, etc.)
  $effect(() => {
    if (ufoStatus.active) {
      ufoHasBeenActive = true;
    } else if (ufoHasBeenActive && sessionStorage.getItem(UFO_ACTIVE_KEY) === "true") {
      // Only clear if UFO was active and then became inactive
      sessionStorage.removeItem(UFO_ACTIVE_KEY);
    }
  });

  function handleCanvasClick(event: MouseEvent) {
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    controller.handleCanvasClick(clickX, clickY);
  }

  function handleResize() {
    controller.handleResize();
  }

  onMount(() => {
    if (canvas) {
      controller.initialize(canvas, quality, layers);
      controller.start();
      isLoading = false;

      // Auto-spawn UFO if it was active before HMR
      const wasUFOActive = sessionStorage.getItem(UFO_ACTIVE_KEY) === "true";
      if (wasUFOActive && mode === "ufoLab") {
        // Short delay to ensure system is ready
        requestAnimationFrame(() => {
          spawnUFO();
        });
      }

      // Start UFO polling if in UFO Lab mode
      if (mode === "ufoLab") {
        const system = controller.getSystem();
        if (system) {
          statusPoller.start(system, (snapshot) => {
            ufoStatus = snapshot;
          });
        }
      }
    }
    window.addEventListener("resize", handleResize);
  });

  onDestroy(() => {
    statusPoller.stop();
    controller.cleanup();
    window.removeEventListener("resize", handleResize);
  });
</script>

<div class="cosmic-lab">
  <div class="controls themed-scrollbar-accent">
    <div class="header">
      <h2>Cosmic Lab</h2>
      <span class="badge">2036 Vision</span>
    </div>

    <!-- Mode Toggle -->
    <div class="mode-toggle">
      <button class="mode-btn" class:active={mode === "default"} onclick={() => setMode("default")}>
        <i class="fas fa-moon"></i>
        Default
      </button>
      <button class="mode-btn ufo-mode" class:active={mode === "ufoLab"} onclick={() => setMode("ufoLab")}>
        <i class="fas fa-satellite"></i>
        UFO Lab
      </button>
    </div>

    {#if mode === "default"}
      <CosmicDefaultControls
        {quality}
        {layers}
        {densityPreset}
        onQualityChange={handleQualityChange}
        onLayerToggle={handleLayerToggle}
        onDensityChange={handleDensityChange}
        onTriggerMeteor={triggerMeteor}
        onTriggerComet={triggerComet}
        onRegenerate={handleRegenerate}
      />
    {:else if mode === "ufoLab"}
      <UFOLabControls
        status={ufoStatus}
        onSpawn={spawnUFO}
        onSetMood={handleSetMood}
        onResetTiredness={handleResetTiredness}
        onClearScannedStars={handleClearScannedStars}
        onTriggerWobble={handleTriggerWobble}
        onWander={handleWander}
        onDrift={handleDrift}
        onPause={handlePause}
        onScanStar={handleScanStar}
        onScanGround={handleScanGround}
        onEntranceType={handleEntranceType}
        onExitType={handleExitType}
        onTriggerMeteor={triggerMeteor}
        onTriggerComet={triggerComet}
      />
    {/if}
  </div>

  <div class="preview">
    {#if isLoading}
      <div class="loading-overlay">
        <i class="fas fa-spinner fa-spin"></i>
        <span>Loading cosmic scene...</span>
      </div>
    {/if}
    <canvas bind:this={canvas} onclick={handleCanvasClick}></canvas>
  </div>
</div>

<style>
  .cosmic-lab {
    display: grid;
    grid-template-columns: 360px 1fr;
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
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(168, 85, 247, 0.3));
    border: 1px solid rgba(139, 92, 246, 0.4);
    border-radius: 20px;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    color: #a78bfa;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .mode-toggle {
    display: flex;
    gap: 8px;
    padding: 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .mode-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .mode-btn:hover {
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.05);
  }

  .mode-btn.active {
    color: #ffffff;
    background: rgba(99, 102, 241, 0.3);
  }

  .mode-btn.ufo-mode.active {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(168, 85, 247, 0.3));
  }

  .mode-btn i {
    font-size: 0.85rem;
  }

  .preview {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
    background: #050510;
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
    background: rgba(5, 5, 16, 0.9);
    color: #a78bfa;
    font-size: var(--font-size-min, 0.875rem);
    z-index: 10;
  }

  .loading-overlay i {
    font-size: 1.5rem;
  }

  @media (max-width: 800px) {
    .cosmic-lab {
      grid-template-columns: 1fr;
      grid-template-rows: auto 400px;
    }
  }

  .mode-btn:focus-visible {
    outline: 2px solid #a78bfa;
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
