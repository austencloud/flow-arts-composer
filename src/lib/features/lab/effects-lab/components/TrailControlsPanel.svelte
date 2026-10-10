<!--
  TrailControlsPanel.svelte

  Trail effect controls: tracking mode, hide props,
  appearance sliders (line width, opacity, glow), and behavior (fade duration).
  Being in Trails mode = trails enabled; no separate toggle needed.
-->
<script lang="ts">
  import { animationSettings } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import { TrackingMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
  import { isBilateralProp } from "#lib/shared/pictograph/prop/domain/enums/prop-classification.js";

  let trail = $derived(animationSettings.trail);
  let propType = $derived(animationSettings.currentPropType);
  let bilateral = $derived(isBilateralProp(propType));

  // Local reactive copies for slider binding
  let fadeDuration = $state(animationSettings.trail.fadeDurationMs);
  let lineWidth = $state(animationSettings.trail.lineWidth);
  let minOpacity = $state(animationSettings.trail.minOpacity);
  let maxOpacity = $state(animationSettings.trail.maxOpacity);
  let glowBlur = $state(animationSettings.trail.glowBlur);

  // Sync from singleton when it changes externally
  $effect(() => {
    fadeDuration = animationSettings.trail.fadeDurationMs;
    lineWidth = animationSettings.trail.lineWidth;
    minOpacity = animationSettings.trail.minOpacity;
    maxOpacity = animationSettings.trail.maxOpacity;
    glowBlur = animationSettings.trail.glowBlur;
  });

  function handleFadeDuration(ms: number) {
    fadeDuration = ms;
    animationSettings.setFadeDuration(ms);
  }

  function handleLineWidth(width: number) {
    lineWidth = width;
    animationSettings.setTrailAppearance({ lineWidth: width });
  }

  function handleMinOpacity(opacity: number) {
    minOpacity = opacity;
    animationSettings.setTrailAppearance({ minOpacity: opacity });
  }

  function handleMaxOpacity(opacity: number) {
    maxOpacity = opacity;
    animationSettings.setTrailAppearance({ maxOpacity: opacity });
  }

  function handleGlowBlur(blur: number) {
    glowBlur = blur;
    animationSettings.setTrailAppearance({ glowBlur: blur });
  }

  function handleTrackingMode(mode: TrackingMode) {
    animationSettings.setTrackingMode(mode);
  }

  function handleHideProps(hide: boolean) {
    animationSettings.setHideProps(hide);
  }

  // Label the tracking buttons based on prop type:
  // - "staff" (primary, has notched thumb end): Thumb / Pinky / Both
  // - Other bilateral props: End 1 / End 2 / Both
  let trackingOptions = $derived.by(() => {
    const pt = propType?.toLowerCase() ?? "staff";

    let leftLabel: string;
    let rightLabel: string;

    if (pt === "staff") {
      leftLabel = "Pinky";
      rightLabel = "Thumb";
    } else if (pt === "bigclub") {
      leftLabel = "Knob";
      rightLabel = "Bulb";
    } else {
      leftLabel = "End 1";
      rightLabel = "End 2";
    }

    return [
      { mode: TrackingMode.LEFT_END, label: leftLabel, aria: `Track ${leftLabel.toLowerCase()} end only` },
      { mode: TrackingMode.RIGHT_END, label: rightLabel, aria: `Track ${rightLabel.toLowerCase()} end only` },
      { mode: TrackingMode.BOTH_ENDS, label: "Both", aria: "Track both ends" },
    ];
  });
</script>

<div class="trail-controls">
  <h3>
    <i class="fas fa-wave-square" aria-hidden="true"></i>
    Trail Effect
  </h3>

  <!-- Tracking mode (bilateral props only - unilateral props have one end) -->
  {#if bilateral}
    <div class="renderer-toggle-section">
      <span class="section-label">Track end</span>
      <div class="renderer-toggle" role="radiogroup" aria-label="Tracking mode">
        {#each trackingOptions as opt (opt.mode)}
          <button
            role="radio"
            class="renderer-btn"
            class:active={trail.trackingMode === opt.mode}
            aria-checked={trail.trackingMode === opt.mode}
            aria-label={opt.aria}
            onclick={() => handleTrackingMode(opt.mode)}
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Hide props toggle -->
  <div class="toggle-row">
    <span>Hide props</span>
    <button
      class="toggle-btn"
      class:active={trail.hideProps}
      onclick={() => handleHideProps(!trail.hideProps)}
      aria-label={trail.hideProps ? "Show props" : "Hide props - trails only"}
      aria-pressed={trail.hideProps}
    >
      {trail.hideProps ? "ON" : "OFF"}
    </button>
  </div>

  <!-- Appearance -->
  <div class="slider-section">
      <span class="section-label">Appearance</span>

      <div class="slider-group">
        <div class="slider-row">
          <label for="trail-line-width">Line width</label>
          <input
            id="trail-line-width"
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={lineWidth}
            oninput={(e) => handleLineWidth(parseFloat(e.currentTarget.value))}
            aria-label="Trail line width"
          />
          <span class="slider-value">{lineWidth.toFixed(1)}</span>
        </div>
      </div>

      <div class="slider-group">
        <div class="slider-row">
          <label for="trail-min-opacity">Min opacity</label>
          <input
            id="trail-min-opacity"
            type="range"
            min="0.0"
            max="0.5"
            step="0.05"
            value={minOpacity}
            oninput={(e) => handleMinOpacity(parseFloat(e.currentTarget.value))}
            aria-label="Trail minimum opacity (tail)"
          />
          <span class="slider-value">{(minOpacity * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div class="slider-group">
        <div class="slider-row">
          <label for="trail-max-opacity">Max opacity</label>
          <input
            id="trail-max-opacity"
            type="range"
            min="0.5"
            max="1.0"
            step="0.05"
            value={maxOpacity}
            oninput={(e) => handleMaxOpacity(parseFloat(e.currentTarget.value))}
            aria-label="Trail maximum opacity (head)"
          />
          <span class="slider-value">{(maxOpacity * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div class="slider-group">
        <div class="slider-row">
          <label for="trail-glow-blur">Glow blur</label>
          <input
            id="trail-glow-blur"
            type="range"
            min="0"
            max="10"
            step="1"
            value={glowBlur}
            oninput={(e) => handleGlowBlur(parseInt(e.currentTarget.value, 10))}
            aria-label="Trail glow blur radius"
          />
          <span class="slider-value">{glowBlur}</span>
        </div>
      </div>
    </div>

    <!-- Behavior -->
    <div class="slider-section">
      <span class="section-label">Behavior</span>

      <div class="slider-group">
        <div class="slider-row">
          <label for="trail-fade-duration">Fade duration</label>
          <input
            id="trail-fade-duration"
            type="range"
            min="500"
            max="5000"
            step="100"
            value={fadeDuration}
            oninput={(e) => handleFadeDuration(parseInt(e.currentTarget.value, 10))}
            aria-label="Trail fade duration in milliseconds"
          />
          <span class="slider-value">{(fadeDuration / 1000).toFixed(1)}s</span>
        </div>
      </div>
    </div>
</div>

<style>
  .trail-controls {
    --trail-blue: #3b82f6;
    --trail-blue-bright: #60a5fa;
    --trail-blue-dim: rgba(59, 130, 246, 0.08);
    --trail-blue-mid: rgba(59, 130, 246, 0.15);
    --trail-blue-border: rgba(59, 130, 246, 0.3);
    --trail-blue-border-strong: rgba(59, 130, 246, 0.5);

    padding: var(--spacing-md, 16px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--trail-blue-dim);
    border-radius: var(--border-radius-lg, 12px);
  }

  h3 {
    margin: 0 0 var(--spacing-sm, 8px);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, white);
    display: flex;
    align-items: center;
    gap: var(--spacing-xs, 4px);
  }

  h3 i {
    color: var(--trail-blue);
  }

  .section-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .toggle-btn {
    padding: 8px 16px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 9999px;
    background: color-mix(in srgb, var(--theme-text) 5%, transparent);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
    min-width: 56px;
    min-height: var(--min-touch-target);
  }

  .toggle-btn.active {
    background: linear-gradient(135deg, color-mix(in srgb, var(--trail-blue) 30%, transparent), color-mix(in srgb, var(--trail-blue) 15%, transparent));
    border-color: var(--trail-blue-border-strong);
    color: var(--trail-blue-bright);
  }

  .toggle-btn:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--theme-text) 30%, transparent);
  }

  .toggle-btn.active:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--trail-blue) 70%, transparent);
  }

  .toggle-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  /* Segmented toggle (tracking mode) */
  .renderer-toggle-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: var(--spacing-sm, 8px) 0;
  }

  .renderer-toggle {
    display: flex;
    gap: 6px;
  }

  .renderer-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 10px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
    min-height: var(--min-touch-target);
  }

  .renderer-btn:hover {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, white);
  }

  .renderer-btn.active {
    background: var(--trail-blue-mid);
    border-color: var(--trail-blue-border-strong);
    color: var(--trail-blue-bright);
  }

  .renderer-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  /* Slider sections */
  .slider-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
    margin-top: var(--spacing-sm, 8px);
    padding-top: var(--spacing-sm, 8px);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .slider-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-height: 44px;
  }

  .slider-row label {
    min-width: 120px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    white-space: nowrap;
  }

  .slider-row input[type="range"] {
    flex: 1;
    accent-color: var(--trail-blue);
    cursor: pointer;
  }

  .slider-value {
    min-width: 44px;
    text-align: right;
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, white);
  }

  @media (prefers-reduced-motion: reduce) {
    .toggle-btn,
    .renderer-btn {
      transition: none;
    }
  }
</style>
