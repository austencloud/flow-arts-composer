<script lang="ts">
  import { getVideoTrailsContext } from "../context/video-trails-context";
  import { DETECTOR_REGISTRY } from "../domain/types";

  const { state: trailsState } = getVideoTrailsContext();

  interface EffectSection {
    key: "fire" | "led" | "trails" | "charcoal";
    label: string;
    icon: string;
  }

  const sections: EffectSection[] = [
    { key: "trails", label: "Trails", icon: "fa-wave-square" },
    { key: "fire", label: "Fire", icon: "fa-fire" },
    { key: "led", label: "LED Glow", icon: "fa-lightbulb" },
    { key: "charcoal", label: "Charcoal", icon: "fa-meteor" },
  ];

  let detectorDropdownOpen = $state(false);

  const activeDetectorLabel = $derived(
    DETECTOR_REGISTRY.find((r) => r.id === trailsState.activeDetectorId)
      ?.name ?? "Unknown"
  );

  function toggleEffect(key: EffectSection["key"]) {
    const current = trailsState.effectConfig[key];
    trailsState.setEffectConfig({
      [key]: { ...current, enabled: !current.enabled },
    });
  }

  function selectDetector(id: string) {
    trailsState.setActiveDetector(id);
    detectorDropdownOpen = false;
  }
</script>

<div class="effects-panel">
  <h3 class="panel-title">Effects</h3>

  {#each sections as section}
    <div
      class="effect-section"
      class:enabled={trailsState.effectConfig[section.key].enabled}
    >
      <button class="effect-toggle" onclick={() => toggleEffect(section.key)}>
        <i class="fas {section.icon}" aria-hidden="true"></i>
        <span>{section.label}</span>
        <span class="toggle-indicator"
          >{trailsState.effectConfig[section.key].enabled ? "ON" : "OFF"}</span
        >
      </button>
    </div>
  {/each}

  <div class="detection-section">
    <h3 class="panel-title">Detection</h3>

    <div class="slider-row">
      <span class="slider-label">Threshold</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={trailsState.detectionConfig.threshold}
        oninput={(e) =>
          trailsState.setDetectionConfig({
            threshold: Number((e.target as HTMLInputElement).value),
          })}
        aria-label="Threshold"
      />
      <span class="value"
        >{trailsState.detectionConfig.threshold.toFixed(2)}</span
      >
    </div>

    <div class="slider-row">
      <span class="slider-label">Sensitivity</span>
      <input
        type="range"
        min="0"
        max="2"
        step="0.1"
        value={trailsState.detectionConfig.sensitivity}
        oninput={(e) =>
          trailsState.setDetectionConfig({
            sensitivity: Number((e.target as HTMLInputElement).value),
          })}
        aria-label="Sensitivity"
      />
      <span class="value"
        >{trailsState.detectionConfig.sensitivity.toFixed(1)}</span
      >
    </div>

    <div class="select-row">
      <span class="select-label">Detector</span>
      <div class="custom-select">
        <button
          class="select-trigger"
          onclick={() => (detectorDropdownOpen = !detectorDropdownOpen)}
        >
          <span>{activeDetectorLabel}</span>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        {#if detectorDropdownOpen}
          <div class="select-dropdown">
            {#each DETECTOR_REGISTRY as reg}
              <button
                class="select-option"
                class:selected={reg.id === trailsState.activeDetectorId}
                onclick={() => selectDetector(reg.id)}
              >
                {reg.name}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .effects-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .panel-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    margin: 0 0 4px;
    color: var(--theme-text, #ffffff);
  }

  .effect-section {
    border-radius: 6px;
    overflow: hidden;
  }

  .effect-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
    text-align: left;
    transition: background var(--duration-fast);
  }

  .effect-toggle:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .enabled .effect-toggle {
    color: var(--theme-text, #ffffff);
  }

  .toggle-indicator {
    margin-left: auto;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    opacity: 0.6;
  }

  .enabled .toggle-indicator {
    color: var(--theme-accent, #f43f5e);
    opacity: 1;
  }

  .detection-section {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .slider-label {
    min-width: 70px;
  }

  .slider-row input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    outline: none;
  }

  .slider-row input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--theme-accent, #f43f5e);
    cursor: pointer;
    border: 2px solid var(--theme-panel-bg, #121220);
  }

  .slider-row input[type="range"]::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--theme-accent, #f43f5e);
    cursor: pointer;
    border: 2px solid var(--theme-panel-bg, #121220);
  }

  .value {
    min-width: 35px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .select-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .select-label {
    min-width: 70px;
  }

  .custom-select {
    position: relative;
    flex: 1;
  }

  .select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
  }

  .select-trigger:hover {
    border-color: var(--theme-accent, #f43f5e);
  }

  .select-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    overflow: hidden;
    z-index: 10;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .select-option {
    display: block;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: transparent;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    text-align: left;
    cursor: pointer;
  }

  .select-option:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
  }

  .select-option.selected {
    color: var(--theme-accent, #f43f5e);
  }
</style>
