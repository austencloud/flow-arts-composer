<!--
  VideoRecordSettingsSheet.svelte

  Settings sheet for video recording options.
  Controls reference view, animation settings, and grid settings.

  Reuses SimpleTrailControls for trail intensity controls.
-->
<script lang="ts">
  import type {
    ReferenceViewType,
    GridSettings,
  } from "../state/video-record-settings.svelte";
  import SimpleTrailControls from "#lib/shared/animation-engine/components/trail/SimpleTrailControls.svelte";

  let {
    isOpen = false,
    isMobile = false,
    referenceView,
    gridSettings,
    leftPropType = null,
    rightPropType = null,
    onClose = () => {},
    onReferenceViewChange = () => {},
    onGridSettingsChange = () => {},
  }: {
    isOpen: boolean;
    isMobile: boolean;
    referenceView: ReferenceViewType;
    gridSettings: GridSettings;
    leftPropType?: string | null;
    rightPropType?: string | null;
    onClose?: () => void;
    onReferenceViewChange?: (view: ReferenceViewType) => void;
    onGridSettingsChange?: (settings: GridSettings) => void;
  } = $props();

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="sheet-backdrop" onclick={handleBackdropClick} aria-hidden="true">
    <div class="sheet-content" role="dialog" aria-modal="true">
      <div class="sheet-header">
        <h2>Recording Settings</h2>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>

      <div class="sheet-body">
        <!-- Reference View Section -->
        <section class="settings-section">
          <h3>Reference View</h3>
          <p class="section-hint">
            Choose what to display alongside your camera feed
          </p>

          <div class="option-grid">
            {#if !isMobile}
              <button
                class="option-btn"
                class:active={referenceView === "none"}
                onclick={() => onReferenceViewChange("none")}
              >
                <i class="fas fa-video" aria-hidden="true"></i>
                <span>Camera Only</span>
              </button>
            {/if}
            <button
              class="option-btn"
              class:active={referenceView === "animation"}
              onclick={() => onReferenceViewChange("animation")}
            >
              <i class="fas fa-play-circle" aria-hidden="true"></i>
              <span>Animation</span>
            </button>
            <button
              class="option-btn"
              class:active={referenceView === "grid"}
              onclick={() => onReferenceViewChange("grid")}
            >
              <i class="fas fa-th" aria-hidden="true"></i>
              <span>Grid</span>
            </button>
          </div>
        </section>

        <!-- Animation Settings (visible when animation reference is active) -->
        {#if referenceView === "animation"}
          <section class="settings-section">
            <h3>Animation Settings</h3>

            <!-- Trail Controls (Off/Subtle/Vivid) with bilateral toggle -->
            <SimpleTrailControls {leftPropType} {rightPropType} />
          </section>
        {/if}

        <!-- Grid Settings (visible when grid reference is active) -->
        {#if referenceView === "grid"}
          <section class="settings-section">
            <h3>Grid Settings</h3>
            <p class="section-hint">
              Adjust playback speed for the animated grid
            </p>

            <div class="slider-row">
              <span>Speed (BPM)</span>
              <div class="slider-control">
                <input
                  type="range"
                  min="30"
                  max="120"
                  step="5"
                  value={gridSettings.bpm}
                  oninput={(e) =>
                    onGridSettingsChange({
                      ...gridSettings,
                      bpm: Number(e.currentTarget.value),
                      animated: true,
                    })}
                />
                <span class="slider-value">{gridSettings.bpm}</span>
              </div>
            </div>
          </section>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    z-index: var(--z-modal);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    animation: fadeIn var(--duration-normal) ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .sheet-content {
    width: 100%;
    max-width: 480px;
    max-height: 80vh;
    background: var(--theme-panel-elevated-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 20px 20px 0 0;
    overflow: hidden;
    animation: slideUp var(--duration-emphasis) ease;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .sheet-header h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--theme-text);
  }

  .close-btn {
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: none;
    border-radius: 50%;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, white);
  }

  .sheet-body {
    padding: 16px 20px 32px;
    overflow-y: auto;
    max-height: calc(80vh - 70px);
  }

  .settings-section {
    margin-bottom: 24px;
  }

  .settings-section:last-child {
    margin-bottom: 0;
  }

  .settings-section h3 {
    margin: 0 0 4px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text, var(--theme-text));
  }

  .section-hint {
    margin: 0 0 12px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  /* Option Grid */
  .option-grid {
    display: flex;
    gap: 8px;
  }

  .option-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 8px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1.5px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .option-btn i {
    font-size: var(--font-size-xl);
  }

  .option-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .option-btn.active {
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--theme-accent, var(--semantic-info)) 18%,
          transparent
        )
        0%,
      color-mix(in srgb, var(--theme-accent-strong) 14%, transparent) 100%
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 45%,
      transparent
    );
    color: var(--theme-accent, var(--semantic-info));
  }

  .option-btn.active i {
    color: var(--theme-accent, var(--semantic-info));
  }

  /* Slider Rows */
  .slider-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 0;
  }

  .slider-row > span {
    font-size: var(--font-size-sm);
    color: var(--theme-text);
  }

  .slider-control {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .slider-control input[type="range"] {
    flex: 1;
    height: 4px;
    background: color-mix(in srgb, var(--theme-stroke-strong) 55%, transparent);
    border-radius: 2px;
    appearance: none;
    cursor: pointer;
  }

  .slider-control input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    background: linear-gradient(
      135deg,
      var(--theme-accent, var(--semantic-info)) 0%,
      var(--theme-accent-strong) 100%
    );
    border-radius: 50%;
    cursor: pointer;
  }

  .slider-value {
    min-width: 40px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text, var(--theme-text));
    text-align: right;
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .sheet-backdrop {
      animation: none;
    }
    .sheet-content {
      animation: none;
    }
  }
</style>
