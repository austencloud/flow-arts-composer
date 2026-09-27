<!--
  SnapControls - Modern chip-based snap settings

  Features:
  - Master snap toggle (magnet icon)
  - Chip toggles for each snap type
  - Sheet for advanced settings (grid interval)
  - Responsive: bottom sheet on mobile, right sheet on desktop
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getTimelineState } from "$lib/shared/animation-engine/state/timeline-state.svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";

  // Get timeline state directly - access the singleton once and read from it reactively
  const timelineState = getTimelineState();

  // Derived state from timeline - these will automatically update when timeline state changes
  const snapEnabled = $derived(timelineState.project.snap.enabled);
  const snapToSteps = $derived(timelineState.project.snap.snapToSteps);
  const snapToClips = $derived(timelineState.project.snap.snapToClips);
  const snapToGrid = $derived(timelineState.project.snap.snapToGrid);
  const snapToPlayhead = $derived(timelineState.project.snap.snapToPlayhead);
  const gridInterval = $derived(timelineState.project.snap.gridInterval);

  // Sheet state
  let showAdvancedSheet = $state(false);

  // Responsive placement
  let sheetPlacement = $state<"bottom" | "right">("bottom");

  $effect(() => {
    sheetPlacement = window.innerWidth < 768 ? "bottom" : "right";
    const handleResize = () => {
      sheetPlacement = window.innerWidth < 768 ? "bottom" : "right";
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  // Grid interval presets
  const GRID_PRESETS = [
    { label: "¼s", value: 0.25 },
    { label: "½s", value: 0.5 },
    { label: "1s", value: 1 },
    { label: "2s", value: 2 },
    { label: "5s", value: 5 },
  ];

  // Snap type definitions - must be $derived for reactivity in {#each}
  const snapTypes = $derived([
    {
      key: "snapToSteps",
      label: "Steps",
      icon: "fa-drum",
      active: snapToSteps,
    },
    {
      key: "snapToClips",
      label: "Clips",
      icon: "fa-film",
      active: snapToClips,
    },
    {
      key: "snapToGrid",
      label: "Grid",
      icon: "fa-border-all",
      active: snapToGrid,
    },
    {
      key: "snapToPlayhead",
      label: "Playhead",
      icon: "fa-location-crosshairs",
      active: snapToPlayhead,
    },
  ]);

  function toggleMaster() {
    timelineState.updateSnapSettings({ enabled: !snapEnabled });
  }

  function toggleSnapType(key: string) {
    const currentValue =
      key === "snapToSteps"
        ? snapToSteps
        : key === "snapToClips"
          ? snapToClips
          : key === "snapToGrid"
            ? snapToGrid
            : snapToPlayhead;
    timelineState.updateSnapSettings({ [key]: !currentValue });
  }

  function setGridInterval(value: number) {
    timelineState.updateSnapSettings({ gridInterval: value });
  }
</script>

<div class="snap-controls">
  <!-- Master Toggle -->
  <button
    class="master-toggle"
    class:active={snapEnabled}
    onclick={toggleMaster}
    title="Toggle snapping (S)"
    aria-label="Toggle snapping"
    aria-pressed={snapEnabled}
  >
    <i class="fa-solid fa-magnet" aria-hidden="true"></i>
  </button>

  <!-- Snap Type Chips -->
  <div class="snap-chips" class:disabled={!snapEnabled}>
    {#each snapTypes as snapType}
      <button
        class="snap-chip"
        class:active={snapType.active}
        disabled={!snapEnabled}
        onclick={() => toggleSnapType(snapType.key)}
        title={`Snap to ${snapType.label}`}
        aria-pressed={snapType.active}
      >
        <i class="fa-solid {snapType.icon}" aria-hidden="true"></i>
        <span class="chip-label">{snapType.label}</span>
      </button>
    {/each}
  </div>

  <!-- Grid Interval Quick Access (when grid is active) -->
  {#if snapEnabled && snapToGrid}
    <div class="grid-quick">
      <span class="grid-label">Grid:</span>
      <div class="grid-chips">
        {#each GRID_PRESETS.slice(0, 3) as preset}
          <button
            class="grid-chip"
            class:active={gridInterval === preset.value}
            onclick={() => setGridInterval(preset.value)}
          >
            {preset.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- More Options Button -->
  <button
    class="more-btn"
    onclick={() => (showAdvancedSheet = true)}
    title={t("compose_ui_more_snap_options")}
    aria-label={t("compose_ui_more_snap_options")}
  >
    <i class="fa-solid fa-sliders" aria-hidden="true"></i>
  </button>
</div>

<!-- Advanced Settings Sheet -->
<Drawer
  isOpen={showAdvancedSheet}
  onclose={() => (showAdvancedSheet = false)}
  placement={sheetPlacement}
  class="snap-settings-sheet"
  labelledBy="snap-settings-title"
>
  <div class="sheet-content">
    <div class="sheet-header">
      <h2 id="snap-settings-title">Snap Settings</h2>
      <button
        class="close-btn"
        onclick={() => (showAdvancedSheet = false)}
        aria-label={t("action_close")}
      >
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Master Toggle Section -->
    <div class="setting-section">
      <button
        class="master-row"
        class:active={snapEnabled}
        onclick={toggleMaster}
      >
        <div class="setting-icon">
          <i class="fa-solid fa-magnet" aria-hidden="true"></i>
        </div>
        <div class="setting-info">
          <span class="setting-name">Snapping</span>
          <span class="setting-desc">Snap clips to markers as you drag</span>
        </div>
        <div class="toggle-indicator" class:on={snapEnabled}>
          {snapEnabled ? "ON" : "OFF"}
        </div>
      </button>
    </div>

    <!-- Snap Types Section -->
    <div class="setting-section">
      <h3 class="section-title">Snap To</h3>
      <div class="snap-options-grid">
        {#each snapTypes as snapType}
          <button
            class="snap-option-card"
            class:active={snapType.active}
            class:disabled={!snapEnabled}
            disabled={!snapEnabled}
            onclick={() => toggleSnapType(snapType.key)}
          >
            <i class="fa-solid {snapType.icon}" aria-hidden="true"></i>
            <span>{snapType.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Grid Interval Section -->
    <div class="setting-section" class:disabled={!snapEnabled || !snapToGrid}>
      <h3 class="section-title">Grid Interval</h3>
      <div class="interval-grid">
        {#each GRID_PRESETS as preset}
          <button
            class="interval-btn"
            class:active={gridInterval === preset.value}
            disabled={!snapEnabled || !snapToGrid}
            onclick={() => setGridInterval(preset.value)}
          >
            {preset.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Keyboard Hint -->
    <div class="keyboard-hint">
      <kbd>S</kbd> Toggle snapping
    </div>
  </div>
</Drawer>

<style>
  .snap-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Master Toggle */
  .master-toggle {
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, var(--theme-stroke-strong));
    background: var(--theme-card-bg, var(--theme-card-bg));
    color: var(--theme-text-muted, var(--theme-text-dim));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-sm);
    transition: all var(--duration-fast) ease;
  }

  .master-toggle:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
  }

  .master-toggle.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: white;
  }

  /* Snap Type Chips */
  .snap-chips {
    display: flex;
    gap: 4px;
    transition: opacity var(--duration-fast) ease;
  }

  .snap-chips.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .snap-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 10px;
    border-radius: 16px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text-muted, var(--theme-text-dim));
    font-size: var(--font-size-compact);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    white-space: nowrap;
  }

  .snap-chip i {
    font-size: var(--font-size-compact);
  }

  .snap-chip:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .snap-chip.active {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
    color: var(--theme-accent);
  }

  .snap-chip:disabled {
    cursor: not-allowed;
  }

  .chip-label {
    font-weight: 500;
  }

  /* Grid Quick Access */
  .grid-quick {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 8px;
    border-left: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .grid-label {
    font-size: var(--font-size-compact);
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  .grid-chips {
    display: flex;
    gap: 2px;
  }

  .grid-chip {
    padding: 4px 8px;
    border-radius: 4px;
    border: none;
    background: var(--theme-card-bg, var(--theme-card-bg));
    color: var(--theme-text-muted, var(--theme-text-dim));
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .grid-chip:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
  }

  .grid-chip.active {
    background: var(--theme-accent);
    color: white;
  }

  /* More Options Button */
  .more-btn {
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--theme-text-muted, var(--theme-text-dim));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-compact);
    transition: all var(--duration-fast) ease;
  }

  .more-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
  }

  /* Sheet Styles */
  :global(.snap-settings-sheet) {
    --sheet-bg: linear-gradient(135deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.5));
    --sheet-filter: blur(24px);
  }

  :global(.drawer-content.snap-settings-sheet) {
    max-width: 400px;
  }

  .sheet-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 0;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .sheet-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .close-btn {
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg);
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.15));
    transform: scale(1.05);
  }

  .setting-section {
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .setting-section.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .section-title {
    margin: 0 0 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  /* Master Row */
  .master-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    text-align: left;
  }

  .master-row:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong);
  }

  .master-row.active {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  .setting-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg);
    border-radius: 10px;
    font-size: var(--font-size-base);
    color: var(--theme-text-dim);
  }

  .master-row.active .setting-icon {
    background: var(--theme-accent);
    color: white;
  }

  .setting-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .setting-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: white;
  }

  .setting-desc {
    font-size: 0.75rem;
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  .toggle-indicator {
    padding: 4px 10px;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--theme-text-dim);
    transition: all var(--duration-normal) ease;
  }

  .toggle-indicator.on {
    background: var(--theme-accent);
    color: white;
  }

  /* Snap Options Grid */
  .snap-options-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .snap-option-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .snap-option-card:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong);
    transform: translateY(-2px);
  }

  .snap-option-card.active {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  .snap-option-card.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .snap-option-card i {
    font-size: var(--font-size-xl);
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  .snap-option-card.active i {
    color: var(--theme-accent);
  }

  .snap-option-card span {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--theme-text);
  }

  /* Interval Grid */
  .interval-grid {
    display: flex;
    gap: 8px;
  }

  .interval-btn {
    flex: 1;
    padding: 12px 8px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--theme-text-muted, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .interval-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, var(--theme-text));
  }

  .interval-btn.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: white;
  }

  .interval-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Keyboard Hint */
  .keyboard-hint {
    margin-top: auto;
    padding: 14px 20px;
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.05));
    font-size: 0.75rem;
    color: var(--theme-text-muted, var(--theme-text-dim));
    text-align: center;
  }

  .keyboard-hint kbd {
    display: inline-block;
    padding: 3px 7px;
    margin-right: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.75rem;
  }

  /* Responsive - hide labels on small screens */
  @container (max-width: 600px) {
    .chip-label {
      display: none;
    }

    .snap-chip {
      padding: 6px 8px;
    }

    .grid-quick {
      display: none;
    }
  }
</style>
